import {
  IWAVE_RADIUS,
  IWAVE_SIZE,
  WATER_ABSORPTION_RGB_PER_METER,
  WATER_IOR,
  createIWaveKernel,
  exactDielectricFresnel,
} from "./iwave";

describe("iWave physics constants", () => {
  const kernel = createIWaveKernel();

  it("builds the recommended 13 by 13 kernel", () => {
    expect(IWAVE_RADIUS).toBe(6);
    expect(kernel).toHaveLength(IWAVE_SIZE * IWAVE_SIZE);
  });

  it("normalizes the center and preserves radial symmetry", () => {
    const center = IWAVE_RADIUS * IWAVE_SIZE + IWAVE_RADIUS;
    expect(kernel[center]).toBeCloseTo(1, 5);

    for (let y = 0; y < IWAVE_SIZE; y += 1) {
      for (let x = 0; x < IWAVE_SIZE; x += 1) {
        const reflectedX = IWAVE_SIZE - 1 - x;
        const reflectedY = IWAVE_SIZE - 1 - y;
        expect(kernel[y * IWAVE_SIZE + x]).toBeCloseTo(
          kernel[reflectedY * IWAVE_SIZE + reflectedX],
          6,
        );
      }
    }
  });

  it("uses measured pure-water absorption in RGB wavelength order", () => {
    expect(WATER_ABSORPTION_RGB_PER_METER).toEqual([0.34, 0.0565, 0.00922]);
  });

  it("matches the normal-incidence dielectric Fresnel value", () => {
    const expected = ((1 - WATER_IOR) / (1 + WATER_IOR)) ** 2;
    expect(exactDielectricFresnel(1)).toBeCloseTo(expected, 10);
    expect(exactDielectricFresnel(0)).toBeCloseTo(1, 10);
  });

  it("uses the water-to-air critical angle for Snell's window", () => {
    const criticalAngle = Math.asin(1 / WATER_IOR);
    const insideWindow = Math.cos(criticalAngle - 0.001);
    const outsideWindow = Math.cos(criticalAngle + 0.001);

    expect(criticalAngle * 2 * 180 / Math.PI).toBeCloseTo(97.2, 1);
    expect(exactDielectricFresnel(insideWindow, WATER_IOR, 1)).toBeLessThan(1);
    expect(exactDielectricFresnel(outsideWindow, WATER_IOR, 1)).toBe(1);
  });
});
