import {
  RIPPLE_GROUP_SPEED,
  RIPPLE_LIFETIME_SECONDS,
  RIPPLE_WAVE_NUMBER,
  createRipplePool,
  rippleProfile,
} from "./oceanRipples";

describe("ring ripples", () => {
  it("moves the envelope outward at the deep-water group speed", () => {
    const peak = (age: number) => {
      let best = 0;
      let bestRadius = 0;
      for (let radius = 0; radius < 4; radius += 0.005) {
        const { height } = rippleProfile(radius, age, 1);
        if (Math.abs(height) > best) {
          best = Math.abs(height);
          bestRadius = radius;
        }
      }
      return bestRadius;
    };
    expect(RIPPLE_GROUP_SPEED).toBeCloseTo(0.5 * Math.sqrt(9.81 / RIPPLE_WAVE_NUMBER), 10);
    expect(Math.abs(peak(3) - RIPPLE_GROUP_SPEED * 3)).toBeLessThan(Math.PI / RIPPLE_WAVE_NUMBER);
  });

  it("returns the radial derivative of the height", () => {
    for (const age of [0.2, 1, 2.5]) {
      for (const radius of [0.05, 0.3, 0.8, 1.4]) {
        const step = 1e-5;
        const numeric = (rippleProfile(radius + step, age, 0.02).height
          - rippleProfile(radius - step, age, 0.02).height) / (2 * step);
        expect(rippleProfile(radius, age, 0.02).slope).toBeCloseTo(numeric, 6);
      }
    }
  });

  it("decays to a negligible height before the pool removes it", () => {
    let largest = 0;
    for (let radius = 0; radius < 6; radius += 0.01) {
      largest = Math.max(largest, Math.abs(rippleProfile(radius, RIPPLE_LIFETIME_SECONDS, 1).height));
    }
    expect(largest).toBeLessThan(0.05);
  });

  it("replaces the oldest ripple in a full pool and drops expired ripples", () => {
    const pool = createRipplePool(2);
    pool.add(1, 1, 0.01, 0);
    pool.add(2, 2, 0.01, 1);
    pool.add(3, 3, 0.01, 2);
    expect(pool.ripples.map(ripple => ripple.x).sort()).toEqual([2, 3]);
    const output = new Float32Array(8).fill(9);
    expect(pool.pack(1 + RIPPLE_LIFETIME_SECONDS + 0.5, output)).toBe(1);
    expect(Array.from(output.subarray(0, 4))).toEqual([3, 3, Math.fround(RIPPLE_LIFETIME_SECONDS - 0.5), Math.fround(0.01)]);
    expect(Array.from(output.subarray(4))).toEqual([0, 0, 0, 0]);
  });

  it("ignores ripples when the quality profile has no ripple slots", () => {
    const pool = createRipplePool(0);
    pool.add(0, 0, 0.01, 0);
    expect(pool.pack(0, new Float32Array(4))).toBe(0);
  });
});
