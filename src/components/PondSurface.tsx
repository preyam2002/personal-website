"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OCEAN_MESH_FAR } from "@/lib/oceanMesh";
import { prepareOcean } from "@/lib/prepareOcean";
import type { OceanWorkerResult } from "@/lib/oceanWorker";
import { compileWebGLPrograms } from "@/lib/webglPrograms";
import { createWebGLFrameGate } from "@/lib/webglFrame";
import { createWaterFrameBudget, getWaterQuality, nextWaterFrameTime, type WaterQuality } from "@/lib/waterQuality";
import { DIFFUSE_WATER_REFLECTANCE, oceanReflectionShader } from "@/lib/oceanReflection";
import { FOAM_DOMAIN_METERS, FOAM_DRIFT_FRACTION, FOAM_ORIGIN, foamEvolutionShader } from "@/lib/oceanFoam";
import { ATMOSPHERE_VIEW_SAMPLES, atmosphereOpticsShader, skyMappingShader } from "@/lib/oceanAtmosphere";
import {
  CAMERA_FOCAL_LENGTH,
  CAMERA_ORIGIN_BOTTOM,
  CAMERA_ORIGIN_TOP,
  CAMERA_TARGET_TOP,
  getCameraRay,
  getOceanCamera,
  getOceanSeedPhase,
  intersectHorizontalPlane,
} from "@/lib/oceanCamera";
import { createGestureTracker, type GestureEvent } from "@/lib/oceanGestures";
import { RIPPLE_SLOTS, createRipplePool, rippleShader } from "@/lib/oceanRipples";
import {
  ACTOR_TEXTURE_ROWS,
  ACTOR_TEXTURE_WIDTH,
  createSchool,
  getSchoolHome,
  packSchool,
  stepSchool,
  type Fish,
  type SchoolBounds,
  type SchoolEnvironment,
} from "@/lib/oceanLife";
import { lifeShader } from "@/lib/oceanLifeShaders";
import {
  OCEAN_CASCADE_COUNT,
  OCEAN_CASCADE_LENGTHS,
  OCEAN_REPEAT_SECONDS,
  OCEAN_MAX_ANISOTROPY,
  VARIANCE_TABLE_SIZE,
  VARIANCE_RATIO_SAMPLES,
  VARIANCE_ANGLE_SAMPLES,
  VARIANCE_MIN_FOOTPRINT,
  VARIANCE_MAX_FOOTPRINT,
} from "@/lib/oceanSpectrum";
import {
  evolveSpectrumShader,
  transformSpectrumShader,
  unpackSpectrumShader,
  filterSpectrumShader,
} from "@/lib/oceanSpectrumShaders";
import {
  getCelestialState,
  type CelestialState,
} from "@/lib/celestial";
import {
  WATER_ABSORPTION_RGB_PER_METER,
  WATER_IOR,
} from "@/lib/iwave";
import {
  OCEAN_PLAYBACK_RATE,
  OCEAN_WAVE_COMPONENT_COUNT,
  DISTANT_CREST_NOISE_CELLS,
  DISTANT_CREST_NOISE_SIZE,
  createOceanWaveField,
  getDisplaySunDirection,
  getMoonPhaseLight,
  getSceneSunDirection,
  getSessionOceanSeed,
  getStarFieldTransform,
  seededRandom,
  getSunAzimuthScale,
  spectralHeightAt,
  type Direction3,
  type Matrix3,
  type OceanWaveField,
} from "@/lib/oceanWaves";

export type PondSurfaceStatus = "pending" | "active" | "fallback";

type PondSurfaceProps = {
  className?: string;
  dateMs?: number;
  latitude?: number;
  longitude?: number;
  seed?: number;
  stageId?: string;
  onStatusChange?: (status: PondSurfaceStatus) => void;
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
  fishCount: number;
  frameInterval: number;
  meshColumns: number;
  meshRows: number;
  name: Exclude<WaterQuality, "static">;
  pixelBudget: number;
  rippleSlots: number;
  simulationSize: number;
};

const SIMULATION_SIZE = 256;
const ATMOSPHERE_TEXTURE_WIDTH = 256;
const ATMOSPHERE_TEXTURE_HEIGHT = 96;
const OCEAN_WAVE_HEIGHT_SCALE = 1.0;
const WATER_DOMAIN_METERS = 32;
const OCEAN_DEPTH_METERS = 24;
const CELESTIAL_DISC_SCALE = 1.8;
const DEFAULT_CELESTIAL_DATE = Date.UTC(2026, 5, 21, 6, 30);

const FULL_QUALITY: QualityProfile = {
  atmosphereHeight: ATMOSPHERE_TEXTURE_HEIGHT,
  atmosphereWidth: ATMOSPHERE_TEXTURE_WIDTH,
  causticGridSize: 120,
  causticTextureSize: 384,
  cloudFrameStride: 3,
  cloudHeight: 384,
  cloudWidth: 1024,
  detailLevel: 1,
  fishCount: 36,
  frameInterval: 1_000 / 60,
  meshColumns: 384,
  meshRows: 640,
  name: "full",
  pixelBudget: 1_000_000,
  rippleSlots: RIPPLE_SLOTS,
  simulationSize: SIMULATION_SIZE,
};

const REDUCED_QUALITY: QualityProfile = {
  atmosphereHeight: 60,
  atmosphereWidth: 160,
  causticGridSize: 80,
  causticTextureSize: 192,
  cloudFrameStride: 8,
  cloudHeight: 192,
  cloudWidth: 512,
  detailLevel: 0,
  fishCount: 18,
  frameInterval: 1_000 / 30,
  meshColumns: 192,
  meshRows: 384,
  name: "reduced",
  pixelBudget: 300_000,
  rippleSlots: 6,
  simulationSize: 128,
};

const LOW_QUALITY: QualityProfile = {
  atmosphereHeight: 48,
  atmosphereWidth: 128,
  causticGridSize: 48,
  causticTextureSize: 128,
  cloudFrameStride: 12,
  cloudHeight: 128,
  cloudWidth: 384,
  detailLevel: 0,
  fishCount: 0,
  frameInterval: 1_000 / 30,
  meshColumns: 96,
  meshRows: 192,
  name: "low",
  pixelBudget: 180_000,
  rippleSlots: 3,
  simulationSize: 64,
};

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
    if (view === "normals") return 4;
    if (view === "roughness") return 5;
    if (view === "reflection") return 6;
  } catch {
    return 0;
  }
  return 0;
}

function getPreviewNumber(name: string): number | null {
  const value = new URLSearchParams(window.location.search).get(name);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function hasQualityOverride() {
  try {
    return new URLSearchParams(window.location.search).has("ocean-quality");
  } catch {
    return false;
  }
}

const fullscreenVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;

out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
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
${skyMappingShader}
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
    skyElevationUv(elevation)
  );
}
`;

const glslCamera = `
void oceanCamera(
  out vec3 origin, out vec3 forward, out vec3 right, out vec3 up, out float focalLength
) {
  float entry = smoothstep(0.0, 0.205, u_scroll);
  float deepDescent = smoothstep(0.19, 0.96, u_scroll);
  float floorView = smoothstep(0.58, 0.96, u_scroll);
  float seedPhase = u_seed * 6.28318530718;
  vec3 entryOrigin = mix(
    vec3(${CAMERA_ORIGIN_TOP[0].toFixed(2)}, ${CAMERA_ORIGIN_TOP[1].toFixed(2)}, ${CAMERA_ORIGIN_TOP[2].toFixed(2)}),
    vec3(0.0, -0.16, -2.75),
    entry
  );
  origin = mix(
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
  forward = normalize(mix(startForward, surfaceForward, entry));
  forward = normalize(mix(forward, floorForward, floorView));
  right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  up = cross(forward, right);
  focalLength = mix(${CAMERA_FOCAL_LENGTH.toFixed(2)}, 1.30, entry);
  focalLength = mix(
    focalLength,
    1.55,
    smoothstep(0.18, 0.30, u_scroll)
  );
  focalLength = mix(focalLength, 1.68, floorView);
}
`;

const glslWaves = `
uniform highp sampler2DArray u_displacement;
uniform highp sampler2DArray u_gradient;
uniform highp sampler2D u_distantNoise;
const float CASCADE_LENGTHS[${OCEAN_CASCADE_COUNT}] = float[${OCEAN_CASCADE_COUNT}](${OCEAN_CASCADE_LENGTHS.map(value => value.toFixed(2)).join(", ")});
${rippleShader}

vec4 cubicWeights(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(1.0 - 3.0 * t + 3.0 * t2 - t3, 4.0 - 6.0 * t2 + 3.0 * t3,
    1.0 + 3.0 * t + 3.0 * t2 - 3.0 * t3, t3) / 6.0;
}

vec4 cascadeLevel(highp sampler2DArray field, vec2 position, int band, float lod) {
  float size = max(u_gridSize / exp2(lod), 1.0);
  vec2 pixel = (position / CASCADE_LENGTHS[band] + 0.5 / u_gridSize) * size - 0.5;
  vec2 base = floor(pixel);
  vec4 wx = cubicWeights(fract(pixel.x));
  vec4 wy = cubicWeights(fract(pixel.y));
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w);
  vec2 gy = vec2(wy.x + wy.y, wy.z + wy.w);
  vec2 x = (base.x + vec2(-0.5 + wx.y / gx.x, 1.5 + wx.w / gx.y)) / size;
  vec2 y = (base.y + vec2(-0.5 + wy.y / gy.x, 1.5 + wy.w / gy.y)) / size;
  return textureLod(field, vec3(x.x, y.x, float(band)), lod) * gx.x * gy.x
    + textureLod(field, vec3(x.y, y.x, float(band)), lod) * gx.y * gy.x
    + textureLod(field, vec3(x.x, y.y, float(band)), lod) * gx.x * gy.y
    + textureLod(field, vec3(x.y, y.y, float(band)), lod) * gx.y * gy.y;
}

vec4 cascadeSample(highp sampler2DArray field, vec2 position, int band, float footprint) {
  float lod = clamp(log2(max(footprint * u_gridSize / CASCADE_LENGTHS[band], 1.0)),
    0.0, log2(u_gridSize));
  vec4 lower = cascadeLevel(field, position, band, floor(lod));
  if (fract(lod) < 0.001) return lower;
  return mix(lower, cascadeLevel(field, position, band, ceil(lod)), fract(lod));
}

vec4 cascadeDirectionalMip(highp sampler2DArray field, vec2 position, int band, float lod) {
  vec3 uv = vec3(position / CASCADE_LENGTHS[band] + 0.5 / u_gridSize, float(band));
  if (lod >= 1.0) return textureLod(field, uv, lod);
  vec4 base = cascadeLevel(field, position, band, 0.0);
  if (lod < 0.001) return base;
  return mix(base, textureLod(field, uv, 1.0), lod);
}

vec4 cascadeDirectionalSample(highp sampler2DArray field, vec2 position, int band,
  vec2 majorAxis, float minor) {
  float texel = CASCADE_LENGTHS[band] / u_gridSize;
  float lod = clamp(log2(max(minor / texel, 1.0)), 0.0, log2(u_gridSize));
  float major = length(majorAxis);
  float span = sqrt(max(major * major - pow(max(minor, texel), 2.0), 0.0));
  if (span < 0.000001) return cascadeDirectionalMip(field, position, band, lod);
  vec2 step = majorAxis * (span / max(major, 0.000001) / 4.0);
  return (cascadeDirectionalMip(field, position - 1.5 * step, band, lod)
    + cascadeDirectionalMip(field, position - 0.5 * step, band, lod)
    + cascadeDirectionalMip(field, position + 0.5 * step, band, lod)
    + cascadeDirectionalMip(field, position + 1.5 * step, band, lod)) * 0.25;
}

float componentDetail(vec2 waveNumber, float footprint) {
  return exp(-0.5 * dot(waveNumber, waveNumber) * footprint * footprint);
}

vec2 distantCrestWarp(vec2 position, float footprint, out mat2 transform) {
  transform = mat2(1.0);
  vec2 offset = position - vec2(0.0, -6.2);
  float distance = length(offset);
  float t = clamp((distance - 18.0) / 77.0, 0.0, 1.0);
  float blend = 0.75 * t * t * (3.0 - 2.0 * t);
  if (blend < 0.001) return position;
  vec2 forward = normalize(u_waveData[0].xy);
  vec2 across = vec2(-forward.y, forward.x);
  vec2 noisePosition = (position - forward * (u_oceanTime * 1.4)) * 0.00625
    + vec2(u_wavePhase[0], u_wavePhase[2]);
  float noiseLod = log2(max(footprint * 0.025, 1.0));
  vec3 noise = textureLod(u_distantNoise,
    noisePosition / ${DISTANT_CREST_NOISE_CELLS.toFixed(1)}, noiseLod).rgb;
  float value = noise.x - 0.5;
  vec2 gradient = (noise.yz * 2.0 - 1.0) * 1.5 * 0.00625;
  vec2 blendGradient = vec2(0.0);
  if (t > 0.0 && t < 1.0) {
    blendGradient = offset / distance * (0.75 * 6.0 * t * (1.0 - t) / 77.0);
  }
  vec2 direction = forward * 70.0 + across * 100.0;
  transform += outerProduct(direction, gradient * blend + blendGradient * value);
  return position + direction * (value * blend);
}

float distantCrossBlend(vec2 position) {
  return 0.38 * smoothstep(25.0, 110.0, length(position - vec2(0.0, -6.2)));
}

mat2 distantCrossRotation() {
  return mat2(0.8660254, 0.5, -0.5, 0.8660254);
}

vec3 oceanDisplacement(vec2 position, float footprint) {
  vec3 displacement = vec3(0.0);
  mat2 warpTransform;
  vec2 warpedPosition = distantCrestWarp(position, footprint, warpTransform);
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    vec2 localWave = transpose(warpTransform) * wave.xy;
    float inverseWaveNumber = inversesqrt(dot(wave.xy, wave.xy));
    float theta = dot(warpedPosition, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    float amplitude = wave.w * componentDetail(localWave, footprint);
    displacement += vec3(wave.x * inverseWaveNumber * cos(theta), sin(theta),
      wave.y * inverseWaveNumber * cos(theta)) * amplitude;
  }
  float crossBlend = distantCrossBlend(position);
  for (int band = 0; band < ${OCEAN_CASCADE_COUNT}; band += 1) {
    vec2 samplePosition = band < 2 ? warpedPosition : position;
    vec3 wave = cascadeSample(u_displacement, samplePosition, band, footprint).xyz;
    if (band == 0 && crossBlend > 0.001) {
      mat2 rotation = distantCrossRotation();
      vec2 crossPosition = rotation * position + vec2(173.0, 277.0);
      vec3 crossing = cascadeSample(u_displacement, crossPosition, band, footprint).xyz;
      crossing.xz = transpose(rotation) * crossing.xz;
      wave = mix(wave, crossing, crossBlend)
        * inversesqrt((1.0 - crossBlend) * (1.0 - crossBlend) + crossBlend * crossBlend);
    }
    displacement += wave;
  }
  return displacement * vec3(u_choppiness, ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)}, u_choppiness)
    + vec3(0.0, rippleField(position, footprint).x, 0.0);
}

float oceanHeight(vec2 position, float footprint) {
  vec2 parameter = position;
  for (int iteration = 0; iteration < 2; iteration += 1) {
    parameter = position - oceanDisplacement(parameter, footprint).xz;
  }
  return oceanDisplacement(parameter, footprint).y;
}

void oceanDerivatives(vec2 position, float footprint, out vec2 slope, out mat2 jacobian) {
  slope = vec2(0.0);
  jacobian = mat2(1.0);
  mat2 warpTransform;
  vec2 warpedPosition = distantCrestWarp(position, footprint, warpTransform);
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    vec2 localWave = transpose(warpTransform) * wave.xy;
    float inverseWaveNumber = inversesqrt(dot(wave.xy, wave.xy));
    float theta = dot(warpedPosition, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    float amplitude = wave.w * componentDetail(localWave, footprint);
    vec2 waveSlope = localWave * amplitude * cos(theta);
    mat2 waveJacobian = -outerProduct(wave.xy, localWave)
      * (amplitude * inverseWaveNumber * sin(theta) * u_choppiness);
    slope += waveSlope;
    jacobian += waveJacobian;
  }
  float crossBlend = distantCrossBlend(position);
  for (int band = 0; band < ${OCEAN_CASCADE_COUNT}; band += 1) {
    vec2 samplePosition = band < 2 ? warpedPosition : position;
    vec4 gradient = cascadeSample(u_gradient, samplePosition, band, footprint);
    float crossStrain = cascadeSample(u_displacement, samplePosition, band, footprint).w;
    mat2 waveJacobian = mat2(gradient.z, crossStrain, crossStrain, gradient.w)
      * u_choppiness;
    vec2 waveSlope = band < 2 ? transpose(warpTransform) * gradient.xy : gradient.xy;
    if (band < 2) waveJacobian *= warpTransform;
    if (band == 0 && crossBlend > 0.001) {
      mat2 rotation = distantCrossRotation();
      vec2 crossPosition = rotation * position + vec2(173.0, 277.0);
      vec4 crossGradient = cascadeSample(u_gradient, crossPosition, band, footprint);
      float crossStrain = cascadeSample(u_displacement, crossPosition, band, footprint).w;
      mat2 crossJacobian = mat2(crossGradient.z, crossStrain,
        crossStrain, crossGradient.w) * u_choppiness;
      float energyScale = inversesqrt((1.0 - crossBlend) * (1.0 - crossBlend)
        + crossBlend * crossBlend);
      waveSlope = mix(waveSlope, transpose(rotation) * crossGradient.xy, crossBlend) * energyScale;
      waveJacobian = (waveJacobian * (1.0 - crossBlend)
        + transpose(rotation) * crossJacobian * rotation * crossBlend) * energyScale;
    }
    slope += waveSlope;
    jacobian += waveJacobian;
  }
  slope *= ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)};
  slope += rippleField(position, footprint).yz;
}

vec3 surfaceNormal(vec2 position, float footprint) {
  vec2 slope;
  mat2 jacobian;
  oceanDerivatives(position, footprint, slope, jacobian);
  vec3 tangentX = vec3(jacobian[0].x, slope.x, jacobian[0].y);
  vec3 tangentZ = vec3(jacobian[1].x, slope.y, jacobian[1].y);
  return normalize(cross(tangentZ, tangentX));
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

const foamFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_previous;
uniform float u_gridSize;
uniform float u_oceanTime;
uniform float u_choppiness;
uniform float u_seconds;
uniform vec2 u_drift;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];
in vec2 v_uv;
out vec4 outColor;
${glslWaves}
${foamEvolutionShader}
float previousFoam(vec2 uv) {
  ivec2 size = textureSize(u_previous, 0);
  vec2 pixel = uv * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(pixel));
  vec2 blend = fract(pixel);
  float a = texelFetch(u_previous, clamp(base, ivec2(0), size - 1), 0).r;
  float b = texelFetch(u_previous, clamp(base + ivec2(1, 0), ivec2(0), size - 1), 0).r;
  float c = texelFetch(u_previous, clamp(base + ivec2(0, 1), ivec2(0), size - 1), 0).r;
  float d = texelFetch(u_previous, clamp(base + ivec2(1, 1), ivec2(0), size - 1), 0).r;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}
void main() {
  vec2 point = vec2(${FOAM_ORIGIN.map(value => value.toFixed(1)).join(", ")})
    + v_uv * ${FOAM_DOMAIN_METERS.toFixed(1)};
  vec2 previousUv = v_uv - u_drift * u_seconds / ${FOAM_DOMAIN_METERS.toFixed(1)};
  float inside = step(0.0, min(previousUv.x, previousUv.y))
    * step(max(previousUv.x, previousUv.y), 1.0);
  float previous = previousFoam(previousUv) * inside;
  float footprint = ${FOAM_DOMAIN_METERS.toFixed(1)} / float(textureSize(u_previous, 0).x);
  vec2 slope;
  mat2 jacobian;
  oceanDerivatives(point, footprint, slope, jacobian);
  float compression = 1.0 - smoothstep(0.55, 0.75, determinant(jacobian));
  float crest = smoothstep(0.04, 0.28, oceanDisplacement(point, footprint).y);
  float density = advanceFoam(previous, compression * crest, u_seconds);
  outColor = vec4(density, 0.0, 0.0, 1.0);
}
`;

const surfaceVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_grid;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_meshColumns;
uniform float u_oceanTime;
uniform float u_choppiness;
uniform float u_scroll;
uniform float u_seed;
uniform vec2 u_resolution;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];
out vec2 v_parameter;
out float v_depth;
${glslCamera}
${glslWaves}

void main() {
  vec3 origin, forward, right, up;
  float focalLength;
  oceanCamera(origin, forward, right, up, focalLength);
  float aspect = u_resolution.x / u_resolution.y;
  vec2 horizontalForward = normalize(forward.xz);
  float halfWidth = (max(a_grid.y, 0.0) + 8.0)
    * (aspect / focalLength * 1.4 + 0.15) + 8.0;
  vec2 point = origin.xz + horizontalForward * a_grid.y + right.xz * a_grid.x * halfWidth;
  float widthSlope = aspect / focalLength * 1.4 + 0.15;
  float rowSpacing = a_grid.z * sqrt(1.0 + a_grid.x * a_grid.x * widthSlope * widthSlope);
  float meshFootprint = max(2.0 * halfWidth / u_meshColumns, rowSpacing);
  vec3 planeRelative = vec3(point.x, 0.0, point.y) - origin;
  float planeDepth = max(dot(planeRelative, forward), 0.0);
  float pixelWidth = 2.0 * planeDepth / (focalLength * u_resolution.y);
  float pixelLength = pixelWidth * planeDepth / max(abs(origin.y), 0.05);
  float pixelFootprint = pixelLength
    * length(vec2(1.0, dot(planeRelative, right) / max(planeDepth, 0.01)));
  // Filter subpixel geometry before the depth pass.
  float footprint = max(meshFootprint, pixelFootprint * smoothstep(0.15, 0.45, origin.y));
  v_parameter = point;
  vec3 position = vec3(point.x, 0.0, point.y) + oceanDisplacement(point, footprint);
  vec3 relative = position - origin;
  v_depth = dot(relative, forward);
  float near = 0.01;
  float far = ${(OCEAN_MESH_FAR * 2).toFixed(1)};
  gl_Position = vec4(
    dot(relative, right) * focalLength / aspect,
    dot(relative, up) * focalLength,
    (far + near) / (far - near) * v_depth - 2.0 * far * near / (far - near),
    v_depth
  );
}
`;

const surfaceFragmentShader = `#version 300 es
precision highp float;
in vec2 v_parameter;
in float v_depth;
layout(location = 0) out vec4 outSurface;
layout(location = 1) out vec4 outParameter;
void main() {
  gl_FragDepth = log2(1.0 + v_depth) / log2(${(OCEAN_MESH_FAR * 2 + 1).toFixed(1)});
  vec2 dx = dFdx(v_parameter);
  vec2 dy = dFdy(v_parameter);
  // Store the footprint before adjacent pixels can come from different wave crests.
  outSurface = vec4(v_depth,
    dx.x * dx.x + dy.x * dy.x,
    dx.x * dx.y + dy.x * dy.y,
    dx.y * dx.y + dy.y * dy.y);
  outParameter = vec4(v_parameter, 0.0, 1.0);
}
`;

const glslSkyEnvironment = `
vec4 skyLut(vec3 direction, float lod) {
  vec3 skyDirection = normalize(vec3(direction.x, max(direction.y, 0.0005), direction.z));
  return textureLod(u_sky, skyLutUv(skyDirection), lod);
}

vec4 skyLut(vec3 direction) {
  return skyLut(direction, 0.0);
}

vec3 skyBackground(vec3 skyDirection, vec4 sky) {
  if (v_skyStrengths.x == 0.0 && v_skyStrengths.z == 0.0) {
    return sky.rgb * v_skyStrengths.w;
  }
  float night = v_skyStrengths.x;
  float lunarNight = v_skyStrengths.y;
  vec3 lunarSky = vec3(0.0018, 0.0048, 0.0115)
    * lunarNight
    * mix(1.0, 0.46, smoothstep(0.0, 0.8, skyDirection.y));
  vec3 airglow = vec3(0.0016, 0.0022, 0.0040)
    * night
    * mix(1.0, 0.5, smoothstep(0.0, 0.6, skyDirection.y));
  float twilight = v_skyStrengths.z;
  vec3 twilightGlow = vec3(0.0);
  if (twilight > 0.0) {
    vec2 sunHorizontal = v_skySunDirection;
    vec2 viewHorizontal = normalize(skyDirection.xz + vec2(0.0001));
    float towardSun = max(dot(viewHorizontal, sunHorizontal), 0.0);
    float depth = v_skyTwilight.w;
    vec3 twilightColor = v_skyTwilight.rgb;
    twilightGlow = twilightColor
      * (0.25 + 0.75 * pow(towardSun, 2.5))
      * exp(-skyDirection.y / mix(0.16, 0.06, depth))
      * twilight
      * mix(0.08, 0.012, depth)
      * (1.0 - sky.a * 0.5);
  }
  return (sky.rgb + lunarSky + airglow + twilightGlow) * v_skyStrengths.w;
}

vec3 diffuseSkyRadiance() {
  vec3 radiance = vec3(0.0);
  for (int ring = 0; ring < 2; ring += 1) {
    float radiusSquared = (float(ring) + 0.5) * 0.5;
    float radius = sqrt(radiusSquared);
    for (int sector = 0; sector < 4; sector += 1) {
      float azimuth = (float(sector) + float(ring) * 0.5) * PI * 0.5;
      vec3 direction = vec3(radius * cos(azimuth), sqrt(1.0 - radiusSquared), radius * sin(azimuth));
      radiance += skyBackground(direction, skyLut(direction, 3.0));
    }
  }
  return radiance * 0.125;
}
`;

const displayVertexShader = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_oceanTime;
uniform float u_choppiness;
uniform float u_scroll;
uniform float u_seed;
uniform sampler2D u_sky;
uniform vec3 u_sunDirection;
uniform vec3 u_moonDirection;
uniform float u_moonIllumination;
uniform float u_moonStrength;
uniform float u_primaryIsMoon;
uniform float u_primaryLightStrength;
uniform vec3 u_displaySunDirection;
uniform vec3 u_displayMoonDirection;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];
out vec2 v_uv;
flat out float v_cameraHeight;
flat out vec3 v_diffuseSkyRadiance;
flat out vec4 v_skyStrengths;
flat out vec4 v_skyTwilight;
flat out vec2 v_skySunDirection;
flat out vec3 v_primaryLightRadiance;
flat out vec3 v_waterAmbientRadiance;
flat out vec3 v_cameraOrigin;
flat out vec3 v_cameraForward;
flat out vec3 v_cameraRight;
flat out vec3 v_cameraUp;
flat out float v_cameraFocalLength;
flat out vec3 v_sunAttenuation;
flat out vec3 v_moonAttenuation;
const float PI = 3.141592653589793;
${glslCamera}
${glslWaves}
${glslAtmosphere}
${glslSkyEnvironment}
void main() {
  vec3 origin, forward, right, up;
  float focalLength;
  oceanCamera(origin, forward, right, up, focalLength);
  v_cameraHeight = oceanHeight(origin.xz, 0.35);
  v_cameraOrigin = origin;
  v_cameraForward = forward;
  v_cameraRight = right;
  v_cameraUp = up;
  v_cameraFocalLength = focalLength;
  float night = 1.0 - smoothstep(-0.16, -0.025, u_sunDirection.y);
  float moonUp = smoothstep(-0.02, 0.06, u_moonDirection.y);
  float twilight = smoothstep(-0.34, -0.03, u_sunDirection.y)
    * (1.0 - smoothstep(-0.03, 0.05, u_sunDirection.y));
  float twilightDepth = clamp(-u_sunDirection.y / 0.34, 0.0, 1.0);
  float skyDaylight = smoothstep(-0.025, 0.10, u_sunDirection.y);
  v_skyStrengths = vec4(night, night * moonUp * u_moonIllumination, twilight, mix(1.0, 0.55, skyDaylight));
  v_skyTwilight = vec4(mix(vec3(1.0, 0.42, 0.14), vec3(0.42, 0.22, 0.34), twilightDepth), twilightDepth);
  v_skySunDirection = normalize(u_sunDirection.xz + vec2(0.0001));
  v_diffuseSkyRadiance = diffuseSkyRadiance();
  v_sunAttenuation = atmosphericTransmittance(u_sunDirection, 1.9);
  v_moonAttenuation = atmosphericTransmittance(u_moonDirection, 1.9);
  vec3 sunlight = v_sunAttenuation;
  vec3 moonlight = vec3(0.44, 0.52, 0.72) * v_moonAttenuation;
  vec3 lightDirection = normalize(mix(u_displaySunDirection, u_displayMoonDirection, u_primaryIsMoon));
  float cloudTransmission = 1.0 - skyLut(lightDirection).a;
  v_primaryLightRadiance = mix(sunlight, moonlight, u_primaryIsMoon)
    * u_primaryLightStrength * 1.32 * cloudTransmission;
  float daylight = smoothstep(-0.30, 0.04, u_sunDirection.y);
  float lunarNight = (1.0 - daylight) * smoothstep(-0.02, 0.20, u_moonDirection.y) * u_moonIllumination;
  v_waterAmbientRadiance = vec3(0.003, 0.015, 0.024) * mix(0.08, 1.0, daylight)
    + vec3(0.0028, 0.0062, 0.0138) * lunarNight
    + vec3(0.0040, 0.0075, 0.0160) * u_moonStrength;
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const causticVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_uv;

uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform float u_surfaceSpacing;
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
  float footprint = 2.0 * u_surfaceSpacing;
  vec3 surfacePosition = vec3(surfaceHorizontalPosition.x, 0.0, surfaceHorizontalPosition.y)
    + oceanDisplacement(surfaceHorizontalPosition, footprint);
  float height = surfacePosition.y;
  vec3 normal = surfaceNormal(surfaceHorizontalPosition, footprint);
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
const vec3 BETA_RAYLEIGH = vec3(0.005802, 0.013558, 0.033100);
const vec3 BETA_MIE_SCATTER = vec3(0.003996);
const vec3 BETA_MIE_EXTINCTION = vec3(0.004440);
const vec3 BETA_OZONE = vec3(0.000650, 0.001881, 0.000085);

${atmosphereOpticsShader}
${skyMappingShader}

void main() {
  float azimuth = (v_uv.x * 2.0 - 1.0) * PI;
  float elevation = skyElevation(v_uv.y);
  float horizontal = cos(elevation);
  vec3 viewDirection = vec3(
    sin(azimuth) * horizontal,
    sin(elevation),
    cos(azimuth) * horizontal
  );
  vec3 observer = vec3(0.0, PLANET_RADIUS + 0.002, 0.0);
  float distanceToSpace = raySphereFar(observer, viewDirection, ATMOSPHERE_RADIUS);
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

  for (int sampleIndex = 0; sampleIndex < ${ATMOSPHERE_VIEW_SAMPLES}; sampleIndex += 1) {
    vec2 segment = atmosphereViewSegment(sampleIndex, distanceToSpace);
    float stepLength = segment.y;
    vec3 samplePosition = observer + viewDirection * segment.x;
    vec3 density = atmosphereDensity(length(samplePosition) - PLANET_RADIUS);
    vec3 lightOpticalDepth = opticalDepthToSpace(samplePosition, u_sunDirection);
    vec3 totalOpticalDepth = viewOpticalDepth + density * stepLength * 0.5 + lightOpticalDepth;
    vec3 transmittance = exp(-(
      BETA_RAYLEIGH * totalOpticalDepth.x
        + BETA_MIE_EXTINCTION * u_aerosolScale * totalOpticalDepth.y
        + BETA_OZONE * totalOpticalDepth.z
    ));
    vec3 scattering =
      BETA_RAYLEIGH * density.x * rayleighPhase
        + BETA_MIE_SCATTER * u_aerosolScale * density.y * miePhase;
    radiance += transmittance * scattering * stepLength;
    viewOpticalDepth += density * stepLength;
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

float cumulusDensity(vec2 point) {
  float weather = cloudFbm(point * 0.23 + 8.4, 2);
  vec2 warp = vec2(cloudFbm(point * 0.43 + 3.1, 2), cloudFbm(point * 0.43 - 7.7, 2)) - 0.5;
  point += warp * 1.4;
  float base = cloudFbm(point, 5);
  float threshold = mix(0.62, 0.47, u_cloudCover) + (0.5 - weather) * 0.22;
  float body = smoothstep(threshold, threshold + 0.16, base);
  float erosion = noise21(point * 7.0 + 9.7);
  return max(body - erosion * 0.10 * (1.0 - body), 0.0);
}

float cloudPhase(float cosineTheta, float anisotropy) {
  float squared = anisotropy * anisotropy;
  return (1.0 - squared) / pow(1.0 + squared - 2.0 * anisotropy * cosineTheta, 1.5);
}

void main() {
  float azimuth = (v_uv.x * 2.0 - 1.0) * PI;
  float elevation = skyElevation(v_uv.y);
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
  vec3 zenithSky = texture(u_atmosphere, vec2(v_uv.x, skyElevationUv(0.72 * PI * 0.5))).rgb;
  vec3 ambient = mix(sky, zenithSky, 0.55) * 1.15 + vec3(0.0007, 0.0010, 0.0018);
  float mu = clamp(dot(direction, lightDirection), -1.0, 1.0);
  float forwardScatter = pow(max(mu, 0.0), 6.0);
  int octaves = u_detail > 0.5 ? 6 : 4;
  vec2 seedOffset = vec2(u_seed * 91.7, u_seed * 47.3);
  vec2 windPerpendicular = vec2(-u_wind.y, u_wind.x);

  float highDistance = 8000.0 / direction.y;
  vec2 highPlane = direction.xz * highDistance * 0.001;
  vec2 highLocal = vec2(dot(highPlane, u_wind), dot(highPlane, windPerpendicular));
  highLocal = highLocal
    - vec2(u_time * 0.011, u_time * 0.0015)
    + seedOffset * 0.7;
  highLocal.x *= 0.22;
  float wisps = cloudFbm(highLocal * 0.75, octaves);
  float wispDensity = smoothstep(0.52, 0.78, wisps)
    * mix(0.35, 0.65, u_cloudCover)
    * exp(-highDistance / 90000.0);
  vec3 cirrusColor = light * (0.62 + 0.55 * forwardScatter) + ambient * 0.9;

  float highAlpha = wispDensity * horizonFade;
  vec3 background = mix(sky, cirrusColor, highAlpha);
  float lowDistance = 1900.0 / direction.y;
  vec2 lowPoint = direction.xz * lowDistance * 0.00062
    - u_wind * u_time * 0.0032 + seedOffset;
  float density = cumulusDensity(lowPoint);
  float opticalDepth = density * density * 1.8 / max(direction.y, 0.18);
  float opacity = (1.0 - exp(-opticalDepth)) * horizonFade * exp(-lowDistance / 110000.0);
  vec2 lightOffset = lightDirection.xz * 0.20 / max(lightDirection.y, 0.15);
  float lightDensity = (density + cumulusDensity(lowPoint + lightOffset)) * 0.5;
  float lightDepth = lightDensity * 2.4 / max(lightDirection.y, 0.15);
  float phase = 0.7 * cloudPhase(mu, 0.62) + 0.3 * cloudPhase(mu, -0.2);
  float direct = exp(-lightDepth);
  float diffuse = exp(-lightDepth * 0.25);
  vec3 cloudColor = light * (direct * phase * 0.32 + diffuse * 0.12)
    + ambient * mix(0.65, 0.32, density);
  cloudColor = mix(sky, cloudColor, exp(-lowDistance / 70000.0));
  vec3 color = mix(background, cloudColor, opacity);
  float alpha = 1.0 - (1.0 - opacity) * (1.0 - highAlpha);
  outColor = vec4(color, alpha);
}
`;

const displayFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_caustics;
uniform sampler2D u_sky;
uniform highp sampler3D u_varianceTable;
uniform sampler2D u_surface;
uniform sampler2D u_surfaceParameter;
uniform sampler2D u_foam;
uniform vec2 u_resolution;
uniform vec2 u_surfaceResolution;
uniform vec3 u_horizonBand;
uniform float u_gridSize;
uniform float u_domainSize;
uniform float u_floorDepth;
uniform float u_scroll;
uniform vec3 u_sunDirection;
uniform vec3 u_displaySunDirection;
uniform vec3 u_primaryLightDirection;
uniform vec3 u_moonDirection;
uniform vec3 u_displayMoonDirection;
uniform vec3 u_moonPhaseLight;
uniform float u_sunAngularRadius;
uniform float u_moonAngularRadius;
uniform float u_moonIllumination;
uniform float u_moonStrength;
uniform float u_primaryIsMoon;
uniform float u_primaryLightStrength;
uniform mat3 u_starTransform;
uniform float u_oceanTime;
uniform float u_seed;
uniform vec2 u_windDirection;
uniform vec2 u_foamDrift;
uniform float u_choppiness;
uniform float u_detail;
uniform float u_debugView;
uniform vec4 u_waveData[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform float u_wavePhase[${OCEAN_WAVE_COMPONENT_COUNT}];
uniform vec3 u_absorption;

in vec2 v_uv;
flat in float v_cameraHeight;
flat in vec3 v_diffuseSkyRadiance;
flat in vec4 v_skyStrengths;
flat in vec4 v_skyTwilight;
flat in vec2 v_skySunDirection;
flat in vec3 v_primaryLightRadiance;
flat in vec3 v_waterAmbientRadiance;
flat in vec3 v_cameraOrigin;
flat in vec3 v_cameraForward;
flat in vec3 v_cameraRight;
flat in vec3 v_cameraUp;
flat in float v_cameraFocalLength;
flat in vec3 v_sunAttenuation;
flat in vec3 v_moonAttenuation;
out vec4 outColor;

const float PI = 3.141592653589793;
const float WATER_IOR = ${WATER_IOR.toFixed(6)};
bool g_crossing = false;
vec2 g_surfaceParameter;
vec3 g_surfaceFootprint;
${glslNoise}
${glslAtmosphere}
${glslWaves}
${glslFresnel}
${glslSkyEnvironment}

vec2 principalAxis(float a, float b, float c) {
  if (abs(a - c) + abs(b) < 0.000000000001) return vec2(1.0, 0.0);
  float angle = 0.5 * atan(2.0 * b, a - c);
  return vec2(cos(angle), sin(angle));
}

void opticalSurface(
  vec2 position,
  vec3 footprint,
  out vec3 normal,
  out vec2 variance,
  out vec2 varianceDirection
) {
  vec2 acrossWind = vec2(-u_windDirection.y, u_windDirection.x);
  float a = footprint.x;
  float b = footprint.y;
  float c = footprint.z;
  float major = sqrt(max(0.5 * (a + c + length(vec2(a - c, 2.0 * b))), 0.000000000001));
  float minor = min(major, max(sqrt(max(a * c - b * b, 0.0)) / major,
    major / ${OCEAN_MAX_ANISOTROPY.toFixed(1)}));
  vec2 direction = principalAxis(a, b, c);
  vec2 majorAxis = direction * major;
  float varianceCoordinate = clamp(log(max(major, ${VARIANCE_MIN_FOOTPRINT}) / ${VARIANCE_MIN_FOOTPRINT})
    / log(${VARIANCE_MAX_FOOTPRINT.toFixed(1)} / ${VARIANCE_MIN_FOOTPRINT}), 0.0, 1.0);
  float ratioCoordinate = (major / minor - 1.0) / ${(OCEAN_MAX_ANISOTROPY - 1).toFixed(1)};
  float angleCoordinate = atan(dot(direction, acrossWind), dot(direction, u_windDirection)) / PI;
  vec3 covariance = texture(u_varianceTable, vec3(
    (varianceCoordinate * ${(VARIANCE_TABLE_SIZE - 1).toFixed(1)} + 0.5) / ${VARIANCE_TABLE_SIZE.toFixed(1)},
    (ratioCoordinate * ${(VARIANCE_RATIO_SAMPLES - 1).toFixed(1)} + 0.5) / ${VARIANCE_RATIO_SAMPLES.toFixed(1)},
    angleCoordinate + ${0.5 / VARIANCE_ANGLE_SAMPLES}
  )).rgb;
  vec2 slope = vec2(0.0);
  mat2 jacobian = mat2(1.0);
  mat2 warpTransform;
  vec2 warpedPosition = distantCrestWarp(position, major, warpTransform);
  for (int index = 0; index < ${OCEAN_WAVE_COMPONENT_COUNT}; index += 1) {
    vec4 wave = u_waveData[index];
    vec2 localWave = transpose(warpTransform) * wave.xy;
    float projection = dot(localWave, direction);
    float detail = exp(-0.5 * (dot(localWave, localWave) * minor * minor
      + projection * projection * (major * major - minor * minor)));
    float theta = dot(warpedPosition, wave.xy) - wave.z * u_oceanTime + u_wavePhase[index];
    float amplitude = wave.w * detail;
    vec2 waveSlope = localWave * amplitude * cos(theta);
    mat2 waveJacobian = -outerProduct(wave.xy, localWave)
      * (amplitude * inversesqrt(dot(wave.xy, wave.xy)) * sin(theta) * u_choppiness);
    slope += waveSlope;
    jacobian += waveJacobian;
    vec2 windWave = vec2(dot(localWave, u_windDirection), dot(localWave, acrossWind));
    covariance += 0.5 * wave.w * wave.w * (1.0 - detail * detail)
      * vec3(windWave * windWave, windWave.x * windWave.y);
  }
  float crossBlend = distantCrossBlend(position);
  for (int band = 0; band < ${OCEAN_CASCADE_COUNT}; band += 1) {
    vec2 samplePosition = band < 2 ? warpedPosition : position;
    vec4 gradient = cascadeDirectionalSample(u_gradient, samplePosition, band, majorAxis, minor);
    float crossStrain = cascadeDirectionalSample(u_displacement,
      samplePosition, band, majorAxis, minor).w;
    mat2 waveJacobian = mat2(gradient.z, crossStrain, crossStrain, gradient.w)
      * u_choppiness;
    vec2 waveSlope = band < 2 ? transpose(warpTransform) * gradient.xy : gradient.xy;
    if (band < 2) waveJacobian *= warpTransform;
    if (band == 0 && crossBlend > 0.001) {
      mat2 rotation = distantCrossRotation();
      vec2 crossPosition = rotation * position + vec2(173.0, 277.0);
      vec2 crossAxis = rotation * majorAxis;
      vec4 crossGradient = cascadeDirectionalSample(u_gradient,
        crossPosition, band, crossAxis, minor);
      float crossStrain = cascadeDirectionalSample(u_displacement,
        crossPosition, band, crossAxis, minor).w;
      mat2 crossJacobian = mat2(crossGradient.z, crossStrain,
        crossStrain, crossGradient.w) * u_choppiness;
      float energyScale = inversesqrt((1.0 - crossBlend) * (1.0 - crossBlend)
        + crossBlend * crossBlend);
      waveSlope = mix(waveSlope, transpose(rotation) * crossGradient.xy, crossBlend) * energyScale;
      waveJacobian = (waveJacobian * (1.0 - crossBlend)
        + transpose(rotation) * crossJacobian * rotation * crossBlend) * energyScale;
    }
    slope += waveSlope;
    jacobian += waveJacobian;
  }
  mat2 inverseJacobian = mat2(jacobian[1].y, -jacobian[0].y, -jacobian[1].x, jacobian[0].x)
    / max(determinant(jacobian), 0.15);
  vec2 alongGradient = inverseJacobian * u_windDirection;
  vec2 acrossGradient = inverseJacobian * acrossWind;
  vec2 along = vec2(dot(alongGradient, u_windDirection), dot(alongGradient, acrossWind));
  vec2 across = vec2(dot(acrossGradient, u_windDirection), dot(acrossGradient, acrossWind));
  mat2 slopeCovariance = mat2(covariance.x, covariance.z, covariance.z, covariance.y);
  a = dot(along, slopeCovariance * along);
  b = dot(along, slopeCovariance * across);
  c = dot(across, slopeCovariance * across);
  vec2 axis = principalAxis(a, b, c);
  float difference = length(vec2(a - c, 2.0 * b));
  variance = max(0.5 * vec2(a + c + difference, a + c - difference), vec2(0.00000001));
  varianceDirection = axis.x * u_windDirection + axis.y * acrossWind;
  variance *= ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)} * ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)};
  slope = slope * ${OCEAN_WAVE_HEIGHT_SCALE.toFixed(2)} + rippleField(position, sqrt(major * minor)).yz;
  slope = transpose(inverseJacobian) * slope;
  normal = normalize(vec3(-slope.x, 1.0, -slope.y));
}

float directionalVariance(vec3 direction, vec3 tangent, vec3 bitangent, vec2 variance) {
  vec2 projected = vec2(dot(direction, tangent), dot(direction, bitangent));
  return dot(projected * projected, variance) / max(dot(projected, projected), 0.00001);
}

float meanFresnel(vec3 view, vec3 normal, vec3 tangent, vec3 bitangent, vec2 variance) {
  float sigma = sqrt(directionalVariance(view, tangent, bitangent, variance));
  float facing = max(dot(view, normal), 0.0);
  float normalReflectance = pow((WATER_IOR - 1.0) / (WATER_IOR + 1.0), 2.0);
  // Bruneton et al., Eq. 26: Fresnel averaged over the unresolved slopes.
  return normalReflectance + (1.0 - normalReflectance)
    * pow(1.0 - facing, 5.0 * exp(-2.69 * sigma))
    / (1.0 + 22.7 * pow(sigma, 1.5));
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
  vec3 tangent,
  vec3 bitangent,
  vec2 variance,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 sunColor
) {
  float normalView = max(dot(normal, viewDirection), 0.0);
  float normalLight = max(dot(normal, lightDirection), 0.0);
  if (normalView <= 0.0 || normalLight <= 0.0) return vec3(0.0);

  vec3 halfway = normalize(viewDirection + lightDirection);
  float normalHalfway = max(dot(normal, halfway), 0.0001);
  vec2 halfwaySlope = vec2(dot(halfway, tangent), dot(halfway, bitangent)) / normalHalfway;
  float distribution = exp(-0.5 * dot(halfwaySlope * halfwaySlope, 1.0 / variance)) / (
    2.0 * PI * sqrt(variance.x * variance.y) * pow(normalHalfway, 4.0)
  );
  float viewRoughness = sqrt(2.0 * directionalVariance(viewDirection, tangent, bitangent, variance));
  float lightRoughness = sqrt(2.0 * directionalVariance(lightDirection, tangent, bitangent, variance));
  float masking = 1.0 / (
    1.0 / beckmannMasking(normalView, max(viewRoughness, 0.001))
    + 1.0 / beckmannMasking(normalLight, max(lightRoughness, 0.001)) - 1.0
  );
  float fresnel = dielectricFresnel(max(dot(viewDirection, halfway), 0.0));
  float reflectedIrradiance = fresnel * distribution * masking / (4.0 * normalView);
  return sunColor * reflectedIrradiance * 0.035;
}

vec3 primaryLightRadiance() {
  return v_primaryLightRadiance;
}

vec3 starField(vec3 direction, float night, float cloudAlpha) {
  if (night <= 0.001 || direction.y <= 0.0) return vec3(0.0);
  vec3 catalogDirection = u_starTransform * direction;
  vec2 sky = vec2(
    atan(catalogDirection.x, catalogDirection.z),
    asin(clamp(catalogDirection.y, -1.0, 1.0))
  );
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
    float radius = 0.0009 + 0.00035 * magnitude;
    float core = exp(-separation * separation / (radius * radius));
    float twinkle = 0.86 + 0.14 * sin(u_oceanTime * 2.7 + random.x * 61.0);
    vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.92, 0.78), random.y);
    total += tint * core * (0.05 + 0.7 * magnitude) * twinkle;
  }
  vec3 bandNormal = normalize(vec3(0.42, 0.62, 0.66));
  float bandDistance = abs(dot(catalogDirection, bandNormal));
  float band = exp(-bandDistance * bandDistance * 26.0);
  float bandTexture = noise21(sky * 9.0 + 3.1) * 0.6 + noise21(sky * 21.0 - 5.7) * 0.4;
  total += vec3(0.010, 0.012, 0.016) * band * (0.35 + 0.65 * bandTexture);
  return total * night * smoothstep(0.0, 0.10, direction.y) * (1.0 - cloudAlpha);
}

vec3 moonDisc(vec3 direction, vec3 discDirection, float cloudAlpha) {
  if (u_moonDirection.y <= -0.01) return vec3(0.0);
  if (dot(direction, discDirection) < 0.9998) return vec3(0.0);
  float moonRadius = sin(u_moonAngularRadius * ${CELESTIAL_DISC_SCALE.toFixed(2)});
  vec3 tangent = normalize(vec3(u_displayMoonDirection.z, 0.0, -u_displayMoonDirection.x));
  vec3 bitangent = cross(discDirection, tangent);
  vec2 disc = vec2(dot(direction, tangent), dot(direction, bitangent)) / moonRadius;
  float radiusSquared = dot(disc, disc);
  float edge = 1.0 - smoothstep(0.92, 1.06, sqrt(radiusSquared));
  if (edge <= 0.0) return vec3(0.0);
  float inside = min(radiusSquared, 1.0);
  vec3 surfaceNormal = normalize(vec3(disc, -sqrt(max(1.0 - inside, 0.0))));
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
    * v_moonAttenuation
    * (1.0 - cloudAlpha);
}

vec3 atmosphere(
  vec3 direction,
  float useDisplaySun,
  float includeCelestialLight,
  float skyLod
) {
  vec3 skyDirection = normalize(vec3(direction.x, max(direction.y, 0.002), direction.z));
  vec4 sky = skyLut(skyDirection, skyLod);
  vec3 discDirection = normalize(mix(
    u_sunDirection,
    u_displaySunDirection,
    useDisplaySun
  ));
  float cosineTheta = clamp(dot(skyDirection, discDirection), -1.0, 1.0);
  float sunAngularRadius = u_sunAngularRadius * ${CELESTIAL_DISC_SCALE.toFixed(2)};
  float sunDisc = smoothstep(
    cos(sunAngularRadius * 1.08),
    cos(sunAngularRadius * 0.90),
    cosineTheta
  );
  float limbDarkening = mix(
    0.62,
    1.0,
    smoothstep(cos(sunAngularRadius * 1.02), cos(sunAngularRadius * 0.25), cosineTheta)
  );
  float lensBloom = exp(
    (cosineTheta - 1.0) / max(u_sunAngularRadius * u_sunAngularRadius * 6.0, 0.00002)
  );
  float sunAureole = exp((cosineTheta - 1.0) / 0.00055);
  float sunVisible = step(0.0, u_sunDirection.y);
  float cloudShade = 1.0 - sky.a;
  vec3 directSun = v_sunAttenuation
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
    * v_moonAttenuation
    * (1.0 - sky.a * 0.6);
  float starNight = 1.0 - smoothstep(-0.22, -0.06, u_sunDirection.y);
  return skyBackground(skyDirection, sky)
    + directSun * includeCelestialLight
    + moonGlow * includeCelestialLight
    + moonDisc(skyDirection, moonDiscDirection, sky.a) * includeCelestialLight
    + starField(skyDirection, starNight, sky.a) * mix(0.4, 1.0, useDisplaySun);
}

${oceanReflectionShader}

vec3 reflectionSkyRadiance(vec3 direction, float lod) {
  return skyBackground(direction, skyLut(direction, lod));
}

vec3 meanSkyRadiance(vec3 ray, vec3 normal, vec3 tangent, vec3 bitangent, vec2 variance) {
  vec2 sigma = sqrt(variance);
  vec2 center = skyLutUv(reflect(ray, normal));
  vec2 axisX = skyLutUv(reflect(ray, normalize(normal - tangent * sigma.x))) - center;
  vec2 axisY = skyLutUv(reflect(ray, normalize(normal - bitangent * sigma.y))) - center;
  axisX.x = fract(axisX.x + 0.5) - 0.5;
  axisY.x = fract(axisY.x + 0.5) - 0.5;
  vec2 skySize = vec2(textureSize(u_sky, 0));
  float footprint = max(length(axisX * skySize), length(axisY * skySize));
  float lod = max(log2(max(footprint * 0.25, 1.0)), 0.0);
  // Bruneton et al., section 6: below-horizon rays receive secondary reflections.
  vec3 secondaryRadiance = v_diffuseSkyRadiance * ${DIFFUSE_WATER_REFLECTANCE.toFixed(9)};
  return integrateOceanReflection(-ray, normal, tangent, bitangent, variance, lod, secondaryRadiance);
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
  return v_waterAmbientRadiance;
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
  vec3 scattering = vec3(0.020, 0.040, 0.044);
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
      cascadeSample(u_displacement, surfaceOrigin, 1, 1.5).y * 4.8 + 0.54,
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
  vec2 surfaceSize = u_surfaceResolution;
  ivec2 surfacePixel = ivec2(gl_FragCoord.xy * surfaceSize / u_resolution);
  vec4 surface = texelFetch(u_surface, surfacePixel, 0);
  if (surface.x <= 0.0) return false;
  position = v_cameraOrigin + direction * (surface.x / dot(direction, v_cameraForward));
  float footprintScale = max(surfaceSize.x / u_resolution.x, surfaceSize.y / u_resolution.y);
  g_surfaceFootprint = surface.yzw * footprintScale * footprintScale;
  g_surfaceParameter = texelFetch(u_surfaceParameter, surfacePixel, 0).xy;
  distance = length(position - origin);
  return dot(position - origin, direction) > 0.0;
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

  if (floorVisibility > 0.0 && floorDistance > 0.0 && floorDistance <= 52.0) {
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

${lifeShader}

vec3 renderAboveWater(vec3 origin, vec3 ray) {
  float distanceToSurface;
  vec3 surfacePosition;
  bool surfaceHit = intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition);
  float lifeDistance;
  vec3 lifeRadiance;
  if (shadeFish(origin, ray, surfaceHit ? distanceToSurface : 200.0, false, lifeDistance, lifeRadiance)) {
    return lifeRadiance;
  }
  if (!surfaceHit) return atmosphere(ray, 1.0, 1.0, 0.0);

  float horizonDetail = smoothstep(0.006, 0.07, -ray.y);
  vec3 opticalNormal;
  vec2 slopeVariance;
  vec2 varianceDirection;
  opticalSurface(
    g_surfaceParameter,
    g_surfaceFootprint,
    opticalNormal,
    slopeVariance,
    varianceDirection
  );
  if (u_debugView > 3.5 && u_debugView < 4.5) return opticalNormal * 0.5 + 0.5;
  if (u_debugView > 4.5 && u_debugView < 5.5) return vec3(sqrt(slopeVariance), 0.0) * 3.0;
  if (dot(opticalNormal, -ray) < 0.0) opticalNormal = reflect(opticalNormal, -ray);
  vec3 wind = vec3(varianceDirection.x, 0.0, varianceDirection.y);
  vec3 tangent = normalize(wind - opticalNormal * dot(wind, opticalNormal));
  vec3 bitangent = cross(tangent, opticalNormal);
  vec3 sunColor = primaryLightRadiance();
  float sunLuminance = dot(sunColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 waterHighlightColor = mix(
    sunColor,
    vec3(sunLuminance),
    (1.0 - u_primaryIsMoon) * 0.16
  );
  vec3 reflected = meanSkyRadiance(ray, opticalNormal, tangent, bitangent, slopeVariance);
  if (u_debugView > 5.5) return encodeScene(reflected, vec3(1.0), 0.92);
  vec3 refractedDirection = refract(ray, opticalNormal, 1.0 / WATER_IOR);
  vec3 refracted = sampleRefractedScene(
    surfacePosition,
    ray,
    refractedDirection,
    g_crossing ? 2 : 3
  );
  float fresnel = meanFresnel(-ray, opticalNormal, tangent, bitangent, slopeVariance);
  vec3 color = mix(refracted, reflected, fresnel);

  vec3 displayLightDirection = normalize(mix(
    u_displaySunDirection,
    u_displayMoonDirection,
    u_primaryIsMoon
  ));
  color += coxMunkSunGlitter(
    opticalNormal,
    tangent,
    bitangent,
    slopeVariance,
    -ray,
    displayLightDirection,
    waterHighlightColor
  );

  vec2 foamUv = (g_surfaceParameter - vec2(${FOAM_ORIGIN.map(value => value.toFixed(1)).join(", ")}))
    / ${FOAM_DOMAIN_METERS.toFixed(1)};
  float foamBorder = min(min(foamUv.x, foamUv.y), min(1.0 - foamUv.x, 1.0 - foamUv.y));
  float foamDensity = textureGrad(u_foam, foamUv,
    dFdx(g_surfaceParameter) / ${FOAM_DOMAIN_METERS.toFixed(1)},
    dFdy(g_surfaceParameter) / ${FOAM_DOMAIN_METERS.toFixed(1)}).r;
  float foamReach = (1.0 - smoothstep(50.0, 180.0, distanceToSurface)) * horizonDetail
    * smoothstep(0.0, 0.035, foamBorder);
  if (foamReach > 0.001) {
    vec2 foamPoint = g_surfaceParameter - u_foamDrift * u_oceanTime;
    float bubbles = noise21(foamPoint * 0.9) * 0.55
      + noise21(foamPoint * 3.4) * 0.45;
    float foam = foamDensity * smoothstep(0.32, 0.72, bubbles) * foamReach;
    if (foam > 0.001) {
      float foamLight = max(dot(opticalNormal, u_primaryLightDirection), 0.0) * 0.72 + 0.08;
      vec3 foamRadiance = vec3(0.70, 0.74, 0.76) * (
        waterHighlightColor * foamLight * 0.42
          + v_diffuseSkyRadiance * 0.58
          + 0.12
      );
      color = mix(color, foamRadiance, foam * 0.62);
    }
    if (u_debugView > 2.5) {
      color = mix(color, vec3(2.0, 0.0, 0.0), foam);
    }
  }

  vec3 horizonDirection = normalize(vec3(ray.x, 0.012, ray.z));
  vec3 horizonSky = skyBackground(horizonDirection, skyLut(horizonDirection));
  float distanceHaze = 1.0 - exp(-distanceToSurface / 2200.0);
  float horizonHaze = (1.0 - smoothstep(0.0, 0.020, -ray.y)) * 0.9;
  return mix(color, horizonSky, max(distanceHaze, horizonHaze));
}

vec3 renderBelowWaterSurface(vec3 origin, vec3 ray) {
  vec3 extinction = waterExtinctionCoefficient();
  float distanceToSurface;
  vec3 surfacePosition;
  bool surfaceHit = intersectOceanSurface(origin, ray, distanceToSurface, surfacePosition);
  float lifeDistance;
  vec3 lifeRadiance;
  if (shadeFish(origin, ray, surfaceHit ? distanceToSurface : 52.0, true, lifeDistance, lifeRadiance)) {
    return lifeRadiance * exp(-extinction * lifeDistance)
      + underwaterVolume(origin, ray, lifeDistance, g_crossing ? 2 : 3);
  }
  if (!surfaceHit) return sampleUnderwaterRay(origin, ray, g_crossing ? 3 : 6);

  float roughFootprint = mix(
    0.28,
    1.45,
    smoothstep(0.0, 14.0, distanceToSurface)
  );
  int volumeSamples = g_crossing || distanceToSurface < 8.0 ? 3 : 6;
  vec3 surfaceNormals[3];
  surfaceNormals[0] = normalize(mix(
    vec3(0.0, 1.0, 0.0),
    surfaceNormal(g_surfaceParameter, roughFootprint),
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
        g_surfaceParameter + vec2(0.73, -0.41) * roughFootprint,
        roughFootprint
      ),
      0.50
    ));
    surfaceNormals[2] = normalize(mix(
      vec3(0.0, 1.0, 0.0),
      surfaceNormal(
        g_surfaceParameter + vec2(-0.37, 0.81) * roughFootprint,
        roughFootprint
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
    transmittedSky += atmosphere(transmittedDirection, 0.0, 1.0, 0.0)
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
  float aspect = u_surfaceResolution.x / max(u_surfaceResolution.y, 1.0);
  vec2 screen = v_uv * 2.0 - 1.0;
  screen.x *= aspect;
  float opacity = u_horizonBand.z > 0.0
    ? u_horizonBand.z
      * smoothstep(u_horizonBand.x, u_horizonBand.x + u_resolution.y * 0.05, gl_FragCoord.y)
      * (1.0 - smoothstep(u_horizonBand.y - u_resolution.y * 0.015, u_horizonBand.y, gl_FragCoord.y))
    : 1.0;
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
      : encodeScene(atmosphere(debugDirection, 1.0, 1.0, 0.0), vec3(1.0), 0.92);
    outColor = vec4(debugColor, opacity);
    return;
  }
  vec3 origin = v_cameraOrigin;
  vec3 forward = v_cameraForward;
  vec3 right = v_cameraRight;
  vec3 up = v_cameraUp;
  float focalLength = v_cameraFocalLength;
  vec3 ray = normalize(
    forward * focalLength + right * screen.x + up * screen.y
  );

  float localSurfaceHeight = v_cameraHeight;
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
  if (u_debugView > 3.5) {
    outColor = vec4(aboveColor, opacity);
    return;
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
  outColor = vec4(encoded, opacity);
}
`;

function getUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const uniform = gl.getUniformLocation(program, name);
  if (!uniform) throw new Error(`WebGL uniform ${name} is unavailable`);
  return uniform;
}

type RippleUniforms = {
  ripples: WebGLUniformLocation | null;
  count: WebGLUniformLocation | null;
};

/** Find the ripple uniforms. A program that never reads the ripples has none. */
function getRippleUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): RippleUniforms {
  return {
    ripples: gl.getUniformLocation(program, "u_ripples[0]"),
    count: gl.getUniformLocation(program, "u_rippleCount"),
  };
}

export type RippleFrame = {
  data: Float32Array;
  count: number;
};

export type LifeFrame = {
  actors: Float32Array;
  school: SchoolBounds;
};

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

function createSurfaceGeometry(gl: WebGL2RenderingContext, data: OceanWorkerResult["mesh"]) {
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vertexArray || !buffer || !indexBuffer) throw new Error("WebGL surface geometry allocation failed");
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vertexArray, buffer, indexBuffer, count: data.indices.length };
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

function bindTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  unit: number,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

function bindArrayTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
}

function createFieldTarget(
  gl: WebGL2RenderingContext, width: number, height: number, internalFormat: number = gl.RGBA32F,
) {
  const target = createRenderTarget(gl, width, height, internalFormat, gl.FLOAT, null, gl.NEAREST);
  const second = createTexture(gl, width, height, internalFormat, gl.RGBA, gl.FLOAT, null, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, second, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("WebGL spectrum framebuffer is incomplete");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { ...target, second };
}

function createCascadeTexture(gl: WebGL2RenderingContext, size: number) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL cascade allocation failed");
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(size) + 1, gl.RGBA16F,
    size, size, OCEAN_CASCADE_COUNT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return texture;
}

const CROSSING_RENDER_SCALE = 0.8;
const FRAME_INTERVAL_TOLERANCE = 2.5;
// Input acts on the water only while the camera sits above the surface.
const INTERACTION_SCROLL_LIMIT = 0.16;
const INTERACTION_DISTANCE = 40;
const TAP_RIPPLE_AMPLITUDE = 0.14;
const MAX_LIFE_STEP_SECONDS = 0.1;
const LIFE_SUBSTEP_SECONDS = 1 / 30;
const INTERACTIVE_SELECTOR = [
  "a", "button", "input", "select", "textarea", "label", "summary",
  "[role='slider']", "[role='button']", "[contenteditable='true']",
].join(", ");

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getHorizonBand(scroll: number, height: number) {
  if (scroll >= 0.14) return null;
  const entry = smoothstep(0, 0.205, scroll);
  const dy = CAMERA_TARGET_TOP[1] - CAMERA_ORIGIN_TOP[1];
  const dz = CAMERA_TARGET_TOP[2] - CAMERA_ORIGIN_TOP[2];
  const length = Math.hypot(dy, dz);
  const surfaceLength = Math.hypot(0.018, 1);
  const forwardY = dy / length * (1 - entry) - 0.018 / surfaceLength * entry;
  const forwardZ = dz / length * (1 - entry) + entry / surfaceLength;
  const focalLength = CAMERA_FOCAL_LENGTH + (1.30 - CAMERA_FOCAL_LENGTH) * entry;
  const horizon = (1 - focalLength * forwardY / forwardZ) * 0.5;
  return {
    bottom: Math.max(0, Math.floor((horizon - 0.20) * height)),
    top: Math.min(height, Math.ceil((horizon + 0.025) * height)),
    opacity: 1 - smoothstep(0.08, 0.14, scroll),
  };
}

/**
 * Predict the crossfade band from the CPU side.
 *
 * The shader renders both the above-water and the underwater path while the
 * camera sits near the waterline. The CPU estimate omits the smaller waves,
 * so this band is wider than the shader band.
 */
function getCrossingRenderScale(
  waveField: OceanWaveField,
  scroll: number,
  oceanTime: number,
) {
  const [x, y, z] = getOceanCamera(scroll, getOceanSeedPhase(waveField.seed)).origin;
  const surface = spectralHeightAt(waveField, x, z, oceanTime);
  const proximity = 1 - smoothstep(0.32, 0.62, Math.abs(y - surface));
  return 1 + (CROSSING_RENDER_SCALE - 1) * proximity;
}

type SceneLight = {
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
  starTransform: Matrix3;
  sunAngularRadius: number;
  sunDirection: Direction3;
};

async function createPondEngine(
  gl: WebGL2RenderingContext,
  waveField: OceanWaveField,
  quality: QualityProfile,
  signal: AbortSignal,
) {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("WebGL floating-point color buffers are unavailable");
  }
  const results = await Promise.allSettled([
    prepareOcean({
      field: waveField,
      size: quality.simulationSize,
      columns: quality.meshColumns,
      rows: quality.meshRows,
    }, signal),
    compileWebGLPrograms(gl, {
      evolveProgram: [fullscreenVertexShader, evolveSpectrumShader],
      transformProgram: [fullscreenVertexShader, transformSpectrumShader],
      unpackProgram: [fullscreenVertexShader, unpackSpectrumShader],
      filterProgram: [fullscreenVertexShader, filterSpectrumShader],
      foamProgram: [fullscreenVertexShader, foamFragmentShader],
      causticProgram: [causticVertexShader, causticFragmentShader],
      causticBlurProgram: [fullscreenVertexShader, causticBlurFragmentShader],
      atmosphereProgram: [fullscreenVertexShader, atmosphereFragmentShader],
      cloudProgram: [fullscreenVertexShader, cloudFragmentShader],
      displayProgram: [displayVertexShader, displayFragmentShader],
      surfaceProgram: [surfaceVertexShader, surfaceFragmentShader],
    }, signal),
  ]);
  const [prepared, compiled] = results;
  if (prepared.status === "rejected" || compiled.status === "rejected" || signal.aborted) {
    if (compiled.status === "fulfilled") {
      Object.values(compiled.value).forEach(program => gl.deleteProgram(program));
    }
    const failure = [prepared, compiled].find(result => result.status === "rejected");
    throw new Error(failure?.status === "rejected" && failure.reason instanceof Error && !signal.aborted
      ? failure.reason.message
      : "Ocean initialization did not complete");
  }
  const { cascades, mesh, noise } = prepared.value;
  const {
    evolveProgram, transformProgram, unpackProgram, filterProgram, foamProgram,
    causticProgram, causticBlurProgram, atmosphereProgram, cloudProgram,
    displayProgram, surfaceProgram,
  } = compiled.value;
  const surfaceGeometry = createSurfaceGeometry(gl, mesh);
  const fullscreen = createFullscreenGeometry(gl);
  const causticGeometry = createCausticGeometry(gl, quality.causticGridSize);
  const distantNoiseTexture = createTexture(gl, DISTANT_CREST_NOISE_SIZE,
    DISTANT_CREST_NOISE_SIZE, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE,
    noise, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  const actorTexture = createTexture(gl, ACTOR_TEXTURE_WIDTH, ACTOR_TEXTURE_ROWS,
    gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST);
  const initialSpectrum = createTexture(gl, quality.simulationSize * OCEAN_CASCADE_COUNT,
    quality.simulationSize, gl.RGBA32F, gl.RGBA, gl.FLOAT, cascades.initial, gl.NEAREST);
  const spectrumTargets = [
    createFieldTarget(gl, quality.simulationSize * OCEAN_CASCADE_COUNT, quality.simulationSize),
    createFieldTarget(gl, quality.simulationSize * OCEAN_CASCADE_COUNT, quality.simulationSize),
  ];
  const displacementTexture = createCascadeTexture(gl, quality.simulationSize);
  const gradientTexture = createCascadeTexture(gl, quality.simulationSize);
  const cascadeLevels = Math.log2(quality.simulationSize);
  const cascadeFramebuffers = Array.from({ length: cascadeLevels + 1 }, (_, level) =>
    Array.from({ length: OCEAN_CASCADE_COUNT }, (_, cascade) => {
      const framebuffer = gl.createFramebuffer();
      if (!framebuffer) throw new Error("WebGL cascade framebuffer allocation failed");
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, displacementTexture, level, cascade);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gradientTexture, level, cascade);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("WebGL cascade framebuffer is incomplete");
      }
      return framebuffer;
    }),
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const varianceTexture = gl.createTexture();
  if (!varianceTexture) throw new Error("WebGL variance texture allocation failed");
  gl.bindTexture(gl.TEXTURE_3D, varianceTexture);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, VARIANCE_TABLE_SIZE, VARIANCE_RATIO_SAMPLES,
    VARIANCE_ANGLE_SAMPLES, 0, gl.RGBA, gl.FLOAT, cascades.filterVariance);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
  const foamTargets = Array.from({ length: 2 }, () => createRenderTarget(
    gl, quality.simulationSize, quality.simulationSize, gl.RGBA32F, gl.FLOAT, null, gl.NEAREST,
  ));
  const foamDisplay = createRenderTarget(gl, quality.simulationSize, quality.simulationSize,
    gl.RGBA16F, gl.HALF_FLOAT, null, gl.LINEAR);
  for (const target of [...foamTargets, foamDisplay]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_2D, foamDisplay.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
  let surfaceTarget: (RenderTarget & { parameter: WebGLTexture; depth: WebGLRenderbuffer }) | null = null;
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
    if (surfaceTarget) {
      gl.deleteFramebuffer(surfaceTarget.framebuffer);
      gl.deleteTexture(surfaceTarget.texture);
      gl.deleteTexture(surfaceTarget.parameter);
      gl.deleteRenderbuffer(surfaceTarget.depth);
    }
    const surface = createRenderTarget(gl, width, height, gl.RGBA32F, gl.FLOAT, null, gl.NEAREST);
    const parameter = createTexture(gl, width, height, gl.RG32F, gl.RG, gl.FLOAT, null, gl.NEAREST);
    const depth = gl.createRenderbuffer();
    if (!depth) throw new Error("WebGL surface depth allocation failed");
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, parameter, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL surface framebuffer is incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    surfaceTarget = { ...surface, parameter, depth };
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  bindTexture(gl, distantNoiseTexture, 8);
  const seedUniform = (waveField.seed % 100_000) / 100_000;
  const evolveUniforms = {
    initial: getUniform(gl, evolveProgram, "u_initial"),
    size: getUniform(gl, evolveProgram, "u_size"),
    time: getUniform(gl, evolveProgram, "u_time"),
  };
  const transformUniforms = {
    inputA: getUniform(gl, transformProgram, "u_inputA"),
    inputB: getUniform(gl, transformProgram, "u_inputB"),
    size: getUniform(gl, transformProgram, "u_size"),
    stage: getUniform(gl, transformProgram, "u_stage"),
    axis: getUniform(gl, transformProgram, "u_axis"),
  };
  const unpackUniforms = {
    inputA: getUniform(gl, unpackProgram, "u_inputA"),
    inputB: getUniform(gl, unpackProgram, "u_inputB"),
    size: getUniform(gl, unpackProgram, "u_size"),
    cascade: getUniform(gl, unpackProgram, "u_cascade"),
  };
  const filterUniforms = {
    displacement: getUniform(gl, filterProgram, "u_displacement"),
    gradient: getUniform(gl, filterProgram, "u_gradient"),
    level: getUniform(gl, filterProgram, "u_level"),
    cascade: getUniform(gl, filterProgram, "u_cascade"),
  };
  const foamUniforms = {
    previous: getUniform(gl, foamProgram, "u_previous"),
    displacement: getUniform(gl, foamProgram, "u_displacement"),
    gradient: getUniform(gl, foamProgram, "u_gradient"),
    distantNoise: getUniform(gl, foamProgram, "u_distantNoise"),
    gridSize: getUniform(gl, foamProgram, "u_gridSize"),
    oceanTime: getUniform(gl, foamProgram, "u_oceanTime"),
    choppiness: getUniform(gl, foamProgram, "u_choppiness"),
    seconds: getUniform(gl, foamProgram, "u_seconds"),
    drift: getUniform(gl, foamProgram, "u_drift"),
    waveData: getUniform(gl, foamProgram, "u_waveData[0]"),
    wavePhase: getUniform(gl, foamProgram, "u_wavePhase[0]"),
  };
  const surfaceUniforms = {
    displacement: getUniform(gl, surfaceProgram, "u_displacement"),
    distantNoise: getUniform(gl, surfaceProgram, "u_distantNoise"),
    gridSize: getUniform(gl, surfaceProgram, "u_gridSize"),
    meshColumns: getUniform(gl, surfaceProgram, "u_meshColumns"),
    oceanTime: getUniform(gl, surfaceProgram, "u_oceanTime"),
    choppiness: getUniform(gl, surfaceProgram, "u_choppiness"),
    scroll: getUniform(gl, surfaceProgram, "u_scroll"),
    seed: getUniform(gl, surfaceProgram, "u_seed"),
    resolution: getUniform(gl, surfaceProgram, "u_resolution"),
    waveData: getUniform(gl, surfaceProgram, "u_waveData[0]"),
    wavePhase: getUniform(gl, surfaceProgram, "u_wavePhase[0]"),
  };
  const causticUniforms = {
    displacement: getUniform(gl, causticProgram, "u_displacement"),
    gradient: getUniform(gl, causticProgram, "u_gradient"),
    distantNoise: getUniform(gl, causticProgram, "u_distantNoise"),
    gridSize: getUniform(gl, causticProgram, "u_gridSize"),
    surfaceSpacing: getUniform(gl, causticProgram, "u_surfaceSpacing"),
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
    foam: getUniform(gl, displayProgram, "u_foam"),
    foamDrift: getUniform(gl, displayProgram, "u_foamDrift"),
    surface: getUniform(gl, displayProgram, "u_surface"),
    surfaceParameter: getUniform(gl, displayProgram, "u_surfaceParameter"),
    displacement: getUniform(gl, displayProgram, "u_displacement"),
    gradient: getUniform(gl, displayProgram, "u_gradient"),
    distantNoise: getUniform(gl, displayProgram, "u_distantNoise"),
    varianceTable: getUniform(gl, displayProgram, "u_varianceTable"),
    caustics: getUniform(gl, displayProgram, "u_caustics"),
    sky: getUniform(gl, displayProgram, "u_sky"),
    resolution: getUniform(gl, displayProgram, "u_resolution"),
    surfaceResolution: getUniform(gl, displayProgram, "u_surfaceResolution"),
    horizonBand: getUniform(gl, displayProgram, "u_horizonBand"),
    gridSize: getUniform(gl, displayProgram, "u_gridSize"),
    domainSize: getUniform(gl, displayProgram, "u_domainSize"),
    floorDepth: getUniform(gl, displayProgram, "u_floorDepth"),
    scroll: getUniform(gl, displayProgram, "u_scroll"),
    sunDirection: getUniform(gl, displayProgram, "u_sunDirection"),
    displaySunDirection: getUniform(gl, displayProgram, "u_displaySunDirection"),
    moonDirection: getUniform(gl, displayProgram, "u_moonDirection"),
    displayMoonDirection: getUniform(gl, displayProgram, "u_displayMoonDirection"),
    moonPhaseLight: getUniform(gl, displayProgram, "u_moonPhaseLight"),
    moonAngularRadius: getUniform(gl, displayProgram, "u_moonAngularRadius"),
    moonIllumination: getUniform(gl, displayProgram, "u_moonIllumination"),
    moonStrength: getUniform(gl, displayProgram, "u_moonStrength"),
    primaryIsMoon: getUniform(gl, displayProgram, "u_primaryIsMoon"),
    primaryLightDirection: getUniform(gl, displayProgram, "u_primaryLightDirection"),
    starTransform: getUniform(gl, displayProgram, "u_starTransform"),
    sunAngularRadius: getUniform(gl, displayProgram, "u_sunAngularRadius"),
    primaryLightStrength: getUniform(gl, displayProgram, "u_primaryLightStrength"),
    oceanTime: getUniform(gl, displayProgram, "u_oceanTime"),
    seed: getUniform(gl, displayProgram, "u_seed"),
    windDirection: getUniform(gl, displayProgram, "u_windDirection"),
    choppiness: getUniform(gl, displayProgram, "u_choppiness"),
    detail: getUniform(gl, displayProgram, "u_detail"),
    debugView: getUniform(gl, displayProgram, "u_debugView"),
    waveData: getUniform(gl, displayProgram, "u_waveData[0]"),
    wavePhase: getUniform(gl, displayProgram, "u_wavePhase[0]"),
    absorption: getUniform(gl, displayProgram, "u_absorption"),
    actors: getUniform(gl, displayProgram, "u_actors"),
    fishCount: getUniform(gl, displayProgram, "u_fishCount"),
    lifeLow: getUniform(gl, displayProgram, "u_lifeLow"),
    lifeHigh: getUniform(gl, displayProgram, "u_lifeHigh"),
    airLow: getUniform(gl, displayProgram, "u_airLow"),
    airHigh: getUniform(gl, displayProgram, "u_airHigh"),
  };

  const rippleUniforms = {
    foam: getRippleUniforms(gl, foamProgram),
    surface: getRippleUniforms(gl, surfaceProgram),
    caustic: getRippleUniforms(gl, causticProgram),
    display: getRippleUniforms(gl, displayProgram),
  };
  let rippleFrame: RippleFrame = { data: new Float32Array(RIPPLE_SLOTS * 4), count: 0 };
  const applyRipples = (uniforms: RippleUniforms) => {
    if (uniforms.count) gl.uniform1i(uniforms.count, Math.min(rippleFrame.count, quality.rippleSlots));
    if (uniforms.ripples && rippleFrame.count > 0) gl.uniform4fv(uniforms.ripples, rippleFrame.data);
  };

  gl.useProgram(evolveProgram);
  gl.uniform1i(evolveUniforms.initial, 0);
  gl.uniform1i(evolveUniforms.size, quality.simulationSize);
  gl.useProgram(transformProgram);
  gl.uniform1i(transformUniforms.inputA, 0);
  gl.uniform1i(transformUniforms.inputB, 1);
  gl.uniform1i(transformUniforms.size, quality.simulationSize);
  gl.useProgram(unpackProgram);
  gl.uniform1i(unpackUniforms.inputA, 0);
  gl.uniform1i(unpackUniforms.inputB, 1);
  gl.uniform1i(unpackUniforms.size, quality.simulationSize);
  gl.useProgram(filterProgram);
  gl.uniform1i(filterUniforms.displacement, 0);
  gl.uniform1i(filterUniforms.gradient, 3);
  gl.uniform1i(filterUniforms.level, 0);

  const foamDrift = waveField.windDirection.map(value => value * waveField.windSpeed * FOAM_DRIFT_FRACTION);
  gl.useProgram(foamProgram);
  gl.uniform1i(foamUniforms.previous, 1);
  gl.uniform1i(foamUniforms.displacement, 0);
  gl.uniform1i(foamUniforms.gradient, 3);
  gl.uniform1i(foamUniforms.distantNoise, 8);
  gl.uniform1f(foamUniforms.gridSize, quality.simulationSize);
  gl.uniform1f(foamUniforms.choppiness, waveField.choppiness);
  gl.uniform2f(foamUniforms.drift, foamDrift[0], foamDrift[1]);
  gl.uniform4fv(foamUniforms.waveData, waveField.data);
  gl.uniform1fv(foamUniforms.wavePhase, waveField.phases);

  gl.useProgram(surfaceProgram);
  gl.uniform1i(surfaceUniforms.displacement, 0);
  gl.uniform1i(surfaceUniforms.distantNoise, 8);
  gl.uniform1f(surfaceUniforms.gridSize, quality.simulationSize);
  gl.uniform1f(surfaceUniforms.meshColumns, quality.meshColumns);
  gl.uniform1f(surfaceUniforms.choppiness, waveField.choppiness);
  gl.uniform1f(surfaceUniforms.seed, seedUniform);
  gl.uniform4fv(surfaceUniforms.waveData, waveField.data);
  gl.uniform1fv(surfaceUniforms.wavePhase, waveField.phases);

  gl.useProgram(causticProgram);
  gl.uniform1i(causticUniforms.displacement, 0);
  gl.uniform1i(causticUniforms.gradient, 3);
  gl.uniform1i(causticUniforms.distantNoise, 8);
  gl.uniform4fv(causticUniforms.waveData, waveField.data);
  gl.uniform1fv(causticUniforms.wavePhase, waveField.phases);
  gl.uniform1f(causticUniforms.choppiness, waveField.choppiness);
  gl.uniform1f(causticUniforms.gridSize, quality.simulationSize);
  gl.uniform1f(causticUniforms.surfaceSpacing, WATER_DOMAIN_METERS / (quality.causticGridSize - 1));
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
  gl.uniform1i(displayUniforms.foam, 7);
  gl.uniform2f(displayUniforms.foamDrift, foamDrift[0], foamDrift[1]);
  gl.uniform4fv(displayUniforms.waveData, waveField.data);
  gl.uniform1fv(displayUniforms.wavePhase, waveField.phases);
  gl.uniform2f(
    displayUniforms.windDirection,
    waveField.windDirection[0],
    waveField.windDirection[1],
  );
  gl.uniform1f(displayUniforms.choppiness, waveField.choppiness);
  gl.uniform1f(displayUniforms.detail, quality.detailLevel);
  gl.uniform1f(displayUniforms.debugView, getDebugView());
  gl.uniform1i(displayUniforms.displacement, 0);
  gl.uniform1i(displayUniforms.caustics, 1);
  gl.uniform1i(displayUniforms.sky, 2);
  gl.uniform1i(displayUniforms.gradient, 3);
  gl.uniform1i(displayUniforms.distantNoise, 8);
  gl.uniform1i(displayUniforms.varianceTable, 4);
  gl.uniform1i(displayUniforms.surface, 5);
  gl.uniform1i(displayUniforms.surfaceParameter, 6);
  gl.uniform1i(displayUniforms.actors, 9);
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

  let atmosphereLightSignature = "";
  let atmosphereLight: SceneLight | null = null;
  let displayLight: SceneLight | null = null;
  let displayFrame = 0;
  let cloudFrame = -1;
  let spectrumTime: number | null = null;
  let cloudTime: number | null = null;
  let cloudLight: SceneLight | null = null;
  let causticTime: number | null = null;
  let causticLight: SceneLight | null = null;
  let foamIndex = 0;
  let foamTime: number | null = null;
  const renderFoam = (oceanTime: number) => {
    if (foamTime === null) {
      foamTime = oceanTime;
      return;
    }
    const seconds = oceanTime - foamTime;
    if (seconds + 1e-6 < OCEAN_PLAYBACK_RATE / 30) return;
    const next = 1 - foamIndex;
    gl.bindFramebuffer(gl.FRAMEBUFFER, foamTargets[next].framebuffer);
    gl.viewport(0, 0, quality.simulationSize, quality.simulationSize);
    gl.disable(gl.BLEND);
    gl.useProgram(foamProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindArrayTexture(gl, displacementTexture, 0);
    bindArrayTexture(gl, gradientTexture, 3);
    bindTexture(gl, foamTargets[foamIndex].texture, 1);
    gl.uniform1f(foamUniforms.oceanTime, oceanTime);
    gl.uniform1f(foamUniforms.seconds, seconds);
    applyRipples(rippleUniforms.foam);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, foamTargets[next].framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, foamDisplay.framebuffer);
    gl.blitFramebuffer(0, 0, quality.simulationSize, quality.simulationSize,
      0, 0, quality.simulationSize, quality.simulationSize, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bindTexture(gl, foamDisplay.texture, 1);
    gl.generateMipmap(gl.TEXTURE_2D);
    foamIndex = next;
    foamTime = oceanTime;
  };
  const renderSpectrum = (oceanTime: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, spectrumTargets[0].framebuffer);
    gl.viewport(0, 0, quality.simulationSize * OCEAN_CASCADE_COUNT, quality.simulationSize);
    gl.disable(gl.BLEND);
    gl.useProgram(evolveProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindTexture(gl, initialSpectrum, 0);
    gl.uniform1f(evolveUniforms.time, oceanTime % OCEAN_REPEAT_SECONDS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(transformProgram);
    let current = 0;
    for (let axis = 0; axis < 2; axis += 1) {
      gl.uniform1i(transformUniforms.axis, axis);
      // The unpack pass performs the last vertical transform directly in the wave textures.
      const lastStage = axis === 0 ? quality.simulationSize : quality.simulationSize / 2;
      for (let stage = 2; stage <= lastStage; stage *= 2) {
        const next = 1 - current;
        gl.bindFramebuffer(gl.FRAMEBUFFER, spectrumTargets[next].framebuffer);
        bindTexture(gl, spectrumTargets[current].texture, 0);
        bindTexture(gl, spectrumTargets[current].second, 1);
        gl.uniform1i(transformUniforms.stage, stage);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        current = next;
      }
    }
    gl.viewport(0, 0, quality.simulationSize, quality.simulationSize);
    gl.useProgram(unpackProgram);
    bindTexture(gl, spectrumTargets[current].texture, 0);
    bindTexture(gl, spectrumTargets[current].second, 1);
    for (let cascade = 0; cascade < OCEAN_CASCADE_COUNT; cascade += 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, cascadeFramebuffers[0][cascade]);
      gl.uniform1i(unpackUniforms.cascade, cascade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.useProgram(filterProgram);
    for (let level = 1; level <= cascadeLevels; level += 1) {
      const size = quality.simulationSize / 2 ** level;
      gl.viewport(0, 0, size, size);
      // Exclude the output level from the sampler range to prevent texture feedback.
      bindArrayTexture(gl, displacementTexture, 0);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, level - 1);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, level - 1);
      bindArrayTexture(gl, gradientTexture, 3);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, level - 1);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, level - 1);
      for (let cascade = 0; cascade < OCEAN_CASCADE_COUNT; cascade += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, cascadeFramebuffers[level][cascade]);
        gl.uniform1i(filterUniforms.cascade, cascade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    bindArrayTexture(gl, displacementTexture, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, cascadeLevels);
    bindArrayTexture(gl, gradientTexture, 3);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, cascadeLevels);
  };

  const renderCaustics = (
    light: SceneLight,
    oceanTime: number,
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
    bindArrayTexture(gl, displacementTexture, 0);
    bindArrayTexture(gl, gradientTexture, 3);
    gl.uniform1f(causticUniforms.oceanTime, oceanTime);
    applyRipples(rippleUniforms.caustic);
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
    gl.bindTexture(gl.TEXTURE_2D, skyTarget.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const renderSurface = (width: number, height: number, scroll: number, oceanTime: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceTarget!.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.useProgram(surfaceProgram);
    gl.bindVertexArray(surfaceGeometry.vertexArray);
    bindArrayTexture(gl, displacementTexture, 0);
    gl.uniform2f(surfaceUniforms.resolution, width, height);
    gl.uniform1f(surfaceUniforms.scroll, scroll);
    gl.uniform1f(surfaceUniforms.oceanTime, oceanTime);
    applyRipples(rippleUniforms.surface);
    gl.drawElements(gl.TRIANGLES, surfaceGeometry.count, gl.UNSIGNED_INT, 0);
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]);
    gl.disable(gl.DEPTH_TEST);
  };

  const render = (
    width: number,
    height: number,
    canvasWidth: number,
    canvasHeight: number,
    scroll: number,
    light: SceneLight,
    oceanTime: number,
    ripples: RippleFrame,
    life: LifeFrame,
  ) => {
    rippleFrame = ripples;
    if (oceanTime !== spectrumTime) {
      renderSpectrum(oceanTime);
      renderFoam(oceanTime);
      spectrumTime = oceanTime;
    }
    let skyChanged = false;
    if (light !== atmosphereLight) {
      const signature = light.sunDirection.map(value => value.toFixed(4)).join(":");
      if (signature !== atmosphereLightSignature) {
        renderAtmosphere(light);
        atmosphereLightSignature = signature;
        skyChanged = true;
      }
      atmosphereLight = light;
    }
    if (
      skyChanged
      || cloudFrame < 0
      || light !== cloudLight
      || (oceanTime !== cloudTime && displayFrame - cloudFrame >= quality.cloudFrameStride)
    ) {
      renderClouds(light, oceanTime);
      cloudFrame = displayFrame;
      cloudTime = oceanTime;
      cloudLight = light;
    }
    if (scroll > 0.08 && (oceanTime !== causticTime || light !== causticLight)) {
      renderCaustics(light, oceanTime);
      causticTime = oceanTime;
      causticLight = light;
    } else if (displayFrame === 0) {
      renderCaustics(light, oceanTime);
      gl.bindFramebuffer(gl.FRAMEBUFFER, causticTarget.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, causticTarget.texture);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    const scene = ensureSceneTarget(canvasWidth, canvasHeight);
    const scaled = width !== canvasWidth || height !== canvasHeight;
    const horizonBand = scaled ? getHorizonBand(scroll, canvasHeight) : null;
    const refinement = horizonBand?.opacity ?? 0;
    const surfaceWidth = Math.round(width + (canvasWidth - width) * refinement);
    const surfaceHeight = Math.round(height + (canvasHeight - height) * refinement);
    renderSurface(surfaceWidth, surfaceHeight, scroll, oceanTime);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scaled ? scene.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(displayProgram);
    gl.bindVertexArray(fullscreen.vertexArray);
    bindArrayTexture(gl, displacementTexture, 0);
    bindTexture(gl, causticTarget.texture, 1);
    bindTexture(gl, skyTarget.texture, 2);
    bindArrayTexture(gl, gradientTexture, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, varianceTexture);
    bindTexture(gl, surfaceTarget!.texture, 5);
    bindTexture(gl, surfaceTarget!.parameter, 6);
    bindTexture(gl, foamDisplay.texture, 7);
    gl.uniform2f(displayUniforms.resolution, width, height);
    gl.uniform2f(displayUniforms.surfaceResolution, surfaceWidth, surfaceHeight);
    gl.uniform3f(displayUniforms.horizonBand, 0, 0, 0);
    gl.uniform1f(displayUniforms.scroll, scroll);
    if (light !== displayLight) {
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
      gl.uniformMatrix3fv(displayUniforms.starTransform, false, light.starTransform);
      displayLight = light;
    }
    gl.uniform1f(displayUniforms.oceanTime, oceanTime);
    applyRipples(rippleUniforms.display);
    const { school } = life;
    if (school.count > 0) {
      bindTexture(gl, actorTexture, 9);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ACTOR_TEXTURE_WIDTH, ACTOR_TEXTURE_ROWS,
        gl.RGBA, gl.FLOAT, life.actors);
    }
    gl.uniform1i(displayUniforms.fishCount, school.count);
    gl.uniform3f(displayUniforms.lifeLow, school.low[0], school.low[1], school.low[2]);
    gl.uniform3f(displayUniforms.lifeHigh, school.high[0], school.high[1], school.high[2]);
    gl.uniform3f(displayUniforms.airLow, school.airLow[0], school.airLow[1], school.airLow[2]);
    gl.uniform3f(displayUniforms.airHigh, school.airHigh[0], school.airHigh[1], school.airHigh[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    if (scaled) {
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
    }
    if (horizonBand) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, horizonBand.bottom, canvasWidth, horizonBand.top - horizonBand.bottom);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvasWidth, canvasHeight);
      gl.useProgram(displayProgram);
      gl.bindVertexArray(fullscreen.vertexArray);
      gl.uniform2f(displayUniforms.resolution, canvasWidth, canvasHeight);
      gl.uniform3f(displayUniforms.horizonBand, horizonBand.bottom, horizonBand.top, horizonBand.opacity);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindVertexArray(null);
    }
    displayFrame += 1;
  };

  const destroy = () => {
    gl.deleteBuffer(surfaceGeometry.buffer);
    gl.deleteBuffer(surfaceGeometry.indexBuffer);
    gl.deleteVertexArray(surfaceGeometry.vertexArray);
    gl.deleteProgram(surfaceProgram);
    gl.deleteBuffer(fullscreen.buffer);
    gl.deleteVertexArray(fullscreen.vertexArray);
    gl.deleteBuffer(causticGeometry.buffer);
    gl.deleteVertexArray(causticGeometry.vertexArray);
    for (const target of spectrumTargets) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
      gl.deleteTexture(target.second);
    }
    for (const level of cascadeFramebuffers) {
      for (const framebuffer of level) gl.deleteFramebuffer(framebuffer);
    }
    gl.deleteTexture(initialSpectrum);
    gl.deleteTexture(distantNoiseTexture);
    gl.deleteTexture(actorTexture);
    gl.deleteTexture(displacementTexture);
    gl.deleteTexture(gradientTexture);
    gl.deleteTexture(varianceTexture);
    for (const target of [...foamTargets, foamDisplay]) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.texture);
    }
    if (sceneTarget) {
      gl.deleteFramebuffer(sceneTarget.framebuffer);
      gl.deleteTexture(sceneTarget.texture);
    }
    if (surfaceTarget) {
      gl.deleteFramebuffer(surfaceTarget.framebuffer);
      gl.deleteTexture(surfaceTarget.texture);
      gl.deleteTexture(surfaceTarget.parameter);
      gl.deleteRenderbuffer(surfaceTarget.depth);
    }
    gl.deleteFramebuffer(causticScratch.framebuffer);
    gl.deleteTexture(causticScratch.texture);
    gl.deleteFramebuffer(causticTarget.framebuffer);
    gl.deleteTexture(causticTarget.texture);
    gl.deleteFramebuffer(atmosphereTarget.framebuffer);
    gl.deleteTexture(atmosphereTarget.texture);
    gl.deleteFramebuffer(skyTarget.framebuffer);
    gl.deleteTexture(skyTarget.texture);
    gl.deleteProgram(evolveProgram);
    gl.deleteProgram(transformProgram);
    gl.deleteProgram(unpackProgram);
    gl.deleteProgram(filterProgram);
    gl.deleteProgram(foamProgram);
    gl.deleteProgram(causticProgram);
    gl.deleteProgram(causticBlurProgram);
    gl.deleteProgram(atmosphereProgram);
    gl.deleteProgram(cloudProgram);
    gl.deleteProgram(displayProgram);
  };

  return { destroy, render };
}

function getSceneLight(
  celestial: CelestialState,
  width: number,
  height: number,
  latitude: number,
): SceneLight {
  const aspect = width / Math.max(height, 1);
  const azimuthScale = getSunAzimuthScale(aspect, CAMERA_FOCAL_LENGTH);
  const sunDirection = getSceneSunDirection(celestial.sun, azimuthScale);
  const displaySunDirection = getDisplaySunDirection(celestial.sun, azimuthScale);
  const moonDirection = getSceneSunDirection(celestial.moon, azimuthScale);
  const displayMoonDirection = getDisplaySunDirection(celestial.moon, azimuthScale);
  const primaryIsMoon = celestial.primaryLightDirection !== celestial.sun.direction;
  return {
    displayMoonDirection,
    displaySunDirection,
    lightDirection: primaryIsMoon ? moonDirection : sunDirection,
    lightStrength: celestial.primaryLightStrength,
    moonAngularRadius: celestial.moon.angularRadius,
    moonDirection,
    moonIllumination: celestial.moonIllumination,
    moonPhaseLight: getMoonPhaseLight(celestial.sun, celestial.moon),
    moonStrength: primaryIsMoon ? celestial.primaryLightStrength : 0,
    primaryIsMoon,
    starTransform: getStarFieldTransform(celestial.localSiderealAngle, latitude),
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
  onStatusChange,
}: PondSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameStats, setFrameStats] = useState<string | null>(null);
  const [qualityFallback, setQualityFallback] = useState<WaterQuality | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
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
    const qualityName = qualityFallback ?? getWaterQuality();
    if (qualityName === "static") {
      canvas.dataset.webgl = "fallback";
      canvas.dataset.quality = "static";
      onStatusChange?.("fallback");
      return;
    }
    const quality = qualityName === "full" ? FULL_QUALITY
      : qualityName === "reduced" ? REDUCED_QUALITY : LOW_QUALITY;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: quality.name === "full" ? "default" : "low-power",
      preserveDrawingBuffer: false,
      stencil: false,
    });

    if (!gl) {
      canvas.dataset.webgl = "fallback";
      onStatusChange?.("fallback");
      return;
    }

    const previewTime = getPreviewNumber("ocean-time");
    // A slow software renderer can raise this limit to see real-time life motion.
    const lifeStepLimit = getPreviewNumber("ocean-life-step") ?? MAX_LIFE_STEP_SECONDS;
    const previewSeed = getPreviewNumber("ocean-seed");
    const previewDate = Date.parse(new URLSearchParams(window.location.search).get("ocean-date") ?? "");
    const previewCelestial = Number.isFinite(previewDate)
      ? getCelestialState(new Date(previewDate), latitude, longitude)
      : null;
    const waveField = createOceanWaveField(previewSeed ?? seed ?? getSessionOceanSeed());
    const controller = new AbortController();
    let engine: Awaited<ReturnType<typeof createPondEngine>> | null = null;
    canvas.dataset.webgl = "pending";
    onStatusChange?.("pending");

    let frameInterval = quality.frameInterval;
    let animationFrame: number | null = null;
    let oceanTime = previewTime ?? 0;
    let lastFrame = 0;
    let nextFrame = 0;
    let startupFrames = 0;
    let renderedScrollProgress = 0;
    let isVisible = true;
    let reducedMotion = motionQuery.matches;

    const seedPhase = getOceanSeedPhase(waveField.seed);
    const ripples = createRipplePool(quality.rippleSlots);
    const rippleFrame: RippleFrame = { data: new Float32Array(RIPPLE_SLOTS * 4), count: 0 };
    const gestures = createGestureTracker();
    // Real seconds of scene motion. Ripples and other life use this clock.
    let lifeTime = 0;
    const lifeRandom = seededRandom((waveField.seed ^ 0x51f15e) >>> 0);
    const surfaceAt = (x: number, z: number) => spectralHeightAt(waveField, x, z, oceanTime);
    const schoolEnvironment = (scroll: number): SchoolEnvironment => ({
      time: lifeTime,
      home: getSchoolHome(lifeTime, getOceanCamera(scroll, seedPhase), scroll, -OCEAN_DEPTH_METERS),
      homeRadius: 2.2,
      floor: -OCEAN_DEPTH_METERS,
      surfaceAt,
      stimuli: [],
      pellets: [],
    });
    const school: Fish[] = createSchool(quality.fishCount, schoolEnvironment(0).home, lifeRandom);
    // Settle the school before the first frame, so a still frame shows a formed school.
    for (let step = 0; step < 90; step += 1) stepSchool(school, schoolEnvironment(0), 1 / 30);
    const actors = new Float32Array(ACTOR_TEXTURE_WIDTH * ACTOR_TEXTURE_ROWS * 4);
    const lifeFrame: LifeFrame = { actors, school: packSchool(school, actors, surfaceAt) };
    const advanceLife = (seconds: number) => {
      const steps = Math.ceil(seconds / LIFE_SUBSTEP_SECONDS);
      for (let step = 0; step < steps; step += 1) {
        stepSchool(school, schoolEnvironment(renderedScrollProgress), seconds / steps);
      }
    };

    const frameGate = createWebGLFrameGate(gl);
    const frameBudget = createWaterFrameBudget(frameInterval, quality.name);
    let appliedScale = 1;
    let drawnFrames = 0;
    const forcedScale = getForcedRenderScale();
    let canFallBack = forcedScale === null
      && !hasQualityOverride();

    let renderWidth = 1;
    let renderHeight = 1;
    let sizeChanged = true;
    const resize = (renderScale: number) => {
      if (sizeChanged) {
        const bounds = canvas.getBoundingClientRect();
        const displayScale = Math.sqrt(
          (quality.name === "full" ? 1_600_000 : 1_000_000) / Math.max(bounds.width * bounds.height, 1),
        );
        const scale = Math.min(window.devicePixelRatio || 1, quality.name === "full" ? 1.5 : 1, displayScale);
        const width = Math.max(1, Math.round(bounds.width * scale));
        const height = Math.max(1, Math.round(bounds.height * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        sizeChanged = false;
      }
      const canvasPixels = canvas.width * canvas.height;
      const horizon = canvasPixels > quality.pixelBudget
        ? getHorizonBand(renderedScrollProgress, canvas.height) : null;
      const horizonPixels = horizon ? canvas.width * (horizon.top - horizon.bottom) * horizon.opacity : 0;
      const sceneBudget = Math.max(quality.pixelBudget * 0.65, quality.pixelBudget - horizonPixels);
      const budgetScale = Math.min(1, Math.sqrt(sceneBudget / canvasPixels));
      renderWidth = Math.max(1, Math.round(canvas.width * budgetScale * renderScale));
      renderHeight = Math.max(1, Math.round(canvas.height * budgetScale * renderScale));
    };

    let slowDraws = 0;
    let maximumGap = 0;
    const showFrameStats = isFrameStatsEnabled();
    let statsWindowStart = 0;
    let statsWindowDraws = 0;
    let statsWindowCallbacks = 0;
    let statsWindowSlow = 0;
    let statsWindowMaxGap = 0;

    // Reduce the scene resolution and frame rate before a profile change.
    const updateAdaptiveScale = (frameGap: number, timestamp: number) => {
      drawnFrames += 1;
      if (showFrameStats) {
        statsWindowDraws += 1;
        statsWindowMaxGap = Math.max(statsWindowMaxGap, frameGap);
        if (frameGap > frameInterval * 1.45) statsWindowSlow += 1;
      }
      if (frameGap > frameInterval * 1.45) slowDraws += 1;
      maximumGap = Math.max(maximumGap, frameGap);
      if (showFrameStats && drawnFrames % 30 === 0) {
        canvas.dataset.slowDraws = slowDraws.toString();
        canvas.dataset.drawGapMax = maximumGap.toFixed(1);
        canvas.dataset.drawnFrames = drawnFrames.toString();
      }
      frameBudget.update(frameGap, timestamp);
      frameInterval = frameBudget.interval;
      if (canFallBack && frameBudget.needsFallback) {
        canFallBack = false;
        setQualityFallback(quality.name === "full" ? "reduced" : quality.name === "reduced" ? "low" : "static");
      }
    };

    const stage = stageId ? document.getElementById(stageId) : null;
    let targetScrollProgress = 0;
    const readScrollProgress = () => {
      if (!stage) return;
      const distance = Math.max(stage.offsetHeight - window.innerHeight, 1);
      targetScrollProgress = Math.min(1, Math.max(0, -stage.getBoundingClientRect().top / distance));
    };

    const requestRender = () => {
      if (engine && animationFrame === null && isVisible && !document.hidden && !controller.signal.aborted) {
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

    let lightState: CelestialState | null = null;
    let lightWidth = 0;
    let lightHeight = 0;
    let sceneLight: SceneLight;
    const draw = (timestamp: number) => {
      animationFrame = null;
      if (!engine || !isVisible || document.hidden || controller.signal.aborted) return;
      publishFrameStats(timestamp);

      if (
        !reducedMotion
        && lastFrame > 0
        && timestamp < nextFrame - FRAME_INTERVAL_TOLERANCE
      ) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }

      if (!frameGate.ready()) {
        requestRender();
        return;
      }

      if (canvas.dataset.webgl !== "active" && startupFrames >= (reducedMotion || previewTime !== null ? 1 : 2)) {
        canvas.dataset.webgl = "active";
        onStatusChange?.("active");
        lastFrame = 0;
        frameBudget.resetTiming();
      }
      const warmingUp = canvas.dataset.webgl !== "active";

      const firstFrame = lastFrame === 0;
      const frameSeconds = firstFrame ? 0 : (timestamp - lastFrame) / 1000;
      if (!firstFrame && !reducedMotion && !warmingUp) {
        updateAdaptiveScale(timestamp - lastFrame, timestamp);
      }
      lastFrame = timestamp;
      nextFrame = nextWaterFrameTime(timestamp, firstFrame ? timestamp : nextFrame, frameInterval);
      renderedScrollProgress = targetScrollProgress;

      const crossingScale = getCrossingRenderScale(
        waveField,
        renderedScrollProgress,
        oceanTime,
      );
      const targetScale = forcedScale ?? Math.min(frameBudget.scale, crossingScale);
      if (Math.abs(targetScale - appliedScale) > 0.02 || firstFrame) {
        appliedScale = targetScale;
      }
      resize(appliedScale);

      if (!reducedMotion && previewTime === null) {
        oceanTime += (warmingUp ? startupFrames === 0 ? 0 : 1 / 30 : frameSeconds) * OCEAN_PLAYBACK_RATE;
        if (!warmingUp) {
          const lifeSeconds = Math.min(frameSeconds, lifeStepLimit);
          lifeTime += lifeSeconds;
          advanceLife(lifeSeconds);
        }
      }
      if (isInteractive()) handleGestures(gestures.poll(timestamp));
      else gestures.cancel();
      rippleFrame.count = ripples.pack(lifeTime, rippleFrame.data);
      lifeFrame.school = packSchool(school, lifeFrame.actors, surfaceAt);

      const currentCelestial = previewCelestial ?? celestialRef.current;
      if (currentCelestial !== lightState || renderWidth !== lightWidth || renderHeight !== lightHeight) {
        sceneLight = getSceneLight(currentCelestial, renderWidth, renderHeight, latitude);
        lightState = currentCelestial;
        lightWidth = renderWidth;
        lightHeight = renderHeight;
      }
      engine.render(
        renderWidth,
        renderHeight,
        canvas.width,
        canvas.height,
        renderedScrollProgress,
        sceneLight,
        oceanTime,
        rippleFrame,
        lifeFrame,
      );
      frameGate.submit();
      startupFrames += 1;
      const scaleText = appliedScale.toFixed(2);
      if (canvas.dataset.renderScale !== scaleText) canvas.dataset.renderScale = scaleText;

      if (warmingUp || (!reducedMotion && previewTime === null)) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const isInteractive = () => engine !== null
      && !reducedMotion
      && previewTime === null
      && canvas.dataset.webgl === "active"
      && renderedScrollProgress < INTERACTION_SCROLL_LIMIT;

    const toWaterPoint = (clientX: number, clientY: number) => {
      const bounds = canvas.getBoundingClientRect();
      const aspect = bounds.width / Math.max(bounds.height, 1);
      const x = ((clientX - bounds.left) / Math.max(bounds.width, 1) * 2 - 1) * aspect;
      const y = 1 - (clientY - bounds.top) / Math.max(bounds.height, 1) * 2;
      const camera = getOceanCamera(renderedScrollProgress, seedPhase);
      if (camera.origin[1] < 0.2) return null;
      return intersectHorizontalPlane(camera.origin, getCameraRay(camera, x, y), 0, INTERACTION_DISTANCE);
    };

    const handleGestures = (events: GestureEvent[]) => {
      for (const event of events) {
        if (event.type !== "tap") continue;
        const point = toWaterPoint(event.x, event.y);
        if (point) ripples.add(point[0], point[2], TAP_RIPPLE_AMPLITUDE, lifeTime);
      }
    };

    const isSceneTarget = (event: PointerEvent) =>
      !(event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR));
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !isInteractive() || !isSceneTarget(event)) return;
      gestures.down(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      handleGestures(gestures.move(event.pointerId, event.clientX, event.clientY, event.timeStamp));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary || !isInteractive()) return;
      handleGestures(gestures.up(event.pointerId, event.clientX, event.clientY, event.timeStamp));
    };
    const onPointerCancel = (event: PointerEvent) => gestures.cancel(event.pointerId);

    canvas.dataset.renderScale = "1";
    const onResize = () => {
      readScrollProgress();
      sizeChanged = true;
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          lastFrame = 0;
          frameBudget.resetTiming();
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
      frameBudget.resetTiming();
      requestRender();
    };
    const onVisibilityChange = () => {
      lastFrame = 0;
      frameBudget.resetTiming();
      if (document.hidden && animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      requestRender();
    };
    const onScroll = () => {
      readScrollProgress();
      requestRender();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      controller.abort();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      engine = null;
      canvas.dataset.webgl = "fallback";
      onStatusChange?.("fallback");
    };
    const onContextRestored = () => setContextVersion(value => value + 1);

    resizeObserver.observe(canvas);
    if (stage) resizeObserver.observe(stage);
    readScrollProgress();
    window.addEventListener("resize", onResize);
    visibilityObserver.observe(canvas);
    motionQuery.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    // Passive listeners on the window: the page keeps its scroll, links, and text selection.
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerCancel, { passive: true });
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    canvas.dataset.quality = quality.name;
    canvas.dataset.solver = "fft";
    createPondEngine(gl, waveField, quality, controller.signal).then(prepared => {
      if (controller.signal.aborted) {
        prepared.destroy();
        return;
      }
      engine = prepared;
      requestRender();
    }).catch(error => {
      if (controller.signal.aborted) return;
      canvas.dataset.webgl = "fallback";
      canvas.dataset.webglError = error instanceof Error ? error.message : "WebGL initialization failed";
      onStatusChange?.("fallback");
    });

    return () => {
      controller.abort();
      requestRenderRef.current = () => undefined;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      visibilityObserver.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      frameGate.dispose();
      engine?.destroy();
    };
  }, [contextVersion, latitude, longitude, onStatusChange, qualityFallback, seed, stageId]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        aria-hidden="true"
        data-webgl="pending"
        data-solver="fft"
      />
      {frameStats !== null && (
        <output style={frameStatsStyle} aria-live="off">
          {frameStats}
        </output>
      )}
    </>
  );
}
