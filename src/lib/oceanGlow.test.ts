import { GLOW_HALF_LIFE_SECONDS, advanceGlow, nightGlowStrength } from "./oceanGlow";

describe("night bioluminescence", () => {
  it("shows at night, fades through twilight, and stays dark by day", () => {
    expect(nightGlowStrength(-0.4)).toBe(1);
    expect(nightGlowStrength(-0.16)).toBe(1);
    expect(nightGlowStrength(-0.09)).toBeGreaterThan(0);
    expect(nightGlowStrength(-0.09)).toBeLessThan(1);
    expect(nightGlowStrength(-0.025)).toBe(0);
    expect(nightGlowStrength(0.5)).toBe(0);
  });

  it("halves without a source after one half-life", () => {
    expect(advanceGlow(0.8, 0, GLOW_HALF_LIFE_SECONDS)).toBeCloseTo(0.4, 12);
  });

  it.each([20, 30, 60, 144])("gives the same light at %i frames per second", rate => {
    let glow = 0.1;
    for (let frame = 0; frame < rate * 2; frame += 1) glow = advanceGlow(glow, 0.6, 1 / rate);
    expect(glow).toBeCloseTo(advanceGlow(0.1, 0.6, 2), 12);
  });

  it("stays between zero and one for any source and step", () => {
    for (const source of [0, 0.3, 5, 100]) {
      for (const seconds of [0.001, 0.1, 1, 30]) {
        const glow = advanceGlow(0.5, source, seconds);
        expect(glow).toBeGreaterThanOrEqual(0);
        expect(glow).toBeLessThanOrEqual(1);
      }
    }
  });
});
