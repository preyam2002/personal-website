import { FAST_POINTER_SPEED, createGestureTracker, smoothPointerSpeed } from "./oceanGestures";

describe("water gestures", () => {
  it("reports a short still contact as a tap", () => {
    const tracker = createGestureTracker();
    tracker.down(1, 100, 100, 0);
    expect(tracker.move(1, 104, 102, 80)).toEqual([]);
    expect(tracker.up(1, 104, 102, 200)).toEqual([{ type: "tap", x: 104, y: 102 }]);
    expect(tracker.active).toBe(false);
  });

  it("reports a long press and repeats it while the contact stays still", () => {
    const tracker = createGestureTracker({ longPressMs: 400, repeatMs: 500 });
    tracker.down(1, 10, 20, 0);
    expect(tracker.poll(399)).toEqual([]);
    expect(tracker.poll(400)).toEqual([{ type: "press", x: 10, y: 20, repeat: 0 }]);
    expect(tracker.poll(899)).toEqual([]);
    expect(tracker.poll(1400)).toEqual([
      { type: "press", x: 10, y: 20, repeat: 1 },
      { type: "press", x: 10, y: 20, repeat: 2 },
    ]);
    expect(tracker.up(1, 10, 20, 1500)).toEqual([]);
  });

  it("turns a moving contact into a drag and never into a tap or press", () => {
    const tracker = createGestureTracker({ moveTolerance: 10 });
    tracker.down(1, 0, 0, 0);
    const [drag] = tracker.move(1, 30, 0, 50);
    expect(drag).toEqual({ type: "drag", x: 30, y: 0, dx: 30, dy: 0, seconds: 0.05 });
    expect(tracker.poll(2000)).toEqual([]);
    expect(tracker.up(1, 30, 0, 2100)).toEqual([]);
  });

  it("ignores other pointers and a cancelled contact", () => {
    const tracker = createGestureTracker();
    tracker.down(1, 0, 0, 0);
    expect(tracker.up(2, 0, 0, 100)).toEqual([]);
    tracker.cancel(1);
    expect(tracker.up(1, 0, 0, 120)).toEqual([]);
  });

  it("measures speed in viewport heights per second", () => {
    let speed = 0;
    for (let step = 0; step < 30; step += 1) speed = smoothPointerSpeed(speed, 30, 1 / 60, 900);
    expect(speed).toBeCloseTo(2, 1);
    expect(speed).toBeGreaterThan(FAST_POINTER_SPEED);
    for (let step = 0; step < 60; step += 1) speed = smoothPointerSpeed(speed, 2, 1 / 60, 900);
    expect(speed).toBeLessThan(FAST_POINTER_SPEED / 4);
  });
});
