import {
  GRAVITY,
  OCEAN_WAVE_COMPONENT_COUNT,
  directionalSpreading,
  getJonswapParameters,
  jonswapSpectrum,
  seededRandom,
  spreadingExponent,
  type JonswapParameters,
  type OceanWaveField,
} from "./oceanWaves";

/**
 * Patch lengths in meters. The ratios are not near small integer fractions,
 * so the tiles do not share a short spatial repeat period.
 */
export const OCEAN_CASCADE_LENGTHS = [587, 61.3, 7.93, 1.97] as const;
export const OCEAN_CASCADE_COUNT = OCEAN_CASCADE_LENGTHS.length;
/** Mode frequencies snap to this period of ocean time, so phases stay precise. */
export const OCEAN_REPEAT_SECONDS = 1000;
/** Elfouhaily et al. (1997), equation 24: the gravity-capillary crossover. */
export const CAPILLARY_WAVE_NUMBER = 370;
const LOW_CUTOFF_MODES = 6;
const MINIMUM_TEXELS_PER_WAVE = 4;
export const VARIANCE_TABLE_SIZE = 128;
export const OCEAN_MAX_ANISOTROPY = 4;
export const VARIANCE_RATIO_SAMPLES = 7;
export const VARIANCE_ANGLE_SAMPLES = 16;
export const VARIANCE_MIN_FOOTPRINT = 0.001;
export const VARIANCE_MAX_FOOTPRINT = 2048;

/** Principal axes of the pixel footprint, with a bounded four-tap filter. */
export function oceanFilterFootprint(dx: readonly number[], dy: readonly number[]) {
  const a = dx[0] ** 2 + dy[0] ** 2;
  const b = dx[0] * dx[1] + dy[0] * dy[1];
  const c = dx[1] ** 2 + dy[1] ** 2;
  const largest = Math.max((a + c + Math.hypot(a - c, 2 * b)) / 2, 1e-12);
  const angle = a === c && b === 0 ? 0 : Math.atan2(2 * b, a - c) / 2;
  const major = Math.sqrt(largest);
  const minor = Math.min(major, Math.max(Math.abs(dx[0] * dy[1] - dx[1] * dy[0]) / major,
    major / OCEAN_MAX_ANISOTROPY));
  return { major, minor, direction: [Math.cos(angle), Math.sin(angle)] as const };
}

export function cascadeFilterKernel(major: number, minor: number, texel: number) {
  const lod = Math.max(Math.log2(minor / texel), 0);
  const span = texel * 2 ** Math.floor(lod);
  return {
    blend: lod % 1,
    width: (span * span - texel * texel) / 4 + span * span / (lod < 1 ? 3 : 6),
    nextWidth: (4 * span * span - texel * texel) / 4 + 4 * span * span / 6,
    step: Math.sqrt(Math.max(major * major - Math.max(minor, texel) ** 2, 0)) / 4,
  };
}

/** Approximate response of the base cubic, linear mip levels, and four line samples. */
export function cascadeFilterAmplitude(waveNumber: number, projection: number,
  kernel: ReturnType<typeof cascadeFilterKernel>) {
  const base = (1 - kernel.blend) * Math.exp(-0.5 * waveNumber ** 2 * kernel.width)
    + kernel.blend * Math.exp(-0.5 * waveNumber ** 2 * kernel.nextWidth);
  return base * Math.cos(projection * kernel.step / 2) * Math.cos(projection * kernel.step);
}

export type OceanCascades = {
  bands: (readonly [number, number])[];
  heightVariance: number[];
  /** Per texel: h0(k) and conj(h0(−k)). The cascades sit side by side. */
  initial: Float32Array;
  significantWaveHeight: number;
  size: number;
  slopeVariance: (readonly [number, number])[];
  filterVariance: Float32Array;
  unresolvedVariance: readonly [number, number];
};

/**
 * Give each wavenumber to exactly one cascade.
 *
 * A cascade starts at six modes of its own patch, or earlier when the larger
 * cascade cannot hold four texels per wavelength.
 */
export function getCascadeBands(size: number) {
  const edge = (index: number) => Math.min(
    LOW_CUTOFF_MODES * 2 * Math.PI / OCEAN_CASCADE_LENGTHS[index],
    2 * Math.PI * size / (MINIMUM_TEXELS_PER_WAVE * OCEAN_CASCADE_LENGTHS[index - 1]),
  );
  return OCEAN_CASCADE_LENGTHS.map((length, index) => [
    index === 0 ? 0 : edge(index),
    index === OCEAN_CASCADE_COUNT - 1
      ? 2 * Math.PI * size / (MINIMUM_TEXELS_PER_WAVE * length)
      : edge(index + 1),
  ] as const);
}

/** The FFT keeps modes in natural order: 0 … N/2 − 1, then −N/2 … −1. */
export function modeNumber(index: number, size: number) {
  return index < size / 2 ? index : index - size;
}

export function gravityCapillaryFrequency(waveNumber: number) {
  return Math.sqrt(GRAVITY * waveNumber * (1 + (waveNumber / CAPILLARY_WAVE_NUMBER) ** 2));
}

export function quantizedFrequency(waveNumber: number) {
  const step = 2 * Math.PI / OCEAN_REPEAT_SECONDS;
  return Math.round(gravityCapillaryFrequency(waveNumber) / step) * step;
}

/**
 * Elfouhaily et al. (1997), equations 40, 41, 44, 57, 60, and 66.
 * Return the short-wave curvature spectrum and its directional anisotropy.
 */
export function shortWaveSpectrum(waveNumber: number, windSpeed: number, parameters: JonswapParameters) {
  const peakNumber = parameters.peakFrequency ** 2 / GRAVITY;
  const peakSpeed = gravityCapillaryFrequency(peakNumber) / peakNumber;
  const minimumSpeed = Math.sqrt(2 * GRAVITY / CAPILLARY_WAVE_NUMBER);
  const phaseSpeed = gravityCapillaryFrequency(waveNumber) / waveNumber;
  const roughnessLength = 3.7e-5 * windSpeed ** 2 / GRAVITY * (windSpeed / peakSpeed) ** 0.9;
  const frictionVelocity = 0.41 * windSpeed / Math.log(10 / roughnessLength);
  const ratio = frictionVelocity / minimumSpeed;
  const alpha = 0.01 * (1 + (ratio < 1 ? 1 : 3) * Math.log(ratio));
  const curvature = 0.5 * Math.max(alpha, 0) * minimumSpeed / phaseSpeed
    * Math.exp(-0.25 * (waveNumber / CAPILLARY_WAVE_NUMBER - 1) ** 2)
    * Math.exp(-1.25 * (peakNumber / waveNumber) ** 2);
  const anisotropy = Math.tanh(Math.log(2) / 4 + 4 * (phaseSpeed / peakSpeed) ** 2.5
    + 0.13 * ratio * (minimumSpeed / phaseSpeed) ** 2.5);
  return { curvature, anisotropy };
}

/** Preserve the long JONSWAP sea and blend to the capillary branch between 1.5 m and 0.5 m. */
export function directionalWaveSpectrum(
  waveX: number,
  waveZ: number,
  windAngle: number,
  windSpeed: number,
  parameters: JonswapParameters,
) {
  const waveNumber = Math.hypot(waveX, waveZ);
  if (waveNumber === 0) return 0;
  const angle = Math.atan2(waveZ, waveX) - windAngle;
  const blend = Math.min(1, Math.max(0, (waveNumber - 2 * Math.PI / 1.5)
    / (2 * Math.PI / 0.5 - 2 * Math.PI / 1.5)));
  const weight = blend * blend * (3 - 2 * blend);
  let short = 0;
  if (weight > 0) {
    const { curvature, anisotropy } = shortWaveSpectrum(waveNumber, windSpeed, parameters);
    short = curvature * (1 + anisotropy * Math.cos(2 * angle)) / (2 * Math.PI * waveNumber ** 4);
  }
  if (weight === 1) return short;
  const frequency = Math.sqrt(GRAVITY * waveNumber);
  const exponent = spreadingExponent(frequency, parameters.peakFrequency, windSpeed);
  const long = jonswapSpectrum(frequency, parameters)
    * directionalSpreading(angle, exponent)
    * GRAVITY / (2 * frequency * waveNumber);
  return long * (1 - weight) + short * weight;
}

/** Integrate the unresolved tail of the same spectrum, in wind coordinates. */
export function unresolvedSlopeVariance(windSpeed: number, minimumWaveNumber: number): [number, number] {
  const variance: [number, number] = [0, 0];
  const parameters = getJonswapParameters(windSpeed);
  const steps = 256;
  const angleSteps = 32;
  const logarithmicStep = Math.log(CAPILLARY_WAVE_NUMBER * 10 / minimumWaveNumber) / steps;
  for (let sample = 0; sample < steps; sample += 1) {
    const waveNumber = minimumWaveNumber * Math.exp((sample + 0.5) * logarithmicStep);
    for (let sector = 0; sector < angleSteps; sector += 1) {
      const angle = (sector + 0.5) * 2 * Math.PI / angleSteps;
      const x = Math.cos(angle), z = Math.sin(angle);
      const energy = directionalWaveSpectrum(waveNumber * x, waveNumber * z, 0, windSpeed, parameters)
        * waveNumber ** 4 * logarithmicStep * 2 * Math.PI / angleSteps;
      variance[0] += energy * x * x;
      variance[1] += energy * z * z;
    }
  }
  return variance;
}

/**
 * Draw one Gaussian amplitude for every FFT mode of every cascade.
 *
 * Independent Gaussian amplitudes distribute the spectral energy across
 * the resolved modes (Tessendorf 2001).
 */
export function createOceanCascades(field: OceanWaveField, size: number): OceanCascades {
  const parameters = getJonswapParameters(field.windSpeed);
  const windAngle = Math.atan2(field.windDirection[1], field.windDirection[0]);
  const random = seededRandom((field.seed ^ 0x6a09e667) >>> 0);
  const bands = getCascadeBands(size);
  const width = size * OCEAN_CASCADE_COUNT;
  const amplitudes = new Float64Array(width * size * 2);
  const heightVariance: number[] = [];
  const slopeVariance: (readonly [number, number])[] = [];
  const radialBins = 64;
  const angleBins = 32;
  const filteredBands = new Float64Array(OCEAN_CASCADE_COUNT * radialBins * angleBins * 3);
  const radialVariance = new Float64Array(OCEAN_CASCADE_COUNT * radialBins * 3);

  OCEAN_CASCADE_LENGTHS.forEach((patchLength, cascade) => {
    const step = 2 * Math.PI / patchLength;
    const [low, high] = bands[cascade];
    let height = 0;
    let along = 0;
    let across = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const radius = Math.sqrt(-2 * Math.log(1 - random()));
        const angle = 2 * Math.PI * random();
        const waveX = modeNumber(column, size) * step;
        const waveZ = modeNumber(row, size) * step;
        const waveNumber = Math.hypot(waveX, waveZ);
        if (waveNumber < low || waveNumber >= high) continue;
        const variance = directionalWaveSpectrum(
          waveX, waveZ, windAngle, field.windSpeed, parameters,
        ) * step * step;
        // E|h0|² = variance / 2, so h0(k) and h0(−k) together carry the variance.
        const amplitude = radius * Math.sqrt(variance) / 2;
        const offset = (row * width + cascade * size + column) * 2;
        amplitudes[offset] = amplitude * Math.cos(angle);
        amplitudes[offset + 1] = amplitude * Math.sin(angle);
        const waveAlong = waveX * field.windDirection[0] + waveZ * field.windDirection[1];
        const waveAcross = -waveX * field.windDirection[1] + waveZ * field.windDirection[0];
        height += variance;
        along += variance * waveAlong * waveAlong;
        across += variance * waveAcross * waveAcross;
        const bin = Math.min(radialBins - 1, Math.floor(waveNumber / high * radialBins));
        const direction = ((Math.atan2(waveAcross, waveAlong) % Math.PI) + Math.PI) % Math.PI;
        const sector = Math.min(angleBins - 1, Math.floor(direction / Math.PI * angleBins));
        const bandOffset = ((cascade * radialBins + bin) * angleBins + sector) * 3;
        filteredBands[bandOffset] += variance * waveAlong * waveAlong;
        filteredBands[bandOffset + 1] += variance * waveAcross * waveAcross;
        filteredBands[bandOffset + 2] += variance * waveAlong * waveAcross;
        const radialOffset = (cascade * radialBins + bin) * 3;
        radialVariance[radialOffset] += variance * waveAlong * waveAlong;
        radialVariance[radialOffset + 1] += variance * waveAcross * waveAcross;
        radialVariance[radialOffset + 2] += variance * waveAlong * waveAcross;
      }
    }
    heightVariance.push(height);
    slopeVariance.push([along, across]);
  });

  const initial = new Float32Array(width * size * 4);
  for (let row = 0; row < size; row += 1) {
    const mirrorRow = (size - row) % size;
    for (let x = 0; x < width; x += 1) {
      const cascade = Math.floor(x / size);
      const mirrorColumn = (size - (x % size)) % size;
      const source = (row * width + x) * 2;
      const mirror = (mirrorRow * width + cascade * size + mirrorColumn) * 2;
      const target = (row * width + x) * 4;
      initial[target] = amplitudes[source];
      initial[target + 1] = amplitudes[source + 1];
      initial[target + 2] = amplitudes[mirror];
      initial[target + 3] = -amplitudes[mirror + 1];
    }
  }

  const unresolved = unresolvedSlopeVariance(field.windSpeed, bands[bands.length - 1][1]);
  let swellEnergy = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    swellEnergy += field.data[index * 4 + 3] ** 2 / 2;
  }
  const filterVariance = new Float64Array(VARIANCE_TABLE_SIZE * VARIANCE_RATIO_SAMPLES * VARIANCE_ANGLE_SAMPLES * 4);
  const total = [unresolved[0], unresolved[1], 0];
  for (let offset = 0; offset < filteredBands.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) total[axis] += filteredBands[offset + axis];
  }
  const projections = Array.from({ length: VARIANCE_ANGLE_SAMPLES }, (_, angle) =>
    Array.from({ length: angleBins }, (_, sector) =>
      Math.cos((sector + 0.5) * Math.PI / angleBins - angle * Math.PI / VARIANCE_ANGLE_SAMPLES)));
  for (let ratioIndex = 0; ratioIndex < VARIANCE_RATIO_SAMPLES; ratioIndex += 1) {
    const ratio = 1 + ratioIndex * (OCEAN_MAX_ANISOTROPY - 1) / (VARIANCE_RATIO_SAMPLES - 1);
    for (let sample = 0; sample < VARIANCE_TABLE_SIZE; sample += 1) {
      const major = VARIANCE_MIN_FOOTPRINT
        * (VARIANCE_MAX_FOOTPRINT / VARIANCE_MIN_FOOTPRINT) ** (sample / (VARIANCE_TABLE_SIZE - 1));
      for (let angle = 0; angle < VARIANCE_ANGLE_SAMPLES; angle += 1) {
        const target = ((angle * VARIANCE_RATIO_SAMPLES + ratioIndex) * VARIANCE_TABLE_SIZE + sample) * 4;
        filterVariance.set(total, target);
      }
      for (let cascade = 0; cascade < OCEAN_CASCADE_COUNT; cascade += 1) {
        const kernel = cascadeFilterKernel(major, major / ratio, OCEAN_CASCADE_LENGTHS[cascade] / size);
        for (let bin = 0; bin < radialBins; bin += 1) {
          const radialOffset = (cascade * radialBins + bin) * 3;
          if (radialVariance[radialOffset] + radialVariance[radialOffset + 1] === 0) continue;
          const waveNumber = (bin + 0.5) / radialBins * bands[cascade][1];
          const base = cascadeFilterAmplitude(waveNumber, 0, kernel) ** 2;
          if (base < 1e-10) continue;
          for (let angle = 0; angle < VARIANCE_ANGLE_SAMPLES; angle += 1) {
            const target = ((angle * VARIANCE_RATIO_SAMPLES + ratioIndex) * VARIANCE_TABLE_SIZE + sample) * 4;
            if (kernel.step === 0) {
              filterVariance[target] -= radialVariance[radialOffset] * base;
              filterVariance[target + 1] -= radialVariance[radialOffset + 1] * base;
              filterVariance[target + 2] -= radialVariance[radialOffset + 2] * base;
              continue;
            }
            for (let sector = 0; sector < angleBins; sector += 1) {
              const offset = ((cascade * radialBins + bin) * angleBins + sector) * 3;
              if (filteredBands[offset] + filteredBands[offset + 1] === 0) continue;
              const cosine = Math.cos(waveNumber * projections[angle][sector] * kernel.step);
              const retained = base * 0.5 * (1 + cosine) * cosine * cosine;
              filterVariance[target] -= filteredBands[offset] * retained;
              filterVariance[target + 1] -= filteredBands[offset + 1] * retained;
              filterVariance[target + 2] -= filteredBands[offset + 2] * retained;
            }
          }
        }
      }
    }
  }

  return {
    bands,
    heightVariance,
    initial,
    significantWaveHeight: 4 * Math.sqrt(
      swellEnergy + heightVariance.reduce((sum, value) => sum + value, 0),
    ),
    size,
    slopeVariance,
    filterVariance: new Float32Array(filterVariance),
    unresolvedVariance: [unresolved[0], unresolved[1]],
  };
}

/**
 * Mirror the GLSL evolution pass for one texel.
 *
 * h(k, t) = h0(k) e^(−iωt) + conj(h0(−k)) e^(iωt), so the h0(k) term travels
 * along +k. The pass packs eight real fields into two complex pairs:
 * (Dx + i·h, Dz + i·∂h/∂x) and (∂h/∂z + i·∂Dx/∂x, ∂Dz/∂z + i·∂Dx/∂z).
 */
export function evolveSpectrumTexel(
  initial: Float32Array,
  size: number,
  x: number,
  y: number,
  time: number,
) {
  const packed = new Float64Array(8);
  const step = 2 * Math.PI / OCEAN_CASCADE_LENGTHS[Math.floor(x / size)];
  const waveX = modeNumber(x % size, size) * step;
  const waveZ = modeNumber(y, size) * step;
  const waveNumber = Math.hypot(waveX, waveZ);
  if (waveNumber === 0) return packed;
  const offset = (y * size * OCEAN_CASCADE_COUNT + x) * 4;
  const phase = quantizedFrequency(waveNumber) * (time % OCEAN_REPEAT_SECONDS);
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  const real = initial[offset] * cosine + initial[offset + 1] * sine
    + initial[offset + 2] * cosine - initial[offset + 3] * sine;
  const imaginary = initial[offset + 1] * cosine - initial[offset] * sine
    + initial[offset + 3] * cosine + initial[offset + 2] * sine;
  const unitX = waveX / waveNumber;
  const unitZ = waveZ / waveNumber;
  // i·s·h = (−s·Im h, s·Re h); A + iB = (Re A − Im B, Im A + Re B).
  const displacementX = [-unitX * imaginary, unitX * real];
  const displacementZ = [-unitZ * imaginary, unitZ * real];
  const slopeX = [-waveX * imaginary, waveX * real];
  const slopeZ = [-waveZ * imaginary, waveZ * real];
  const strainXX = [-waveX * unitX * real, -waveX * unitX * imaginary];
  const strainZZ = [-waveZ * unitZ * real, -waveZ * unitZ * imaginary];
  const strainXZ = [-waveX * unitZ * real, -waveX * unitZ * imaginary];
  packed.set([
    displacementX[0] - imaginary,
    displacementX[1] + real,
    displacementZ[0] - slopeX[1],
    displacementZ[1] + slopeX[0],
    slopeZ[0] - strainXX[1],
    slopeZ[1] + strainXX[0],
    strainZZ[0] - strainXZ[1],
    strainZZ[1] + strainXZ[0],
  ]);
  return packed;
}

/**
 * Mirror the GLSL Stockham radix-2 pass. Output `index` of a pass with
 * sub-transform length `stage` combines two inputs half a row apart.
 */
export function stockhamSource(index: number, stage: number, size: number) {
  const even = Math.floor(index / stage) * (stage / 2) + (index % (stage / 2));
  return {
    angle: 2 * Math.PI * (index % stage) / stage,
    even,
    odd: even + size / 2,
  };
}
