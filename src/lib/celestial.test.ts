import {
  getCelestialState,
  getDaylightWindow,
  getLunarCoordinates,
  getMoonPosition,
  getSolarPosition,
} from "./celestial";

const toDegrees = (value: number) => value * 180 / Math.PI;

describe("celestial positions", () => {
  it("matches the NREL solar-position reference case", () => {
    const position = getSolarPosition(
      new Date("2003-10-17T19:30:30.000Z"),
      39.742476,
      -105.1786,
    );

    expect(90 - toDegrees(position.elevation)).toBeCloseTo(50.11, 1);
    expect(toDegrees(position.azimuth)).toBeCloseTo(194.34, 1);
  });

  it("keeps the solar and lunar direction vectors normalized", () => {
    const date = new Date("2026-08-30T12:00:00.000Z");
    const positions = [
      getSolarPosition(date, 15.2, 73.7),
      getMoonPosition(date, 15.2, 73.7),
    ];

    for (const position of positions) {
      expect(Math.hypot(...position.direction)).toBeCloseTo(1, 10);
      expect(position.azimuth).toBeGreaterThanOrEqual(0);
      expect(position.azimuth).toBeLessThan(Math.PI * 2);
    }
  });

  it("matches the Meeus lunar-coordinate reference case", () => {
    const coordinates = getLunarCoordinates(
      new Date("1992-04-12T00:00:00.000Z"),
    );

    expect(toDegrees(coordinates.longitude)).toBeCloseTo(133.1627, 3);
    expect(toDegrees(coordinates.latitude)).toBeCloseTo(-3.2291, 3);
    expect(coordinates.distanceKm).toBeCloseTo(368_409.7, -1);
  });

  it("tracks a new moon and a full moon", () => {
    const newMoon = getCelestialState(
      new Date("2024-04-08T18:21:00.000Z"),
      25.3,
      -104.1,
    );
    const fullMoon = getCelestialState(
      new Date("2024-03-25T07:00:00.000Z"),
      0,
      0,
    );

    expect(newMoon.moonIllumination).toBeLessThan(0.03);
    expect(fullMoon.moonIllumination).toBeGreaterThan(0.97);
  });

  it("keeps the full-moon scene opposite the sun at night", () => {
    const state = getCelestialState(
      new Date("2026-08-30T18:30:00.000Z"),
      15.2,
      73.7,
      { fullMoonScene: true },
    );

    expect(state.moonIllumination).toBe(1);
    expect(state.moon.elevation).toBeGreaterThan(0);
    expect(state.moon.elevation).toBeLessThanOrEqual(39 * Math.PI / 180);
    expect(Math.cos(state.moon.azimuth - state.sun.azimuth)).toBeCloseTo(-1, 10);
  });

  it("finds the local sunrise and sunset window", () => {
    const window = getDaylightWindow(
      new Date(2026, 7, 30, 12, 0, 0),
      15.2,
      73.7,
    );

    expect(window.sunriseMinute).toBeGreaterThan(330);
    expect(window.sunriseMinute).toBeLessThan(430);
    expect(window.sunsetMinute).toBeGreaterThan(1_050);
    expect(window.sunsetMinute).toBeLessThan(1_170);
  });
});
