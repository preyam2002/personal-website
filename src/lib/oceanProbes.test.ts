import { PROBE_SLOTS, packProbes, sampleSwellSurface, unpackProbes, type ProbeSample } from "./oceanProbes";
import { createOceanWaveField, spectralHeightAt } from "./oceanWaves";

const field = createOceanWaveField(4603);

describe("surface probes", () => {
  it("packs requests into slots and keeps their keys", () => {
    const data = new Float32Array(PROBE_SLOTS * 4).fill(7);
    const keys = packProbes([
      { key: "boat:0", x: 1, z: 2, mode: "floating", footprint: 0.2 },
      { key: "jump:3", x: -1, z: 5, mode: "fixed", footprint: 0.1 },
    ], data);
    expect(keys).toEqual(["boat:0", "jump:3"]);
    expect(Array.from(data.subarray(0, 8))).toEqual([1, 2, 0, Math.fround(0.2), -1, 5, 1, Math.fround(0.1)]);
    expect(data.subarray(8).every(value => value === 0)).toBe(true);
  });

  it("drops requests beyond the slot count", () => {
    const requests = Array.from({ length: PROBE_SLOTS + 3 }, (_, index) => ({
      key: `pellet:${index}`, x: index, z: 0, mode: "floating" as const, footprint: 0.05,
    }));
    expect(packProbes(requests, new Float32Array(PROBE_SLOTS * 4))).toHaveLength(PROBE_SLOTS);
  });

  it("matches each readback row to the key of its request and skips invalid values", () => {
    const data = new Float32Array(PROBE_SLOTS * 2 * 4);
    data.set([1, 0.2, 3, 1], 0);
    data.set([0, 1, 0, 1], PROBE_SLOTS * 4);
    data.set([Number.NaN, 0, 0, 1], 4);
    const samples = unpackProbes(["boat:0", "boat:1"], data, new Map<string, ProbeSample>());
    expect(samples.get("boat:0")).toEqual({ position: [1, Math.fround(0.2), 3], normal: [0, 1, 0] });
    expect(samples.has("boat:1")).toBe(false);
  });
});

describe("swell sample for floating objects", () => {
  it.each([[0, 0, 0], [3.2, -1.5, 12], [-20, 40, 431.7]])("matches the swell height at (%p, %p) and time %p", (x, z, time) => {
    const sample = sampleSwellSurface(field, x, z, time);
    expect(sample.position[1]).toBeCloseTo(spectralHeightAt(field, x, z, time), 12);
  });

  it("moves a floating point on a closed orbit over one swell period", () => {
    const period = (2 * Math.PI) / field.data[2];
    const single = { ...field, data: field.data.map((value, index) => index >= 4 && index % 4 === 3 ? 0 : value) };
    const start = sampleSwellSurface(single, 2, 3, 0).position;
    const later = sampleSwellSurface(single, 2, 3, period).position;
    const middle = sampleSwellSurface(single, 2, 3, period / 2).position;
    later.forEach((value, axis) => expect(value).toBeCloseTo(start[axis], 9));
    expect(Math.hypot(middle[0] - start[0], middle[2] - start[2])).toBeGreaterThan(0.01);
  });

  it("returns the normal of the displaced surface", () => {
    const step = 1e-4;
    for (const [x, z, time] of [[0.4, 1.2, 3], [-5, 8, 40]]) {
      const center = sampleSwellSurface(field, x, z, time);
      const alongX = sampleSwellSurface(field, x + step, z, time).position.map((value, axis) => value - center.position[axis]);
      const alongZ = sampleSwellSurface(field, x, z + step, time).position.map((value, axis) => value - center.position[axis]);
      const normal = [
        alongZ[1] * alongX[2] - alongZ[2] * alongX[1],
        alongZ[2] * alongX[0] - alongZ[0] * alongX[2],
        alongZ[0] * alongX[1] - alongZ[1] * alongX[0],
      ];
      const length = Math.hypot(...normal);
      normal.forEach((value, axis) => expect(center.normal[axis]).toBeCloseTo(value / length, 5));
      expect(center.normal[1]).toBeGreaterThan(0.9);
    }
  });
});
