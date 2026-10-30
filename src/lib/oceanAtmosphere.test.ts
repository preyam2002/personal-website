import {
  ATMOSPHERE_RADIUS_KM,
  ATMOSPHERE_VIEW_SAMPLES,
  PLANET_RADIUS_KM,
  SKY_MIN_ELEVATION,
  atmosphereDensity,
  atmosphereOpticalDepth,
  atmosphereViewSegment,
  skyElevation,
  skyElevationUv,
} from "./oceanAtmosphere";

function ray(altitude: number, elevation: number) {
  const origin = [0, PLANET_RADIUS_KM + altitude, 0] as const;
  const direction = [Math.cos(elevation * Math.PI / 180), Math.sin(elevation * Math.PI / 180), 0] as const;
  const projected = origin[1] * direction[1];
  const distance = -projected + Math.sqrt(projected ** 2 - origin[1] ** 2 + ATMOSPHERE_RADIUS_KM ** 2);
  return { origin, direction, distance };
}

function denseDepth(state: ReturnType<typeof ray>) {
  const result = [0, 0, 0];
  const step = state.distance / 16384;
  for (let i = 0; i < 16384; i += 1) {
    const t = (i + 0.5) * step;
    const altitude = Math.hypot(state.direction[0] * t, state.origin[1] + state.direction[1] * t) - PLANET_RADIUS_KM;
    const density = [Math.exp(-altitude / 8), Math.exp(-altitude / 1.2), Math.max(0, 1 - Math.abs(altitude - 25) / 15)];
    for (let axis = 0; axis < 3; axis += 1) result[axis] += density[axis] * step;
  }
  return result;
}

describe("ocean sky optics", () => {
  it("retains the dense air that the old six-point rule missed", () => {
    const state = ray(0.002, 90);
    const expected = 1.2 * Math.exp(-0.002 / 1.2);
    let oldDepth = 0;
    for (let i = 0; i < 6; i += 1) {
      oldDepth += Math.exp(-(0.002 + (i + 0.5) * state.distance / 6) / 1.2) * state.distance / 6;
    }
    const depth = atmosphereOpticalDepth(state.origin, state.direction, state.distance);
    expect(oldDepth / expected).toBeLessThan(0.014);
    expect(Math.abs(depth[1] / expected - 1)).toBeLessThan(1e-6);
  });

  it.each([0.002, 2, 10, 30].flatMap(altitude => [0, 5, 30, 90].map(elevation => [altitude, elevation])))
  ("matches a dense integral at %f km and %f degrees", (altitude, elevation) => {
    const state = ray(altitude, elevation);
    const expected = denseDepth(state);
    const actual = atmosphereOpticalDepth(state.origin, state.direction, state.distance);
    expect(Math.abs(actual[0] - expected[0])).toBeLessThan(expected[0] * 1e-5 + 1e-8);
    expect(Math.abs(actual[1] - expected[1])).toBeLessThan(expected[1] * 3e-6 + 1e-8);
    // The triangular ozone profile has corners that limit this fixed quadrature.
    expect(Math.abs(actual[2] - expected[2])).toBeLessThan(expected[2] * 0.07 + 1e-8);
  });

  it("covers the view ray without gaps or repeated intervals", () => {
    let end = 0;
    for (let i = 0; i < ATMOSPHERE_VIEW_SAMPLES; i += 1) {
      const [middle, width] = atmosphereViewSegment(i, 100);
      expect(middle - width / 2).toBeCloseTo(end, 12);
      expect(width).toBeGreaterThan(0);
      end = middle + width / 2;
    }
    expect(end).toBeCloseTo(100, 12);
  });

  it("integrates the vertical view density within one percent", () => {
    const state = ray(0.002, 90);
    const actual = [0, 0, 0];
    for (let i = 0; i < ATMOSPHERE_VIEW_SAMPLES; i += 1) {
      const [distance, width] = atmosphereViewSegment(i, state.distance);
      const density = atmosphereDensity(0.002 + distance);
      for (let axis = 0; axis < 3; axis += 1) actual[axis] += density[axis] * width;
    }
    const expected = [8 * Math.exp(-0.002 / 8), 1.2 * Math.exp(-0.002 / 1.2), 15];
    for (let axis = 0; axis < 3; axis += 1) expect(Math.abs(actual[axis] / expected[axis] - 1)).toBeLessThan(0.01);
  });

  it.each([0, 0.01, 0.1, 0.3, 0.6, 1])("preserves the sky coordinate %f", uv => {
    expect(skyElevationUv(skyElevation(uv))).toBeCloseTo(uv, 12);
  });

  it("allocates more texels to the visible horizon band", () => {
    const elevation = 5 * Math.PI / 180;
    const linearFraction = elevation / (Math.PI / 2);
    expect(skyElevationUv(elevation)).toBeGreaterThan(linearFraction * 4);
    expect(skyElevation(0)).toBe(SKY_MIN_ELEVATION);
    expect(skyElevation(1)).toBe(Math.PI / 2);
    expect(skyElevationUv(-1)).toBe(0);
    expect(skyElevationUv(2)).toBe(1);
  });
});
