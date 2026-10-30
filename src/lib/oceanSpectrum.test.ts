import {
  CAPILLARY_WAVE_NUMBER,
  OCEAN_CASCADE_COUNT,
  OCEAN_CASCADE_LENGTHS,
  OCEAN_REPEAT_SECONDS,
  OCEAN_MAX_ANISOTROPY,
  VARIANCE_TABLE_SIZE,
  VARIANCE_RATIO_SAMPLES,
  VARIANCE_ANGLE_SAMPLES,
  VARIANCE_MIN_FOOTPRINT,
  VARIANCE_MAX_FOOTPRINT,
  cascadeFilterAmplitude,
  cascadeFilterKernel,
  oceanFilterFootprint,
  createOceanCascades,
  directionalWaveSpectrum,
  evolveSpectrumTexel,
  getCascadeBands,
  gravityCapillaryFrequency,
  modeNumber,
  quantizedFrequency,
  stockhamSource,
  shortWaveSpectrum,
  unresolvedSlopeVariance,
} from "./oceanSpectrum";
import {
  createOceanWaveField,
  directionalSpreading,
  getJonswapParameters,
  GRAVITY,
  jonswapSpectrum,
  seededRandom,
  spreadingExponent,
  windSeaHeightVariance,
} from "./oceanWaves";

describe("gravity-capillary waves", () => {
  it("retains long-wave speed and includes surface tension at centimeter scales", () => {
    expect(gravityCapillaryFrequency(0)).toBe(0);
    const long = 2 * Math.PI / 100;
    expect(gravityCapillaryFrequency(long) / Math.sqrt(GRAVITY * long)).toBeCloseTo(1, 7);
    expect(gravityCapillaryFrequency(CAPILLARY_WAVE_NUMBER) ** 2)
      .toBeCloseTo(2 * GRAVITY * CAPILLARY_WAVE_NUMBER, 8);
    const short = 2 * Math.PI / 0.03;
    expect(gravityCapillaryFrequency(short) / Math.sqrt(GRAVITY * short)).toBeGreaterThan(1.14);
  });

  it.each([0.06, 2, 30, 200, 500])("keeps the repeat period and frequency accuracy at k=%f", waveNumber => {
    const step = 2 * Math.PI / OCEAN_REPEAT_SECONDS;
    expect(Math.abs(quantizedFrequency(waveNumber) - gravityCapillaryFrequency(waveNumber)))
      .toBeLessThanOrEqual(step / 2);
    expect(quantizedFrequency(waveNumber) / step).toBeCloseTo(Math.round(quantizedFrequency(waveNumber) / step), 8);
  });

  it("preserves the long-wave spectrum", () => {
    const windSpeed = 7;
    const parameters = getJonswapParameters(windSpeed);
    const x = 0.4, z = 0.2, angle = 0.31;
    const k = Math.hypot(x, z), frequency = Math.sqrt(GRAVITY * k);
    const expected = jonswapSpectrum(frequency, parameters)
      * directionalSpreading(Math.atan2(z, x) - angle, spreadingExponent(frequency, parameters.peakFrequency, windSpeed))
      * GRAVITY / (2 * frequency * k);
    expect(directionalWaveSpectrum(x, z, angle, windSpeed, parameters)).toBe(expected);
  });

  it.each([5.8, 6.7, 7.6])("normalizes the short-wave directions at wind speed %f", windSpeed => {
    const parameters = getJonswapParameters(windSpeed);
    const k = CAPILLARY_WAVE_NUMBER;
    const { curvature, anisotropy } = shortWaveSpectrum(k, windSpeed, parameters);
    expect(curvature).toBeGreaterThan(0);
    expect(anisotropy).toBeGreaterThan(0);
    expect(anisotropy).toBeLessThan(1);
    let integral = 0;
    for (let sector = 0; sector < 256; sector += 1) {
      const angle = 2 * Math.PI * (sector + 0.5) / 256;
      integral += directionalWaveSpectrum(k * Math.cos(angle), k * Math.sin(angle), 0, windSpeed, parameters)
        * k ** 4 * 2 * Math.PI / 256;
    }
    expect(integral / curvature).toBeCloseTo(1, 12);
    expect(shortWaveSpectrum(k * 10, windSpeed, parameters).curvature).toBeLessThan(curvature * 1e-8);
  });

  it.each([2 * Math.PI / 1.5, 2 * Math.PI / 0.5])("has no discontinuity at k=%f", boundary => {
    const parameters = getJonswapParameters(7);
    const lower = directionalWaveSpectrum(boundary * (1 - 1e-7), 0, 0, 7, parameters);
    const upper = directionalWaveSpectrum(boundary * (1 + 1e-7), 0, 0, 7, parameters);
    expect(Math.abs(lower / upper - 1)).toBeLessThan(1e-5);
  });

  it("matches a dense tail integral with analytic angular moments", () => {
    const windSpeed = 7;
    const parameters = getJonswapParameters(windSpeed);
    for (const minimum of [102, 204]) {
      const expected = [0, 0];
      const step = Math.log(CAPILLARY_WAVE_NUMBER * 10 / minimum) / 4096;
      for (let sample = 0; sample < 4096; sample += 1) {
        const { curvature, anisotropy } = shortWaveSpectrum(minimum * Math.exp((sample + 0.5) * step), windSpeed, parameters);
        expected[0] += curvature * (0.5 + anisotropy / 4) * step;
        expected[1] += curvature * (0.5 - anisotropy / 4) * step;
      }
      unresolvedSlopeVariance(windSpeed, minimum).forEach((value, axis) => {
        expect(Math.abs(value / expected[axis] - 1)).toBeLessThan(2e-5);
      });
    }
  });
});

function inverseFft(input: Float64Array) {
  const size = input.length / 2;
  let current = input;
  for (let stage = 2; stage <= size; stage *= 2) {
    const next = new Float64Array(input.length);
    for (let index = 0; index < size; index += 1) {
      const { even, odd, angle } = stockhamSource(index, stage, size);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      next[index * 2] = current[even * 2]
        + current[odd * 2] * cosine - current[odd * 2 + 1] * sine;
      next[index * 2 + 1] = current[even * 2 + 1]
        + current[odd * 2] * sine + current[odd * 2 + 1] * cosine;
    }
    current = next;
  }
  return current;
}

function inverseDft(input: Float64Array) {
  const size = input.length / 2;
  const result = new Float64Array(input.length);
  for (let index = 0; index < size; index += 1) {
    for (let mode = 0; mode < size; mode += 1) {
      const angle = 2 * Math.PI * index * mode / size;
      result[index * 2] += input[mode * 2] * Math.cos(angle) - input[mode * 2 + 1] * Math.sin(angle);
      result[index * 2 + 1] += input[mode * 2] * Math.sin(angle) + input[mode * 2 + 1] * Math.cos(angle);
    }
  }
  return result;
}

function spatialFields(initial: Float32Array, size: number, cascade: number, time: number) {
  const result = new Float64Array(size * size * 8);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      result.set(evolveSpectrumTexel(initial, size, cascade * size + x, y, time), (y * size + x) * 8);
    }
  }
  for (let axis = 0; axis < 2; axis += 1) {
    for (let row = 0; row < size; row += 1) {
      for (let pair = 0; pair < 4; pair += 1) {
        const input = new Float64Array(size * 2);
        for (let index = 0; index < size; index += 1) {
          const pixel = axis === 0 ? row * size + index : index * size + row;
          input.set(result.subarray(pixel * 8 + pair * 2, pixel * 8 + pair * 2 + 2), index * 2);
        }
        const output = inverseFft(input);
        for (let index = 0; index < size; index += 1) {
          const pixel = axis === 0 ? row * size + index : index * size + row;
          result.set(output.subarray(index * 2, index * 2 + 2), pixel * 8 + pair * 2);
        }
      }
    }
  }
  return result;
}

describe("Stockham inverse FFT", () => {
  it.each([8, 16, 32, 128, 256])("matches an independent DFT for %i samples", size => {
    const random = seededRandom(size);
    const input = Float64Array.from({ length: size * 2 }, () => random() * 2 - 1);
    const expected = inverseDft(input);
    inverseFft(input).forEach((value, index) => expect(value).toBeCloseTo(expected[index], 9));
  });

  it.each([0, 7.25, OCEAN_REPEAT_SECONDS + 7.25])("preserves all eight plane-wave fields at t=%f", time => {
    const size = 16;
    const cascade = 1;
    const width = size * OCEAN_CASCADE_COUNT;
    const initial = new Float32Array(width * size * 4);
    const amplitude = 0.24;
    const phase = 0.63;
    const modeX = 3;
    const modeZ = 2;
    const positive = (modeZ * width + cascade * size + modeX) * 4;
    const negative = ((size - modeZ) * width + cascade * size + size - modeX) * 4;
    initial[positive] = amplitude * Math.cos(phase) / 2;
    initial[positive + 1] = amplitude * Math.sin(phase) / 2;
    initial[negative + 2] = initial[positive];
    initial[negative + 3] = -initial[positive + 1];
    const waveX = modeX * 2 * Math.PI / OCEAN_CASCADE_LENGTHS[cascade];
    const waveZ = modeZ * 2 * Math.PI / OCEAN_CASCADE_LENGTHS[cascade];
    const magnitude = Math.hypot(waveX, waveZ);
    const fields = spatialFields(initial, size, cascade, time);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const angle = 2 * Math.PI * (modeX * x + modeZ * y) / size
          - quantizedFrequency(magnitude) * time + phase;
        const height = amplitude * Math.cos(angle);
        const derivative = -amplitude * Math.sin(angle);
        const expected = [
          derivative * waveX / magnitude, height, derivative * waveZ / magnitude,
          derivative * waveX, derivative * waveZ, -waveX * waveX / magnitude * height,
          -waveZ * waveZ / magnitude * height, -waveX * waveZ / magnitude * height,
        ];
        expected.forEach((value, channel) => {
          expect(fields[(y * size + x) * 8 + channel]).toBeCloseTo(value, 7);
        });
      }
    }
  });
});

describe("cascade spectrum", () => {
  const field = createOceanWaveField(4603);
  const full = createOceanCascades(field, 256);
  const reduced = createOceanCascades(field, 128);

  it("reproduces one seed and changes the surface for another seed", () => {
    const initial = createOceanCascades(field, 32).initial;
    expect(createOceanCascades(field, 32).initial).toEqual(initial);
    expect(createOceanCascades(createOceanWaveField(99), 32).initial).not.toEqual(initial);
  });

  it.each([128, 256])("partitions wave bands without overlap at resolution %i", size => {
    const bands = getCascadeBands(size);
    bands.forEach(([low, high], cascade) => {
      expect(low).toBeLessThan(high);
      expect(high).toBeLessThanOrEqual(2 * Math.PI * size / (4 * OCEAN_CASCADE_LENGTHS[cascade]));
      if (cascade > 0) expect(low).toBe(bands[cascade - 1][1]);
    });
  });

  it.each([128, 256])("resolves foreground ripples below seven centimeters at resolution %i", size => {
    const bands = getCascadeBands(size);
    const last = bands[bands.length - 1];
    expect(2 * Math.PI / last[1]).toBeLessThan(0.07);
    expect(OCEAN_CASCADE_COUNT).toBe(OCEAN_CASCADE_LENGTHS.length);
  });

  it.each([full, reduced])("packs conjugate pairs and excludes unresolved modes at $size", spectrum => {
    const { size, initial, bands } = spectrum;
    const width = size * OCEAN_CASCADE_COUNT;
    let active = 0;
    let conjugateError = 0;
    let invalidModes = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cascade = Math.floor(x / size);
        const index = (y * width + x) * 4;
        const mirror = (((size - y) % size) * width + cascade * size + (size - x % size) % size) * 4;
        conjugateError = Math.max(conjugateError,
          Math.abs(initial[index + 2] - initial[mirror]),
          Math.abs(initial[index + 3] + initial[mirror + 1]));
        if (initial[index] === 0 && initial[index + 1] === 0) continue;
        active += 1;
        const magnitude = Math.hypot(modeNumber(x % size, size), modeNumber(y, size))
          * 2 * Math.PI / OCEAN_CASCADE_LENGTHS[cascade];
        if (magnitude < bands[cascade][0] || magnitude >= bands[cascade][1]) invalidModes += 1;
      }
    }
    expect(active).toBeGreaterThan(size * 20);
    expect(conjugateError).toBe(0);
    expect(invalidModes).toBe(0);
  });

  it("matches integrated wind-sea height and preserves energy across quality profiles", () => {
    const expected = windSeaHeightVariance(field.windSpeed);
    const fullHeight = full.heightVariance.reduce((sum, variance) => sum + variance, 0);
    const reducedHeight = reduced.heightVariance.reduce((sum, variance) => sum + variance, 0);
    expect(fullHeight / expected).toBeCloseTo(1, 1);
    expect(reducedHeight / fullHeight).toBeCloseTo(1, 1);
    expect(full.significantWaveHeight).toBeGreaterThan(0.6);
    expect(full.significantWaveHeight).toBeLessThan(1.7);
  });

  it.each([full, reduced])("moves removed slope energy into roughness at $size", spectrum => {
    for (let axis = 0; axis < 2; axis += 1) {
      const total = spectrum.unresolvedVariance[axis]
        + spectrum.slopeVariance.reduce((sum, band) => sum + band[axis], 0);
      expect(spectrum.filterVariance[axis]).toBeGreaterThan(spectrum.unresolvedVariance[axis]);
      for (let sample = 1; sample < VARIANCE_TABLE_SIZE; sample += 1) {
        expect(spectrum.filterVariance[sample * 4 + axis])
          .toBeGreaterThanOrEqual(spectrum.filterVariance[(sample - 1) * 4 + axis] - 1e-7);
      }
      expect(spectrum.filterVariance[(VARIANCE_TABLE_SIZE - 1) * 4 + axis]).toBeCloseTo(total, 5);
    }
  });

  it("transfers the unresolved short-wave tail between quality profiles", () => {
    for (let axis = 0; axis < 2; axis += 1) {
      expect(reduced.unresolvedVariance[axis]).toBeGreaterThan(full.unresolvedVariance[axis]);
      const fullTotal = full.unresolvedVariance[axis] + full.slopeVariance.reduce((sum, band) => sum + band[axis], 0);
      const reducedTotal = reduced.unresolvedVariance[axis] + reduced.slopeVariance.reduce((sum, band) => sum + band[axis], 0);
      expect(Math.abs(fullTotal / reducedTotal - 1)).toBeLessThan(0.03);
    }
  });

  it.each([full, reduced])("keeps every directional covariance finite and positive at $size", spectrum => {
    expect(spectrum.filterVariance.length)
      .toBe(VARIANCE_TABLE_SIZE * VARIANCE_RATIO_SAMPLES * VARIANCE_ANGLE_SAMPLES * 4);
    const totals = spectrum.unresolvedVariance.map((tail, axis) =>
      tail + spectrum.slopeVariance.reduce((sum, band) => sum + band[axis], 0));
    for (let offset = 0; offset < spectrum.filterVariance.length; offset += 4) {
      const [a, c, b] = spectrum.filterVariance.subarray(offset, offset + 3);
      expect(Number.isFinite(a + b + c)).toBe(true);
      expect(a * c - b * b).toBeGreaterThan(0);
      expect(a).toBeGreaterThanOrEqual(spectrum.unresolvedVariance[0] - 1e-6);
      expect(c).toBeGreaterThanOrEqual(spectrum.unresolvedVariance[1] - 1e-6);
      expect(a).toBeLessThanOrEqual(totals[0] + 1e-6);
      expect(c).toBeLessThanOrEqual(totals[1] + 1e-6);
    }
  });

  it.each([[40, 0, 0], [40, 6, 5], [60, 3, 15], [70, 6, 7], [45.3, 4.1, 15.7], [56.8, 2.6, -0.2]])(
    "matches a direct mode integral at footprint %f, ratio %f, angle %f", (sample, ratioIndex, angleIndex) => {
      const major = VARIANCE_MIN_FOOTPRINT
        * (VARIANCE_MAX_FOOTPRINT / VARIANCE_MIN_FOOTPRINT) ** (sample / (VARIANCE_TABLE_SIZE - 1));
      const ratio = 1 + ratioIndex * (OCEAN_MAX_ANISOTROPY - 1) / (VARIANCE_RATIO_SAMPLES - 1);
      const angle = angleIndex * Math.PI / VARIANCE_ANGLE_SAMPLES;
      const windAngle = Math.atan2(field.windDirection[1], field.windDirection[0]);
      const parameters = getJonswapParameters(field.windSpeed);
      const expected = [...full.unresolvedVariance, 0];
      OCEAN_CASCADE_LENGTHS.forEach((length, cascade) => {
        const step = 2 * Math.PI / length;
        const texel = length / full.size;
        const lod = Math.max(Math.log2(major / ratio / texel), 0);
        const span = texel * 2 ** Math.floor(lod);
        const width = (span * span - texel * texel) / 4 + span * span / (lod < 1 ? 3 : 6);
        const nextWidth = (4 * span * span - texel * texel) / 4 + 4 * span * span / 6;
        const spacing = Math.sqrt(Math.max(major * major - Math.max(major / ratio, texel) ** 2, 0)) / 4;
        for (let row = 0; row < full.size; row += 1) {
          for (let column = 0; column < full.size; column += 1) {
            const x = modeNumber(column, full.size) * step, z = modeNumber(row, full.size) * step;
            const k = Math.hypot(x, z);
            if (k < full.bands[cascade][0] || k >= full.bands[cascade][1]) continue;
            const energy = directionalWaveSpectrum(x, z, windAngle, field.windSpeed, parameters) * step * step;
            const along = x * field.windDirection[0] + z * field.windDirection[1];
            const across = -x * field.windDirection[1] + z * field.windDirection[0];
            const phase = (along * Math.cos(angle) + across * Math.sin(angle)) * spacing;
            const taps = [-1.5, -0.5, 0.5, 1.5].reduce((sum, offset) => sum + Math.cos(offset * phase), 0) / 4;
            const base = (1 - lod % 1) * Math.exp(-0.5 * k * k * width)
              + lod % 1 * Math.exp(-0.5 * k * k * nextWidth);
            const removed = energy * (1 - (base * taps) ** 2);
            expected[0] += along * along * removed;
            expected[1] += across * across * removed;
            expected[2] += along * across * removed;
          }
        }
      });
      const actual = [0, 0, 0];
      for (let dz = 0; dz < 2; dz += 1) {
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const x = Math.min(Math.floor(sample) + dx, VARIANCE_TABLE_SIZE - 1);
            const y = Math.min(Math.floor(ratioIndex) + dy, VARIANCE_RATIO_SAMPLES - 1);
            const z = (Math.floor(angleIndex) + dz + VARIANCE_ANGLE_SAMPLES) % VARIANCE_ANGLE_SAMPLES;
            const fraction = [sample - Math.floor(sample), ratioIndex - Math.floor(ratioIndex), angleIndex - Math.floor(angleIndex)];
            const weight = (dx ? fraction[0] : 1 - fraction[0])
              * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
            const offset = ((z * VARIANCE_RATIO_SAMPLES + y) * VARIANCE_TABLE_SIZE + x) * 4;
            actual.forEach((_, axis) => { actual[axis] += full.filterVariance[offset + axis] * weight; });
          }
        }
      }
      expected.forEach((value, axis) => {
        expect(Math.abs(actual[axis] - value)).toBeLessThan(0.00006);
      });
    },
  );
});

describe("directional wave filter", () => {
  it("preserves detail across a stretched horizon footprint", () => {
    const { major, minor, direction } = oceanFilterFootprint([0.1, 0], [0, 1.2]);
    expect(major).toBeCloseTo(1.2);
    expect(minor).toBeCloseTo(0.3);
    expect(direction[0]).toBeCloseTo(0);
    expect(direction[1]).toBeCloseTo(1);
    const directional = cascadeFilterKernel(major, minor, 0.02);
    const isotropic = cascadeFilterKernel(major, major, 0.02);
    expect(cascadeFilterAmplitude(4, 0, directional))
      .toBeGreaterThan(cascadeFilterAmplitude(4, 0, isotropic) * 10);
    expect(Math.abs(cascadeFilterAmplitude(2 * Math.PI / major, 2 * Math.PI / major, directional)))
      .toBeLessThan(0.05);
  });

  it.each([
    [[0.1, 0], [0, 0.1]],
    [[0.1, 0.04], [0.5, 1.2]],
    [[0, 0], [0, 0]],
    [[2, 2], [2, 2]],
  ])("handles square, sheared, and degenerate footprints %j %j", (dx, dy) => {
    const footprint = oceanFilterFootprint(dx, dy);
    const swapped = oceanFilterFootprint(dy, dx);
    expect(footprint.major).toBeCloseTo(swapped.major);
    expect(footprint.minor).toBeCloseTo(swapped.minor);
    expect(footprint.major / footprint.minor).toBeLessThanOrEqual(OCEAN_MAX_ANISOTROPY);
    expect(footprint.major).toBeGreaterThanOrEqual(footprint.minor);
    expect(Math.hypot(...footprint.direction)).toBeCloseTo(1);
    const [x, y] = footprint.direction;
    const a = dx[0] ** 2 + dy[0] ** 2, b = dx[0] * dx[1] + dy[0] * dy[1];
    const c = dx[1] ** 2 + dy[1] ** 2;
    expect(a * x + b * y).toBeCloseTo(footprint.major ** 2 * x);
    expect(b * x + c * y).toBeCloseTo(footprint.major ** 2 * y);
  });

  it("retains the original cubic reconstruction below a texel", () => {
    const kernel = cascadeFilterKernel(0.01, 0.003, 0.1);
    expect(kernel.step).toBe(0);
    expect(kernel.blend).toBe(0);
    expect(kernel.width).toBeCloseTo(0.1 ** 2 / 3);
    expect(cascadeFilterAmplitude(3, 3, kernel)).toBe(cascadeFilterAmplitude(3, 0, kernel));
  });

  it.each([1, 2, 3])("has no filter jump at mip level %i", level => {
    const minor = 0.1 * 2 ** level;
    const before = cascadeFilterKernel(4 * minor * (1 - 1e-7), minor * (1 - 1e-7), 0.1);
    const after = cascadeFilterKernel(4 * minor * (1 + 1e-7), minor * (1 + 1e-7), 0.1);
    expect(cascadeFilterAmplitude(1, 0.3, before)).toBeCloseTo(cascadeFilterAmplitude(1, 0.3, after), 6);
  });

  it.each([0, 0.1, 1, 3, 10, 100])("matches the four-sample response at phase %f", phase => {
    const kernel = cascadeFilterKernel(1, 0.25, 0.01);
    const projection = phase / kernel.step;
    const expected = [-1.5, -0.5, 0.5, 1.5].reduce((sum, offset) => sum + Math.cos(offset * phase), 0) / 4;
    expect(cascadeFilterAmplitude(1, projection, kernel) / cascadeFilterAmplitude(1, 0, kernel))
      .toBeCloseTo(expected, 12);
  });
});

describe("directional spread", () => {
  it.each([1, 4, 16, 64])("integrates to one for exponent %i", exponent => {
    const steps = 4096;
    let integral = 0;
    for (let index = 0; index < steps; index += 1) {
      integral += directionalSpreading((index + 0.5) / steps * 2 * Math.PI - Math.PI, exponent)
        * 2 * Math.PI / steps;
    }
    expect(integral).toBeCloseTo(1, 9);
    expect(directionalSpreading(0, exponent)).toBeGreaterThan(directionalSpreading(Math.PI / 2, exponent));
  });
});

describe("wave filters", () => {
  function cubicWeights(t: number) {
    return [
      (1 - 3 * t + 3 * t * t - t ** 3) / 6,
      (4 - 6 * t * t + 3 * t ** 3) / 6,
      (1 + 3 * t + 3 * t * t - 3 * t ** 3) / 6,
      t ** 3 / 6,
    ];
  }

  it("keeps the cubic filter width constant across a texture cell", () => {
    for (let sample = 0; sample <= 100; sample += 1) {
      const fraction = sample / 100;
      const weights = cubicWeights(fraction);
      const mean = weights.reduce((sum, weight, index) => sum + weight * (index - 1), 0);
      const variance = weights.reduce((sum, weight, index) => sum + weight * (index - 1 - fraction) ** 2, 0);
      expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      expect(mean).toBeCloseTo(fraction, 12);
      expect(variance).toBeCloseTo(1 / 3, 12);
    }
  });

  it("matches sixteen cubic taps with four bilinear taps", () => {
    const values = [0.1, -0.3, 0.7, 0.8, -0.6, 0.2, 0.3, -0.7,
      -0.2, 0.5, -0.5, 0.1, 0.8, -0.3, -0.1, 0.6];
    const bilinear = (x: number, y: number) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      return (values[iy * 4 + ix] * (1 - fx) + values[iy * 4 + ix + 1] * fx) * (1 - fy)
        + (values[(iy + 1) * 4 + ix] * (1 - fx) + values[(iy + 1) * 4 + ix + 1] * fx) * fy;
    };
    for (const [x, y] of [[0.02, 0.07], [0.29, 0.84], [0.5, 0.5], [0.97, 0.91]]) {
      const wx = cubicWeights(x);
      const wy = cubicWeights(y);
      let direct = 0;
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) direct += values[row * 4 + column] * wx[column] * wy[row];
      }
      const gx = [wx[0] + wx[1], wx[2] + wx[3]];
      const gy = [wy[0] + wy[1], wy[2] + wy[3]];
      const px = [wx[1] / gx[0], 2 + wx[3] / gx[1]];
      const py = [wy[1] / gy[0], 2 + wy[3] / gy[1]];
      const optimized = gx[0] * gy[0] * bilinear(px[0], py[0])
        + gx[1] * gy[0] * bilinear(px[1], py[0])
        + gx[0] * gy[1] * bilinear(px[0], py[1])
        + gx[1] * gy[1] * bilinear(px[1], py[1]);
      expect(optimized).toBeCloseTo(direct, 12);
    }
  });

  it("suppresses the alias band before each mip reduction", () => {
    const weights = [1 / 8, 3 / 8, 3 / 8, 1 / 8];
    for (const frequency of [Math.PI / 2, 0.7 * Math.PI, 0.9 * Math.PI, Math.PI]) {
      let real = 0;
      let imaginary = 0;
      weights.forEach((weight, index) => {
        real += weight * Math.cos(frequency * index);
        imaginary += weight * Math.sin(frequency * index);
      });
      const amplitude = Math.hypot(real, imaginary);
      const boxAmplitude = Math.abs(Math.cos(frequency / 2));
      expect(amplitude).toBeCloseTo(boxAmplitude ** 3, 12);
      expect(amplitude).toBeLessThanOrEqual(boxAmplitude * 0.501 + 1e-12);
    }
  });
});
