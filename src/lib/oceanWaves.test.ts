import { getSolarPosition } from "./celestial";
import {
  GRAVITY,
  OCEAN_SWELL_COMPONENT_COUNT,
  OCEAN_WAVE_COMPONENT_COUNT,
  createOceanWaveField,
  describeSeaState,
  getDisplaySunDirection,
  getSceneSunDirection,
  getSunAzimuthScale,
  rotateAboutY,
  seededRandom,
} from "./oceanWaves";

const LATITUDE = 15.2;
const LONGITUDE = 73.7;

function vectorLength(vector: readonly [number, number, number]) {
  return Math.hypot(vector[0], vector[1], vector[2]);
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

  it("packs nine components with deep-water dispersion", () => {
    expect(field.data).toHaveLength(OCEAN_WAVE_COMPONENT_COUNT * 4);
    expect(field.phases).toHaveLength(OCEAN_WAVE_COMPONENT_COUNT);

    for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
      const waveNumber = Math.hypot(field.data[index * 4], field.data[index * 4 + 1]);
      const angularFrequency = field.data[index * 4 + 2];
      const amplitude = field.data[index * 4 + 3];
      expect(angularFrequency).toBeCloseTo(Math.sqrt(GRAVITY * waveNumber), 5);
      expect(amplitude).toBeGreaterThan(0);
      expect(amplitude * waveNumber).toBeLessThan(0.05);
      expect(field.phases[index]).toBeGreaterThanOrEqual(0);
      expect(field.phases[index]).toBeLessThan(Math.PI * 2);
    }
  });

  it("keeps the swell group long and nearly aligned", () => {
    const wavelengths: number[] = [];
    const angles: number[] = [];
    for (let index = 0; index < OCEAN_SWELL_COMPONENT_COUNT; index += 1) {
      const waveX = field.data[index * 4];
      const waveZ = field.data[index * 4 + 1];
      wavelengths.push((2 * Math.PI) / Math.hypot(waveX, waveZ));
      angles.push(Math.atan2(waveZ, waveX));
    }
    expect(wavelengths[0]).toBeGreaterThanOrEqual(72);
    expect(wavelengths[0]).toBeLessThanOrEqual(96);
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
    expect(state.significantWaveHeight).toBeGreaterThan(0.4);
    expect(state.significantWaveHeight).toBeLessThan(1.1);
    expect(state.swellPeriod).toBeGreaterThan(6);
    expect(state.swellPeriod).toBeLessThan(8.5);
    expect(state.cloudCover).toBeGreaterThan(0.2);
    expect(state.cloudCover).toBeLessThan(0.6);
    expect(vectorLength([...field.windDirection, 0])).toBeCloseTo(1, 6);
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
