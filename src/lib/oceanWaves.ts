import type { CelestialPosition } from "./celestial";

export const OCEAN_WAVE_COMPONENT_COUNT = 9;
export const OCEAN_SWELL_COMPONENT_COUNT = 3;
export const GRAVITY = 9.81;

export type OceanWaveField = {
  choppiness: number;
  cloudCover: number;
  data: Float32Array;
  phases: Float32Array;
  seed: number;
  significantWaveHeight: number;
  swellPeriod: number;
  swellWavelength: number;
  windDirection: readonly [number, number];
  windSpeed: number;
};

export type SeaStateSummary = {
  cloudCover: number;
  significantWaveHeight: number;
  swellPeriod: number;
  swellWavelength: number;
  windSpeed: number;
};

export type Direction3 = readonly [number, number, number];

const OCEAN_SEED_KEY = "preyam-ocean-seed-v2";
const FALLBACK_SEED = 4603;

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function getSessionOceanSeed(): number {
  try {
    const storedSeed = window.sessionStorage.getItem(OCEAN_SEED_KEY);
    if (storedSeed) return Number.parseInt(storedSeed, 10) >>> 0;
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    const seed = value[0] || FALLBACK_SEED;
    window.sessionStorage.setItem(OCEAN_SEED_KEY, seed.toString());
    return seed;
  } catch {
    return FALLBACK_SEED;
  }
}

function writeWave(
  field: { data: Float32Array; phases: Float32Array },
  index: number,
  wavelength: number,
  angle: number,
  amplitude: number,
  phase: number,
) {
  const waveNumber = (2 * Math.PI) / wavelength;
  field.data[index * 4] = Math.cos(angle) * waveNumber;
  field.data[index * 4 + 1] = Math.sin(angle) * waveNumber;
  field.data[index * 4 + 2] = Math.sqrt(GRAVITY * waveNumber);
  field.data[index * 4 + 3] = amplitude;
  field.phases[index] = phase;
}

/**
 * Build one seeded deep-water wave field.
 *
 * The first three components form a swell group. Their wavelengths sit close
 * together, so the sum beats and produces wave sets without a timer. The other
 * six components form the local wind sea. Every component uses the deep-water
 * dispersion relation, so the field never repeats in time.
 */
export function createOceanWaveField(seed: number): OceanWaveField {
  const random = seededRandom((seed ^ 0x2f6e2b17) >>> 0);
  const data = new Float32Array(OCEAN_WAVE_COMPONENT_COUNT * 4);
  const phases = new Float32Array(OCEAN_WAVE_COMPONENT_COUNT);
  const field = { data, phases };

  const windAngle = random() * Math.PI * 2;
  const windSpeed = 5.8 + random() * 1.8;
  const swellAngle = windAngle + (random() - 0.5) * 0.9;
  const swellWavelength = 72 + random() * 24;
  const swellRatios = [
    1,
    0.79 + (random() - 0.5) * 0.06,
    0.62 + (random() - 0.5) * 0.06,
  ];
  const swellAmplitudes = [0.13, 0.10, 0.075];
  const swellScale = 0.92 + random() * 0.16;

  for (let index = 0; index < OCEAN_SWELL_COMPONENT_COUNT; index += 1) {
    writeWave(
      field,
      index,
      swellWavelength * swellRatios[index],
      swellAngle + (random() - 0.5) * 0.16,
      swellAmplitudes[index] * swellScale,
      random() * Math.PI * 2,
    );
  }

  const windSeaWavelengths = [7, 10, 14.5, 20, 28, 40];
  for (let offset = 0; offset < windSeaWavelengths.length; offset += 1) {
    const wavelength = windSeaWavelengths[offset] * (0.85 + random() * 0.3);
    const waveNumber = (2 * Math.PI) / wavelength;
    const steepness = 0.022 + random() * 0.016;
    const amplitude = Math.min(steepness / waveNumber, 0.07);
    writeWave(
      field,
      OCEAN_SWELL_COMPONENT_COUNT + offset,
      wavelength,
      windAngle + (random() - 0.5) * 1.2,
      amplitude,
      random() * Math.PI * 2,
    );
  }

  let energy = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    energy += data[index * 4 + 3] ** 2 / 2;
  }

  return {
    choppiness: 1.7,
    cloudCover: 0.22 + random() * 0.34,
    data,
    phases,
    seed,
    significantWaveHeight: 4 * Math.sqrt(energy),
    swellPeriod: (2 * Math.PI) / data[2],
    swellWavelength,
    windDirection: [Math.cos(windAngle), Math.sin(windAngle)],
    windSpeed,
  };
}

/** Sum the spectral components at one point. This ignores the IWave tile. */
export function spectralHeightAt(
  field: OceanWaveField,
  x: number,
  z: number,
  time: number,
): number {
  let height = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    const offset = index * 4;
    const phase =
      x * field.data[offset]
      + z * field.data[offset + 1]
      - field.data[offset + 2] * time
      + field.phases[index];
    height += field.data[offset + 3] * Math.sin(phase);
  }
  return height;
}

export function describeSeaState(field: OceanWaveField): SeaStateSummary {
  return {
    cloudCover: field.cloudCover,
    significantWaveHeight: field.significantWaveHeight,
    swellPeriod: field.swellPeriod,
    swellWavelength: field.swellWavelength,
    windSpeed: field.windSpeed,
  };
}

/**
 * Compress the solar azimuth so the daily path fits the fixed camera.
 *
 * The camera never turns. This helper maps the hour angle onto a narrow
 * azimuth range in front of the camera. The elevation stays physical.
 */
export function getSceneSunDirection(
  sun: CelestialPosition,
  azimuthScale: number,
): Direction3 {
  const azimuth = sun.hourAngle * azimuthScale;
  const elevation = Math.max(sun.elevation, -0.35);
  const horizontal = Math.cos(elevation);
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ];
}

/**
 * Map the solar state onto the narrow sky band above the horizon.
 *
 * The visible disc uses this direction. The elevation is a presentation
 * value between 0.8 and 4.5 degrees, so the disc stays inside the sky band
 * at every daylight time.
 */
export function getDisplaySunDirection(
  sun: CelestialPosition,
  azimuthScale: number,
): Direction3 {
  const azimuth = sun.hourAngle * azimuthScale;
  const normalizedElevation = Math.min(
    1,
    Math.max(0, sun.elevation / (Math.PI / 2)),
  );
  const elevation =
    ((0.8 + 3.7 * Math.sqrt(normalizedElevation)) * Math.PI) / 180;
  const horizontal = Math.cos(elevation);
  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ];
}

/** Rotate a direction about the vertical axis. */
export function rotateAboutY(direction: Direction3, angle: number): Direction3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [
    direction[0] * cosine + direction[2] * sine,
    direction[1],
    -direction[0] * sine + direction[2] * cosine,
  ];
}

/**
 * Pick the azimuth compression for the current canvas shape.
 *
 * A wide canvas can show the sun across a wide arc. A narrow phone canvas
 * needs a tighter arc, or the disc leaves the frame at sunrise and sunset.
 */
export function getSunAzimuthScale(aspect: number, focalLength: number) {
  const halfHorizontalFov = Math.atan(Math.max(aspect, 0.2) / focalLength);
  return Math.min(0.32, (0.62 * halfHorizontalFov) / (Math.PI / 2));
}
