"use client";

import { useEffect, useMemo, useRef } from "react";
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

type PondSurfaceProps = {
  className?: string;
  dateMs?: number;
  fullMoonScene?: boolean;
  latitude?: number;
  longitude?: number;
  mode?: "pond" | "dusk";
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
  causticRevisionStride: number;
  causticTextureSize: number;
  frameInterval: number;
  lightSampleCount: number;
  name: "full" | "reduced";
  pixelBudget: number;
  simulationSize: number;
};

const SIMULATION_SIZE = 192;
const CAUSTIC_GRID_SIZE = 144;
const CAUSTIC_TEXTURE_SIZE = 512;
const ATMOSPHERE_TEXTURE_WIDTH = 256;
const ATMOSPHERE_TEXTURE_HEIGHT = 96;
const FIXED_TIME_STEP = 1 / 60;
const SIMULATION_PLAYBACK_RATE = 0.45;
const WATER_DOMAIN_METERS = 32;
const OCEAN_DEPTH_METERS = 36;
const CAMERA_FOCAL_LENGTH = 2.7;
const CAMERA_ORIGIN_TOP = [0, 3.6, -6.2] as const;
const CAMERA_ORIGIN_BOTTOM = [0, -32.4, 11.8] as const;
const CAMERA_TARGET_TOP = [0, -0.05, 0.7] as const;
const OCEAN_SEED_KEY = "preyam-ocean-seed-v1";
const DEFAULT_CELESTIAL_DATE = Date.UTC(2026, 5, 21, 6, 30);

const FULL_QUALITY: QualityProfile = {
  atmosphereHeight: ATMOSPHERE_TEXTURE_HEIGHT,
  atmosphereWidth: ATMOSPHERE_TEXTURE_WIDTH,
  causticGridSize: CAUSTIC_GRID_SIZE,
  causticRevisionStride: 2,
  causticTextureSize: CAUSTIC_TEXTURE_SIZE,
  frameInterval: 1_000 / 60,
  lightSampleCount: 5,
  name: "full",
  pixelBudget: 1_700_000,
  simulationSize: SIMULATION_SIZE,
};

const REDUCED_QUALITY: QualityProfile = {
  atmosphereHeight: 72,
  atmosphereWidth: 192,
  causticGridSize: 96,
  causticRevisionStride: 4,
  causticTextureSize: 256,
  frameInterval: 1_000 / 30,
  lightSampleCount: 1,
  name: "reduced",
  pixelBudget: 650_000,
  simulationSize: 128,
};

let cachedIWaveKernel: Float32Array | null = null;
const initialStateCache = new Map<string, Float32Array>();

function getCachedIWaveKernel() {
  cachedIWaveKernel ??= createIWaveKernel();
  return cachedIWaveKernel;
}

function getSessionOceanSeed() {
  try {
    const storedSeed = window.sessionStorage.getItem(OCEAN_SEED_KEY);
    if (storedSeed) return Number.parseInt(storedSeed, 10) >>> 0;
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    const seed = value[0] || 4603;
    window.sessionStorage.setItem(OCEAN_SEED_KEY, seed.toString());
    return seed;
  } catch {
    return 4603;
  }
}

function getQualityProfile(coarsePointer: boolean, reducedMotion: boolean) {
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

  outState = vec4(nextHeight, state.r, verticalDerivative, 1.0);
}
`;

const causticVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_uv;

uniform sampler2D u_state;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform vec3 u_sunDirection;
uniform vec2 u_tileOffset;
uniform float u_oceanTime;
uniform float u_seed;

out vec2 v_surfaceUv;
out float v_transmission;

const float WATER_IOR = ${WATER_IOR.toFixed(6)};

float simulationHeight(vec2 uv) {
  vec2 texel = fract(uv) * u_gridSize - 0.5;
  vec2 base = floor(texel);
  vec2 fraction = fract(texel);
  vec2 uv00 = (base + 0.5) / u_gridSize;
  float height00 = texture(u_state, fract(uv00)).r;
  float height10 = texture(u_state, fract(uv00 + vec2(1.0 / u_gridSize, 0.0))).r;
  float height01 = texture(u_state, fract(uv00 + vec2(0.0, 1.0 / u_gridSize))).r;
  float height11 = texture(u_state, fract(uv00 + vec2(1.0 / u_gridSize))).r;
  return mix(
    mix(height00, height10, fraction.x),
    mix(height01, height11, fraction.x),
    fraction.y
  );
}

float oceanSwell(
  vec2 position,
  float wavelength,
  float amplitude,
  float angle,
  float phase
) {
  float waveNumber = 6.28318530718 / wavelength;
  vec2 direction = vec2(cos(angle), sin(angle));
  float angularFrequency = sqrt(9.81 * waveNumber);
  return amplitude * sin(
    dot(position, direction) * waveNumber
      - angularFrequency * u_oceanTime
      + phase
  );
}

float oceanHeight(vec2 position) {
  float phase = u_seed * 6.28318530718;
  float resolved = simulationHeight(fract(position / u_domainSize + 0.5));
  return resolved
    + oceanSwell(position, 21.0, 0.075, 0.31 + phase * 0.07, phase)
    + oceanSwell(position, 37.0, 0.060, 0.88 + phase * 0.11, phase * 1.71)
    + oceanSwell(position, 61.0, 0.044, 1.64 + phase * 0.05, phase * 2.37)
    + oceanSwell(position, 97.0, 0.032, 2.22 + phase * 0.09, phase * 3.13)
    + oceanSwell(position, 13.0, 0.018, 2.83 + phase * 0.17, phase * 4.41)
    + oceanSwell(position, 47.0, 0.026, -0.47 + phase * 0.13, phase * 5.07)
    + oceanSwell(position, 73.0, 0.021, 1.17 - phase * 0.08, phase * 6.31);
}

vec3 surfaceNormal(vec2 position) {
  float cellSize = u_domainSize / u_gridSize;
  float slopeX = (
    oceanHeight(position + vec2(cellSize, 0.0))
      - oceanHeight(position - vec2(cellSize, 0.0))
  ) / (2.0 * cellSize);
  float slopeZ = (
    oceanHeight(position + vec2(0.0, cellSize))
      - oceanHeight(position - vec2(0.0, cellSize))
  ) / (2.0 * cellSize);
  return normalize(vec3(-slopeX, 1.0, -slopeZ));
}

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

void main() {
  vec2 worldUv = a_uv + u_tileOffset;
  vec2 surfaceHorizontalPosition = (worldUv - 0.5) * u_domainSize;
  float height = oceanHeight(surfaceHorizontalPosition);
  vec3 normal = surfaceNormal(surfaceHorizontalPosition);
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
    * vec3(0.035, 0.045, 0.060)
    * daylight;
  outColor = vec4(radiance * 22.0 + multipleScattering, 1.0);
}
`;

const displayFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform sampler2D u_caustics;
uniform sampler2D u_atmosphere;
uniform vec2 u_resolution;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform float u_scroll;
uniform float u_mode;
uniform vec3 u_sunDirection;
uniform vec3 u_moonDirection;
uniform vec3 u_primaryLightDirection;
uniform float u_sunAngularRadius;
uniform float u_moonAngularRadius;
uniform float u_primaryLightStrength;
uniform float u_moonIllumination;
uniform float u_oceanTime;
uniform float u_seed;
uniform vec3 u_absorption;

in vec2 v_uv;
out vec4 outColor;

const float PI = 3.141592653589793;
const float WATER_IOR = ${WATER_IOR.toFixed(6)};
const vec3 AIR_RAYLEIGH = vec3(0.005802, 0.013558, 0.033100);
const vec3 AIR_MIE_EXTINCTION = vec3(0.004440);
const vec3 AIR_OZONE = vec3(0.000650, 0.001881, 0.000085);

float hash21(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
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

float simulationHeight(vec2 uv) {
  vec2 texel = fract(uv) * u_gridSize - 0.5;
  vec2 base = floor(texel);
  vec2 fraction = fract(texel);
  vec2 uv00 = (base + 0.5) / u_gridSize;
  float height00 = texture(u_state, fract(uv00)).r;
  float height10 = texture(u_state, fract(uv00 + vec2(1.0 / u_gridSize, 0.0))).r;
  float height01 = texture(u_state, fract(uv00 + vec2(0.0, 1.0 / u_gridSize))).r;
  float height11 = texture(u_state, fract(uv00 + vec2(1.0 / u_gridSize))).r;
  return mix(
    mix(height00, height10, fraction.x),
    mix(height01, height11, fraction.x),
    fraction.y
  );
}

vec2 worldToWaterUv(vec2 worldPosition) {
  return fract(worldPosition / u_domainSize + 0.5);
}

float oceanSwell(
  vec2 position,
  float wavelength,
  float amplitude,
  float angle,
  float phase
) {
  float waveNumber = 6.28318530718 / wavelength;
  vec2 direction = vec2(cos(angle), sin(angle));
  float angularFrequency = sqrt(9.81 * waveNumber);
  return amplitude * sin(
    dot(position, direction) * waveNumber
      - angularFrequency * u_oceanTime
      + phase
  );
}

float oceanHeight(vec2 position) {
  float phase = u_seed * 6.28318530718;
  float resolved = simulationHeight(worldToWaterUv(position));
  return resolved
    + oceanSwell(position, 21.0, 0.075, 0.31 + phase * 0.07, phase)
    + oceanSwell(position, 37.0, 0.060, 0.88 + phase * 0.11, phase * 1.71)
    + oceanSwell(position, 61.0, 0.044, 1.64 + phase * 0.05, phase * 2.37)
    + oceanSwell(position, 97.0, 0.032, 2.22 + phase * 0.09, phase * 3.13)
    + oceanSwell(position, 13.0, 0.018, 2.83 + phase * 0.17, phase * 4.41)
    + oceanSwell(position, 47.0, 0.026, -0.47 + phase * 0.13, phase * 5.07)
    + oceanSwell(position, 73.0, 0.021, 1.17 - phase * 0.08, phase * 6.31);
}

vec3 surfaceNormal(vec2 worldPosition) {
  float cellSize = u_domainSize / u_gridSize;
  float slopeX = (
    oceanHeight(worldPosition + vec2(cellSize, 0.0))
      - oceanHeight(worldPosition - vec2(cellSize, 0.0))
  ) / (2.0 * cellSize);
  float slopeZ = (
    oceanHeight(worldPosition + vec2(0.0, cellSize))
      - oceanHeight(worldPosition - vec2(0.0, cellSize))
  ) / (2.0 * cellSize);
  return normalize(vec3(-slopeX, 1.0, -slopeZ));
}

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
  float meanSquareSlope = 0.003 + 0.00512 * 5.0;
  float distribution = exp(-tangentSquared / meanSquareSlope) / (
    PI * meanSquareSlope * pow(normalHalfway, 4.0)
  );
  float roughness = sqrt(meanSquareSlope);
  float masking = beckmannMasking(normalView, roughness) *
    beckmannMasking(normalLight, roughness);
  float fresnel = dielectricFresnel(max(dot(viewDirection, halfway), 0.0));
  float reflectedIrradiance = fresnel * distribution * masking / (4.0 * normalView);
  return sunColor * reflectedIrradiance * 0.28;
}

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

vec3 primaryLightRadiance(float turbidity) {
  if (u_sunDirection.y > -0.002) {
    return atmosphericTransmittance(u_sunDirection, turbidity)
      * u_primaryLightStrength;
  }
  return vec3(0.44, 0.52, 0.72) * u_primaryLightStrength;
}

vec3 moonRadiance(vec3 direction, float turbidity) {
  if (u_moonDirection.y <= -0.01) return vec3(0.0);
  float moonCosine = dot(direction, u_moonDirection);
  float moonRadius = sin(u_moonAngularRadius);
  vec3 reference = abs(u_moonDirection.y) > 0.96
    ? vec3(1.0, 0.0, 0.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(reference, u_moonDirection));
  vec3 bitangent = cross(u_moonDirection, tangent);
  vec2 disc = vec2(
    dot(direction, tangent),
    dot(direction, bitangent)
  ) / moonRadius;
  float radiusSquared = dot(disc, disc);
  if (radiusSquared >= 1.0 || moonCosine < 0.9999) return vec3(0.0);

  vec3 surfaceNormal = normalize(
    tangent * disc.x
      + bitangent * disc.y
      - u_moonDirection * sqrt(max(1.0 - radiusSquared, 0.0))
  );
  float lunarDaylight = max(dot(surfaceNormal, u_sunDirection), 0.0);
  float earthshine = 0.025 * (1.0 - u_moonIllumination);
  float limb = pow(max(1.0 - radiusSquared, 0.0), 0.16);
  vec3 moonColor = mix(
    vec3(0.50, 0.61, 0.82),
    vec3(1.00, 0.91, 0.73),
    clamp(u_moonDirection.y * 2.0, 0.0, 1.0)
  );
  return moonColor
    * (lunarDaylight * 0.24 + earthshine)
    * limb
    * atmosphericTransmittance(u_moonDirection, turbidity);
}

vec3 atmosphereLut(vec3 direction) {
  vec3 skyDirection = normalize(vec3(
    direction.x,
    max(direction.y, 0.0005),
    direction.z
  ));
  float azimuth = atan(skyDirection.x, skyDirection.z);
  float elevation = asin(clamp(skyDirection.y, 0.0, 1.0));
  vec2 uv = vec2(
    fract(azimuth / (2.0 * PI) + 0.5),
    clamp(elevation / (0.5 * PI), 0.0, 1.0)
  );
  return textureLod(u_atmosphere, uv, 0.0).rgb;
}

vec3 atmosphere(vec3 direction, vec3 sunDirection, float turbidity) {
  vec3 skyDirection = normalize(vec3(direction.x, max(direction.y, 0.002), direction.z));
  float cosineTheta = clamp(dot(skyDirection, sunDirection), -1.0, 1.0);
  vec3 sunAttenuation = atmosphericTransmittance(sunDirection, turbidity);
  float sunDisc = smoothstep(
    cos(u_sunAngularRadius * 1.08),
    cos(u_sunAngularRadius * 0.90),
    cosineTheta
  );
  float lensBloom = exp(
    (cosineTheta - 1.0) / max(u_sunAngularRadius * u_sunAngularRadius * 6.0, 0.00002)
  );
  float sunVisible = step(0.0, sunDirection.y);
  vec3 directSun = sunAttenuation
    * (sunDisc * 30.0 + lensBloom * 2.8)
    * sunVisible;
  float moonCosine = dot(skyDirection, u_moonDirection);
  float moonHalo = exp(
    (moonCosine - 1.0) / max(u_moonAngularRadius * u_moonAngularRadius * 34.0, 0.00008)
  );
  vec3 moonAureole = vec3(0.28, 0.38, 0.62)
    * moonHalo
    * u_primaryLightStrength
    * (1.0 - step(-0.002, u_sunDirection.y))
    * step(0.0, u_moonDirection.y)
    * atmosphericTransmittance(u_moonDirection, turbidity)
    * 4.8;
  float lunarNight = (1.0 - smoothstep(-0.16, -0.025, u_sunDirection.y))
    * smoothstep(-0.02, 0.18, u_moonDirection.y)
    * u_moonIllumination;
  vec3 lunarSky = vec3(0.0018, 0.0048, 0.0115)
    * lunarNight
    * mix(1.0, 0.46, smoothstep(0.0, 0.8, skyDirection.y));
  return atmosphereLut(skyDirection)
    + directSun
    + lunarSky
    + moonRadiance(skyDirection, turbidity)
    + moonAureole;
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
  float stone = smoothstep(0.115, 0.045, length(stoneLocal - stoneOffset))
    * smoothstep(0.78, 0.94, noise21(stoneCell + 11.7));
  vec3 silt = mix(vec3(0.15, 0.15, 0.11), vec3(0.43, 0.35, 0.20), broad);
  return silt
    * mix(0.84, 1.12, fine)
    * mix(0.88, 1.10, grain)
    * mix(0.78, 1.18, ripple)
    * mix(1.0, 0.42, stone);
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
  vec3 particulateExtinction = mix(
    vec3(0.062, 0.055, 0.048),
    vec3(0.135, 0.110, 0.082),
    u_mode
  );
  return u_absorption + particulateExtinction;
}

vec3 waterAmbientRadiance() {
  vec3 daylightRadiance = mix(
    vec3(0.003, 0.015, 0.034),
    vec3(0.015, 0.030, 0.030),
    u_mode
  );
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  float lunarNight = (1.0 - daylight)
    * smoothstep(-0.02, 0.20, u_moonDirection.y)
    * u_moonIllumination;
  vec3 lunarAmbient = vec3(0.0028, 0.0062, 0.0138) * lunarNight;
  vec3 moonlight = vec3(0.0040, 0.0075, 0.0160) * u_primaryLightStrength;
  return daylightRadiance * mix(0.08, 1.0, daylight)
    + lunarAmbient
    + moonlight;
}

vec3 seabedRadiance(vec2 floorPosition, float turbidity) {
  vec2 floorUv = fract(floorPosition / u_domainSize + 0.5);
  float causticEnergy = textureLod(u_caustics, floorUv, 0.75).r;
  vec3 lightColor = primaryLightRadiance(turbidity);
  vec3 refractedLight = refract(
    -u_primaryLightDirection,
    vec3(0.0, 1.0, 0.0),
    1.0 / WATER_IOR
  );
  vec3 bedNormal = seabedNormal(floorPosition);
  float bedIllumination = mix(
    0.52,
    1.32,
    max(dot(bedNormal, -refractedLight), 0.0)
  );
  float lightWaterPath = u_floorDepth / max(-refractedLight.y, 0.0001);
  vec3 lightThroughWater = exp(-waterExtinctionCoefficient() * lightWaterPath);
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  float lunarNight = (1.0 - daylight)
    * smoothstep(-0.02, 0.20, u_moonDirection.y)
    * u_moonIllumination;
  vec3 floorAmbient = mix(
    vec3(0.0045, 0.0095, 0.0200),
    vec3(0.050, 0.078, 0.094),
    daylight
  ) + vec3(0.0070, 0.0140, 0.0290) * lunarNight;
  return seabedAlbedo(floorPosition) * (
    floorAmbient + lightColor * lightThroughWater * (
        0.34 + bedIllumination * causticEnergy * mix(3.80, 1.90, u_mode)
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
  float turbidity
) {
  float marchDistance = clamp(distance, 0.0, 52.0);
  float stepLength = marchDistance / 6.0;
  vec3 extinction = waterExtinctionCoefficient();
  vec3 scattering = mix(
    vec3(0.020, 0.040, 0.064),
    vec3(0.025, 0.048, 0.052),
    u_mode
  );
  vec3 lightColor = primaryLightRadiance(turbidity);
  vec3 refractedLight = refract(
    -u_primaryLightDirection,
    vec3(0.0, 1.0, 0.0),
    1.0 / WATER_IOR
  );
  float phase = henyeyGreenstein(dot(refractedLight, -direction), 0.64);
  vec3 accumulated = vec3(0.0);

  for (int sampleIndex = 0; sampleIndex < 6; sampleIndex += 1) {
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
    float fineLight = sedimentNoise(
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
      sedimentNoise(
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

vec3 encodeScene(vec3 color, vec3 grade, float exposure) {
  color = max(color * grade, vec3(0.0));
  color = 1.0 - exp(-color * exposure);
  return pow(color, vec3(1.0 / 2.2));
}

bool intersectOceanSurface(
  vec3 origin,
  vec3 direction,
  out float distance,
  out vec3 position
) {
  if (abs(direction.y) < 0.0001) return false;
  float flatDistance = -origin.y / direction.y;
  if (flatDistance <= 0.0) return false;
  distance = flatDistance;
  position = origin + direction * distance;
  float detail = 1.0 - smoothstep(140.0, 1100.0, flatDistance);

  for (int iteration = 0; iteration < 4; iteration += 1) {
    float height = oceanHeight(position.xz) * detail;
    distance = (height - origin.y) / direction.y;
    if (distance <= 0.0) return false;
    position = origin + direction * distance;
  }
  return true;
}

vec3 sampleUnderwaterRay(
  vec3 origin,
  vec3 direction,
  float turbidity
) {
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
      seabedRadiance(floorPosition, turbidity),
      floorVisibility
    );
  }

  vec3 volumeRadiance = underwaterVolume(
    origin,
    direction,
    visibleDistance,
    turbidity
  );
  return targetRadiance * exp(-extinction * visibleDistance)
    + volumeRadiance * mix(1.0, 0.38, floorVisibility);
}

vec3 renderAboveWater(vec3 origin, vec3 ray, float turbidity) {
  if (ray.y >= -0.0001) {
    return atmosphere(ray, u_sunDirection, turbidity);
  }

  float distanceToSurface;
  vec3 surfacePosition;
  if (!intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition)) {
    return atmosphere(ray, u_sunDirection, turbidity);
  }

  float geometryDetail = 1.0 - smoothstep(140.0, 1100.0, distanceToSurface);
  vec3 normal = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(surfacePosition.xz),
    geometryDetail
  ));
  vec3 reflectedDirection = reflect(ray, normal);
  vec3 reflected = atmosphere(reflectedDirection, u_sunDirection, turbidity);
  vec3 refractedDirection = refract(ray, normal, 1.0 / WATER_IOR);
  vec3 refracted = sampleUnderwaterRay(
    surfacePosition + refractedDirection * 0.025,
    refractedDirection,
    turbidity
  );
  float facing = max(dot(-ray, normal), 0.0);
  float fresnel = dielectricFresnel(facing);
  vec3 color = mix(refracted, reflected, fresnel);
  color += coxMunkSunGlitter(
    normal,
    -ray,
    u_primaryLightDirection,
    primaryLightRadiance(turbidity)
  );
  return color * mix(1.0, 0.63, u_mode);
}

vec3 renderBelowWater(vec3 origin, vec3 ray, float turbidity) {
  vec3 extinction = waterExtinctionCoefficient();
  if (ray.y <= 0.0001) {
    return sampleUnderwaterRay(origin, ray, turbidity);
  }

  float distanceToSurface;
  vec3 surfacePosition;
  if (!intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition)) {
    return sampleUnderwaterRay(origin, ray, turbidity);
  }

  float roughFootprint = mix(
    0.28,
    1.45,
    smoothstep(0.0, 14.0, distanceToSurface)
  );
  vec3 surfaceNormals[3];
  surfaceNormals[0] = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(surfacePosition.xz),
    0.56
  ));
  surfaceNormals[1] = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(
      surfacePosition.xz + vec2(0.73, -0.41) * roughFootprint
    ),
    0.50
  ));
  surfaceNormals[2] = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(
      surfacePosition.xz + vec2(-0.37, 0.81) * roughFootprint
    ),
    0.46
  ));
  float normalWeights[3];
  normalWeights[0] = 0.44;
  normalWeights[1] = 0.30;
  normalWeights[2] = 0.26;
  vec3 transmittedSky = vec3(0.0);
  float transmittedEnergy = 0.0;

  for (int normalIndex = 0; normalIndex < 3; normalIndex += 1) {
    vec3 normal = surfaceNormals[normalIndex];
    float waterFacing = max(dot(ray, normal), 0.0);
    float fresnel = dielectricFresnelBetween(waterFacing, WATER_IOR, 1.0);
    vec3 transmittedDirection = refract(ray, -normal, WATER_IOR);
    float transmission = length(transmittedDirection) > 0.001
      ? 1.0 - fresnel
      : 0.0;
    vec3 transmittedRadiance = atmosphere(
      transmittedDirection,
      u_sunDirection,
      turbidity
    );
    transmittedSky += transmittedRadiance
      * transmission
      * normalWeights[normalIndex];
    transmittedEnergy += transmission * normalWeights[normalIndex];
  }

  vec3 reflectedDirection = reflect(ray, surfaceNormals[0]);
  vec3 reflectedWater = sampleUnderwaterRay(
    surfacePosition - surfaceNormals[0] * 0.025,
    reflectedDirection,
    turbidity
  );
  vec3 surfaceRadiance = transmittedSky
    + reflectedWater * (1.0 - transmittedEnergy);
  surfaceRadiance = mix(
    waterAmbientRadiance() * 1.45,
    surfaceRadiance,
    0.82
  );
  vec3 resolvedSurface = surfaceRadiance * exp(-extinction * distanceToSurface)
    + underwaterVolume(origin, ray, distanceToSurface, turbidity);
  if (ray.y < 0.12) {
    vec3 waterColumn = sampleUnderwaterRay(origin, ray, turbidity);
    return mix(
      waterColumn,
      resolvedSurface,
      smoothstep(0.005, 0.12, ray.y)
    );
  }
  return resolvedSurface;
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 screen = v_uv * 2.0 - 1.0;
  screen.x *= aspect;
  float turbidity = mix(1.9, 3.8, u_mode);
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
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
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

  float localSurfaceHeight = oceanHeight(origin.xz);
  float cameraUnderwaterMix = 1.0 - smoothstep(
    -0.22,
    0.22,
    origin.y - localSurfaceHeight
  );
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
    aboveColor = renderAboveWater(aboveOrigin, ray, turbidity);
  }
  if (cameraUnderwaterMix > 0.001) {
    belowColor = renderBelowWater(belowOrigin, ray, turbidity);
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
    vec3(0.89, 0.98, 1.08),
    daylight
  );
  vec3 underwaterGrade = mix(
    vec3(0.56, 1.06, 1.42),
    vec3(0.78, 1.04, 1.18),
    floorReveal
  );
  float aboveExposure = mix(7.2, 1.42, daylight);
  float underwaterExposure = mix(8.4, mix(1.82, 1.62, floorReveal), daylight);
  outColor = vec4(
    encodeScene(
      color,
      mix(aboveGrade, underwaterGrade, pixelUnderwaterMix),
      mix(aboveExposure, underwaterExposure, pixelUnderwaterMix)
    ),
    1.0
  );
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

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createInitialState(size: number, seed: number): Float32Array {
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
  const primaryWindAngle = random() * Math.PI * 2;
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
  const scale = 0.105 / Math.max(Math.sqrt(variance), 0.000001);
  const state = new Float32Array(size * size * 4);

  for (let index = 0; index < currentHeight.length; index += 1) {
    state[index * 4] = (currentHeight[index] - mean) * scale;
    state[index * 4 + 1] = (previousHeight[index] - mean) * scale;
    state[index * 4 + 2] = 0;
    state[index * 4 + 3] = 1;
  }

  return state;
}

function getCachedInitialState(size: number, seed: number) {
  const key = `${size}:${seed}`;
  const cached = initialStateCache.get(key);
  if (cached) return cached;
  const state = createInitialState(size, seed);
  initialStateCache.clear();
  initialStateCache.set(key, state);
  return state;
}

function normalizeVector(vector: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function crossVector(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): [number, number, number] {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function createSunDiscSamples(
  direction: readonly [number, number, number],
  angularRadius: number,
): Array<[number, number, number]> {
  const reference: readonly [number, number, number] = Math.abs(direction[1]) > 0.96
    ? [1, 0, 0]
    : [0, 1, 0];
  const tangent = normalizeVector(crossVector(direction, reference));
  const bitangent = normalizeVector(crossVector(tangent, direction));
  const offsets = [
    [0, 0],
    [0.58, 0],
    [-0.58, 0],
    [0, 0.58],
    [0, -0.58],
  ] as const;

  return offsets.map(([x, y]) =>
    normalizeVector([
      direction[0] + (tangent[0] * x + bitangent[0] * y) * angularRadius,
      direction[1] + (tangent[1] * x + bitangent[1] * y) * angularRadius,
      direction[2] + (tangent[2] * x + bitangent[2] * y) * angularRadius,
    ]),
  );
}

function bindTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  unit: number,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

function createPondEngine(
  gl: WebGL2RenderingContext,
  mode: "pond" | "dusk",
  seed: number,
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
  const atmosphereProgram = createProgram(
    gl,
    fullscreenVertexShader,
    atmosphereFragmentShader,
  );
  const displayProgram = createProgram(gl, fullscreenVertexShader, displayFragmentShader);
  const fullscreen = createFullscreenGeometry(gl);
  const causticGeometry = createCausticGeometry(gl, quality.causticGridSize);
  const initialState = getCachedInitialState(
    quality.simulationSize,
    mode === "dusk" ? seed ^ 0x51f15e : seed,
  );
  const firstState = createRenderTarget(
    gl,
    quality.simulationSize,
    quality.simulationSize,
    gl.RGBA32F,
    gl.FLOAT,
    initialState,
    gl.NEAREST,
  );
  const secondState = createRenderTarget(
    gl,
    quality.simulationSize,
    quality.simulationSize,
    gl.RGBA32F,
    gl.FLOAT,
    initialState,
    gl.NEAREST,
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
  const seedUniform = (seed % 100_000) / 100_000;

  const simulationUniforms = {
    state: getUniform(gl, simulationProgram, "u_state"),
    kernel: getUniform(gl, simulationProgram, "u_kernel"),
    gridSize: getUniform(gl, simulationProgram, "u_gridSize"),
    deltaTime: getUniform(gl, simulationProgram, "u_deltaTime"),
    gravity: getUniform(gl, simulationProgram, "u_gravity"),
    damping: getUniform(gl, simulationProgram, "u_damping"),
    source: getUniform(gl, simulationProgram, "u_source"),
  };
  const causticUniforms = {
    state: getUniform(gl, causticProgram, "u_state"),
    gridSize: getUniform(gl, causticProgram, "u_gridSize"),
    domainSize: getUniform(gl, causticProgram, "u_domainSize"),
    floorDepth: getUniform(gl, causticProgram, "u_floorDepth"),
    sunDirection: getUniform(gl, causticProgram, "u_sunDirection"),
    tileOffset: getUniform(gl, causticProgram, "u_tileOffset"),
    oceanTime: getUniform(gl, causticProgram, "u_oceanTime"),
    seed: getUniform(gl, causticProgram, "u_seed"),
    resolution: getUniform(gl, causticProgram, "u_resolution"),
    sampleWeight: getUniform(gl, causticProgram, "u_sampleWeight"),
  };
  const atmosphereUniforms = {
    sunDirection: getUniform(gl, atmosphereProgram, "u_sunDirection"),
    aerosolScale: getUniform(gl, atmosphereProgram, "u_aerosolScale"),
  };
  const displayUniforms = {
    state: getUniform(gl, displayProgram, "u_state"),
    caustics: getUniform(gl, displayProgram, "u_caustics"),
    atmosphere: getUniform(gl, displayProgram, "u_atmosphere"),
    resolution: getUniform(gl, displayProgram, "u_resolution"),
    gridSize: getUniform(gl, displayProgram, "u_gridSize"),
    domainSize: getUniform(gl, displayProgram, "u_domainSize"),
    floorDepth: getUniform(gl, displayProgram, "u_floorDepth"),
    scroll: getUniform(gl, displayProgram, "u_scroll"),
    mode: getUniform(gl, displayProgram, "u_mode"),
    sunDirection: getUniform(gl, displayProgram, "u_sunDirection"),
    moonDirection: getUniform(gl, displayProgram, "u_moonDirection"),
    primaryLightDirection: getUniform(gl, displayProgram, "u_primaryLightDirection"),
    sunAngularRadius: getUniform(gl, displayProgram, "u_sunAngularRadius"),
    moonAngularRadius: getUniform(gl, displayProgram, "u_moonAngularRadius"),
    primaryLightStrength: getUniform(gl, displayProgram, "u_primaryLightStrength"),
    moonIllumination: getUniform(gl, displayProgram, "u_moonIllumination"),
    oceanTime: getUniform(gl, displayProgram, "u_oceanTime"),
    seed: getUniform(gl, displayProgram, "u_seed"),
    absorption: getUniform(gl, displayProgram, "u_absorption"),
  };

  let readState = firstState;
  let writeState = secondState;
  let stateRevision = 0;
  let causticRevision = -1;
  let causticLightSignature = "";
  let atmosphereLightSignature = "";

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
    gl.uniform1f(
      simulationUniforms.gravity,
      9.81 / (WATER_DOMAIN_METERS / quality.simulationSize),
    );
    gl.uniform1f(simulationUniforms.damping, mode === "dusk" ? 0.22 : 0.16);
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
    stateRevision += 1;
  };

  const renderCaustics = (celestial: CelestialState, oceanTime: number) => {
    const lightDirection = celestial.primaryLightDirection;
    const discSamples = createSunDiscSamples(
      lightDirection,
      celestial.primaryLightAngularRadius,
    );
    const lightSamples = quality.lightSampleCount === 1
      ? discSamples.slice(0, 1)
      : discSamples;
    const tileX = Math.sign(lightDirection[0]);
    const tileY = Math.sign(lightDirection[2]);
    const causticTiles = [
      [0, 0],
      [tileX, 0],
      [0, tileY],
      [tileX, tileY],
    ] as const;
    gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget.framebuffer);
    gl.viewport(0, 0, quality.causticTextureSize, quality.causticTextureSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(causticProgram);
    gl.bindVertexArray(causticGeometry.vertexArray);
    bindTexture(gl, readState.texture, 0);
    gl.uniform1i(causticUniforms.state, 0);
    gl.uniform1f(causticUniforms.gridSize, quality.simulationSize);
    gl.uniform1f(causticUniforms.domainSize, WATER_DOMAIN_METERS);
    gl.uniform1f(causticUniforms.floorDepth, OCEAN_DEPTH_METERS);
    gl.uniform1f(causticUniforms.oceanTime, oceanTime);
    gl.uniform1f(causticUniforms.seed, seedUniform);
    gl.uniform2f(
      causticUniforms.resolution,
      quality.causticTextureSize,
      quality.causticTextureSize,
    );
    gl.uniform1f(causticUniforms.sampleWeight, 1 / lightSamples.length);

    if (celestial.primaryLightStrength > 0.00001 && lightDirection[1] > 0) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (const [offsetX, offsetY] of causticTiles) {
        gl.uniform2f(causticUniforms.tileOffset, offsetX, offsetY);
        for (const sample of lightSamples) {
          gl.uniform3f(causticUniforms.sunDirection, sample[0], sample[1], sample[2]);
          gl.drawArrays(gl.TRIANGLES, 0, causticGeometry.vertexCount);
        }
      }
    }

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, causticTarget.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const renderAtmosphere = (celestial: CelestialState) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, atmosphereTarget.framebuffer);
    gl.viewport(0, 0, quality.atmosphereWidth, quality.atmosphereHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(atmosphereProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    gl.uniform3f(
      atmosphereUniforms.sunDirection,
      celestial.sun.direction[0],
      celestial.sun.direction[1],
      celestial.sun.direction[2],
    );
    gl.uniform1f(atmosphereUniforms.aerosolScale, mode === "dusk" ? 1.34 : 0.72);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const render = (
    width: number,
    height: number,
    scroll: number,
    celestial: CelestialState,
    oceanTime: number,
  ) => {
    const atmosphereSignature = celestial.sun.direction
      .map((value) => value.toFixed(4))
      .join(":");
    if (atmosphereSignature !== atmosphereLightSignature) {
      renderAtmosphere(celestial);
      atmosphereLightSignature = atmosphereSignature;
    }
    const lightSignature = celestial.primaryLightDirection
      .map((value) => value.toFixed(3))
      .join(":");
    if (
      causticRevision < 0 ||
      stateRevision - causticRevision >= quality.causticRevisionStride ||
      lightSignature !== causticLightSignature
    ) {
      renderCaustics(celestial, oceanTime);
      causticRevision = stateRevision;
      causticLightSignature = lightSignature;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(displayProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, readState.texture, 0);
    bindTexture(gl, causticTarget.texture, 1);
    bindTexture(gl, atmosphereTarget.texture, 2);
    gl.uniform1i(displayUniforms.state, 0);
    gl.uniform1i(displayUniforms.caustics, 1);
    gl.uniform1i(displayUniforms.atmosphere, 2);
    gl.uniform2f(displayUniforms.resolution, width, height);
    gl.uniform1f(displayUniforms.gridSize, quality.simulationSize);
    gl.uniform1f(displayUniforms.domainSize, WATER_DOMAIN_METERS);
    gl.uniform1f(displayUniforms.floorDepth, OCEAN_DEPTH_METERS);
    gl.uniform1f(displayUniforms.scroll, scroll);
    gl.uniform1f(displayUniforms.mode, mode === "dusk" ? 1 : 0);
    gl.uniform3f(
      displayUniforms.sunDirection,
      celestial.sun.direction[0],
      celestial.sun.direction[1],
      celestial.sun.direction[2],
    );
    gl.uniform3f(
      displayUniforms.moonDirection,
      celestial.moon.direction[0],
      celestial.moon.direction[1],
      celestial.moon.direction[2],
    );
    gl.uniform3f(
      displayUniforms.primaryLightDirection,
      celestial.primaryLightDirection[0],
      celestial.primaryLightDirection[1],
      celestial.primaryLightDirection[2],
    );
    gl.uniform1f(displayUniforms.sunAngularRadius, celestial.sun.angularRadius);
    gl.uniform1f(displayUniforms.moonAngularRadius, celestial.moon.angularRadius);
    gl.uniform1f(displayUniforms.primaryLightStrength, celestial.primaryLightStrength);
    gl.uniform1f(displayUniforms.moonIllumination, celestial.moonIllumination);
    gl.uniform1f(displayUniforms.oceanTime, oceanTime);
    gl.uniform1f(displayUniforms.seed, seedUniform);
    gl.uniform3f(
      displayUniforms.absorption,
      WATER_ABSORPTION_RGB_PER_METER[0],
      WATER_ABSORPTION_RGB_PER_METER[1],
      WATER_ABSORPTION_RGB_PER_METER[2],
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
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
    gl.deleteFramebuffer(causticTarget.framebuffer);
    gl.deleteTexture(causticTarget.texture);
    gl.deleteFramebuffer(atmosphereTarget.framebuffer);
    gl.deleteTexture(atmosphereTarget.texture);
    gl.deleteTexture(kernelTexture);
    gl.deleteProgram(simulationProgram);
    gl.deleteProgram(causticProgram);
    gl.deleteProgram(atmosphereProgram);
    gl.deleteProgram(displayProgram);
  };

  return { destroy, render, step };
}

export default function PondSurface({
  className = "",
  dateMs = DEFAULT_CELESTIAL_DATE,
  fullMoonScene = false,
  latitude = 15.2,
  longitude = 73.7,
  mode = "pond",
  stageId,
}: PondSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const celestial = useMemo(
    () => getCelestialState(
      new Date(dateMs),
      latitude,
      longitude,
      { fullMoonScene },
    ),
    [dateMs, fullMoonScene, latitude, longitude],
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

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      stencil: false,
    });

    if (!gl) {
      canvas.dataset.webgl = "fallback";
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const quality = getQualityProfile(coarsePointer, motionQuery.matches);
    let engine: ReturnType<typeof createPondEngine>;
    try {
      engine = createPondEngine(gl, mode, getSessionOceanSeed(), quality);
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

    const resize = () => {
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

    const draw = (timestamp: number) => {
      animationFrame = null;
      if (!isVisible || document.hidden) return;

      if (!reducedMotion && lastFrame > 0 && timestamp - lastFrame < frameInterval) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }

      resize();
      const firstFrame = lastFrame === 0;
      const elapsed = firstFrame ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.05);
      lastFrame = timestamp;

      const targetScrollProgress = getScrollProgress();
      if (firstFrame || reducedMotion) {
        renderedScrollProgress = targetScrollProgress;
      } else {
        const scrollBlend = 1 - Math.exp(-elapsed * 5.0);
        renderedScrollProgress +=
          (targetScrollProgress - renderedScrollProgress) * scrollBlend;
      }

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
        canvas.width,
        canvas.height,
        renderedScrollProgress,
        celestialRef.current,
        oceanTime,
      );

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

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
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [latitude, mode, stageId]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      data-webgl="pending"
      data-solver="iwave"
    />
  );
}
