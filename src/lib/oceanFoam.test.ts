import { advanceFoam, FOAM_HALF_LIFE_SECONDS, FOAM_SOURCE_RATE } from "./oceanFoam";

describe("persistent ocean foam", () => {
  it("preserves a frozen state", () => {
    expect(advanceFoam(0.42, 0.8, 0)).toBe(0.42);
  });

  it("retains half the foam after one half-life without a source", () => {
    expect(advanceFoam(0.8, 0, FOAM_HALF_LIFE_SECONDS)).toBeCloseTo(0.4, 12);
  });

  it("leaves a trail after crest compression ends", () => {
    const crest = advanceFoam(0, 0.8, 1);
    const trail = advanceFoam(crest, 0, 0.5);
    expect(crest).toBeGreaterThan(0.4);
    expect(trail).toBeGreaterThan(0);
    expect(trail).toBeLessThan(crest);
  });

  it.each([15, 30, 60, 120])("preserves the density across %i steps per second", steps => {
    let density = 0.12;
    for (let step = 0; step < steps * 4; step += 1) density = advanceFoam(density, 0.35, 1 / steps);
    expect(density).toBeCloseTo(advanceFoam(0.12, 0.35, 4), 12);
  });

  it("stays bounded and approaches source-decay equilibrium", () => {
    for (const source of [0, 0.2, 0.7, 1]) {
      for (const density of [0, 0.4, 1]) {
        for (const seconds of [0.001, 0.1, 1, 10, 100]) {
          const result = advanceFoam(density, source, seconds);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1);
        }
      }
      const birth = source * FOAM_SOURCE_RATE;
      expect(advanceFoam(0, source, 100)).toBeCloseTo(birth / (birth + Math.LN2 / FOAM_HALF_LIFE_SECONDS), 10);
    }
  });
});
