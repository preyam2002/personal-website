import { getCelestialState, getSolarPosition } from "./celestial";
import {
  GRAVITY,
  DISTANT_CREST_NOISE_SIZE,
  OCEAN_WAVE_COMPONENT_COUNT,
  createDistantCrestNoise,
  createOceanWaveField,
  describeSeaState,
  getDisplaySunDirection,
  getMoonPhaseLight,
  getSceneSunDirection,
  getStarFieldTransform,
  getSunAzimuthScale,
  rotateAboutY,
  seededRandom,
} from "./oceanWaves";

describe("createDistantCrestNoise", () => {
  it("produces a stable, seed-specific RGBA texture", () => {
    const first = createDistantCrestNoise(4603);
    const again = createDistantCrestNoise(4603);
    const other = createDistantCrestNoise(99);

    expect(first).toHaveLength(DISTANT_CREST_NOISE_SIZE ** 2 * 4);
    expect(first).toEqual(again);
    expect(first).not.toEqual(other);
    for (let index = 3; index < first.length; index += 4) {
      expect(first[index]).toBe(255);
    }
  });

  it("stores gradients that follow the value channel", () => {
    const pixels = createDistantCrestNoise(4603);
    const size = DISTANT_CREST_NOISE_SIZE;
    const offset = (x: number, y: number) => (y * size + x) * 4;
    for (const [x, y] of [[101, 201], [257, 347], [409, 93]]) {
      const center = offset(x, y);
      const dx = (pixels[offset(x + 1, y)] - pixels[offset(x - 1, y)]) / 255 / 0.5;
      const dy = (pixels[offset(x, y + 1)] - pixels[offset(x, y - 1)]) / 255 / 0.5;
      expect(Math.abs((pixels[center + 1] / 255 * 2 - 1) * 1.5 - dx)).toBeLessThan(0.12);
      expect(Math.abs((pixels[center + 2] / 255 * 2 - 1) * 1.5 - dy)).toBeLessThan(0.12);
    }
  });
});

const LATITUDE = 15.2;
const LONGITUDE = 73.7;

function vectorLength(vector: readonly [number, number, number]) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function transformDirection(
  matrix: ReturnType<typeof getStarFieldTransform>,
  direction: readonly [number, number, number],
) {
  return [
    matrix[0] * direction[0] + matrix[3] * direction[1] + matrix[6] * direction[2],
    matrix[1] * direction[0] + matrix[4] * direction[1] + matrix[7] * direction[2],
    matrix[2] * direction[0] + matrix[5] * direction[1] + matrix[8] * direction[2],
  ] as const;
}

describe("createOceanWaveField", () => {
  const field = createOceanWaveField(4603);

  it("is deterministic for one seed", () => {
    const again = createOceanWaveField(4603);
    expect(Array.from(again.data)).toEqual(Array.from(field.data));
    expect(Array.from(again.phases)).toEqual(Array.from(field.phases));
    expect(again.windSpeed).toBe(field.windSpeed);
  });

  it("changes with the seed", () => {
    const other = createOceanWaveField(99);
    expect(Array.from(other.data)).not.toEqual(Array.from(field.data));
  });

  it("packs the swell components with deep-water dispersion", () => {
    expect(field.data).toHaveLength(OCEAN_WAVE_COMPONENT_COUNT * 4);
    expect(field.phases).toHaveLength(OCEAN_WAVE_COMPONENT_COUNT);

    for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
      const waveNumber = Math.hypot(field.data[index * 4], field.data[index * 4 + 1]);
      const angularFrequency = field.data[index * 4 + 2];
      const amplitude = field.data[index * 4 + 3];
      expect(angularFrequency).toBeCloseTo(Math.sqrt(GRAVITY * waveNumber), 5);
      expect(amplitude).toBeGreaterThan(0);
      expect(amplitude * waveNumber).toBeLessThan(0.08);
      expect(field.phases[index]).toBeGreaterThanOrEqual(0);
      expect(field.phases[index]).toBeLessThan(Math.PI * 2);
    }
  });

  it("keeps the swell group long and nearly aligned", () => {
    const wavelengths: number[] = [];
    const angles: number[] = [];
    for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
      const waveX = field.data[index * 4];
      const waveZ = field.data[index * 4 + 1];
      wavelengths.push((2 * Math.PI) / Math.hypot(waveX, waveZ));
      angles.push(Math.atan2(waveZ, waveX));
    }
    expect(wavelengths[0]).toBeGreaterThanOrEqual(84);
    expect(wavelengths[0]).toBeLessThanOrEqual(112);
    expect(wavelengths[1]).toBeLessThan(wavelengths[0]);
    expect(wavelengths[2]).toBeLessThan(wavelengths[1]);
    expect(wavelengths[2]).toBeGreaterThan(wavelengths[0] * 0.5);
    for (const angle of angles) {
      const delta = Math.atan2(
        Math.sin(angle - angles[0]),
        Math.cos(angle - angles[0]),
      );
      expect(Math.abs(delta)).toBeLessThan(0.2);
    }
  });

  it("produces a moderate sea state", () => {
    const state = describeSeaState(field);
    expect(state.windSpeed).toBeGreaterThanOrEqual(5.8);
    expect(state.windSpeed).toBeLessThanOrEqual(7.6);
    expect(state.significantWaveHeight).toBeGreaterThan(0.58);
    expect(state.significantWaveHeight).toBeLessThan(1.7);
    expect(state.swellPeriod).toBeGreaterThan(7.2);
    expect(state.swellPeriod).toBeLessThan(8.6);
    expect(state.cloudCover).toBeGreaterThan(0.2);
    expect(state.cloudCover).toBeLessThan(0.6);
    expect(vectorLength([...field.windDirection, 0])).toBeCloseTo(1, 6);
  });

  it.each([17321, 4603, 99, 248, 301])("keeps the displacement below the fold limit for seed %i", (seed) => {
    const waves = createOceanWaveField(seed);
    let maximumSlope = 0;
    for (let offset = 0; offset < waves.data.length; offset += 4) {
      maximumSlope += Math.hypot(waves.data[offset], waves.data[offset + 1]) * waves.data[offset + 3];
    }
    expect(maximumSlope * waves.choppiness).toBeLessThan(1);
  });
});

describe("seededRandom", () => {
  it("stays inside the unit interval", () => {
    const random = seededRandom(12);
    for (let sample = 0; sample < 1000; sample += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("sun mapping", () => {
  const morning = getSolarPosition(
    new Date(2026, 8, 2, 8, 0),
    LATITUDE,
    LONGITUDE,
  );
  const noon = getSolarPosition(
    new Date(2026, 8, 2, 12, 30),
    LATITUDE,
    LONGITUDE,
  );
  const evening = getSolarPosition(
    new Date(2026, 8, 2, 17, 30),
    LATITUDE,
    LONGITUDE,
  );
  const scale = getSunAzimuthScale(16 / 10, 2.7);

  it("keeps the display disc inside the narrow sky band", () => {
    for (const sun of [morning, noon, evening]) {
      const direction = getDisplaySunDirection(sun, scale);
      const elevation = Math.asin(direction[1]);
      expect(vectorLength(direction)).toBeCloseTo(1, 6);
      expect(elevation).toBeGreaterThan((0.7 * Math.PI) / 180);
      expect(elevation).toBeLessThan((4.6 * Math.PI) / 180);
    }
  });

  it("moves the display disc from left to right through the day", () => {
    const left = getDisplaySunDirection(morning, scale);
    const middle = getDisplaySunDirection(noon, scale);
    const right = getDisplaySunDirection(evening, scale);
    expect(left[0]).toBeLessThan(middle[0]);
    expect(middle[0]).toBeLessThan(right[0]);
    expect(middle[1]).toBeGreaterThan(left[1]);
    expect(middle[1]).toBeGreaterThan(right[1]);
  });

  it("keeps the physical elevation for the scene sun", () => {
    for (const sun of [morning, noon, evening]) {
      const direction = getSceneSunDirection(sun, scale);
      expect(vectorLength(direction)).toBeCloseTo(1, 6);
      expect(Math.asin(direction[1])).toBeCloseTo(sun.elevation, 6);
    }
    const display = getDisplaySunDirection(noon, scale);
    const scene = getSceneSunDirection(noon, scale);
    expect(Math.atan2(display[0], display[2])).toBeCloseTo(
      Math.atan2(scene[0], scene[2]),
      6,
    );
  });

  it("uses a tighter azimuth arc on a narrow canvas", () => {
    const wide = getSunAzimuthScale(16 / 10, 2.7);
    const narrow = getSunAzimuthScale(9 / 19.5, 2.7);
    expect(wide).toBeLessThanOrEqual(0.32);
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeGreaterThan(0.05);
    for (const [aspect, azimuthScale] of [[16 / 10, wide], [9 / 19.5, narrow]]) {
      const halfFov = Math.atan(aspect / 2.7);
      for (const sun of [morning, evening]) {
        const edge = getDisplaySunDirection(sun, azimuthScale);
        expect(Math.abs(Math.atan2(edge[0], edge[2]))).toBeLessThan(halfFov);
      }
    }
  });
});

describe("rotateAboutY", () => {
  it("adds the angle to the azimuth and keeps the elevation", () => {
    const azimuth = 0.4;
    const elevation = 0.3;
    const direction = [
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    ] as const;
    const rotated = rotateAboutY(direction, 0.25);
    expect(rotated[0]).toBeCloseTo(Math.sin(azimuth + 0.25) * Math.cos(elevation), 9);
    expect(rotated[1]).toBeCloseTo(direction[1], 12);
    expect(rotated[2]).toBeCloseTo(Math.cos(azimuth + 0.25) * Math.cos(elevation), 9);
    expect(vectorLength(rotated)).toBeCloseTo(1, 9);
  });
});

describe("getMoonPhaseLight", () => {
  it("keeps an almost full moon lit after the sky remap", () => {
    const state = getCelestialState(
      new Date("2026-10-26T17:00:00Z"), LATITUDE, LONGITUDE,
    );
    const light = getMoonPhaseLight(state.sun, state.moon);
    let inside = 0;
    let lit = 0;
    const size = 200;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const x = (column + 0.5) * 2 / size - 1;
        const y = (row + 0.5) * 2 / size - 1;
        const radiusSquared = x * x + y * y;
        if (radiusSquared >= 1) continue;
        inside += 1;
        const sunlight = x * light[0] + y * light[1]
          - Math.sqrt(1 - radiusSquared) * light[2];
        if (sunlight > 0) lit += 1;
      }
    }

    expect(state.moonIllumination).toBeGreaterThan(0.99);
    expect(Math.abs(lit / inside - state.moonIllumination)).toBeLessThan(0.001);
  });

  it("preserves every phase across a lunar cycle", () => {
    for (let day = 1; day <= 31; day += 1) {
      const state = getCelestialState(
        new Date(Date.UTC(2026, 9, day, 17)), LATITUDE, LONGITUDE,
      );
      const light = getMoonPhaseLight(state.sun, state.moon);

      expect(vectorLength(light)).toBeCloseTo(1, 12);
      expect((1 - light[2]) / 2).toBeCloseTo(state.moonIllumination, 12);
    }
  });
});

describe("getStarFieldTransform", () => {
  it("returns the identity at a zero sidereal angle", () => {
    const matrix = getStarFieldTransform(0, LATITUDE);
    const identity = [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ];

    matrix.forEach((value, index) => {
      expect(value).toBeCloseTo(identity[index], 12);
    });
  });

  it("keeps the north celestial pole fixed", () => {
    const latitude = LATITUDE * Math.PI / 180;
    const pole = [0, Math.sin(latitude), -Math.cos(latitude)] as const;
    const transformed = transformDirection(
      getStarFieldTransform(1.7, LATITUDE),
      pole,
    );

    expect(transformed[0]).toBeCloseTo(pole[0], 12);
    expect(transformed[1]).toBeCloseTo(pole[1], 12);
    expect(transformed[2]).toBeCloseTo(pole[2], 12);
  });

  it("moves a star from the east horizon to the zenith at the equator", () => {
    const transformed = transformDirection(
      getStarFieldTransform(Math.PI / 2, 0),
      [0, 1, 0],
    );

    expect(transformed[0]).toBeCloseTo(-1, 12);
    expect(transformed[1]).toBeCloseTo(0, 12);
    expect(transformed[2]).toBeCloseTo(0, 12);
    expect(vectorLength(transformed)).toBeCloseTo(1, 12);
  });
});
