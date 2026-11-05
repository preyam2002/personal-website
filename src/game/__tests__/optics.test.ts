import { WATER_EXTINCTION, opticsShader, underwaterLength, waterTransmittance, whiteBalance } from "../optics";

describe("water optics", () => {
  it("removes red light first and blue light last", () => {
    const [red, green, blue] = waterTransmittance(10);
    expect(red).toBeLessThan(green);
    expect(green).toBeLessThan(blue);
    expect(waterTransmittance(0)).toEqual([1, 1, 1]);
    expect(waterTransmittance(-3)).toEqual([1, 1, 1]);
  });

  it("measures only the part of a segment below the surface", () => {
    expect(underwaterLength([0, 1, 0], [0, 5, 0])).toBe(0);
    expect(underwaterLength([0, -1, 0], [0, -5, 0])).toBeCloseTo(4);
    expect(underwaterLength([0, 2, 0], [0, -2, 0])).toBeCloseTo(2);
    expect(underwaterLength([0, -3, 0], [4, 1, 0])).toBeCloseTo(Math.hypot(4, 4) * 0.75);
  });

  it("puts the same coefficients into the shader", () => {
    expect(opticsShader).toContain(WATER_EXTINCTION.map(value => value.toFixed(4)).join(", "));
  });

  it("warms the view under water with a partial white balance", () => {
    expect(whiteBalance(0)).toEqual([1, 1, 1]);
    const shallow = whiteBalance(3);
    const deep = whiteBalance(20);
    expect(shallow[1]).toBeCloseTo(1);
    expect(shallow[0]).toBeGreaterThan(1);
    expect(shallow[2]).toBeLessThan(1);
    expect(deep[0]).toBeGreaterThan(shallow[0]);
    expect(deep[0]).toBeLessThanOrEqual(4);
  });
});
