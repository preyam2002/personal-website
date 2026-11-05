import { compassPoint, inputFromKeys, inputFromStick, isMoveKey } from "../input";

describe("game input", () => {
  it("maps held keys to swim input and cancels opposite keys", () => {
    expect(inputFromKeys(new Set(["KeyW", "KeyD", "ShiftLeft"]))).toEqual({ forward: 1, strafe: 1, rise: 0, sprint: true });
    expect(inputFromKeys(new Set(["KeyW", "KeyS"])).forward).toBe(0);
    expect(inputFromKeys(new Set(["Space"])).rise).toBe(1);
    expect(inputFromKeys(new Set(["KeyC"])).rise).toBe(-1);
    expect(isMoveKey("KeyF")).toBe(false);
    expect(isMoveKey("ShiftRight")).toBe(true);
  });

  it("maps the touch stick with a dead zone and a limit", () => {
    expect(inputFromStick(2, 2, 56)).toEqual({ forward: 0, strafe: 0 });
    const full = inputFromStick(0, -200, 56);
    expect(full.forward).toBeCloseTo(1);
    expect(inputFromStick(28, 0, 56).strafe).toBeCloseTo(0.5);
  });

  it("names compass points", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(91)).toBe("E");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });
});
