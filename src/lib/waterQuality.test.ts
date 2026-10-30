import { createWaterFrameBudget, getWaterQuality, nextWaterFrameTime, selectWaterQuality } from "./waterQuality";

const desktop = { coarsePointer: false, reducedMotion: false, cores: 8 };

describe("water device budgets", () => {
  it("retains full detail on a capable desktop", () => {
    expect(selectWaterQuality(desktop)).toBe("full");
  });

  it("limits a phone when its browser supplies no memory or processor hints", () => {
    expect(selectWaterQuality({ coarsePointer: true, reducedMotion: false })).toBe("reduced");
  });

  it.each([{ cores: 2 }, { memory: 2 }])("uses the smallest live simulation for %j", hints => {
    expect(selectWaterQuality({ ...desktop, ...hints })).toBe("low");
  });

  it.each([{ saveData: true }, { memory: 1 }])("avoids graphics initialization for %j", hints => {
    expect(selectWaterQuality({ ...desktop, ...hints })).toBe("static");
  });

  it.each([{ cores: 4 }, { memory: 4 }, { reducedMotion: true }])("reduces the graphics budget for %j", hints => {
    expect(selectWaterQuality({ ...desktop, ...hints })).toBe("reduced");
  });

  it.each(["full", "reduced", "low", "static"])("allows a reproducible %s preview", quality => {
    window.history.replaceState(null, "", `/?ocean-quality=${quality}`);
    expect(getWaterQuality()).toBe(quality);
    window.history.replaceState(null, "", "/");
  });
});

describe("water frame budget", () => {
  it.each([60, 90, 120, 144])("keeps 60 frames per second on a %i Hz display", refresh => {
    const interval = 1_000 / 60;
    const budget = createWaterFrameBudget(interval, "full");
    let deadline = 0;
    let last = 0;
    let frames = 0;
    for (let tick = 1; tick <= refresh * 10; tick += 1) {
      const now = tick * 1_000 / refresh;
      if (now < deadline - 2.5) continue;
      if (frames > 0) budget.update(now - last, now);
      deadline = nextWaterFrameTime(now, frames === 0 ? now : deadline, interval);
      last = now;
      frames += 1;
    }
    expect(frames).toBeGreaterThanOrEqual(599);
    expect(frames).toBeLessThanOrEqual(601);
    expect(budget.scale).toBe(1);
    expect(budget.needsFallback).toBe(false);
  });

  it("accepts a stable 30 fps cadence without a renderer rebuild", () => {
    const budget = createWaterFrameBudget(1_000 / 60, "full");
    for (let frame = 1; frame <= 24; frame += 1) budget.update(1_000 / 30, frame * 1_000 / 30);
    expect(budget.scale).toBeLessThan(0.8);
    for (let frame = 25; frame <= 90; frame += 1) budget.update(1_000 / 30, frame * 1_000 / 30);
    expect(budget.scale).toBe(0.75);
    expect(budget.interval).toBe(1_000 / 30);
    expect(budget.needsFallback).toBe(false);
  });

  it("requests a lighter profile when the full renderer also fails at 30 fps", () => {
    const budget = createWaterFrameBudget(1_000 / 60, "full");
    for (let frame = 1; frame <= 100; frame += 1) budget.update(100, frame * 100);
    expect(budget.interval).toBe(1_000 / 30);
    expect(budget.needsFallback).toBe(true);
  });

  it("retains a stable resolution after recovery instead of repeating the overload", () => {
    const budget = createWaterFrameBudget(1_000 / 60, "full");
    for (let frame = 1; frame <= 24; frame += 1) budget.update(1_000 / 30, frame * 1_000 / 30);
    const scale = budget.scale;
    for (let frame = 1; frame <= 1_800; frame += 1) budget.update(1_000 / 60, 800 + frame * 1_000 / 60);
    expect(budget.scale).toBe(scale);
    expect(budget.needsFallback).toBe(false);
  });

  it("does not lower quality for one stalled frame", () => {
    const budget = createWaterFrameBudget(1_000 / 60, "full");
    for (let frame = 1; frame <= 300; frame += 1) {
      budget.update(frame === 120 ? 100 : 1_000 / 60, frame * 1_000 / 60);
    }
    expect(budget.scale).toBe(1);
  });

  it("drops stale delay samples after a hidden tab resumes and preserves its resolution", () => {
    const budget = createWaterFrameBudget(1_000 / 60, "full");
    for (let frame = 1; frame <= 60; frame += 1) budget.update(1_000 / 30, frame * 1_000 / 30);
    const scale = budget.scale;
    budget.resetTiming();
    for (let frame = 1; frame <= 60; frame += 1) budget.update(1_000 / 60, 60_000 + frame * 1_000 / 60);
    expect(budget.scale).toBe(scale);
    expect(budget.needsFallback).toBe(false);
  });

  it.each([[50, false], [100, true]])("keeps the low profile live at %i ms unless it remains below 15 fps", (gap, fallback) => {
    const budget = createWaterFrameBudget(1_000 / 30, "low");
    for (let frame = 1; frame <= 100; frame += 1) budget.update(gap, frame * gap);
    expect(budget.needsFallback).toBe(fallback);
  });

  it.each([["full", 0.75], ["reduced", 0.85], ["low", 1]] as const)(
    "keeps the %s scene above its resolution floor under sustained overload", (quality, minimum) => {
      const budget = createWaterFrameBudget(1_000 / 30, quality);
      for (let frame = 1; frame <= 300; frame += 1) budget.update(100, frame * 100);
      expect(budget.scale).toBe(minimum);
      expect(budget.needsFallback).toBe(true);
    },
  );
});
