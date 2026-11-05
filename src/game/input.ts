import type { DiverInput } from "./player";

/** The keys that move the diver. */
const MOVE_KEYS: Record<string, keyof Pick<DiverInput, "forward" | "strafe" | "rise">> = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "forward", ArrowDown: "forward",
  KeyD: "strafe", ArrowRight: "strafe",
  KeyA: "strafe", ArrowLeft: "strafe",
  Space: "rise", KeyE: "rise",
  KeyC: "rise", KeyQ: "rise", ControlLeft: "rise",
};

const NEGATIVE_KEYS = new Set(["KeyS", "ArrowDown", "KeyA", "ArrowLeft", "KeyC", "KeyQ", "ControlLeft"]);

export function isMoveKey(code: string) {
  return code in MOVE_KEYS || code === "ShiftLeft" || code === "ShiftRight";
}

/** Convert the set of held keys to diver input. Opposite keys cancel. */
export function inputFromKeys(held: ReadonlySet<string>): DiverInput {
  const input: DiverInput = { forward: 0, strafe: 0, rise: 0, sprint: false };
  for (const code of held) {
    const axis = MOVE_KEYS[code];
    if (axis) input[axis] += NEGATIVE_KEYS.has(code) ? -1 : 1;
  }
  input.forward = Math.max(-1, Math.min(1, input.forward));
  input.strafe = Math.max(-1, Math.min(1, input.strafe));
  input.rise = Math.max(-1, Math.min(1, input.rise));
  input.sprint = held.has("ShiftLeft") || held.has("ShiftRight");
  return input;
}

/**
 * Convert a touch joystick offset to swim input.
 * The stick has a dead zone of 12% and a radius in pixels.
 */
export function inputFromStick(dx: number, dy: number, radius: number) {
  const length = Math.hypot(dx, dy);
  if (length < radius * 0.12) return { forward: 0, strafe: 0 };
  const scale = Math.min(length, radius) / length / radius;
  return { forward: -dy * scale, strafe: dx * scale };
}

/** Format a compass heading in degrees as a point name. */
export function compassPoint(degrees: number) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
