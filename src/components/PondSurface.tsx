"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCelestialState,
  type CelestialState,
} from "@/lib/celestial";
import {
  IWAVE_RADIUS,
  IWAVE_SIZE,
  WATER_ABSORPTION_RGB_PER_METER,
  WATER_IOR,
  createIWaveKernel,
} from "@/lib/iwave";
import {
  OCEAN_WAVE_COMPONENT_COUNT,
  createOceanWaveField,
  getDisplaySunDirection,
  getSceneSunDirection,
  getSessionOceanSeed,
  getSunAzimuthScale,
  rotateAboutY,
  seededRandom,
  spectralHeightAt,
  type Direction3,
  type OceanWaveField,
} from "@/lib/oceanWaves";

type PondSurfaceProps = {
  className?: string;
  dateMs?: number;
  latitude?: number;
  longitude?: number;
  seed?: number;
  stageId?: string;
};

type WaveSource = {
  x: number;
  y: number;
  strength: number;
  radius: number;
};

type RenderTarget = {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
};

type QualityProfile = {
  atmosphereHeight: number;
  atmosphereWidth: number;
  causticGridSize: number;
  causticTextureSize: number;
  cloudFrameStride: number;
  cloudHeight: number;
  cloudWidth: number;
  detailLevel: number;
  frameInterval: number;
  name: "full" | "reduced";
  pixelBudget: number;
  simulationSize: number;
};

const SIMULATION_SIZE = 192;
const DRIVE_MODE_COUNT = 64;
const ATMOSPHERE_TEXTURE_WIDTH = 256;
const ATMOSPHERE_TEXTURE_HEIGHT = 96;
const FIXED_TIME_STEP = 1 / 60;
const SIMULATION_PLAYBACK_RATE = 0.60;
const OCEAN_WAVE_HEIGHT_SCALE = 1.0;
const WATER_DOMAIN_METERS = 32;
const OCEAN_DEPTH_METERS = 24;
const CAMERA_FOCAL_LENGTH = 2.7;
const CAMERA_ORIGIN_TOP = [0, 3.6, -6.2] as const;
const CAMERA_ORIGIN_BOTTOM = [0, -21.2, 11.8] as const;
const CAMERA_TARGET_TOP = [0, 1.8, 0.7] as const;
const DEFAULT_CELESTIAL_DATE = Date.UTC(2026, 5, 21, 6, 30);

const FULL_QUALITY: QualityProfile = {
  atmosphereHeight: ATMOSPHERE_TEXTURE_HEIGHT,
  atmosphereWidth: ATMOSPHERE_TEXTURE_WIDTH,
  causticGridSize: 120,
  causticTextureSize: 384,
  cloudFrameStride: 3,
  cloudHeight: 256,
  cloudWidth: 768,
  detailLevel: 1,
  frameInterval: 1_000 / 60,
  name: "full",
  pixelBudget: 1_700_000,
  simulationSize: SIMULATION_SIZE,
};

const REDUCED_QUALITY: QualityProfile = {
  atmosphereHeight: 60,
  atmosphereWidth: 160,
  causticGridSize: 80,
  causticTextureSize: 192,
  cloudFrameStride: 8,
  cloudHeight: 128,
  cloudWidth: 384,
  detailLevel: 0,
  frameInterval: 1_000 / 30,
  name: "reduced",
  pixelBudget: 400_000,
  simulationSize: 112,
};

let cachedIWaveKernel: Float32Array | null = null;
const initialStateCache = new Map<string, InitialState>();

function getCachedIWaveKernel() {
  cachedIWaveKernel ??= createIWaveKernel();
  return cachedIWaveKernel;
}

function getForcedRenderScale(): number | null {
  try {
    const value = new URLSearchParams(window.location.search).get("ocean-scale");
    if (value === null) return null;
    const scale = Number.parseFloat(value);
    return Number.isFinite(scale) ? Math.min(1, Math.max(0.3, scale)) : null;
  } catch {
    return null;
  }
}

function isFrameStatsEnabled() {
  try {
    return new URLSearchParams(window.location.search).get("ocean-debug") === "fps";
  } catch {
    return false;
  }
}

const frameStatsStyle = {
  position: "fixed",
  top: "0.75rem",
  left: "0.75rem",
  zIndex: 20,
  padding: "0.4rem 0.6rem",
  background: "rgba(0, 0, 0, 0.62)",
  color: "#d9ffd0",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: "0.72rem",
  lineHeight: 1.5,
  whiteSpace: "pre",
  pointerEvents: "none",
} as const;

function getDebugView() {
  try {
    const view = new URLSearchParams(window.location.search).get("ocean-debug");
    if (view === "sky") return 1;
    if (view === "cloud") return 2;
    if (view === "foam") return 3;
  } catch {
    return 0;
  }
  return 0;
}

function hasQualityOverride() {
  try {
    return new URLSearchParams(window.location.search).has("ocean-quality");
  } catch {
    return false;
  }
}

function getQualityProfile(coarsePointer: boolean, reducedMotion: boolean) {
  try {
    const override = new URLSearchParams(window.location.search).get("ocean-quality");
    if (override === "reduced") return REDUCED_QUALITY;
    if (override === "full") return FULL_QUALITY;
  } catch {
    // Ignore an unavailable location and fall through to detection.
  }
  const hints = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  const lowCoreCount = navigator.hardwareConcurrency > 0
    && navigator.hardwareConcurrency <= 4;
  const lowMemory = hints.deviceMemory !== undefined && hints.deviceMemory <= 4;

  return coarsePointer
    || reducedMotion
    || lowCoreCount
    || lowMemory
    || hints.connection?.saveData
    ? REDUCED_QUALITY
    : FULL_QUALITY;
}

const fullscreenVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;

out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const simulationFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform sampler2D u_kernel;
uniform float u_gridSize;
uniform float u_deltaTime;
uniform float u_gravity;
uniform float u_damping;
uniform vec4 u_source;
uniform vec4 u_drive[${DRIVE_MODE_COUNT}];
uniform vec4 u_drivePhase[${DRIVE_MODE_COUNT / 4}];
uniform float u_simulationTime;

in vec2 v_uv;
out vec4 outState;

void main() {
  float verticalDerivative = 0.0;

  for (int y = -${IWAVE_RADIUS}; y <= ${IWAVE_RADIUS}; y += 1) {
    for (int x = -${IWAVE_RADIUS}; x <= ${IWAVE_RADIUS}; x += 1) {
      vec2 offset = vec2(float(x), float(y)) / u_gridSize;
      float height = texture(u_state, fract(v_uv + offset)).r;
      float weight = texelFetch(
        u_kernel,
        ivec2(x + ${IWAVE_RADIUS}, y + ${IWAVE_RADIUS}),
        0
      ).r;
      verticalDerivative += height * weight;
    }
  }

  vec4 state = texture(u_state, v_uv);
  vec2 sourceDelta = abs(v_uv - u_source.xy);
  sourceDelta = min(sourceDelta, 1.0 - sourceDelta);
  float sourceDistanceSquared = dot(sourceDelta, sourceDelta);
  float innerRadiusSquared = max(u_source.w * u_source.w, 0.000001);
  float inner = exp(-sourceDistanceSquared / innerRadiusSquared);
  float outer = exp(-sourceDistanceSquared / (innerRadiusSquared * 4.0));
  float displacement = u_source.z * (inner - outer * 0.25);

  float dampingStep = u_damping * u_deltaTime;
  float denominator = 1.0 + dampingStep;
  float nextHeight =
    state.r * (2.0 - dampingStep) / denominator
    - state.g / denominator
    - verticalDerivative * u_gravity * u_deltaTime * u_deltaTime / denominator
    + displacement;

  // Force the strongest modes of the tile sea, so the solver keeps its
  // energy. A forcing of twice the damping per step holds a resonant mode at
  // its target amplitude and leaves every other mode untouched.
  float target = 0.0;
  for (int group = 0; group < ${DRIVE_MODE_COUNT / 4}; group += 1) {
    vec4 phases = u_drivePhase[group];
    vec4 a = u_drive[group * 4];
    vec4 b = u_drive[group * 4 + 1];
    vec4 c = u_drive[group * 4 + 2];
    vec4 d = u_drive[group * 4 + 3];
    target += a.w * cos(dot(a.xy, v_uv) + phases.x + a.z * u_simulationTime)
      + b.w * cos(dot(b.xy, v_uv) + phases.y + b.z * u_simulationTime)
      + c.w * cos(dot(c.xy, v_uv) + phases.z + c.z * u_simulationTime)
      + d.w * cos(dot(d.xy, v_uv) + phases.w + d.z * u_simulationTime);
  }
  nextHeight += 2.0 * u_damping * u_deltaTime * target;

  outState = vec4(nextHeight, state.r, verticalDerivative, 1.0);
}
`;

const glslNoise = `
float hash21(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

vec3 hash33(vec3 point) {
  vec3 value = fract(point * vec3(0.1031, 0.1030, 0.0973));
  value += dot(value, value.yxz + 33.33);
  return fract((value.xxy + value.yxx) * value.zyx);
}

float noise21(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + 1.0), local.x),
    local.y
  );
}

float sedimentNoise(vec2 point) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 4; octave += 1) {
    value += noise21(point) * amplitude;
    point = rotation * point * 2.03 + 11.7;
    amplitude *= 0.48;
  }
  return value;
}
`;

const glslAtmosphere = `
const vec3 AIR_RAYLEIGH = vec3(0.005802, 0.013558, 0.033100);
const vec3 AIR_MIE_EXTINCTION = vec3(0.004440);
const vec3 AIR_OZONE = vec3(0.000650, 0.001881, 0.000085);

float opticalAirMass(float cosineZenith) {
  float zenithDegrees = degrees(acos(clamp(cosineZenith, 0.001, 1.0)));
  return 1.0 / (
    cosineZenith + 0.15 * pow(max(93.885 - zenithDegrees, 0.001), -1.253)
  );
}

vec3 atmosphericTransmittance(vec3 direction, float turbidity) {
  if (direction.y <= 0.0) return vec3(0.0);
  float airMass = opticalAirMass(max(direction.y, 0.001));
  float aerosolScale = mix(0.72, 1.34, clamp((turbidity - 1.9) / 1.9, 0.0, 1.0));
  vec3 extinction =
    AIR_RAYLEIGH * 8.0
      + AIR_MIE_EXTINCTION * aerosolScale * 1.2
      + AIR_OZONE * 15.0;
  return exp(-extinction * airMass);
}

vec2 skyLutUv(vec3 skyDirection) {
  float azimuth = atan(skyDirection.x, skyDirection.z);
  float elevation = asin(clamp(skyDirection.y, 0.0, 1.0));
  return vec2(
    fract(azimuth / (2.0 * PI) + 0.5),
    clamp(elevation / (0.5 * PI), 0.0, 1.0)
  );
}
`;

const glslWaves = `
// The solver stores the current height in .r and the previous step in .g.
// Blend them with the leftover simulation time so the tile moves every frame.
float stateHeight(vec2 uv) {
  vec2 heights = texture(u_state, fract(uv)).rg;
  return mix(heights.g, heights.r, u_stateBlend);
}

float simulationHeight(vec2 uv) {
  vec2 texel = fract(uv) * u_gridSize - 0.5;
  vec2 base = floor(texel);
  vec2 fraction = fract(texel);
  vec2 uv00 = (base + 0.5) / u_gridSize;
  float height00 = stateHeight(uv00);
  float height10 = stateHeight(uv00 + vec2(1.0 / u_gridSize, 0.0));
  float height01 = stateHeight(uv00 + vec2(0.0, 1.0 / u_gridSize));
  float height11 = stateHeight(uv00 + vec2(1.0 / u_gridSize));
  return mix(
    mix(height00, height10, fraction.x),
    mix(height01, height11, fraction.x),
    fraction.y
  );
}

vec2 worldToWaterUv(vec2 worldPosition) {
  return fract(worldPosition / u_domainSize + 0.5);
}

float componentDetail(float wavelength, float viewDistance) {
  return 1.0 - smoothstep(wavelength * 9.0, wavelength * 26.0, viewDistance);
}

float oceanHeight(vec2 position, float viewDistance) {
  float detail[${OCEAN_WAVE_COMPONENT_COUNT}];
  vec2 offset = vec2(0.0);
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    float inverseWaveNumber = inversesqrt(dot(wave.xy, wave.xy));
    detail[index] = componentDetail(6.283185307 * inverseWaveNumber, viewDistance);
    float theta = dot(position, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    offset += wave.xy * inverseWaveNumber * (wave.w * detail[index] * cos(theta));
  }
  vec2 displaced = position - u_choppiness * offset;
  float height = 0.0;
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    float theta = dot(displaced, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    height += wave.w * detail[index] * sin(theta);
  }
  float localDetail = 1.0 - smoothstep(45.0, 190.0, viewDistance);
  height += simulationHeight(worldToWaterUv(displaced)) * localDetail;
  return height * ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)};
}

vec3 surfaceNormal(vec2 position, float viewDistance) {
  float cellSize = max(u_domainSize / u_gridSize, viewDistance * 0.0045);
  float slopeX = (
    oceanHeight(position + vec2(cellSize, 0.0), viewDistance)
      - oceanHeight(position - vec2(cellSize, 0.0), viewDistance)
  ) / (2.0 * cellSize);
  float slopeZ = (
    oceanHeight(position + vec2(0.0, cellSize), viewDistance)
      - oceanHeight(position - vec2(0.0, cellSize), viewDistance)
  ) / (2.0 * cellSize);
  return normalize(vec3(-slopeX, 1.0, -slopeZ));
}

float oceanFoamJacobian(vec2 position, float viewDistance) {
  float shearXX = 0.0;
  float shearZZ = 0.0;
  float shearXZ = 0.0;
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    float inverseWaveNumber = inversesqrt(dot(wave.xy, wave.xy));
    float detail = componentDetail(6.283185307 * inverseWaveNumber, viewDistance);
    float theta = dot(position, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    float shear = wave.w * detail * inverseWaveNumber * sin(theta) * u_choppiness;
    shearXX += wave.x * wave.x * shear;
    shearZZ += wave.y * wave.y * shear;
    shearXZ += wave.x * wave.y * shear;
  }
  return (1.0 - shearXX) * (1.0 - shearZZ) - shearXZ * shearXZ;
}
`;

const glslFresnel = `
float dielectricFresnelBetween(
  float cosineIncident,
  float incidentIor,
  float transmittedIor
) {
  float cosine = clamp(cosineIncident, 0.0, 1.0);
  float sineIncident = sqrt(max(0.0, 1.0 - cosine * cosine));
  float sineTransmitted = incidentIor * sineIncident / transmittedIor;
  if (sineTransmitted >= 1.0) return 1.0;
  float cosineTransmitted = sqrt(max(0.0, 1.0 - sineTransmitted * sineTransmitted));
  float parallel = (
    transmittedIor * cosine - incidentIor * cosineTransmitted
  ) / (
    transmittedIor * cosine + incidentIor * cosineTransmitted
  );
  float perpendicular = (
    incidentIor * cosine - transmittedIor * cosineTransmitted
  ) / (
    incidentIor * cosine + transmittedIor * cosineTransmitted
  );
  return 0.5 * (parallel * parallel + perpendicular * perpendicular);
}

float dielectricFresnel(float cosineIncident) {
  return dielectricFresnelBetween(cosineIncident, 1.0, WATER_IOR);
}
`;

const causticVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_uv;

uniform sampler2D u_state;
uniform float u_stateBlend;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform vec3 u_sunDirection;
uniform vec2 u_tileOffset;
uniform float u_oceanTime;
uniform float u_choppiness;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];

out vec2 v_surfaceUv;
out float v_transmission;

const float WATER_IOR = ${WATER_IOR.toFixed(6)};
${glslWaves}
${glslFresnel}

void main() {
  vec2 worldUv = a_uv + u_tileOffset;
  vec2 surfaceHorizontalPosition = (worldUv - 0.5) * u_domainSize;
  float height = oceanHeight(surfaceHorizontalPosition, 0.0);
  vec3 normal = surfaceNormal(surfaceHorizontalPosition, 0.0);
  vec3 surfacePosition = vec3(
    surfaceHorizontalPosition.x,
    height,
    surfaceHorizontalPosition.y
  );
  vec3 refractedSun = refract(-u_sunDirection, normal, 1.0 / WATER_IOR);
  float travel = (-u_floorDepth - height) / min(refractedSun.y, -0.0001);
  vec2 floorPosition = surfacePosition.xz + refractedSun.xz * travel;
  vec2 floorUv = floorPosition / u_domainSize + 0.5;

  v_surfaceUv = worldUv;
  v_transmission = 1.0 - dielectricFresnel(dot(normal, u_sunDirection));
  gl_Position = vec4(floorUv * 2.0 - 1.0, 0.0, 1.0);
}
`;

const causticFragmentShader = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_sampleWeight;

in vec2 v_surfaceUv;
in float v_transmission;
out vec4 outColor;

void main() {
  vec2 derivativeX = dFdx(v_surfaceUv);
  vec2 derivativeY = dFdy(v_surfaceUv);
  float sourceArea = abs(
    derivativeX.x * derivativeY.y - derivativeX.y * derivativeY.x
  );
  float pixelArea = 1.0 / (u_resolution.x * u_resolution.y);
  float concentration = clamp(sourceArea / pixelArea, 0.0, 4.0);
  float energy = concentration * v_transmission * u_sampleWeight;
  outColor = vec4(energy, energy, energy, 0.0);
}
`;

/**
 * Soften the caustic map by about one texel.
 *
 * The sun disc spans about 0.6 texel on the floor at this depth. One bilinear
 * four-tap pass gives the same softness as five light directions at a fifth
 * of the vertex work, so the map can update every frame.
 */
const causticBlurFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform vec2 u_texel;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 offset = u_texel * 0.5;
  vec4 sum = texture(u_source, v_uv + vec2(-offset.x, -offset.y))
    + texture(u_source, v_uv + vec2(offset.x, -offset.y))
    + texture(u_source, v_uv + vec2(-offset.x, offset.y))
    + texture(u_source, v_uv + vec2(offset.x, offset.y));
  outColor = sum * 0.25;
}
`;

const atmosphereFragmentShader = `#version 300 es
precision highp float;

uniform vec3 u_sunDirection;
uniform float u_aerosolScale;

in vec2 v_uv;
out vec4 outColor;

const float PI = 3.141592653589793;
const float PLANET_RADIUS = 6360.0;
const float ATMOSPHERE_RADIUS = 6460.0;
const vec3 BETA_RAYLEIGH = vec3(0.005802, 0.013558, 0.033100);
const vec3 BETA_MIE_SCATTER = vec3(0.003996);
const vec3 BETA_MIE_EXTINCTION = vec3(0.004440);
const vec3 BETA_OZONE = vec3(0.000650, 0.001881, 0.000085);

float raySphereFar(vec3 origin, vec3 direction, float radius) {
  float projected = dot(origin, direction);
  float discriminant = projected * projected - dot(origin, origin) + radius * radius;
  if (discriminant <= 0.0) return -1.0;
  return -projected + sqrt(discriminant);
}

float raySphereNear(vec3 origin, vec3 direction, float radius) {
  float projected = dot(origin, direction);
  float discriminant = projected * projected - dot(origin, origin) + radius * radius;
  if (discriminant <= 0.0) return -1.0;
  return -projected - sqrt(discriminant);
}

vec3 atmosphereDensity(float altitude) {
  float rayleigh = exp(-max(altitude, 0.0) / 8.0);
  float mie = exp(-max(altitude, 0.0) / 1.2);
  float ozone = max(0.0, 1.0 - abs(altitude - 25.0) / 15.0);
  return vec3(rayleigh, mie, ozone);
}

vec3 opticalDepthToSpace(vec3 position, vec3 lightDirection) {
  float planetDistance = raySphereNear(position, lightDirection, PLANET_RADIUS);
  if (planetDistance > 0.0) return vec3(1e5);
  float distanceToSpace = raySphereFar(position, lightDirection, ATMOSPHERE_RADIUS);
  float stepLength = distanceToSpace / 6.0;
  vec3 opticalDepth = vec3(0.0);

  for (int sampleIndex = 0; sampleIndex < 6; sampleIndex += 1) {
    float sampleDistance = (float(sampleIndex) + 0.5) * stepLength;
    vec3 samplePosition = position + lightDirection * sampleDistance;
    opticalDepth += atmosphereDensity(length(samplePosition) - PLANET_RADIUS) * stepLength;
  }

  return opticalDepth;
}

void main() {
  float azimuth = (v_uv.x * 2.0 - 1.0) * PI;
  float elevation = mix(0.0005, PI * 0.5, v_uv.y);
  float horizontal = cos(elevation);
  vec3 viewDirection = vec3(
    sin(azimuth) * horizontal,
    sin(elevation),
    cos(azimuth) * horizontal
  );
  vec3 observer = vec3(0.0, PLANET_RADIUS + 0.002, 0.0);
  float distanceToSpace = raySphereFar(observer, viewDirection, ATMOSPHERE_RADIUS);
  float stepLength = distanceToSpace / 12.0;
  float cosineTheta = clamp(dot(viewDirection, u_sunDirection), -1.0, 1.0);
  float rayleighPhase = 3.0 * (1.0 + cosineTheta * cosineTheta) / (16.0 * PI);
  float anisotropy = 0.76;
  float anisotropySquared = anisotropy * anisotropy;
  float miePhase = 3.0 * (1.0 - anisotropySquared)
    * (1.0 + cosineTheta * cosineTheta)
    / (
      8.0 * PI * (2.0 + anisotropySquared)
      * pow(
        max(1.0 + anisotropySquared - 2.0 * anisotropy * cosineTheta, 0.0001),
        1.5
      )
    );
  vec3 viewOpticalDepth = vec3(0.0);
  vec3 radiance = vec3(0.0);

  for (int sampleIndex = 0; sampleIndex < 12; sampleIndex += 1) {
    float sampleDistance = (float(sampleIndex) + 0.5) * stepLength;
    vec3 samplePosition = observer + viewDirection * sampleDistance;
    vec3 density = atmosphereDensity(length(samplePosition) - PLANET_RADIUS);
    viewOpticalDepth += density * stepLength;
    vec3 lightOpticalDepth = opticalDepthToSpace(samplePosition, u_sunDirection);
    vec3 totalOpticalDepth = viewOpticalDepth + lightOpticalDepth;
    vec3 transmittance = exp(-(
      BETA_RAYLEIGH * totalOpticalDepth.x
        + BETA_MIE_EXTINCTION * u_aerosolScale * totalOpticalDepth.y
        + BETA_OZONE * totalOpticalDepth.z
    ));
    vec3 scattering =
      BETA_RAYLEIGH * density.x * rayleighPhase
        + BETA_MIE_SCATTER * u_aerosolScale * density.y * miePhase;
    radiance += transmittance * scattering * stepLength;
  }

  vec3 viewExtinction =
    BETA_RAYLEIGH * viewOpticalDepth.x
      + BETA_MIE_EXTINCTION * u_aerosolScale * viewOpticalDepth.y
      + BETA_OZONE * viewOpticalDepth.z;
  float daylight = smoothstep(-0.31, 0.08, u_sunDirection.y);
  vec3 multipleScattering = (1.0 - exp(-viewExtinction))
    * vec3(0.085, 0.105, 0.135)
    * daylight
    * smoothstep(-0.05, 0.35, u_sunDirection.y);
  vec3 skyRadiance = radiance * 22.0 + multipleScattering;
  float horizonHaze = (1.0 - exp(-viewExtinction.b * 0.9))
    * smoothstep(0.12, 0.45, u_sunDirection.y);
  vec3 neutralHaze = vec3(dot(skyRadiance, vec3(0.30, 0.45, 0.25)))
    * vec3(0.90, 0.99, 1.16);
  outColor = vec4(mix(skyRadiance, neutralHaze, horizonHaze * 0.55), 1.0);
}
`;

const cloudFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_atmosphere;
uniform vec3 u_sunDirection;
uniform vec2 u_wind;
uniform float u_time;
uniform float u_seed;
uniform float u_cloudCover;
uniform float u_detail;
uniform vec3 u_moonDirection;
uniform float u_moonStrength;

in vec2 v_uv;
out vec4 outColor;

const float PI = 3.141592653589793;
${glslNoise}
${glslAtmosphere}

float cloudFbm(vec2 point, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  mat2 rotation = mat2(0.86, -0.51, 0.51, 0.86);
  for (int octave = 0; octave < 6; octave += 1) {
    if (octave >= octaves) break;
    value += noise21(point) * amplitude;
    total += amplitude;
    point = rotation * point * 2.1 + 5.3;
    amplitude *= 0.52;
  }
  return value / total;
}

float cumulusShape(vec2 point, int octaves) {
  vec2 warp = vec2(
    cloudFbm(point * 0.7 + 3.1, 3),
    cloudFbm(point * 0.7 - 7.7, 3)
  ) - 0.5;
  float base = cloudFbm(point + warp * 0.9, octaves);
  float threshold = mix(0.66, 0.44, u_cloudCover);
  return smoothstep(threshold, threshold + 0.22, base);
}

void main() {
  float azimuth = (v_uv.x * 2.0 - 1.0) * PI;
  float elevation = mix(0.0005, PI * 0.5, v_uv.y);
  float horizontal = cos(elevation);
  vec3 direction = vec3(
    sin(azimuth) * horizontal,
    sin(elevation),
    cos(azimuth) * horizontal
  );
  vec3 sky = texture(u_atmosphere, v_uv).rgb;
  float horizonFade = smoothstep(0.003, 0.03, direction.y);
  if (horizonFade <= 0.0) {
    outColor = vec4(sky, 0.0);
    return;
  }

  vec3 sunLight = atmosphericTransmittance(u_sunDirection, 1.9)
    * smoothstep(-0.03, 0.08, u_sunDirection.y)
    * 2.4;
  vec3 moonLight = vec3(0.44, 0.52, 0.72)
    * atmosphericTransmittance(u_moonDirection, 1.9)
    * smoothstep(-0.03, 0.08, u_moonDirection.y)
    * u_moonStrength
    * 3.2;
  vec3 light = sunLight + moonLight;
  vec3 lightDirection = u_sunDirection.y > -0.02 ? u_sunDirection : u_moonDirection;
  vec3 zenithSky = texture(u_atmosphere, vec2(v_uv.x, 0.72)).rgb;
  vec3 ambient = mix(sky, zenithSky, 0.55) * 1.15 + vec3(0.0007, 0.0010, 0.0018);
  float mu = clamp(dot(direction, lightDirection), -1.0, 1.0);
  float forwardScatter = pow(max(mu, 0.0), 6.0);
  int octaves = u_detail > 0.5 ? 6 : 4;
  vec2 seedOffset = vec2(u_seed * 91.7, u_seed * 47.3);
  vec2 windPerpendicular = vec2(-u_wind.y, u_wind.x);

  float highDistance = 8000.0 / direction.y;
  vec2 highPlane = direction.xz * highDistance * 0.001;
  vec2 highLocal = vec2(dot(highPlane, u_wind), dot(highPlane, windPerpendicular));
  highLocal += vec2(u_time * 0.011, u_time * 0.0015) + seedOffset * 0.7;
  highLocal.x *= 0.22;
  float wisps = cloudFbm(highLocal * 0.75, octaves);
  float wispDensity = smoothstep(0.52, 0.78, wisps)
    * mix(0.35, 0.65, u_cloudCover)
    * exp(-highDistance / 90000.0);
  vec3 cirrusColor = light * (0.62 + 0.55 * forwardScatter) + ambient * 0.9;

  float lowDistance = 1900.0 / direction.y;
  vec2 lowPlane = direction.xz * lowDistance * 0.001;
  vec2 lowPoint = lowPlane * 0.62 + u_wind * u_time * 0.0032 + seedOffset;
  float density = cumulusShape(lowPoint, octaves);
  vec2 towardSun = normalize(lightDirection.xz + vec2(0.0001))
    * (0.06 + 0.10 * (1.0 - clamp(lightDirection.y, 0.0, 1.0)));
  float shadowDensity = cumulusShape(lowPoint + towardSun, max(octaves - 2, 3));
  float lit = clamp(1.0 - shadowDensity * 0.85 + density * 0.15, 0.0, 1.0);
  float thickness = smoothstep(0.0, 0.9, density);
  vec3 cloudColor = light * (0.28 + 0.72 * lit) * (0.82 + 0.18 * mu)
    + ambient * (1.05 - 0.45 * thickness);
  cloudColor += light * forwardScatter * (1.0 - thickness) * 0.9;
  float lowFade = exp(-lowDistance / 110000.0);
  vec3 horizonSky = texture(u_atmosphere, vec2(v_uv.x, 0.02)).rgb;
  cloudColor = mix(horizonSky, cloudColor, exp(-lowDistance / 70000.0));
  float lowAlpha = density * lowFade * horizonFade * 0.97;
  float highAlpha = wispDensity * horizonFade;

  vec3 color = mix(sky, cirrusColor, highAlpha);
  color = mix(color, cloudColor, lowAlpha);
  float alpha = 1.0 - (1.0 - lowAlpha) * (1.0 - highAlpha);
  outColor = vec4(color, alpha);
}
`;

const displayFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform float u_stateBlend;
uniform sampler2D u_caustics;
uniform sampler2D u_sky;
uniform vec2 u_resolution;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform float u_scroll;
uniform vec3 u_sunDirection;
uniform vec3 u_displaySunDirection;
uniform vec3 u_primaryLightDirection;
uniform vec3 u_displayLightDirection;
uniform vec3 u_moonDirection;
uniform vec3 u_displayMoonDirection;
uniform vec3 u_moonPhaseLight;
uniform float u_sunAngularRadius;
uniform float u_moonAngularRadius;
uniform float u_moonIllumination;
uniform float u_moonStrength;
uniform float u_primaryIsMoon;
uniform float u_primaryLightStrength;
uniform float u_oceanTime;
uniform float u_seed;
uniform float u_windSpeed;
uniform vec2 u_windDirection;
uniform float u_choppiness;
uniform float u_waveHeight;
uniform float u_detail;
uniform float u_debugView;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform vec3 u_absorption;

in vec2 v_uv;
out vec4 outColor;

const float PI = 3.141592653589793;
const float WATER_IOR = ${WATER_IOR.toFixed(6)};
const float TURBIDITY = 1.9;
bool g_crossing = false;
${glslNoise}
${glslAtmosphere}
${glslWaves}
${glslFresnel}

float beckmannMasking(float cosine, float roughness) {
  float clampedCosine = max(cosine, 0.0001);
  float tangent = sqrt(max(1.0 - clampedCosine * clampedCosine, 0.0)) / clampedCosine;
  if (tangent < 0.0001) return 1.0;
  float ratio = 1.0 / (roughness * tangent);
  if (ratio >= 1.6) return 1.0;
  float ratioSquared = ratio * ratio;
  return (
    3.535 * ratio + 2.181 * ratioSquared
  ) / (
    1.0 + 2.276 * ratio + 2.577 * ratioSquared
  );
}

vec3 coxMunkSunGlitter(
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 sunColor
) {
  float normalView = max(dot(normal, viewDirection), 0.0);
  float normalLight = max(dot(normal, lightDirection), 0.0);
  if (normalView <= 0.0 || normalLight <= 0.0) return vec3(0.0);

  vec3 halfway = normalize(viewDirection + lightDirection);
  float normalHalfway = max(dot(normal, halfway), 0.0001);
  float tangentSquared = max(
    (1.0 - normalHalfway * normalHalfway) / (normalHalfway * normalHalfway),
    0.0
  );
  float meanSquareSlope = 0.0025 + 0.0016 * u_windSpeed;
  float distribution = exp(-tangentSquared / meanSquareSlope) / (
    PI * meanSquareSlope * pow(normalHalfway, 4.0)
  );
  float roughness = sqrt(meanSquareSlope);
  float masking = beckmannMasking(normalView, roughness) *
    beckmannMasking(normalLight, roughness);
  float fresnel = dielectricFresnel(max(dot(viewDirection, halfway), 0.0));
  float reflectedIrradiance = fresnel * distribution * masking / (4.0 * normalView);
  return sunColor * reflectedIrradiance * 0.36;
}

vec3 primaryLightRadiance() {
  vec3 sunlight = atmosphericTransmittance(u_sunDirection, TURBIDITY);
  vec3 moonlight = vec3(0.44, 0.52, 0.72)
    * atmosphericTransmittance(u_moonDirection, TURBIDITY);
  return mix(sunlight, moonlight, u_primaryIsMoon) * u_primaryLightStrength * 1.32;
}

vec3 starField(vec3 direction, float night, float cloudAlpha) {
  if (night <= 0.001 || direction.y <= 0.0) return vec3(0.0);
  vec2 sky = vec2(atan(direction.x, direction.z), asin(clamp(direction.y, -1.0, 1.0)));
  vec3 total = vec3(0.0);
  for (int layer = 0; layer < 2; layer += 1) {
    float scale = layer == 0 ? 14.0 : 26.0;
    float threshold = layer == 0 ? 0.62 : 0.78;
    vec2 scaled = sky * scale;
    vec2 cell = floor(scaled);
    vec3 random = hash33(vec3(cell, 3.7 + float(layer) * 11.0));
    if (random.z < threshold) continue;
    vec2 starPosition = 0.2 + 0.6 * random.xy;
    vec2 offset = (fract(scaled) - starPosition) * vec2(cos(sky.y), 1.0);
    float separation = length(offset) / scale;
    float magnitude = pow((random.z - threshold) / (1.0 - threshold), 2.2);
    float radius = 0.0009 + 0.0011 * magnitude;
    float core = exp(-separation * separation / (radius * radius));
    float twinkle = 0.86 + 0.14 * sin(u_oceanTime * 2.7 + random.x * 61.0);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.92, 0.78), random.y);
    total += tint * core * (0.05 + 0.7 * magnitude) * twinkle;
  }
  vec3 bandNormal = normalize(vec3(0.42, 0.62, 0.66));
  float bandDistance = abs(dot(direction, bandNormal));
  float band = exp(-bandDistance * bandDistance * 26.0);
  float bandTexture = noise21(sky * 9.0 + 3.1) * 0.6 + noise21(sky * 21.0 - 5.7) * 0.4;
  total += vec3(0.010, 0.012, 0.016) * band * (0.35 + 0.65 * bandTexture);
  return total * night * smoothstep(0.0, 0.10, direction.y) * (1.0 - cloudAlpha);
}

vec3 moonDisc(vec3 direction, vec3 discDirection, float cloudAlpha) {
  if (u_moonDirection.y <= -0.01) return vec3(0.0);
  if (dot(direction, discDirection) < 0.9998) return vec3(0.0);
  float moonRadius = sin(u_moonAngularRadius);
  vec3 reference = abs(discDirection.y) > 0.96
    ? vec3(1.0, 0.0, 0.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(reference, discDirection));
  vec3 bitangent = cross(discDirection, tangent);
  vec2 disc = vec2(dot(direction, tangent), dot(direction, bitangent)) / moonRadius;
  float radiusSquared = dot(disc, disc);
  float edge = 1.0 - smoothstep(0.92, 1.06, sqrt(radiusSquared));
  if (edge <= 0.0) return vec3(0.0);
  float inside = min(radiusSquared, 1.0);
  vec3 surfaceNormal = normalize(
    tangent * disc.x
      + bitangent * disc.y
      - discDirection * sqrt(max(1.0 - inside, 0.0))
  );
  float lunarDaylight = max(dot(surfaceNormal, u_moonPhaseLight), 0.0);
  float earthshine = 0.05 * (1.0 - u_moonIllumination);
  float limb = pow(max(1.0 - inside, 0.0), 0.16);
  vec3 moonColor = mix(
    vec3(1.0, 0.82, 0.62),
    vec3(0.96, 0.97, 1.0),
    clamp(u_moonDirection.y * 3.0, 0.0, 1.0)
  );
  return moonColor
    * (lunarDaylight * 0.6 + earthshine)
    * limb
    * edge
    * atmosphericTransmittance(u_moonDirection, TURBIDITY)
    * (1.0 - cloudAlpha * 0.9);
}

vec4 skyLut(vec3 direction) {
  vec3 skyDirection = normalize(vec3(
    direction.x,
    max(direction.y, 0.0005),
    direction.z
  ));
  return textureLod(u_sky, skyLutUv(skyDirection), 0.0);
}

vec3 skyBackground(vec3 skyDirection, vec4 sky) {
  float night = 1.0 - smoothstep(-0.16, -0.025, u_sunDirection.y);
  float moonUp = smoothstep(-0.02, 0.06, u_moonDirection.y);
  float lunarNight = night * moonUp * u_moonIllumination;
  vec3 lunarSky = vec3(0.0018, 0.0048, 0.0115)
    * lunarNight
    * mix(1.0, 0.46, smoothstep(0.0, 0.8, skyDirection.y));
  vec3 airglow = vec3(0.0016, 0.0022, 0.0040)
    * night
    * mix(1.0, 0.5, smoothstep(0.0, 0.6, skyDirection.y));
  float twilight = smoothstep(-0.34, -0.03, u_sunDirection.y)
    * (1.0 - smoothstep(-0.03, 0.05, u_sunDirection.y));
  vec2 sunHorizontal = normalize(u_sunDirection.xz + vec2(0.0001));
  vec2 viewHorizontal = normalize(skyDirection.xz + vec2(0.0001));
  float towardSun = max(dot(viewHorizontal, sunHorizontal), 0.0);
  float depth = clamp(-u_sunDirection.y / 0.34, 0.0, 1.0);
  vec3 twilightColor = mix(vec3(1.0, 0.42, 0.14), vec3(0.42, 0.22, 0.34), depth);
  vec3 twilightGlow = twilightColor
    * (0.25 + 0.75 * pow(towardSun, 2.5))
    * exp(-skyDirection.y / mix(0.16, 0.06, depth))
    * twilight
    * mix(0.08, 0.012, depth)
    * (1.0 - sky.a * 0.5);
  return sky.rgb + lunarSky + airglow + twilightGlow;
}

vec3 atmosphere(vec3 direction, float useDisplaySun) {
  vec3 skyDirection = normalize(vec3(direction.x, max(direction.y, 0.002), direction.z));
  vec4 sky = skyLut(skyDirection);
  vec3 discDirection = normalize(mix(
    u_sunDirection,
    u_displaySunDirection,
    useDisplaySun
  ));
  float cosineTheta = clamp(dot(skyDirection, discDirection), -1.0, 1.0);
  vec3 sunAttenuation = atmosphericTransmittance(u_sunDirection, TURBIDITY);
  float sunDisc = smoothstep(
    cos(u_sunAngularRadius * 1.08),
    cos(u_sunAngularRadius * 0.90),
    cosineTheta
  );
  float limbDarkening = mix(
    0.62,
    1.0,
    smoothstep(cos(u_sunAngularRadius * 1.02), cos(u_sunAngularRadius * 0.25), cosineTheta)
  );
  float lensBloom = exp(
    (cosineTheta - 1.0) / max(u_sunAngularRadius * u_sunAngularRadius * 6.0, 0.00002)
  );
  float sunAureole = exp((cosineTheta - 1.0) / 0.00055);
  float sunVisible = step(0.0, u_sunDirection.y);
  float cloudShade = 1.0 - sky.a * 0.9;
  vec3 directSun = sunAttenuation
    * (
      sunDisc * limbDarkening * 46.0 * cloudShade
        + lensBloom * 4.6 * cloudShade
        + sunAureole * 0.52 * (1.0 - sky.a * 0.5)
    )
    * sunVisible;

  vec3 moonDiscDirection = normalize(mix(
    u_moonDirection,
    u_displayMoonDirection,
    useDisplaySun
  ));
  float moonUp = smoothstep(-0.02, 0.06, u_moonDirection.y);
  float moonCosine = clamp(dot(skyDirection, moonDiscDirection), -1.0, 1.0);
  float moonHalo = exp((moonCosine - 1.0) / 0.0009);
  vec3 moonGlow = vec3(0.30, 0.40, 0.62)
    * moonHalo
    * u_moonStrength
    * moonUp
    * 5.0
    * atmosphericTransmittance(u_moonDirection, TURBIDITY)
    * (1.0 - sky.a * 0.6);
  float starNight = 1.0 - smoothstep(-0.22, -0.06, u_sunDirection.y);
  return skyBackground(skyDirection, sky)
    + directSun
    + moonGlow
    + moonDisc(skyDirection, moonDiscDirection, sky.a)
    + starField(skyDirection, starNight, sky.a) * mix(0.4, 1.0, useDisplaySun);
}

vec3 seabedAlbedo(vec2 position) {
  float broad = sedimentNoise(position * 0.31);
  float fine = sedimentNoise(position * 1.7 + 4.2);
  float grain = noise21(position * 8.3 - 2.6);
  float ripplePhase = position.x * 1.35
    + sin(position.y * 0.23 + broad * 2.2) * 1.35;
  float ripple = 0.5 + 0.5 * sin(ripplePhase);
  vec2 stoneCell = floor(position * 0.42);
  vec2 stoneLocal = fract(position * 0.42) - 0.5;
  vec2 stoneOffset = vec2(
    noise21(stoneCell + 3.2),
    noise21(stoneCell - 7.1)
  ) * 0.42 - 0.21;
  float stone = (1.0 - smoothstep(0.045, 0.115, length(stoneLocal - stoneOffset)))
    * smoothstep(0.78, 0.94, noise21(stoneCell + 11.7));
  vec2 shellCell = floor(position * 1.9);
  vec2 shellLocal = fract(position * 1.9) - 0.5;
  vec2 shellOffset = vec2(
    noise21(shellCell + 8.5),
    noise21(shellCell - 2.9)
  ) * 0.5 - 0.25;
  float shell = (1.0 - smoothstep(0.03, 0.075, length(shellLocal - shellOffset)))
    * smoothstep(0.86, 0.96, noise21(shellCell * 1.7 + 5.3));
  vec3 silt = mix(vec3(0.15, 0.15, 0.11), vec3(0.43, 0.35, 0.20), broad);
  return silt
    * mix(0.84, 1.12, fine)
    * mix(0.88, 1.10, grain)
    * mix(0.78, 1.18, ripple)
    * mix(1.0, 0.42, stone)
    * mix(1.0, 1.65, shell);
}

vec3 seabedNormal(vec2 position) {
  float broad = sedimentNoise(position * 0.31);
  float phase = position.x * 1.35
    + sin(position.y * 0.23 + broad * 2.2) * 1.35;
  float ridgeSlope = cos(phase) * 0.16;
  float crossSlope = cos(
    dot(position, vec2(0.31, 1.0)) * 2.7 + broad * 3.1
  ) * 0.035;
  return normalize(vec3(-ridgeSlope, 1.0, -crossSlope));
}

vec3 waterExtinctionCoefficient() {
  return u_absorption + vec3(0.062, 0.055, 0.048);
}

float lunarNightFactor() {
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  return (1.0 - daylight)
    * smoothstep(-0.02, 0.20, u_moonDirection.y)
    * u_moonIllumination;
}

vec3 waterAmbientRadiance() {
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  return vec3(0.003, 0.015, 0.034) * mix(0.08, 1.0, daylight)
    + vec3(0.0028, 0.0062, 0.0138) * lunarNightFactor()
    + vec3(0.0040, 0.0075, 0.0160) * u_moonStrength;
}

vec3 refractedSunDirection() {
  return refract(
    -u_primaryLightDirection,
    vec3(0.0, 1.0, 0.0),
    1.0 / WATER_IOR
  );
}

vec3 seabedRadiance(vec2 floorPosition) {
  vec2 floorUv = fract(floorPosition / u_domainSize + 0.5);
  float causticEnergy = textureLod(u_caustics, floorUv, 0.75).r;
  vec3 lightColor = primaryLightRadiance();
  vec3 refractedLight = refractedSunDirection();
  vec3 bedNormal = seabedNormal(floorPosition);
  float bedIllumination = mix(
    0.52,
    1.32,
    max(dot(bedNormal, -refractedLight), 0.0)
  );
  float lightWaterPath = u_floorDepth / max(-refractedLight.y, 0.0001);
  vec3 lightThroughWater = exp(-waterExtinctionCoefficient() * lightWaterPath);
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  vec3 floorAmbient = mix(
    vec3(0.0045, 0.0095, 0.0200),
    vec3(0.105, 0.150, 0.180),
    daylight
  ) + vec3(0.0070, 0.0140, 0.0290) * lunarNightFactor();
  return seabedAlbedo(floorPosition) * (
    floorAmbient + lightColor * lightThroughWater * (
        0.55 + bedIllumination * causticEnergy * 4.6
      )
  );
}

float henyeyGreenstein(float cosineTheta, float anisotropy) {
  float anisotropySquared = anisotropy * anisotropy;
  return (1.0 - anisotropySquared) / (
    4.0 * PI * pow(
      max(1.0 + anisotropySquared - 2.0 * anisotropy * cosineTheta, 0.0001),
      1.5
    )
  );
}

vec3 underwaterVolume(
  vec3 origin,
  vec3 direction,
  float distance,
  int sampleCount
) {
  float marchDistance = clamp(distance, 0.0, 52.0);
  float stepLength = marchDistance / float(sampleCount);
  vec3 extinction = waterExtinctionCoefficient();
  vec3 scattering = vec3(0.020, 0.040, 0.064);
  vec3 lightColor = primaryLightRadiance();
  vec3 refractedLight = refractedSunDirection();
  float phase = henyeyGreenstein(dot(refractedLight, -direction), 0.64);
  vec3 accumulated = vec3(0.0);

  for (int sampleIndex = 0; sampleIndex < 6; sampleIndex += 1) {
    if (sampleIndex >= sampleCount) break;
    float sampleDistance = (float(sampleIndex) + 0.5) * stepLength;
    vec3 samplePosition = origin + direction * sampleDistance;
    float sampleDepth = max(-samplePosition.y, 0.0);
    float lightPath = sampleDepth / max(-refractedLight.y, 0.0001);
    vec2 surfaceOrigin = samplePosition.xz
      - refractedLight.xz * lightPath;
    vec2 lightDrift = vec2(
      u_oceanTime * 0.016,
      -u_oceanTime * 0.011
    );
    float broadLight = sedimentNoise(
      surfaceOrigin * 0.072 + lightDrift + u_seed * 23.0
    );
    float fineLight = noise21(
      mat2(0.62, -0.78, 0.78, 0.62) * surfaceOrigin * 0.19
        - lightDrift * 1.7
        + u_seed * 41.0
    );
    float lightNoise = clamp(broadLight * 0.68 + fineLight * 0.32, 0.0, 1.0);
    float surfaceLens = clamp(
      simulationHeight(worldToWaterUv(surfaceOrigin)) * 4.8 + 0.54,
      0.0,
      1.0
    );
    float rayModulation = mix(
      0.70,
      1.30,
      smoothstep(0.24, 0.82, lightNoise * 0.78 + surfaceLens * 0.25)
    );
    float remainingDepth = max(u_floorDepth + samplePosition.y, 0.0);
    float beamDistance = remainingDepth / max(-refractedLight.y, 0.0001);
    vec2 beamFloor = samplePosition.xz + refractedLight.xz * beamDistance;
    float beamFocus = clamp(
      textureLod(
        u_caustics,
        fract(beamFloor / u_domainSize + 0.5),
        3.05
      ).r,
      0.0,
      2.4
    );
    float focusedShaft = 0.18
      + smoothstep(0.55, 1.60, beamFocus) * 1.02;
    focusedShaft *= mix(
      0.82,
      1.18,
      noise21(
        beamFloor * 0.083
          + vec2(u_oceanTime * 0.013, -u_oceanTime * 0.009)
          + u_seed * 17.0
      )
    ) * rayModulation;
    vec3 pathTransmittance = exp(
      -extinction * (sampleDistance + lightPath)
    );
    accumulated += lightColor
      * pathTransmittance
      * scattering
      * phase
      * focusedShaft
      * stepLength;
  }

  vec2 ambientPosition = origin.xz
    + direction.xz * marchDistance * 0.47;
  float ambientVariation = clamp(
    sedimentNoise(
      ambientPosition * 0.078
        + vec2(u_oceanTime * 0.006, -u_oceanTime * 0.004)
        + u_seed * 29.0
    ),
    0.0,
    1.0
  );
  vec3 ambient = waterAmbientRadiance()
    * (1.0 - exp(-extinction * marchDistance))
    * mix(0.72, 1.28, ambientVariation);
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  return accumulated * mix(12.0, 9.60, daylight) + ambient * 0.78;
}

vec3 marineSnow(
  vec3 origin,
  vec3 ray,
  vec3 forward,
  vec3 right,
  vec3 up,
  float maxDistance
) {
  vec3 extinction = waterExtinctionCoefficient();
  vec3 lightColor = primaryLightRadiance();
  vec3 refractedLight = refractedSunDirection();
  vec3 ambient = waterAmbientRadiance();
  float layerDistances[4];
  layerDistances[0] = 0.9;
  layerDistances[1] = 2.1;
  layerDistances[2] = 4.6;
  layerDistances[3] = 9.5;
  float angularRadius[4];
  angularRadius[0] = 0.026;
  angularRadius[1] = 0.013;
  angularRadius[2] = 0.008;
  angularRadius[3] = 0.005;
  int layerCount = u_detail > 0.5 && !g_crossing ? 4 : 2;
  float cosine = dot(ray, forward);
  if (cosine < 0.25) return vec3(0.0);
  vec3 total = vec3(0.0);

  for (int layer = 0; layer < 4; layer += 1) {
    if (layer >= layerCount) break;
    float layerDistance = layerDistances[layer];
    float along = layerDistance / cosine;
    if (along > maxDistance) break;
    vec3 point = origin + ray * along;
    float cellSize = layerDistance * 0.30;
    float layerSeed = float(layer) * 17.3 + u_seed * 53.0;
    vec2 drift = vec2(
      sin(u_oceanTime * 0.07 + layerSeed) * 0.35 * layerDistance,
      u_oceanTime * 0.022
    );
    vec2 plane = vec2(dot(point, right), dot(point, up)) + drift;
    vec2 cell = floor(plane / cellSize);
    vec3 random = hash33(vec3(cell, layerSeed));
    if (random.z < 0.40) continue;
    vec2 particle = (cell + 0.30 + 0.40 * random.xy) * cellSize;
    float across = length(plane - particle);
    float radius = min(
      angularRadius[layer] * layerDistance * (0.7 + 0.6 * random.x),
      cellSize * 0.28
    );
    float speck = 1.0 - smoothstep(radius * 0.25, radius, across);
    if (speck <= 0.0) continue;
    float depth = max(-point.y, 0.0);
    float lightPath = depth / max(-refractedLight.y, 0.0001);
    vec3 illumination = lightColor * exp(-extinction * (lightPath + along)) * 0.5
      + ambient * 2.4;
    total += illumination * speck * (0.35 + 0.65 * random.y)
      * (layer == 0 ? 0.45 : 0.7);
  }

  return total;
}

vec3 acesFilm(vec3 color) {
  return clamp(
    (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14),
    0.0,
    1.0
  );
}

vec3 encodeScene(vec3 color, vec3 grade, float exposure) {
  color = max(color * grade, vec3(0.0)) * exposure;
  color = acesFilm(color);
  return pow(color, vec3(1.0 / 2.2));
}

bool intersectOceanSurface(
  vec3 origin,
  vec3 direction,
  out float distance,
  out vec3 position
) {
  if (abs(direction.y) < 0.0001) return false;
  float crestHeight = u_waveHeight;
  float nearDistance = (crestHeight - origin.y) / direction.y;
  float farDistance = (-crestHeight - origin.y) / direction.y;
  if (direction.y > 0.0) {
    float swap = nearDistance;
    nearDistance = farDistance;
    farDistance = swap;
  }
  nearDistance = max(nearDistance, 0.0);
  if (farDistance <= 0.0) return false;

  float previousDistance = nearDistance;
  float previousSign = origin.y + direction.y * nearDistance
    - oceanHeight(origin.xz + direction.xz * nearDistance, nearDistance);
  if (previousSign == 0.0) previousSign = direction.y > 0.0 ? -1.0 : 1.0;
  bool found = false;
  float crossingSign = -previousSign;
  float lowDistance = nearDistance;
  float highDistance = farDistance;

  int marchSteps = farDistance - nearDistance < 6.0 ? 5 : 7;
  for (int stepIndex = 1; stepIndex <= 7; stepIndex += 1) {
    if (stepIndex > marchSteps) break;
    float fraction = float(stepIndex) / float(marchSteps);
    float sampleDistance = mix(nearDistance, farDistance, fraction);
    vec3 samplePosition = origin + direction * sampleDistance;
    float sign = samplePosition.y - oceanHeight(samplePosition.xz, sampleDistance);
    if (sign * previousSign <= 0.0) {
      lowDistance = previousDistance;
      highDistance = sampleDistance;
      crossingSign = sign;
      found = true;
      break;
    }
    previousDistance = sampleDistance;
    previousSign = sign;
  }
  if (!found) {
    distance = farDistance;
    position = origin + direction * farDistance;
    return true;
  }

  float lowSign = previousSign;
  float highSign = crossingSign;
  for (int refineIndex = 0; refineIndex < 5; refineIndex += 1) {
    float middleDistance = 0.5 * (lowDistance + highDistance);
    vec3 middlePosition = origin + direction * middleDistance;
    float sign = middlePosition.y - oceanHeight(middlePosition.xz, middleDistance);
    if (sign * previousSign <= 0.0) {
      highDistance = middleDistance;
      highSign = sign;
    } else {
      lowDistance = middleDistance;
      lowSign = sign;
    }
  }
  float blend = clamp(
    abs(lowSign) / max(abs(lowSign) + abs(highSign), 0.000001),
    0.0,
    1.0
  );
  distance = mix(lowDistance, highDistance, blend);
  position = origin + direction * distance;
  return true;
}

vec3 sampleUnderwaterRay(vec3 origin, vec3 direction, int sampleCount) {
  vec3 extinction = waterExtinctionCoefficient();
  float floorDistance = direction.y < -0.0001
    ? (-u_floorDepth - origin.y) / direction.y
    : 1e5;
  float floorVisibility = smoothstep(0.68, 0.94, u_scroll);
  float boundedFloorDistance = min(max(floorDistance, 0.0), 52.0);
  float visibleDistance = mix(52.0, boundedFloorDistance, floorVisibility);
  vec3 targetRadiance = waterAmbientRadiance();

  if (floorDistance > 0.0 && floorDistance <= 52.0) {
    vec2 floorPosition = origin.xz + direction.xz * floorDistance;
    targetRadiance = mix(
      targetRadiance,
      seabedRadiance(floorPosition),
      floorVisibility
    );
  }

  vec3 volumeRadiance = underwaterVolume(
    origin,
    direction,
    visibleDistance,
    sampleCount
  );
  return targetRadiance * exp(-extinction * visibleDistance)
    + volumeRadiance * mix(1.0, 0.38, floorVisibility);
}

vec3 renderAboveWater(vec3 origin, vec3 ray) {
  if (ray.y >= -0.0001) {
    return atmosphere(ray, 1.0);
  }

  float distanceToSurface;
  vec3 surfacePosition;
  if (!intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition)) {
    return atmosphere(ray, 1.0);
  }

  float horizonDetail = smoothstep(0.006, 0.07, -ray.y);
  vec3 normal = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(surfacePosition.xz, distanceToSurface),
    horizonDetail
  ));
  vec3 sunColor = primaryLightRadiance();
  vec3 reflectedDirection = reflect(ray, normal);
  vec3 reflected = atmosphere(reflectedDirection, 0.0);
  vec3 refractedDirection = refract(ray, normal, 1.0 / WATER_IOR);
  vec3 refracted = sampleUnderwaterRay(
    surfacePosition + refractedDirection * 0.025,
    refractedDirection,
    g_crossing ? 2 : 3
  );
  float facing = max(dot(-ray, normal), 0.0);
  float fresnel = dielectricFresnel(facing);
  vec3 color = mix(refracted, reflected, fresnel);

  float crest = smoothstep(0.02, 0.36 * u_waveHeight, surfacePosition.y);
  vec2 towardSun = normalize(u_displayLightDirection.xz + vec2(0.0001));
  vec2 viewHorizontal = normalize(ray.xz + vec2(0.0001));
  float backlight = pow(max(dot(viewHorizontal, towardSun), 0.0), 3.0);
  float scatterReach = 1.0 - smoothstep(24.0, 170.0, distanceToSurface);
  float lowSun = 1.0 - smoothstep(0.05, 0.55, u_sunDirection.y);
  vec3 subsurface = sunColor
    * vec3(0.05, 0.30, 0.27)
    * crest
    * (0.22 + 0.78 * backlight)
    * (1.0 - fresnel)
    * scatterReach
    * mix(0.35, 1.0, lowSun)
    * 0.36;
  color += subsurface;

  float glitterDetail = mix(
    0.22,
    1.0,
    horizonDetail * (
      1.0 - smoothstep(100.0, 480.0, distanceToSurface)
    )
  );
  float sparkleReach = 1.0 - smoothstep(30.0, 260.0, distanceToSurface);
  vec3 glitterNormal = normal;
  if (sparkleReach > 0.001) {
    vec2 capillaryDrift = u_windDirection * u_oceanTime * 1.9;
    vec2 coarsePoint = surfacePosition.xz * 7.0 + capillaryDrift;
    vec2 finePoint = mat2(0.6, -0.8, 0.8, 0.6) * surfacePosition.xz * 21.0
      - capillaryDrift * 1.4;
    vec2 capillarySlope = vec2(
      noise21(coarsePoint + vec2(0.3, 0.0)) - noise21(coarsePoint - vec2(0.3, 0.0)),
      noise21(coarsePoint + vec2(0.0, 0.3)) - noise21(coarsePoint - vec2(0.0, 0.3))
    ) * 0.42 + vec2(
      noise21(finePoint + vec2(0.3, 0.0)) - noise21(finePoint - vec2(0.3, 0.0)),
      noise21(finePoint + vec2(0.0, 0.3)) - noise21(finePoint - vec2(0.0, 0.3))
    ) * 0.26;
    glitterNormal = normalize(
      normal + vec3(capillarySlope.x, 0.0, capillarySlope.y) * sparkleReach
    );
  }
  color += coxMunkSunGlitter(
    glitterNormal,
    -ray,
    u_displayLightDirection,
    sunColor
  ) * glitterDetail;

  float foamReach = (1.0 - smoothstep(50.0, 240.0, distanceToSurface)) * horizonDetail;
  if (foamReach > 0.001) {
    float jacobian = oceanFoamJacobian(surfacePosition.xz, distanceToSurface);
    vec2 foamDrift = u_windDirection * u_oceanTime * 0.09;
    float bubbles = noise21(surfacePosition.xz * 0.9 + foamDrift) * 0.55
      + noise21(surfacePosition.xz * 3.4 - foamDrift * 1.6) * 0.45;
    vec2 windPerpendicular = vec2(-u_windDirection.y, u_windDirection.x);
    float streaks = noise21(vec2(
      dot(surfacePosition.xz, u_windDirection) * 0.07 + u_oceanTime * 0.02,
      dot(surfacePosition.xz, windPerpendicular) * 0.75
    ));
    float crestFoam = (1.0 - smoothstep(0.79, 0.855, jacobian))
      * smoothstep(0.34, 0.70, bubbles + crest * 0.22);
    float streakFoam = smoothstep(0.72, 0.94, streaks)
      * smoothstep(0.62, 1.0, crest)
      * smoothstep(0.35, 0.7, bubbles)
      * 0.35;
    float foam = clamp(crestFoam + streakFoam, 0.0, 1.0) * foamReach;
    if (foam > 0.001) {
      float foamLight = max(dot(normal, u_displayLightDirection), 0.0) * 0.72 + 0.08;
      vec3 foamRadiance = vec3(0.84, 0.86, 0.86)
        * (sunColor * foamLight + skyLut(vec3(0.0, 1.0, 0.0)).rgb * 0.95);
      color = mix(color, foamRadiance, foam * 0.9);
    }
    if (u_debugView > 2.5) {
      color = mix(color, vec3(2.0, 0.0, 0.0), foam);
    }
  }

  vec3 horizonDirection = normalize(vec3(ray.x, 0.012, ray.z));
  vec3 horizonSky = skyBackground(horizonDirection, skyLut(horizonDirection));
  float distanceHaze = 1.0 - exp(-distanceToSurface / 2200.0);
  float horizonHaze = (1.0 - smoothstep(0.0, 0.028, -ray.y)) * 0.9;
  return mix(color, horizonSky, max(distanceHaze, horizonHaze));
}

vec3 renderBelowWaterSurface(vec3 origin, vec3 ray) {
  vec3 extinction = waterExtinctionCoefficient();
  if (ray.y <= 0.0001) {
    return sampleUnderwaterRay(origin, ray, g_crossing ? 3 : 6);
  }

  float distanceToSurface;
  vec3 surfacePosition;
  if (!intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition)) {
    return sampleUnderwaterRay(origin, ray, g_crossing ? 3 : 6);
  }

  float roughFootprint = mix(
    0.28,
    1.45,
    smoothstep(0.0, 14.0, distanceToSurface)
  );
  int volumeSamples = g_crossing || distanceToSurface < 8.0 ? 3 : 6;
  vec3 surfaceNormals[3];
  surfaceNormals[0] = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(surfacePosition.xz, distanceToSurface),
    0.56
  ));
  float normalWeights[3];
  if (g_crossing) {
    surfaceNormals[1] = surfaceNormals[0];
    surfaceNormals[2] = surfaceNormals[0];
    normalWeights[0] = 1.0;
    normalWeights[1] = 0.0;
    normalWeights[2] = 0.0;
  } else {
    surfaceNormals[1] = normalize(mix(
      vec3(0.0, 1.0, 0.0),
      surfaceNormal(
        surfacePosition.xz + vec2(0.73, -0.41) * roughFootprint,
        distanceToSurface
      ),
      0.50
    ));
    surfaceNormals[2] = normalize(mix(
      vec3(0.0, 1.0, 0.0),
      surfaceNormal(
        surfacePosition.xz + vec2(-0.37, 0.81) * roughFootprint,
        distanceToSurface
      ),
      0.46
    ));
    normalWeights[0] = 0.44;
    normalWeights[1] = 0.30;
    normalWeights[2] = 0.26;
  }
  vec3 transmittedSky = vec3(0.0);
  float transmittedEnergy = 0.0;

  for (int normalIndex = 0; normalIndex < 3; normalIndex += 1) {
    if (normalWeights[normalIndex] <= 0.0) continue;
    vec3 normal = surfaceNormals[normalIndex];
    float waterFacing = max(dot(ray, normal), 0.0);
    float fresnel = dielectricFresnelBetween(waterFacing, WATER_IOR, 1.0);
    vec3 transmittedDirection = refract(ray, -normal, WATER_IOR);
    // Total internal reflection returns a zero vector. Skip the sky lookup:
    // the zenith fallback inside atmosphere() feeds atan(0, 0) to the star
    // hash, and the NaN survives the zero transmission weight.
    if (dot(transmittedDirection, transmittedDirection) < 0.000001) continue;
    float transmission = 1.0 - fresnel;
    transmittedSky += atmosphere(transmittedDirection, 0.0)
      * transmission
      * normalWeights[normalIndex];
    transmittedEnergy += transmission * normalWeights[normalIndex];
  }

  vec3 reflectedDirection = reflect(ray, surfaceNormals[0]);
  vec3 reflectedWater = sampleUnderwaterRay(
    surfacePosition - surfaceNormals[0] * 0.025,
    reflectedDirection,
    3
  );
  vec3 surfaceRadiance = transmittedSky
    + reflectedWater * (1.0 - transmittedEnergy);
  surfaceRadiance = mix(
    waterAmbientRadiance() * 1.45,
    surfaceRadiance,
    0.82
  );
  vec3 resolvedSurface = surfaceRadiance * exp(-extinction * distanceToSurface)
    + underwaterVolume(origin, ray, distanceToSurface, volumeSamples);
  if (ray.y < 0.12) {
    vec3 waterColumn = sampleUnderwaterRay(origin, ray, volumeSamples);
    return mix(
      waterColumn,
      resolvedSurface,
      smoothstep(0.005, 0.12, ray.y)
    );
  }
  return resolvedSurface;
}

vec3 renderBelowWater(
  vec3 origin,
  vec3 ray,
  vec3 forward,
  vec3 right,
  vec3 up
) {
  vec3 color = renderBelowWaterSurface(origin, ray);
  float snowDistance = ray.y > 0.02
    ? max(-origin.y / ray.y, 0.0)
    : 40.0;
  return color + marineSnow(origin, ray, forward, right, up, snowDistance);
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 screen = v_uv * 2.0 - 1.0;
  screen.x *= aspect;
  if (u_debugView > 0.5 && u_debugView < 2.5) {
    float debugAzimuth = (v_uv.x * 2.0 - 1.0) * PI * 0.25;
    float debugElevation = v_uv.y * PI * 0.25;
    vec3 debugDirection = vec3(
      sin(debugAzimuth) * cos(debugElevation),
      sin(debugElevation),
      cos(debugAzimuth) * cos(debugElevation)
    );
    vec4 debugSky = skyLut(debugDirection);
    vec3 debugColor = u_debugView > 1.5
      ? vec3(debugSky.a)
      : encodeScene(atmosphere(debugDirection, 1.0), vec3(1.0), 0.92);
    outColor = vec4(debugColor, 1.0);
    return;
  }
  float entry = smoothstep(0.0, 0.205, u_scroll);
  float deepDescent = smoothstep(0.19, 0.96, u_scroll);
  float floorView = smoothstep(0.58, 0.96, u_scroll);
  float seedPhase = u_seed * 6.28318530718;
  vec3 entryOrigin = mix(
    vec3(${CAMERA_ORIGIN_TOP[0].toFixed(2)}, ${CAMERA_ORIGIN_TOP[1].toFixed(2)}, ${CAMERA_ORIGIN_TOP[2].toFixed(2)}),
    vec3(0.0, -0.16, -2.75),
    entry
  );
  vec3 origin = mix(
    entryOrigin,
    vec3(
      ${CAMERA_ORIGIN_BOTTOM[0].toFixed(2)},
      ${CAMERA_ORIGIN_BOTTOM[1].toFixed(2)},
      ${CAMERA_ORIGIN_BOTTOM[2].toFixed(2)}
    ),
    deepDescent
  );
  origin.x += sin(u_scroll * 5.1 + seedPhase) * 2.4 * deepDescent;
  origin.z += sin(u_scroll * 2.7 + seedPhase * 1.7) * 1.2 * deepDescent;

  vec3 startForward = normalize(
    vec3(${CAMERA_TARGET_TOP[0].toFixed(2)}, ${CAMERA_TARGET_TOP[1].toFixed(2)}, ${CAMERA_TARGET_TOP[2].toFixed(2)})
      - vec3(${CAMERA_ORIGIN_TOP[0].toFixed(2)}, ${CAMERA_ORIGIN_TOP[1].toFixed(2)}, ${CAMERA_ORIGIN_TOP[2].toFixed(2)})
  );
  vec3 surfaceForward = normalize(vec3(0.0, -0.018, 1.0));
  vec3 floorForward = normalize(vec3(0.12, -0.72, 1.0));
  vec3 forward = normalize(mix(startForward, surfaceForward, entry));
  forward = normalize(mix(forward, floorForward, floorView));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  float focalLength = mix(${CAMERA_FOCAL_LENGTH.toFixed(2)}, 1.30, entry);
  focalLength = mix(
    focalLength,
    1.55,
    smoothstep(0.18, 0.30, u_scroll)
  );
  focalLength = mix(focalLength, 1.68, floorView);
  vec3 ray = normalize(
    forward * focalLength + right * screen.x + up * screen.y
  );

  float localSurfaceHeight = oceanHeight(origin.xz, 0.0);
  float cameraUnderwaterMix = 1.0 - smoothstep(
    -0.12,
    0.12,
    origin.y - localSurfaceHeight
  );
  g_crossing = cameraUnderwaterMix > 0.001 && cameraUnderwaterMix < 0.999;
  vec3 aboveOrigin = vec3(
    origin.x,
    max(origin.y, localSurfaceHeight + 0.025),
    origin.z
  );
  vec3 belowOrigin = vec3(
    origin.x,
    min(origin.y, localSurfaceHeight - 0.025),
    origin.z
  );
  vec3 aboveColor = vec3(0.0);
  vec3 belowColor = vec3(0.0);
  if (cameraUnderwaterMix < 0.999) {
    aboveColor = renderAboveWater(aboveOrigin, ray);
  }
  if (cameraUnderwaterMix > 0.001) {
    belowColor = renderBelowWater(belowOrigin, ray, forward, right, up);
  }
  float pixelUnderwaterMix = smoothstep(
    0.16,
    0.84,
    cameraUnderwaterMix
  );
  if (cameraUnderwaterMix <= 0.001) pixelUnderwaterMix = 0.0;
  if (cameraUnderwaterMix >= 0.999) pixelUnderwaterMix = 1.0;
  vec3 color = mix(aboveColor, belowColor, pixelUnderwaterMix);

  float depthProgress = clamp(-origin.y / u_floorDepth, 0.0, 1.0);
  float floorReveal = smoothstep(0.72, 0.96, depthProgress);
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  vec3 aboveGrade = mix(
    vec3(0.70, 0.89, 1.22),
    vec3(0.92, 0.98, 1.05),
    daylight
  );
  vec3 underwaterGrade = mix(
    vec3(0.56, 1.06, 1.42),
    vec3(0.78, 1.04, 1.18),
    floorReveal
  );
  float aboveExposure = mix(6.4, 0.92, daylight);
  float underwaterExposure = mix(6.2, mix(1.18, 1.48, floorReveal), daylight);
  vec3 encoded = encodeScene(
    color,
    mix(aboveGrade, underwaterGrade, pixelUnderwaterMix),
    mix(aboveExposure, underwaterExposure, pixelUnderwaterMix)
  );

  vec2 vignetteCoordinate = (v_uv - 0.5) * vec2(1.0, 1.0 / max(aspect, 0.5));
  float vignette = 1.0 - 0.16 * smoothstep(0.32, 0.78, length(vignetteCoordinate) * 1.35);
  encoded *= vignette;
  float grain = hash21(gl_FragCoord.xy + fract(u_oceanTime) * 61.0) - 0.5;
  encoded += grain / 255.0 * 1.6;
  outColor = vec4(encoded, 1.0);
}
`;

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL shader allocation failed");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program allocation failed");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "WebGL program link failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function getUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const uniform = gl.getUniformLocation(program, name);
  if (!uniform) throw new Error(`WebGL uniform ${name} is unavailable`);
  return uniform;
}

function createFullscreenGeometry(gl: WebGL2RenderingContext) {
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vertexArray || !buffer) throw new Error("WebGL geometry allocation failed");

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { buffer, vertexArray };
}

function createCausticGeometry(gl: WebGL2RenderingContext, size: number) {
  const vertices = new Float32Array((size - 1) * (size - 1) * 12);
  let offset = 0;
  const writeVertex = (x: number, y: number) => {
    vertices[offset] = x;
    vertices[offset + 1] = y;
    offset += 2;
  };

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const left = x / (size - 1);
      const right = (x + 1) / (size - 1);
      const bottom = y / (size - 1);
      const top = (y + 1) / (size - 1);
      writeVertex(left, bottom);
      writeVertex(right, bottom);
      writeVertex(left, top);
      writeVertex(left, top);
      writeVertex(right, bottom);
      writeVertex(right, top);
    }
  }

  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vertexArray || !buffer) throw new Error("WebGL caustic geometry allocation failed");

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { buffer, vertexArray, vertexCount: vertices.length / 2 };
}

function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
  data: ArrayBufferView | null,
  filter: number,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL texture allocation failed");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    data,
  );
  return texture;
}

function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number,
  type: number,
  data: ArrayBufferView | null,
  filter: number,
): RenderTarget {
  const texture = createTexture(
    gl,
    width,
    height,
    internalFormat,
    gl.RGBA,
    type,
    data,
    filter,
  );
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("WebGL framebuffer allocation failed");

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error("WebGL floating-point framebuffer is incomplete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture };
}

type InitialState = {
  drive: Float32Array;
  drivePhase: Float32Array;
  state: Float32Array;
};

function createInitialState(
  size: number,
  seed: number,
  windAngle: number,
): InitialState {
  const random = seededRandom(seed);
  const currentHeight = new Float32Array(size * size);
  const previousHeight = new Float32Array(size * size);
  const modes: Array<{
    amplitude: number;
    phase: number;
    previousPhaseOffset: number;
    waveX: number;
    waveY: number;
  }> = [];
  const windSpeed = 4.6 + random() * 1.4;
  const largestWave = (windSpeed * windSpeed) / 9.81;
  const shortWaveDamping = 0.03 + random() * 0.012;
  const maximumMode = 90;
  const primaryWindAngle = windAngle + (random() - 0.5) * 0.3;
  const crossingWindAngle =
    primaryWindAngle + (0.58 + random() * 0.56) * (random() > 0.5 ? 1 : -1);
  const primaryWindX = Math.cos(primaryWindAngle);
  const primaryWindY = Math.sin(primaryWindAngle);
  const crossingWindX = Math.cos(crossingWindAngle);
  const crossingWindY = Math.sin(crossingWindAngle);

  for (let modeY = -maximumMode; modeY <= maximumMode; modeY += 1) {
    for (let modeX = -maximumMode; modeX <= maximumMode; modeX += 1) {
      if (modeY < 0 || (modeY === 0 && modeX <= 0)) continue;
      if (modeX === 0 && modeY === 0) continue;
      if (random() > 0.04) continue;

      const waveX = (2 * Math.PI * modeX) / WATER_DOMAIN_METERS;
      const waveY = (2 * Math.PI * modeY) / WATER_DOMAIN_METERS;
      const waveNumber = Math.hypot(waveX, waveY);
      const primaryAlignment = Math.abs(
        (waveX * primaryWindX + waveY * primaryWindY) / waveNumber,
      );
      const crossingAlignment = Math.abs(
        (waveX * crossingWindX + waveY * crossingWindY) / waveNumber,
      );
      const directionalEnergy =
        0.24 + 0.58 * primaryAlignment ** 4 + 0.18 * crossingAlignment ** 6;
      const spectrum =
        (Math.exp(-1 / (waveNumber * waveNumber * largestWave * largestWave)) /
          waveNumber ** 4) *
        directionalEnergy *
        Math.exp(-((waveNumber * shortWaveDamping) ** 2));
      if (spectrum < 0.000002) continue;

      const gaussian = Math.sqrt(-2 * Math.log(Math.max(random(), 0.000001)));
      const phase = random() * Math.PI * 2;
      const angularFrequency = Math.sqrt(9.81 * waveNumber);
      modes.push({
        amplitude: Math.sqrt(spectrum) * gaussian,
        phase,
        previousPhaseOffset: angularFrequency * FIXED_TIME_STEP,
        waveX,
        waveY,
      });
    }
  }

  for (let y = 0; y < size; y += 1) {
    const worldY = ((y + 0.5) / size) * WATER_DOMAIN_METERS;
    for (let x = 0; x < size; x += 1) {
      const worldX = ((x + 0.5) / size) * WATER_DOMAIN_METERS;
      let current = 0;
      let previous = 0;

      for (const mode of modes) {
        const phase = mode.waveX * worldX + mode.waveY * worldY + mode.phase;
        current += mode.amplitude * Math.cos(phase);
        previous += mode.amplitude * Math.cos(phase - mode.previousPhaseOffset);
      }

      const index = y * size + x;
      currentHeight[index] = current;
      previousHeight[index] = previous;
    }
  }

  const mean = currentHeight.reduce((sum, value) => sum + value, 0) / currentHeight.length;
  const variance =
    currentHeight.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    currentHeight.length;
  const scale = 0.11 / Math.max(Math.sqrt(variance), 0.000001);
  const state = new Float32Array(size * size * 4);

  for (let index = 0; index < currentHeight.length; index += 1) {
    state[index * 4] = (currentHeight[index] - mean) * scale;
    state[index * 4 + 1] = (previousHeight[index] - mean) * scale;
    state[index * 4 + 2] = 0;
    state[index * 4 + 3] = 1;
  }

  // The strongest modes drive the solver. Wave vectors are in tile units
  // and the sign matches the initial state: the phase grows with time. The
  // frequency comes from the solver kernel, not from the deep-water formula,
  // so the forcing sits on the solver's own resonance for each mode.
  const kernel = getCachedIWaveKernel();
  const kernelSize = IWAVE_RADIUS * 2 + 1;
  const cellSize = WATER_DOMAIN_METERS / size;
  const solverFrequency = (waveX: number, waveY: number) => {
    let eigenvalue = 0;
    for (let offsetY = -IWAVE_RADIUS; offsetY <= IWAVE_RADIUS; offsetY += 1) {
      for (let offsetX = -IWAVE_RADIUS; offsetX <= IWAVE_RADIUS; offsetX += 1) {
        const weight = kernel[(offsetY + IWAVE_RADIUS) * kernelSize + offsetX + IWAVE_RADIUS];
        eigenvalue += weight * Math.cos((waveX * offsetX + waveY * offsetY) * cellSize);
      }
    }
    return Math.sqrt(Math.max((9.81 / cellSize) * eigenvalue, 0));
  };
  const strongest = [...modes]
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, DRIVE_MODE_COUNT);
  const drive = new Float32Array(DRIVE_MODE_COUNT * 4);
  const drivePhase = new Float32Array(DRIVE_MODE_COUNT);
  strongest.forEach((mode, index) => {
    const frequency = solverFrequency(mode.waveX, mode.waveY);
    drive[index * 4] = mode.waveX * WATER_DOMAIN_METERS;
    drive[index * 4 + 1] = mode.waveY * WATER_DOMAIN_METERS;
    drive[index * 4 + 2] = frequency;
    drive[index * 4 + 3] = frequency > 0 ? mode.amplitude * scale : 0;
    drivePhase[index] = mode.phase;
  });

  return { drive, drivePhase, state };
}

function getCachedInitialState(size: number, seed: number, windAngle: number) {
  const key = `${size}:${seed}`;
  const cached = initialStateCache.get(key);
  if (cached) return cached;
  const state = createInitialState(size, seed, windAngle);
  initialStateCache.clear();
  initialStateCache.set(key, state);
  return state;
}

function bindTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  unit: number,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

const CROSSING_RENDER_SCALE = 0.8;
const FRAME_INTERVAL_TOLERANCE = 2.5;
const MINIMUM_RENDER_SCALE = 0.55;
const ADAPTIVE_WARMUP_MS = 2500;
const SLOW_CONFIRM_MS = 500;
const HOLD_AFTER_DROP_MS = 900;
const HOLD_AFTER_RAISE_MS = 1200;
const RAISE_AFTER_CALM_MS = 2500;
const FALLBACK_AFTER_MS = 2500;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Mirror the shader camera path so the CPU can predict the surface crossing. */
function getCameraPosition(scroll: number, seedPhase: number) {
  const entry = smoothstep(0, 0.205, scroll);
  const deepDescent = smoothstep(0.19, 0.96, scroll);
  const entryY = CAMERA_ORIGIN_TOP[1] + (-0.16 - CAMERA_ORIGIN_TOP[1]) * entry;
  const entryZ = CAMERA_ORIGIN_TOP[2] + (-2.75 - CAMERA_ORIGIN_TOP[2]) * entry;
  const y = entryY + (CAMERA_ORIGIN_BOTTOM[1] - entryY) * deepDescent;
  const x = Math.sin(scroll * 5.1 + seedPhase) * 2.4 * deepDescent;
  const z = entryZ + (CAMERA_ORIGIN_BOTTOM[2] - entryZ) * deepDescent
    + Math.sin(scroll * 2.7 + seedPhase * 1.7) * 1.2 * deepDescent;
  return { x, y, z };
}

/**
 * Predict the crossfade band from the CPU side.
 *
 * The shader renders both the above-water and the underwater path while the
 * camera sits near the waterline. That costs about three frames of GPU time.
 * The IWave tile adds up to 0.3 meters that the CPU cannot see, so the band
 * here is wider than the shader band.
 */
function getCrossingRenderScale(
  waveField: OceanWaveField,
  scroll: number,
  oceanTime: number,
) {
  const seedPhase = ((waveField.seed % 100_000) / 100_000) * Math.PI * 2;
  const camera = getCameraPosition(scroll, seedPhase);
  const surface = spectralHeightAt(waveField, camera.x, camera.z, oceanTime);
  const proximity = 1 - smoothstep(0.32, 0.62, Math.abs(camera.y - surface));
  return 1 + (CROSSING_RENDER_SCALE - 1) * proximity;
}

type SceneLight = {
  displayLightDirection: Direction3;
  displayMoonDirection: Direction3;
  displaySunDirection: Direction3;
  lightDirection: Direction3;
  lightStrength: number;
  moonAngularRadius: number;
  moonDirection: Direction3;
  moonIllumination: number;
  moonPhaseLight: Direction3;
  moonStrength: number;
  primaryIsMoon: boolean;
  sunAngularRadius: number;
  sunDirection: Direction3;
};

function createPondEngine(
  gl: WebGL2RenderingContext,
  waveField: OceanWaveField,
  quality: QualityProfile,
) {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("WebGL floating-point color buffers are unavailable");
  }

  const simulationProgram = createProgram(
    gl,
    fullscreenVertexShader,
    simulationFragmentShader,
  );
  const causticProgram = createProgram(gl, causticVertexShader, causticFragmentShader);
  const causticBlurProgram = createProgram(
    gl,
    fullscreenVertexShader,
    causticBlurFragmentShader,
  );
  const atmosphereProgram = createProgram(
    gl,
    fullscreenVertexShader,
    atmosphereFragmentShader,
  );
  const cloudProgram = createProgram(gl, fullscreenVertexShader, cloudFragmentShader);
  const displayProgram = createProgram(gl, fullscreenVertexShader, displayFragmentShader);
  const fullscreen = createFullscreenGeometry(gl);
  const causticGeometry = createCausticGeometry(gl, quality.causticGridSize);
  const windAngle = Math.atan2(waveField.windDirection[1], waveField.windDirection[0]);
  const initialState = getCachedInitialState(
    quality.simulationSize,
    waveField.seed,
    windAngle,
  );
  const firstState = createRenderTarget(
    gl,
    quality.simulationSize,
    quality.simulationSize,
    gl.RGBA32F,
    gl.FLOAT,
    initialState.state,
    gl.NEAREST,
  );
  const secondState = createRenderTarget(
    gl,
    quality.simulationSize,
    quality.simulationSize,
    gl.RGBA32F,
    gl.FLOAT,
    initialState.state,
    gl.NEAREST,
  );
  const causticScratch = createRenderTarget(
    gl,
    quality.causticTextureSize,
    quality.causticTextureSize,
    gl.RGBA16F,
    gl.HALF_FLOAT,
    null,
    gl.LINEAR,
  );
  const causticTarget = createRenderTarget(
    gl,
    quality.causticTextureSize,
    quality.causticTextureSize,
    gl.RGBA16F,
    gl.HALF_FLOAT,
    null,
    gl.LINEAR,
  );
  gl.bindTexture(gl.TEXTURE_2D, causticTarget.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget.framebuffer);
  gl.viewport(0, 0, quality.causticTextureSize, quality.causticTextureSize);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, causticTarget.texture);
  gl.generateMipmap(gl.TEXTURE_2D);
  // The scene renders into a framebuffer the size of the canvas and blits a
  // sub-rectangle to the screen. A render-scale change then costs nothing:
  // no canvas reallocation, no compositor hitch.
  let sceneTarget: RenderTarget | null = null;
  let sceneWidth = 0;
  let sceneHeight = 0;
  const ensureSceneTarget = (width: number, height: number) => {
    if (sceneTarget && sceneWidth === width && sceneHeight === height) {
      return sceneTarget;
    }
    if (sceneTarget) {
      gl.deleteFramebuffer(sceneTarget.framebuffer);
      gl.deleteTexture(sceneTarget.texture);
    }
    sceneTarget = createRenderTarget(
      gl,
      width,
      height,
      gl.RGBA8,
      gl.UNSIGNED_BYTE,
      null,
      gl.LINEAR,
    );
    sceneWidth = width;
    sceneHeight = height;
    return sceneTarget;
  };
  const atmosphereTarget = createRenderTarget(
    gl,
    quality.atmosphereWidth,
    quality.atmosphereHeight,
    gl.RGBA16F,
    gl.HALF_FLOAT,
    null,
    gl.LINEAR,
  );
  gl.bindTexture(gl.TEXTURE_2D, atmosphereTarget.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const skyTarget = createRenderTarget(
    gl,
    quality.cloudWidth,
    quality.cloudHeight,
    gl.RGBA16F,
    gl.HALF_FLOAT,
    null,
    gl.LINEAR,
  );
  gl.bindTexture(gl.TEXTURE_2D, skyTarget.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const kernelTexture = createTexture(
    gl,
    IWAVE_SIZE,
    IWAVE_SIZE,
    gl.R32F,
    gl.RED,
    gl.FLOAT,
    getCachedIWaveKernel(),
    gl.NEAREST,
  );
  const seedUniform = (waveField.seed % 100_000) / 100_000;
  let crestHeight = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    crestHeight += waveField.data[index * 4 + 3];
  }
  crestHeight = (crestHeight + 0.5) * OCEAN_WAVE_HEIGHT_SCALE;

  const simulationUniforms = {
    state: getUniform(gl, simulationProgram, "u_state"),
    kernel: getUniform(gl, simulationProgram, "u_kernel"),
    gridSize: getUniform(gl, simulationProgram, "u_gridSize"),
    deltaTime: getUniform(gl, simulationProgram, "u_deltaTime"),
    gravity: getUniform(gl, simulationProgram, "u_gravity"),
    damping: getUniform(gl, simulationProgram, "u_damping"),
    source: getUniform(gl, simulationProgram, "u_source"),
    drive: getUniform(gl, simulationProgram, "u_drive"),
    drivePhase: getUniform(gl, simulationProgram, "u_drivePhase"),
    simulationTime: getUniform(gl, simulationProgram, "u_simulationTime"),
  };
  const causticUniforms = {
    state: getUniform(gl, causticProgram, "u_state"),
    stateBlend: getUniform(gl, causticProgram, "u_stateBlend"),
    gridSize: getUniform(gl, causticProgram, "u_gridSize"),
    domainSize: getUniform(gl, causticProgram, "u_domainSize"),
    floorDepth: getUniform(gl, causticProgram, "u_floorDepth"),
    sunDirection: getUniform(gl, causticProgram, "u_sunDirection"),
    tileOffset: getUniform(gl, causticProgram, "u_tileOffset"),
    oceanTime: getUniform(gl, causticProgram, "u_oceanTime"),
    choppiness: getUniform(gl, causticProgram, "u_choppiness"),
    waveData: getUniform(gl, causticProgram, "u_waveData[0]"),
    wavePhase: getUniform(gl, causticProgram, "u_wavePhase[0]"),
    resolution: getUniform(gl, causticProgram, "u_resolution"),
    sampleWeight: getUniform(gl, causticProgram, "u_sampleWeight"),
  };
  const atmosphereUniforms = {
    sunDirection: getUniform(gl, atmosphereProgram, "u_sunDirection"),
    aerosolScale: getUniform(gl, atmosphereProgram, "u_aerosolScale"),
  };
  const cloudUniforms = {
    atmosphere: getUniform(gl, cloudProgram, "u_atmosphere"),
    sunDirection: getUniform(gl, cloudProgram, "u_sunDirection"),
    wind: getUniform(gl, cloudProgram, "u_wind"),
    moonDirection: getUniform(gl, cloudProgram, "u_moonDirection"),
    moonStrength: getUniform(gl, cloudProgram, "u_moonStrength"),
    time: getUniform(gl, cloudProgram, "u_time"),
    seed: getUniform(gl, cloudProgram, "u_seed"),
    cloudCover: getUniform(gl, cloudProgram, "u_cloudCover"),
    detail: getUniform(gl, cloudProgram, "u_detail"),
  };
  const causticBlurUniforms = {
    source: getUniform(gl, causticBlurProgram, "u_source"),
    texel: getUniform(gl, causticBlurProgram, "u_texel"),
  };
  const displayUniforms = {
    state: getUniform(gl, displayProgram, "u_state"),
    stateBlend: getUniform(gl, displayProgram, "u_stateBlend"),
    caustics: getUniform(gl, displayProgram, "u_caustics"),
    sky: getUniform(gl, displayProgram, "u_sky"),
    resolution: getUniform(gl, displayProgram, "u_resolution"),
    gridSize: getUniform(gl, displayProgram, "u_gridSize"),
    domainSize: getUniform(gl, displayProgram, "u_domainSize"),
    floorDepth: getUniform(gl, displayProgram, "u_floorDepth"),
    scroll: getUniform(gl, displayProgram, "u_scroll"),
    sunDirection: getUniform(gl, displayProgram, "u_sunDirection"),
    displaySunDirection: getUniform(gl, displayProgram, "u_displaySunDirection"),
    displayLightDirection: getUniform(gl, displayProgram, "u_displayLightDirection"),
    moonDirection: getUniform(gl, displayProgram, "u_moonDirection"),
    displayMoonDirection: getUniform(gl, displayProgram, "u_displayMoonDirection"),
    moonPhaseLight: getUniform(gl, displayProgram, "u_moonPhaseLight"),
    moonAngularRadius: getUniform(gl, displayProgram, "u_moonAngularRadius"),
    moonIllumination: getUniform(gl, displayProgram, "u_moonIllumination"),
    moonStrength: getUniform(gl, displayProgram, "u_moonStrength"),
    primaryIsMoon: getUniform(gl, displayProgram, "u_primaryIsMoon"),
    primaryLightDirection: getUniform(gl, displayProgram, "u_primaryLightDirection"),
    sunAngularRadius: getUniform(gl, displayProgram, "u_sunAngularRadius"),
    primaryLightStrength: getUniform(gl, displayProgram, "u_primaryLightStrength"),
    oceanTime: getUniform(gl, displayProgram, "u_oceanTime"),
    seed: getUniform(gl, displayProgram, "u_seed"),
    windSpeed: getUniform(gl, displayProgram, "u_windSpeed"),
    windDirection: getUniform(gl, displayProgram, "u_windDirection"),
    choppiness: getUniform(gl, displayProgram, "u_choppiness"),
    waveHeight: getUniform(gl, displayProgram, "u_waveHeight"),
    detail: getUniform(gl, displayProgram, "u_detail"),
    debugView: getUniform(gl, displayProgram, "u_debugView"),
    waveData: getUniform(gl, displayProgram, "u_waveData[0]"),
    wavePhase: getUniform(gl, displayProgram, "u_wavePhase[0]"),
    absorption: getUniform(gl, displayProgram, "u_absorption"),
  };

  gl.useProgram(simulationProgram);
  gl.uniform4fv(simulationUniforms.drive, initialState.drive);
  gl.uniform4fv(simulationUniforms.drivePhase, initialState.drivePhase);

  gl.useProgram(causticProgram);
  gl.uniform4fv(causticUniforms.waveData, waveField.data);
  gl.uniform1fv(causticUniforms.wavePhase, waveField.phases);
  gl.uniform1f(causticUniforms.choppiness, waveField.choppiness);
  gl.uniform1f(causticUniforms.gridSize, quality.simulationSize);
  gl.uniform1f(causticUniforms.domainSize, WATER_DOMAIN_METERS);
  gl.uniform1f(causticUniforms.floorDepth, OCEAN_DEPTH_METERS);
  gl.uniform2f(
    causticUniforms.resolution,
    quality.causticTextureSize,
    quality.causticTextureSize,
  );
  gl.uniform1f(causticUniforms.sampleWeight, 1);

  gl.useProgram(causticBlurProgram);
  gl.uniform1i(causticBlurUniforms.source, 0);
  gl.uniform2f(
    causticBlurUniforms.texel,
    1 / quality.causticTextureSize,
    1 / quality.causticTextureSize,
  );

  gl.useProgram(cloudProgram);
  gl.uniform1i(cloudUniforms.atmosphere, 0);
  gl.uniform2f(cloudUniforms.wind, waveField.windDirection[0], waveField.windDirection[1]);
  gl.uniform1f(cloudUniforms.seed, seedUniform);
  gl.uniform1f(cloudUniforms.cloudCover, waveField.cloudCover);
  gl.uniform1f(cloudUniforms.detail, quality.detailLevel);

  gl.useProgram(displayProgram);
  gl.uniform4fv(displayUniforms.waveData, waveField.data);
  gl.uniform1fv(displayUniforms.wavePhase, waveField.phases);
  gl.uniform1f(displayUniforms.windSpeed, waveField.windSpeed);
  gl.uniform2f(
    displayUniforms.windDirection,
    waveField.windDirection[0],
    waveField.windDirection[1],
  );
  gl.uniform1f(displayUniforms.choppiness, waveField.choppiness);
  gl.uniform1f(displayUniforms.waveHeight, crestHeight);
  gl.uniform1f(displayUniforms.detail, quality.detailLevel);
  gl.uniform1f(displayUniforms.debugView, getDebugView());
  gl.uniform1i(displayUniforms.state, 0);
  gl.uniform1i(displayUniforms.caustics, 1);
  gl.uniform1i(displayUniforms.sky, 2);
  gl.uniform1f(displayUniforms.gridSize, quality.simulationSize);
  gl.uniform1f(displayUniforms.domainSize, WATER_DOMAIN_METERS);
  gl.uniform1f(displayUniforms.floorDepth, OCEAN_DEPTH_METERS);
  gl.uniform1f(displayUniforms.seed, seedUniform);
  gl.uniform3f(
    displayUniforms.absorption,
    WATER_ABSORPTION_RGB_PER_METER[0],
    WATER_ABSORPTION_RGB_PER_METER[1],
    WATER_ABSORPTION_RGB_PER_METER[2],
  );

  let readState = firstState;
  let writeState = secondState;
  let atmosphereLightSignature = "";
  let displayFrame = 0;
  let cloudFrame = -1;
  let simulationTime = 0;

  const step = (source: WaveSource | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeState.framebuffer);
    gl.viewport(0, 0, quality.simulationSize, quality.simulationSize);
    gl.disable(gl.BLEND);
    gl.useProgram(simulationProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, readState.texture, 0);
    bindTexture(gl, kernelTexture, 1);
    gl.uniform1i(simulationUniforms.state, 0);
    gl.uniform1i(simulationUniforms.kernel, 1);
    gl.uniform1f(simulationUniforms.gridSize, quality.simulationSize);
    gl.uniform1f(simulationUniforms.deltaTime, FIXED_TIME_STEP);
    simulationTime += FIXED_TIME_STEP;
    gl.uniform1f(simulationUniforms.simulationTime, simulationTime);
    gl.uniform1f(
      simulationUniforms.gravity,
      9.81 / (WATER_DOMAIN_METERS / quality.simulationSize),
    );
    gl.uniform1f(simulationUniforms.damping, 0.16);
    gl.uniform4f(
      simulationUniforms.source,
      source?.x ?? 0,
      source?.y ?? 0,
      source?.strength ?? 0,
      source?.radius ?? 0.02,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const previousRead = readState;
    readState = writeState;
    writeState = previousRead;
  };

  const renderCaustics = (
    light: SceneLight,
    oceanTime: number,
    stateBlend: number,
  ) => {
    const lightDirection = light.lightDirection;
    const tileX = Math.sign(lightDirection[0]);
    const tileY = Math.sign(lightDirection[2]);
    const causticTiles = [
      [0, 0],
      [tileX, 0],
      [0, tileY],
      [tileX, tileY],
    ] as const;
    gl.bindFramebuffer(gl.FRAMEBUFFER, causticScratch.framebuffer);
    gl.viewport(0, 0, quality.causticTextureSize, quality.causticTextureSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(causticProgram);
    gl.bindVertexArray(causticGeometry.vertexArray);
    bindTexture(gl, readState.texture, 0);
    gl.uniform1i(causticUniforms.state, 0);
    gl.uniform1f(causticUniforms.stateBlend, stateBlend);
    gl.uniform1f(causticUniforms.oceanTime, oceanTime);
    gl.uniform3f(
      causticUniforms.sunDirection,
      lightDirection[0],
      lightDirection[1],
      lightDirection[2],
    );

    if (light.lightStrength > 0.00001 && lightDirection[1] > 0) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (const [offsetX, offsetY] of causticTiles) {
        gl.uniform2f(causticUniforms.tileOffset, offsetX, offsetY);
        gl.drawArrays(gl.TRIANGLES, 0, causticGeometry.vertexCount);
      }
      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget.framebuffer);
    gl.useProgram(causticBlurProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, causticScratch.texture, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, causticTarget.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const renderAtmosphere = (light: SceneLight) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, atmosphereTarget.framebuffer);
    gl.viewport(0, 0, quality.atmosphereWidth, quality.atmosphereHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(atmosphereProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    gl.uniform3f(
      atmosphereUniforms.sunDirection,
      light.sunDirection[0],
      light.sunDirection[1],
      light.sunDirection[2],
    );
    gl.uniform1f(atmosphereUniforms.aerosolScale, 0.72);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const renderClouds = (light: SceneLight, oceanTime: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyTarget.framebuffer);
    gl.viewport(0, 0, quality.cloudWidth, quality.cloudHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(cloudProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, atmosphereTarget.texture, 0);
    gl.uniform3f(
      cloudUniforms.sunDirection,
      light.sunDirection[0],
      light.sunDirection[1],
      light.sunDirection[2],
    );
    gl.uniform3f(
      cloudUniforms.moonDirection,
      light.moonDirection[0],
      light.moonDirection[1],
      light.moonDirection[2],
    );
    gl.uniform1f(cloudUniforms.moonStrength, light.moonStrength);
    gl.uniform1f(cloudUniforms.time, oceanTime);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const render = (
    width: number,
    height: number,
    canvasWidth: number,
    canvasHeight: number,
    scroll: number,
    light: SceneLight,
    oceanTime: number,
    stateBlend: number,
  ) => {
    const atmosphereSignature = light.sunDirection
      .map((value) => value.toFixed(4))
      .join(":");
    let skyChanged = false;
    if (atmosphereSignature !== atmosphereLightSignature) {
      renderAtmosphere(light);
      atmosphereLightSignature = atmosphereSignature;
      skyChanged = true;
    }
    if (
      skyChanged
      || cloudFrame < 0
      || displayFrame - cloudFrame >= quality.cloudFrameStride
    ) {
      renderClouds(light, oceanTime);
      cloudFrame = displayFrame;
    }
    if (scroll > 0.08) {
      renderCaustics(light, oceanTime, stateBlend);
    }
    const scene = ensureSceneTarget(canvasWidth, canvasHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(displayProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, readState.texture, 0);
    bindTexture(gl, causticTarget.texture, 1);
    bindTexture(gl, skyTarget.texture, 2);
    gl.uniform2f(displayUniforms.resolution, width, height);
    gl.uniform1f(displayUniforms.scroll, scroll);
    gl.uniform1f(displayUniforms.stateBlend, stateBlend);
    gl.uniform3f(
      displayUniforms.sunDirection,
      light.sunDirection[0],
      light.sunDirection[1],
      light.sunDirection[2],
    );
    gl.uniform3f(
      displayUniforms.displaySunDirection,
      light.displaySunDirection[0],
      light.displaySunDirection[1],
      light.displaySunDirection[2],
    );
    gl.uniform3f(
      displayUniforms.primaryLightDirection,
      light.lightDirection[0],
      light.lightDirection[1],
      light.lightDirection[2],
    );
    gl.uniform3f(
      displayUniforms.displayLightDirection,
      light.displayLightDirection[0],
      light.displayLightDirection[1],
      light.displayLightDirection[2],
    );
    gl.uniform3f(
      displayUniforms.moonDirection,
      light.moonDirection[0],
      light.moonDirection[1],
      light.moonDirection[2],
    );
    gl.uniform3f(
      displayUniforms.displayMoonDirection,
      light.displayMoonDirection[0],
      light.displayMoonDirection[1],
      light.displayMoonDirection[2],
    );
    gl.uniform3f(
      displayUniforms.moonPhaseLight,
      light.moonPhaseLight[0],
      light.moonPhaseLight[1],
      light.moonPhaseLight[2],
    );
    gl.uniform1f(displayUniforms.sunAngularRadius, light.sunAngularRadius);
    gl.uniform1f(displayUniforms.moonAngularRadius, light.moonAngularRadius);
    gl.uniform1f(displayUniforms.moonIllumination, light.moonIllumination);
    gl.uniform1f(displayUniforms.moonStrength, light.moonStrength);
    gl.uniform1f(displayUniforms.primaryIsMoon, light.primaryIsMoon ? 1 : 0);
    gl.uniform1f(displayUniforms.primaryLightStrength, light.lightStrength);
    gl.uniform1f(displayUniforms.oceanTime, oceanTime);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scene.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0,
      0,
      width,
      height,
      0,
      0,
      canvasWidth,
      canvasHeight,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    displayFrame += 1;
  };

  const destroy = () => {
    gl.deleteBuffer(fullscreen.buffer);
    gl.deleteVertexArray(fullscreen.vertexArray);
    gl.deleteBuffer(causticGeometry.buffer);
    gl.deleteVertexArray(causticGeometry.vertexArray);
    gl.deleteFramebuffer(firstState.framebuffer);
    gl.deleteTexture(firstState.texture);
    gl.deleteFramebuffer(secondState.framebuffer);
    gl.deleteTexture(secondState.texture);
    if (sceneTarget) {
      gl.deleteFramebuffer(sceneTarget.framebuffer);
      gl.deleteTexture(sceneTarget.texture);
    }
    gl.deleteFramebuffer(causticScratch.framebuffer);
    gl.deleteTexture(causticScratch.texture);
    gl.deleteFramebuffer(causticTarget.framebuffer);
    gl.deleteTexture(causticTarget.texture);
    gl.deleteFramebuffer(atmosphereTarget.framebuffer);
    gl.deleteTexture(atmosphereTarget.texture);
    gl.deleteFramebuffer(skyTarget.framebuffer);
    gl.deleteTexture(skyTarget.texture);
    gl.deleteTexture(kernelTexture);
    gl.deleteProgram(simulationProgram);
    gl.deleteProgram(causticProgram);
    gl.deleteProgram(causticBlurProgram);
    gl.deleteProgram(atmosphereProgram);
    gl.deleteProgram(cloudProgram);
    gl.deleteProgram(displayProgram);
  };

  return { destroy, render, step };
}

function getSceneLight(
  celestial: CelestialState,
  width: number,
  height: number,
): SceneLight {
  const aspect = width / Math.max(height, 1);
  const azimuthScale = getSunAzimuthScale(aspect, CAMERA_FOCAL_LENGTH);
  const sunDirection = getSceneSunDirection(celestial.sun, azimuthScale);
  const displaySunDirection = getDisplaySunDirection(celestial.sun, azimuthScale);
  const moonDirection = getSceneSunDirection(celestial.moon, azimuthScale);
  const displayMoonDirection = getDisplaySunDirection(celestial.moon, azimuthScale);
  const primaryIsMoon = celestial.primaryLightDirection !== celestial.sun.direction;
  const trueMoonAzimuth = Math.atan2(
    celestial.moon.direction[0],
    celestial.moon.direction[2],
  );
  return {
    displayLightDirection: primaryIsMoon ? displayMoonDirection : displaySunDirection,
    displayMoonDirection,
    displaySunDirection,
    lightDirection: primaryIsMoon ? moonDirection : sunDirection,
    lightStrength: celestial.primaryLightStrength,
    moonAngularRadius: celestial.moon.angularRadius,
    moonDirection,
    moonIllumination: celestial.moonIllumination,
    moonPhaseLight: rotateAboutY(
      celestial.sun.direction,
      celestial.moon.hourAngle * azimuthScale - trueMoonAzimuth,
    ),
    moonStrength: primaryIsMoon ? celestial.primaryLightStrength : 0,
    primaryIsMoon,
    sunAngularRadius: celestial.sun.angularRadius,
    sunDirection,
  };
}

export default function PondSurface({
  className = "",
  dateMs = DEFAULT_CELESTIAL_DATE,
  latitude = 15.2,
  longitude = 73.7,
  seed,
  stageId,
}: PondSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameStats, setFrameStats] = useState<string | null>(null);
  const [qualityFallback, setQualityFallback] = useState<"reduced" | null>(null);
  const celestial = useMemo(
    () => getCelestialState(new Date(dateMs), latitude, longitude),
    [dateMs, latitude, longitude],
  );
  const celestialRef = useRef(celestial);
  const requestRenderRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    celestialRef.current = celestial;
    requestRenderRef.current();
  }, [celestial]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const quality = qualityFallback === "reduced"
      ? REDUCED_QUALITY
      : getQualityProfile(coarsePointer, motionQuery.matches);

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: quality.name === "full" ? "high-performance" : "low-power",
      preserveDrawingBuffer: false,
      stencil: false,
    });

    if (!gl) {
      canvas.dataset.webgl = "fallback";
      return;
    }

    const waveField = createOceanWaveField(seed ?? getSessionOceanSeed());
    let engine: ReturnType<typeof createPondEngine>;
    try {
      engine = createPondEngine(gl, waveField, quality);
    } catch (error) {
      canvas.dataset.webgl = "fallback";
      canvas.dataset.webglError =
        error instanceof Error ? error.message : "WebGL initialization failed";
      gl.clearColor(0.03, 0.1, 0.11, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const frameInterval = quality.frameInterval;
    let animationFrame: number | null = null;
    let accumulator = 0;
    let oceanTime = 0;
    let lastFrame = 0;
    let renderedScrollProgress = 0;
    let isVisible = true;
    let reducedMotion = motionQuery.matches;

    let adaptiveScale = 1;
    let appliedScale = 1;
    let drawnFrames = 0;
    let frameGapAverage = frameInterval;
    let frameGapTrend = frameInterval;
    let controllerStart = 0;
    let slowSince = 0;
    let calmSince = 0;
    let holdUntil = 0;
    let floorSlowSince = 0;
    const forcedScale = getForcedRenderScale();
    let canFallBack = quality.name === "full"
      && forcedScale === null
      && !hasQualityOverride();
    let keepContext = false;

    let renderWidth = 1;
    let renderHeight = 1;
    const resize = (renderScale: number) => {
      const bounds = canvas.getBoundingClientRect();
      const budgetScale = Math.sqrt(
        quality.pixelBudget / Math.max(bounds.width * bounds.height, 1),
      );
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, budgetScale);
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      renderWidth = Math.max(1, Math.round(width * renderScale));
      renderHeight = Math.max(1, Math.round(height * renderScale));
    };

    let slowDraws = 0;
    let maximumGap = 0;
    const showFrameStats = isFrameStatsEnabled();
    let statsWindowStart = 0;
    let statsWindowDraws = 0;
    let statsWindowCallbacks = 0;
    let statsWindowSlow = 0;
    let statsWindowMaxGap = 0;

    // Render-scale controller. Every timer is in milliseconds, so a machine
    // at 2 fps reacts within seconds instead of minutes. The first drop is
    // proportional to the measured gap, so a very slow frame goes straight to
    // the floor. If the floor is still slow, the engine falls back to the
    // reduced profile once.
    const updateAdaptiveScale = (frameGap: number, timestamp: number) => {
      drawnFrames += 1;
      if (showFrameStats) {
        statsWindowDraws += 1;
        statsWindowMaxGap = Math.max(statsWindowMaxGap, frameGap);
        if (frameGap > frameInterval * 1.45) statsWindowSlow += 1;
      }
      if (controllerStart === 0) controllerStart = timestamp;
      if (drawnFrames < 8 || timestamp - controllerStart < ADAPTIVE_WARMUP_MS) return;
      if (frameGap > frameInterval * 1.45) slowDraws += 1;
      maximumGap = Math.max(maximumGap, frameGap);
      if (drawnFrames % 30 === 0) {
        canvas.dataset.slowDraws = slowDraws.toString();
        canvas.dataset.drawGapMax = maximumGap.toFixed(1);
        canvas.dataset.drawnFrames = drawnFrames.toString();
      }
      frameGapAverage += (Math.min(frameGap, frameInterval * 4) - frameGapAverage) * 0.12;
      frameGapTrend += (frameGap - frameGapTrend) * 0.3;
      if (timestamp < holdUntil) return;

      if (frameGapAverage > frameInterval * 1.10) {
        calmSince = 0;
        if (slowSince === 0) slowSince = timestamp;
        if (timestamp - slowSince < SLOW_CONFIRM_MS) return;
        slowSince = 0;
        if (adaptiveScale > MINIMUM_RENDER_SCALE) {
          const proportional = Math.sqrt(
            (frameInterval * 0.92) / Math.max(frameGapTrend, frameInterval),
          );
          adaptiveScale = Math.max(
            MINIMUM_RENDER_SCALE,
            adaptiveScale * Math.min(0.86, proportional),
          );
          holdUntil = timestamp + HOLD_AFTER_DROP_MS;
          floorSlowSince = 0;
          return;
        }
        if (!canFallBack) return;
        if (floorSlowSince === 0) floorSlowSince = timestamp;
        if (timestamp - floorSlowSince >= FALLBACK_AFTER_MS) {
          canFallBack = false;
          keepContext = true;
          setQualityFallback("reduced");
        }
        return;
      }

      slowSince = 0;
      floorSlowSince = 0;
      if (frameGapAverage > frameInterval * 1.03) {
        calmSince = 0;
        return;
      }
      if (calmSince === 0) calmSince = timestamp;
      if (timestamp - calmSince >= RAISE_AFTER_CALM_MS && adaptiveScale < 1) {
        adaptiveScale = Math.min(1, adaptiveScale * 1.05);
        holdUntil = timestamp + HOLD_AFTER_RAISE_MS;
        calmSince = 0;
      }
    };

    const getScrollProgress = () => {
      const stage = stageId ? document.getElementById(stageId) : null;
      if (!stage) return 0;
      const distance = Math.max(stage.offsetHeight - window.innerHeight, 1);
      return Math.min(1, Math.max(0, -stage.getBoundingClientRect().top / distance));
    };

    const requestRender = () => {
      if (animationFrame === null && isVisible && !document.hidden) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };
    requestRenderRef.current = requestRender;

    const publishFrameStats = (timestamp: number) => {
      if (!showFrameStats) return;
      statsWindowCallbacks += 1;
      if (statsWindowStart === 0) {
        statsWindowStart = timestamp;
        return;
      }
      const windowLength = timestamp - statsWindowStart;
      if (windowLength < 1000) return;
      const seconds = windowLength / 1000;
      setFrameStats([
        `draws  ${(statsWindowDraws / seconds).toFixed(1)} fps`,
        `raf    ${(statsWindowCallbacks / seconds).toFixed(1)} hz`,
        `gap    max ${statsWindowMaxGap.toFixed(1)} ms`,
        `slow   ${statsWindowSlow} / ${statsWindowDraws}`,
        `scale  ${appliedScale.toFixed(2)}  ${renderWidth}x${renderHeight}`,
        `scroll ${renderedScrollProgress.toFixed(3)}`,
        `profile ${quality.name}`,
      ].join("\n"));
      statsWindowStart = timestamp;
      statsWindowDraws = 0;
      statsWindowCallbacks = 0;
      statsWindowSlow = 0;
      statsWindowMaxGap = 0;
    };

    const draw = (timestamp: number) => {
      animationFrame = null;
      if (!isVisible || document.hidden) return;
      publishFrameStats(timestamp);

      if (
        !reducedMotion
        && lastFrame > 0
        && timestamp - lastFrame < frameInterval - FRAME_INTERVAL_TOLERANCE
      ) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }

      const firstFrame = lastFrame === 0;
      const elapsed = firstFrame ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.05);
      if (!firstFrame && !reducedMotion) {
        updateAdaptiveScale(timestamp - lastFrame, timestamp);
      }
      lastFrame = timestamp;

      const targetScrollProgress = getScrollProgress();
      if (firstFrame || reducedMotion) {
        renderedScrollProgress = targetScrollProgress;
      } else {
        const scrollBlend = 1 - Math.exp(-elapsed * 5.0);
        renderedScrollProgress +=
          (targetScrollProgress - renderedScrollProgress) * scrollBlend;
      }

      const crossingScale = getCrossingRenderScale(
        waveField,
        renderedScrollProgress,
        oceanTime,
      );
      const targetScale = forcedScale ?? Math.min(adaptiveScale, crossingScale);
      if (Math.abs(targetScale - appliedScale) > 0.02 || firstFrame) {
        appliedScale = targetScale;
      }
      resize(appliedScale);

      if (!reducedMotion) {
        oceanTime += elapsed * SIMULATION_PLAYBACK_RATE;
        accumulator += elapsed * SIMULATION_PLAYBACK_RATE;
        let simulationSteps = 0;
        while (accumulator >= FIXED_TIME_STEP && simulationSteps < 3) {
          engine.step(null);
          accumulator -= FIXED_TIME_STEP;
          simulationSteps += 1;
        }
      }

      engine.render(
        renderWidth,
        renderHeight,
        canvas.width,
        canvas.height,
        renderedScrollProgress,
        getSceneLight(celestialRef.current, renderWidth, renderHeight),
        oceanTime,
        reducedMotion ? 1 : Math.min(accumulator / FIXED_TIME_STEP, 1),
      );
      canvas.dataset.renderScale = appliedScale.toFixed(2);

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    canvas.dataset.renderScale = "1";
    const resizeObserver = new ResizeObserver(requestRender);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          lastFrame = 0;
          requestRender();
        } else if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
      },
      { rootMargin: "100px" },
    );
    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      lastFrame = 0;
      requestRender();
    };
    const onVisibilityChange = () => {
      lastFrame = 0;
      requestRender();
    };
    const onScrollEnd = () => {
      if (reducedMotion) requestRender();
    };

    resizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    motionQuery.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scrollend", onScrollEnd);
    canvas.dataset.webgl = "active";
    canvas.dataset.quality = quality.name;
    canvas.dataset.solver = "iwave";
    requestRender();

    return () => {
      requestRenderRef.current = () => undefined;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scrollend", onScrollEnd);
      engine.destroy();
      // The quality fall-back re-runs this effect on the same context.
      if (!keepContext) gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [qualityFallback, seed, stageId]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        aria-hidden="true"
        data-webgl="pending"
        data-solver="iwave"
      />
      {frameStats !== null && (
        <output style={frameStatsStyle} aria-live="off">
          {frameStats}
        </output>
      )}
    </>
  );
}
