import {
  getOceanIntersectionBounds,
  intersectOceanHeightfield,
  oceanRayHeightDerivativeBound,
} from "./oceanIntersection";
import {
  GRAVITY,
  createOceanWaveField,
  OCEAN_WAVE_COMPONENT_COUNT,
  seededRandom,
  type Direction3,
  type OceanWaveField,
} from "./oceanWaves";

type Detail = { data: Float32Array; phases: Float32Array };

function fade(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/** Sixty-four short waves between 0.8 and 8 m, as a stand-in for local detail. */
function createDetail(seed: number): Detail {
  const random = seededRandom(seed);
  const data = new Float32Array(64 * 4);
  const phases = new Float32Array(64);
  for (let index = 0; index < 64; index += 1) {
    const waveNumber = 2 * Math.PI / (0.8 * 10 ** random());
    const angle = random() * 2 * Math.PI;
    data.set([
      Math.cos(angle) * waveNumber,
      Math.sin(angle) * waveNumber,
      Math.sqrt(GRAVITY * waveNumber),
      0.03 / waveNumber,
    ], index * 4);
    phases[index] = random() * 2 * Math.PI;
  }
  return { data, phases };
}

function sampleSurface(field: OceanWaveField, time: number, detail?: Detail) {
  return (x: number, z: number, distance: number) => {
    let warpX = 0;
    let warpZ = 0;
    const amplitudes: number[] = [];
    for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
      const offset = index * 4;
      const [kx, kz, frequency, amplitude] = field.data.subarray(offset, offset + 4);
      const k = Math.hypot(kx, kz);
      const resolved = amplitude * fade(2 * Math.PI / k * 9, 2 * Math.PI / k * 26, distance);
      const phase = kx * x + kz * z - frequency * time + field.phases[index];
      warpX += kx / k * resolved * Math.cos(phase);
      warpZ += kz / k * resolved * Math.cos(phase);
      amplitudes.push(resolved);
    }
    const qx = x - field.choppiness * warpX;
    const qz = z - field.choppiness * warpZ;
    let height = 0;
    for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
      const offset = index * 4;
      height += amplitudes[index] * Math.sin(
        field.data[offset] * qx + field.data[offset + 1] * qz
          - field.data[offset + 2] * time + field.phases[index],
      );
    }
    if (detail && distance < 190) {
      let local = 0;
      for (let index = 0; index < detail.data.length / 4; index += 1) {
        const offset = index * 4;
        local += detail.data[offset + 3] * Math.cos(
          detail.data[offset] * qx + detail.data[offset + 1] * qz
            - detail.data[offset + 2] * time + detail.phases[index],
        );
      }
      height += local * fade(45, 190, distance);
    }
    return height;
  };
}

function denseFirstHit(
  origin: Direction3,
  direction: Direction3,
  height: ReturnType<typeof sampleSurface>,
  far: number,
) {
  const sample = (t: number) => origin[1] + direction[1] * t
    - height(origin[0] + direction[0] * t, origin[2] + direction[2] * t, t);
  let low = 0;
  let lowSign = sample(0);
  for (let t = 0.025; t <= far; t += 0.025) {
    const sign = sample(t);
    if (sign * lowSign <= 0) {
      let high = t;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) * 0.5;
        if (sample(middle) * lowSign > 0) low = middle;
        else high = middle;
      }
      return (low + high) * 0.5;
    }
    low = t;
    lowSign = sign;
  }
  return null;
}

describe("ocean first intersection", () => {
  it("finds the first crossing of a grazing ray", () => {
    const field = createOceanWaveField(4603);
    const height = sampleSurface(field, 30);
    const origin: Direction3 = [0, 3.6, -6.2];
    const direction: Direction3 = [-0.35530416143478544, -0.008374481652339298, 0.9347132292442312];
    const bounds = getOceanIntersectionBounds(field);
    const result = intersectOceanHeightfield(origin, direction, height, bounds.height,
      (near, far) => oceanRayHeightDerivativeBound(field, bounds.detail, direction, near, far));
    const reference = denseFirstHit(origin, direction, height, 600);
    expect(reference).not.toBeNull();
    expect(result).toMatchObject({ exhausted: false });
    expect(result.distance).not.toBeNull();
    expect(Math.abs(result.distance! - reference!)).toBeLessThan(0.005);
    expect(result.evaluations).toBeLessThan(100);
  });

  it.each([
    { seed: 4603, time: 0, origin: [0, 3.6, -6.2], direction: [0, -0.3, 0.9539392014] },
    { seed: 17321, time: 15, origin: [0, 0.3, -6.2], direction: [0.6, -0.04, 0.8] },
    { seed: 99, time: 60, origin: [0, -0.8, -6.2], direction: [-0.6, 0.12, 0.8] },
    { seed: 17321, time: 30, origin: [0, -0.5, -6.2], direction: [0, 0.02, 1] },
  ])("matches a dense reference for seed $seed at time $time", ({ seed, time, origin, direction }) => {
    const field = createOceanWaveField(seed);
    const detail = createDetail(seed);
    const height = sampleSurface(field, time, detail);
    const ray = direction as unknown as Direction3;
    const eye = origin as unknown as Direction3;
    const bounds = getOceanIntersectionBounds(field, detail);
    const result = intersectOceanHeightfield(eye, ray, height, bounds.height,
      (near, far) => oceanRayHeightDerivativeBound(field, bounds.detail, ray, near, far));
    const reference = denseFirstHit(eye, ray, height, 500);
    expect(reference).not.toBeNull();
    expect(result).toMatchObject({ exhausted: false });
    expect(result.distance).not.toBeNull();
    expect(Math.abs(result.distance! - reference!)).toBeLessThan(0.005);
  });

  it("does not skip the first crossing when interval endpoints share one sign", () => {
    const height = (x: number) => Math.sin(x);
    const result = intersectOceanHeightfield([0, 0.5, 0], [1, 0, 0], height, 1, () => 1, 10);
    expect(result.exhausted).toBe(false);
    expect(result.distance).toBeCloseTo(Math.PI / 6, 4);
  });

  it("does not invent a hit for a horizontal ray above the water", () => {
    const result = intersectOceanHeightfield([0, 2, 0], [1, 0, 0], () => 0, 1, () => 0);
    expect(result).toEqual({ distance: null, evaluations: 0, exhausted: false });
  });

  it("returns no hit when an upward ray leaves the surface behind it", () => {
    const result = intersectOceanHeightfield([0, 0.5, 0], [0, 1, 0], () => 0, 1, () => 0);
    expect(result.distance).toBeNull();
    expect(result.exhausted).toBe(false);
  });

  it("reports an unresolved interval instead of an arbitrary far-plane hit", () => {
    const result = intersectOceanHeightfield([0, 0.5, 0], [1, 0, 0], () => 0, 1, () => 1e12);
    expect(result.distance).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it("bounds the directional derivative through geometry fades and the coordinate warp", () => {
    for (const seed of [4603, 17321, 99]) {
      const field = createOceanWaveField(seed);
      const detail = createDetail(seed);
      const bounds = getOceanIntersectionBounds(field, detail);
      const height = sampleSurface(field, 30, detail);
      const direction: Direction3 = [0.6, -0.2, 0.8];
      for (const distance of [0, 44, 80, 160, 189, 191, 250, 400, 900, 1800]) {
        const epsilon = 1e-4;
        const sample = (t: number) => height(direction[0] * t, direction[2] * t, t);
        const derivative = (sample(distance + epsilon) - sample(distance - epsilon)) / (2 * epsilon);
        const limit = oceanRayHeightDerivativeBound(field, bounds.detail, direction,
          distance - epsilon, distance + epsilon);
        expect(Math.abs(derivative)).toBeLessThanOrEqual(limit + 1e-6);
      }
    }
  });
});
