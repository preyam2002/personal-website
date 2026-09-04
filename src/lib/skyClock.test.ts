import {
  dialAngleToMinute,
  dialArcPath,
  dialPoint,
  minuteToDialAngle,
  pointToDialAngle,
  stepMinute,
} from "./skyClock";

describe("sky clock dial", () => {
  it("puts noon at the top and midnight at the bottom", () => {
    expect(minuteToDialAngle(720)).toBeCloseTo(0, 9);
    expect(Math.abs(minuteToDialAngle(0))).toBeCloseTo(Math.PI, 9);
    expect(dialPoint(720, 10).y).toBeCloseTo(-10, 9);
    expect(dialPoint(0, 10).y).toBeCloseTo(10, 9);
    expect(dialPoint(18 * 60, 10).x).toBeCloseTo(10, 9);
  });

  it("round-trips minutes through the angle in five minute steps", () => {
    for (let minute = 0; minute < 1440; minute += 5) {
      expect(dialAngleToMinute(minuteToDialAngle(minute))).toBe(minute);
    }
    expect(dialAngleToMinute(minuteToDialAngle(722))).toBe(720);
  });

  it("reads a pointer offset with screen axes", () => {
    expect(dialAngleToMinute(pointToDialAngle(0, -10))).toBe(720);
    expect(dialAngleToMinute(pointToDialAngle(10, 0))).toBe(18 * 60);
    expect(dialAngleToMinute(pointToDialAngle(0, 10))).toBe(0);
    expect(dialAngleToMinute(pointToDialAngle(-10, 0))).toBe(6 * 60);
  });

  it("draws the day arc clockwise from sunrise to sunset", () => {
    const path = dialArcPath(6 * 60 + 20, 18 * 60 + 10, 20);
    expect(path).toMatch(/^M -[\d.]+ -?[\d.]+ A 20 20 0 0 1 /);
    const long = dialArcPath(5 * 60, 21 * 60, 20);
    expect(long).toContain("A 20 20 0 1 1 ");
  });

  it("wraps when stepping across midnight", () => {
    expect(stepMinute(1435, 1)).toBe(0);
    expect(stepMinute(0, -1)).toBe(1435);
    expect(stepMinute(600, 3)).toBe(615);
  });
});
