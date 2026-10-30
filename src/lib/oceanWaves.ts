import type { CelestialPosition } from "./celestial";

/** The analytic components carry the long swell. The FFT cascades carry the wind sea. */
export const OCEAN_WAVE_COMPONENT_COUNT = 3;
export const OCEAN_PLAYBACK_RATE = 0.38;
export const GRAVITY = 9.81;
export const DISTANT_CREST_NOISE_SIZE = 512;
export const DISTANT_CREST_NOISE_CELLS = 128;
/** The fetch sets the wind-sea peak. At 7 m/s, 40 km puts the peak near 26 m. */
export const WIND_FETCH_METERS = 40_000;
const PEAK_ENHANCEMENT = 3.3;

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

export type JonswapParameters = {
  alpha: number;
  peakFrequency: number;
};

export type Direction3 = readonly [number, number, number];

export type Matrix3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

const OCEAN_SEED_KEY = "preyam-ocean-seed-v2";
const FALLBACK_SEED = 4603;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Fetch-limited JONSWAP parameters (Hasselmann et al. 1973). */
export function getJonswapParameters(
  windSpeed: number,
  fetch = WIND_FETCH_METERS,
): JonswapParameters {
  return {
    alpha: 0.076 * (windSpeed ** 2 / (fetch * GRAVITY)) ** 0.22,
    peakFrequency: 22 * (GRAVITY ** 2 / (windSpeed * fetch)) ** (1 / 3),
  };
}

/** JONSWAP height spectrum over angular frequency, in m²·s. */
export function jonswapSpectrum(frequency: number, { alpha, peakFrequency }: JonswapParameters) {
  const width = frequency <= peakFrequency ? 0.07 : 0.09;
  const peak = Math.exp(
    -((frequency - peakFrequency) ** 2) / (2 * width ** 2 * peakFrequency ** 2),
  );
  return alpha * GRAVITY ** 2 / frequency ** 5
    * Math.exp(-1.25 * (peakFrequency / frequency) ** 4)
    * PEAK_ENHANCEMENT ** peak;
}

export function windSeaHeightVariance(windSpeed: number) {
  const parameters = getJonswapParameters(windSpeed);
  const minimum = parameters.peakFrequency * 0.25;
  const maximum = parameters.peakFrequency * 40;
  const count = 4096;
  const step = Math.log(maximum / minimum) / count;
  let variance = 0;
  for (let sample = 0; sample < count; sample += 1) {
    const frequency = minimum * Math.exp((sample + 0.5) * step);
    variance += jonswapSpectrum(frequency, parameters) * frequency * step;
  }
  return variance;
}

/** Hasselmann spreading exponent, as Horvath (2015) gives it in equation 43. */
export function spreadingExponent(frequency: number, peakFrequency: number, windSpeed: number) {
  const ratio = frequency / peakFrequency;
  if (ratio <= 1) return 6.97 * ratio ** 4.06;
  return 9.77 * ratio ** (-2.33 - 1.45 * (windSpeed * peakFrequency / GRAVITY - 1.17));
}

function logGamma(value: number) {
  const shifted = value - 1;
  let sum = LANCZOS_COEFFICIENTS[0];
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index += 1) {
    sum += LANCZOS_COEFFICIENTS[index] / (shifted + index);
  }
  const base = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(base) - base + Math.log(sum);
}

/** Longuet-Higgins cos-2s spreading, normalized over the full circle. */
export function directionalSpreading(angle: number, exponent: number) {
  const normalization = Math.exp(logGamma(exponent + 1) - logGamma(exponent + 0.5))
    / (2 * Math.sqrt(Math.PI));
  return normalization * Math.abs(Math.cos(angle / 2)) ** (2 * exponent);
}

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

export function createDistantCrestNoise(seed: number) {
  const random = seededRandom((seed ^ 0x51f15e5d) >>> 0);
  const cells = DISTANT_CREST_NOISE_CELLS;
  const size = DISTANT_CREST_NOISE_SIZE;
  const lattice = Float32Array.from({ length: cells * cells }, () => random());
  const pixels = new Uint8Array(size * size * 4);
  const encode = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);

  for (let y = 0; y < size; y += 1) {
    const gridY = (y + 0.5) * cells / size;
    const cellY = Math.floor(gridY);
    const localY = gridY - cellY;
    const weightY = localY * localY * (3 - 2 * localY);
    const derivativeY = 6 * localY * (1 - localY);
    const nextY = (cellY + 1) % cells;

    for (let x = 0; x < size; x += 1) {
      const gridX = (x + 0.5) * cells / size;
      const cellX = Math.floor(gridX);
      const localX = gridX - cellX;
      const weightX = localX * localX * (3 - 2 * localX);
      const derivativeX = 6 * localX * (1 - localX);
      const nextX = (cellX + 1) % cells;
      const a = lattice[cellY * cells + cellX];
      const b = lattice[cellY * cells + nextX];
      const c = lattice[nextY * cells + cellX];
      const d = lattice[nextY * cells + nextX];
      const lower = a + (b - a) * weightX;
      const upper = c + (d - c) * weightX;
      const offset = (y * size + x) * 4;
      pixels[offset] = encode(lower + (upper - lower) * weightY);
      pixels[offset + 1] = encode(0.5 + ((b - a) + (d - c - b + a) * weightY) * derivativeX / 3);
      pixels[offset + 2] = encode(0.5 + (upper - lower) * derivativeY / 3);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
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
 * Build one seeded sea state.
 *
 * The three analytic components form a swell group. Their wavelengths sit
 * close together, so the sum beats and produces wave sets without a timer.
 * The wind speed and direction drive the JONSWAP wind sea in the FFT cascades.
 */
export function createOceanWaveField(seed: number): OceanWaveField {
  const random = seededRandom((seed ^ 0x2f6e2b17) >>> 0);
  const data = new Float32Array(OCEAN_WAVE_COMPONENT_COUNT * 4);
  const phases = new Float32Array(OCEAN_WAVE_COMPONENT_COUNT);
  const field = { data, phases };

  const windAngle = random() * Math.PI * 2;
  const windSpeed = 5.8 + random() * 1.8;
  const swellAngle = windAngle + (random() - 0.5) * 0.9;
  const swellWavelength = 84 + random() * 28;
  const swellRatios = [
    1,
    0.79 + (random() - 0.5) * 0.06,
    0.62 + (random() - 0.5) * 0.06,
  ];
  const swellAmplitudes = [0.18, 0.125, 0.085];
  const swellScale = 0.92 + random() * 0.16;

  let swellEnergy = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    writeWave(
      field,
      index,
      swellWavelength * swellRatios[index],
      swellAngle + (random() - 0.5) * 0.16,
      swellAmplitudes[index] * swellScale,
      random() * Math.PI * 2,
    );
    swellEnergy += data[index * 4 + 3] ** 2 / 2;
  }

  return {
    choppiness: 0.85,
    cloudCover: 0.22 + random() * 0.34,
    data,
    phases,
    seed,
    significantWaveHeight: 4 * Math.sqrt(swellEnergy + windSeaHeightVariance(windSpeed)),
    swellPeriod: (2 * Math.PI) / data[2],
    swellWavelength,
    windDirection: [Math.cos(windAngle), Math.sin(windAngle)],
    windSpeed,
  };
}

export function waveSlopeVariance(
  data: Float32Array,
  windDirection: readonly [number, number],
): [number, number] {
  const variance: [number, number] = [0, 0];
  for (let offset = 0; offset < data.length; offset += 4) {
    const along = data[offset] * windDirection[0] + data[offset + 1] * windDirection[1];
    const across = -data[offset] * windDirection[1] + data[offset + 1] * windDirection[0];
    const energy = data[offset + 3] ** 2 / 2;
    variance[0] += along * along * energy;
    variance[1] += across * across * energy;
  }
  return variance;
}

/** Sum the swell at one point. This omits the wind sea in the FFT cascades. */
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
 * Compress the solar azimuth so the daily path fits the south-facing camera.
 *
 * The camera never turns. This helper maps the hour angle onto a narrow
 * azimuth range in front of the camera. Screen-left is east, and screen-right
 * is west. The elevation stays physical.
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

/** Preserve the lunar phase when the visible moon moves within the sky. */
export function getMoonPhaseLight(
  sun: CelestialPosition,
  moon: CelestialPosition,
): Direction3 {
  const relativeSun = rotateAboutY(sun.direction, -moon.azimuth);
  const sine = Math.sin(moon.elevation);
  const cosine = Math.cos(moon.elevation);
  return [
    relativeSun[0],
    relativeSun[1] * cosine - relativeSun[2] * sine,
    relativeSun[1] * sine + relativeSun[2] * cosine,
  ];
}

/** Map a south-facing view direction into the fixed celestial frame. */
export function getStarFieldTransform(
  localSiderealAngle: number,
  latitudeDegrees: number,
): Matrix3 {
  const latitude = latitudeDegrees * Math.PI / 180;
  const poleY = Math.sin(latitude);
  const poleZ = -Math.cos(latitude);
  const sine = Math.sin(-localSiderealAngle);
  const cosine = Math.cos(localSiderealAngle);
  const oneMinusCosine = 1 - cosine;
  const poleProduct = oneMinusCosine * poleY * poleZ;

  return [
    cosine,
    poleZ * sine,
    -poleY * sine,
    -poleZ * sine,
    cosine + oneMinusCosine * poleY * poleY,
    poleProduct,
    poleY * sine,
    poleProduct,
    cosine + oneMinusCosine * poleZ * poleZ,
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
