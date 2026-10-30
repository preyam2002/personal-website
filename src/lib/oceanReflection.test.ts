import {
  DIFFUSE_WATER_REFLECTANCE,
  inverseNormalCdf,
  normalCdf,
  normalDensity,
  oceanReflectionSamples,
  positiveQuadraticIntervals,
  visibleSlopeMass,
  type ReflectionFrame,
} from "./oceanReflection";
import type { Direction3 } from "./oceanWaves";

const dot = (a: Direction3, b: Direction3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Direction3): Direction3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

function frame(elevation = 10, tilt = 5, wind = 0, variance: readonly [number, number] = [0.0126, 0.00844]): ReflectionFrame {
  const e = elevation * Math.PI / 180, n = tilt * Math.PI / 180, w = wind * Math.PI / 180;
  const view: Direction3 = [0, Math.sin(e), -Math.cos(e)];
  const normal: Direction3 = [0, Math.cos(n), Math.sin(n)];
  const projection = Math.sin(w) * normal[2];
  const tangent = normalize([Math.cos(w), -normal[1] * projection, Math.sin(w) - normal[2] * projection]);
  const bitangent: Direction3 = [
    tangent[1] * normal[2] - tangent[2] * normal[1],
    tangent[2] * normal[0] - tangent[0] * normal[2],
    tangent[0] * normal[1] - tangent[1] * normal[0],
  ];
  return { view, normal, tangent, bitangent, variance };
}

function denseReference(state: ReflectionFrame, sky: (direction: Direction3) => number, below = 0) {
  const { view, normal, tangent, bitangent, variance } = state;
  const size = 384, step = 12 / size;
  const sigmaX = Math.sqrt(variance[0]), sigmaY = Math.sqrt(variance[1]);
  let mass = 0, radiance = 0;
  for (let x = 0; x < size; x += 1) {
    const gx = -6 + (x + 0.5) * step, sx = gx * sigmaX;
    const wx = normalDensity(gx);
    for (let y = 0; y < size; y += 1) {
      const gy = -6 + (y + 0.5) * step, sy = gy * sigmaY;
      const m: Direction3 = [
        normal[0] - tangent[0] * sx - bitangent[0] * sy,
        normal[1] - tangent[1] * sx - bitangent[1] * sy,
        normal[2] - tangent[2] * sx - bitangent[2] * sy,
      ];
      const viewDot = dot(view, m);
      const weight = wx * normalDensity(gy) * Math.max(viewDot, 0);
      const reflectionScale = 2 * viewDot / dot(m, m);
      const direction: Direction3 = [
        reflectionScale * m[0] - view[0],
        reflectionScale * m[1] - view[1],
        reflectionScale * m[2] - view[2],
      ];
      radiance += weight * (direction[1] > 0 ? sky(direction) : below);
      mass += weight;
    }
  }
  return radiance / mass;
}

function integrate(state: ReflectionFrame, sky: (direction: Direction3) => number, below = 0) {
  const { samples, belowHorizonWeight } = oceanReflectionSamples(state);
  return samples.reduce((total, sample) => total + sample.weight * sky(sample.direction), belowHorizonWeight * below);
}

describe("Gaussian reflection integration", () => {
  it.each([
    [-3, 0.001349898], [-1, 0.158655254], [0, 0.5], [1, 0.841344746], [3, 0.998650102],
  ])("evaluates the normal CDF at %f", (x, expected) => {
    expect(Math.abs(normalCdf(x) - expected)).toBeLessThan(8e-8);
  });

  it.each([1e-7, 0.00001, 0.01, 0.2, 0.5, 0.8, 0.99, 0.99999, 1 - 1e-7])("inverts probability %f", probability => {
    expect(normalCdf(inverseNormalCdf(probability))).toBeCloseTo(probability, 6);
  });

  it.each([
    [-1, 0, 1, [[-1, 1]]],
    [1, 0, -1, [[-6, -1], [1, 6]]],
    [0, 1, -2, [[2, 6]]],
    [0, -1, -2, [[-6, -2]]],
    [0, 0, 1, [[-6, 6]]],
    [0, 0, -1, []],
    [-1, 0, 0, []],
    [1, 0, 1, [[-6, 6]]],
  ] as const)("clips quadratic (%f, %f, %f)", (a, b, c, expected) => {
    expect(positiveQuadraticIntervals(a, b, c, [-6, 6])).toEqual(expected);
  });

  it("integrates the visible projected area", () => {
    expect(visibleSlopeMass(1, 0, [-6, 6])).toBeCloseTo(1, 8);
    expect(visibleSlopeMass(0, 1, [-6, 0])).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 7);
  });

  it("removes the horizon jump in the rejected 25-sample fixture", () => {
    const before = integrate(frame(10, 4.9999), () => 1);
    const after = integrate(frame(10, 5.0001), () => 1);
    expect(before).toBeCloseTo(0.834297112, 3);
    expect(after).toBeCloseTo(0.834288535, 3);
    expect(Math.abs(after - before)).toBeLessThan(0.00005);
  });

  it.each([0, 30, 60, 90, 135, 180])("keeps the horizon continuous at wind angle %i", wind => {
    const before = integrate(frame(10, 4.9999, wind), () => 1);
    const after = integrate(frame(10, 5.0001, wind), () => 1);
    expect(Math.abs(after - before)).toBeLessThan(0.00005);
  });

  const states = [
    frame(5, 2.5), frame(10, 5, 45), frame(20, 10, 90), frame(35, 17.5, 135),
    frame(60, 0, 0), frame(10, -20, 35), frame(20, 8, 70, [0.003, 0.03]),
    frame(30, 12, 20, [0.08, 0.02]), frame(-5, -35, 60),
  ];
  const broadSky = ([x, y, z]: Direction3) => 0.2 + 0.3 * y + 0.25 * x * x + 0.1 * z;

  it.each(states.map((state, index) => [index, state] as const))("matches dense sky integration for scene %i", (_, state) => {
    for (const sky of [() => 1, broadSky]) {
      const expected = denseReference(state, sky, 0.07);
      expect(Math.abs(integrate(state, sky, 0.07) - expected)).toBeLessThan(0.012);
    }
  });

  it("keeps sample directions above the horizon and conserves a constant environment", () => {
    for (const state of states) {
      const { samples, belowHorizonWeight } = oceanReflectionSamples(state);
      expect(samples.length).toBeLessThanOrEqual(30);
      expect(belowHorizonWeight).toBeGreaterThanOrEqual(0);
      for (const sample of samples) {
        expect(sample.weight).toBeGreaterThanOrEqual(0);
        expect(sample.direction[1]).toBeGreaterThan(-0.00001);
        expect(Math.hypot(...sample.direction)).toBeCloseTo(1, 10);
      }
      expect(integrate(state, () => 1, 1)).toBeCloseTo(1, 6);
    }
  });

  it("uses the smooth-surface limit for negligible roughness", () => {
    const state = frame(60, 0, 25, [1e-8, 1e-8]);
    expect(integrate(state, broadSky)).toBeCloseTo(broadSky([0, Math.sqrt(3) / 2, 0.5]), 5);
  });

  it("derives the diffuse water reflectance from the water index of refraction", () => {
    expect(DIFFUSE_WATER_REFLECTANCE).toBeGreaterThan(0.06);
    expect(DIFFUSE_WATER_REFLECTANCE).toBeLessThan(0.07);
  });
});
