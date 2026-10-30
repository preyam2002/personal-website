export type GestureEvent =
  | { type: "tap"; x: number; y: number }
  | { type: "press"; x: number; y: number; repeat: number }
  | { type: "drag"; x: number; y: number; dx: number; dy: number; seconds: number };

type GestureOptions = {
  longPressMs: number;
  repeatMs: number;
  moveTolerance: number;
};

const DEFAULT_OPTIONS: GestureOptions = {
  longPressMs: 450,
  repeatMs: 700,
  moveTolerance: 10,
};

/**
 * Classify one pointer contact as a tap, a long press, or a drag.
 *
 * A contact that moves less than the tolerance and ends before the long-press
 * time is a tap. A still contact that passes the long-press time sends a press
 * and then one more press for each repeat interval. A contact that moves past
 * the tolerance becomes a drag and sends its motion until it ends.
 */
export function createGestureTracker(options: Partial<GestureOptions> = {}) {
  const { longPressMs, repeatMs, moveTolerance } = { ...DEFAULT_OPTIONS, ...options };
  let active: {
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    time: number;
    start: number;
    mode: "pending" | "press" | "drag";
    presses: number;
  } | null = null;

  return {
    get active() { return active !== null; },
    down(id: number, x: number, y: number, time: number) {
      active = { id, startX: x, startY: y, x, y, time, start: time, mode: "pending", presses: 0 };
    },
    move(id: number, x: number, y: number, time: number): GestureEvent[] {
      if (!active || active.id !== id) return [];
      const events: GestureEvent[] = [];
      if (active.mode === "pending"
        && Math.hypot(x - active.startX, y - active.startY) > moveTolerance) {
        active.mode = "drag";
      }
      if (active.mode === "drag") {
        events.push({
          type: "drag",
          x,
          y,
          dx: x - active.x,
          dy: y - active.y,
          seconds: Math.max((time - active.time) / 1000, 0),
        });
      }
      active.x = x;
      active.y = y;
      active.time = time;
      return events;
    },
    /** Send the long-press events that are due at this time. */
    poll(time: number): GestureEvent[] {
      if (!active || active.mode === "drag") return [];
      const events: GestureEvent[] = [];
      const due = time - active.start >= longPressMs
        ? Math.floor((time - active.start - longPressMs) / repeatMs) + 1
        : 0;
      while (active.presses < due) {
        active.mode = "press";
        events.push({ type: "press", x: active.x, y: active.y, repeat: active.presses });
        active.presses += 1;
      }
      return events;
    },
    up(id: number, x: number, y: number, time: number): GestureEvent[] {
      if (!active || active.id !== id) return [];
      const events = this.poll(time);
      const tap = active.mode === "pending" && events.length === 0;
      active = null;
      return tap ? [{ type: "tap", x, y }] : events;
    },
    cancel(id?: number) {
      if (id === undefined || active?.id === id) active = null;
    },
  };
}

/**
 * Smooth the pointer speed in viewport heights per second.
 *
 * The visible scene scales with the viewport height, so this measure keeps the
 * same gesture fast or slow on a phone and on a desktop display.
 */
export function smoothPointerSpeed(
  previous: number,
  distancePixels: number,
  seconds: number,
  viewportHeight: number,
) {
  if (seconds <= 0) return previous;
  const speed = distancePixels / Math.max(viewportHeight, 1) / seconds;
  const blend = 1 - Math.exp(-seconds / 0.08);
  return previous + (speed - previous) * blend;
}

export const FAST_POINTER_SPEED = 1.1;
