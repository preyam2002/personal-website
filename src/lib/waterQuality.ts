export type WaterQuality = "full" | "reduced" | "low" | "static";

type DeviceHints = {
  coarsePointer: boolean;
  reducedMotion: boolean;
  cores?: number;
  memory?: number;
  saveData?: boolean;
};

export function selectWaterQuality(hints: DeviceHints): WaterQuality {
  if (hints.saveData || (hints.memory !== undefined && hints.memory <= 1)) return "static";
  if ((hints.cores && hints.cores <= 2) || (hints.memory && hints.memory <= 2)) return "low";
  if (hints.coarsePointer || hints.reducedMotion
    || (hints.cores && hints.cores <= 4) || (hints.memory && hints.memory <= 4)) return "reduced";
  return "full";
}

export function getWaterQuality(): WaterQuality {
  const override = new URLSearchParams(window.location.search).get("ocean-quality");
  if (override === "full" || override === "reduced" || override === "low" || override === "static") {
    return override;
  }
  const hints = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  return selectWaterQuality({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    cores: navigator.hardwareConcurrency,
    memory: hints.deviceMemory,
    saveData: hints.connection?.saveData,
  });
}

export function nextWaterFrameTime(timestamp: number, deadline: number, interval: number) {
  return deadline + Math.max(1, Math.floor((timestamp - deadline + 2.5) / interval) + 1) * interval;
}

export function createWaterFrameBudget(interval: number, quality: Exclude<WaterQuality, "static">) {
  const minimumScale = quality === "full" ? 0.75 : quality === "reduced" ? 0.85 : 1;
  let scale = 1;
  let startedAt: number | null = null;
  let slowSince: number | null = null;
  let floorSince: number | null = null;
  let holdUntil = 0;
  let average = interval;
  let trend = interval;
  let frames = 0;
  let needsFallback = false;

  return {
    get interval() { return interval; },
    get scale() { return scale; },
    get needsFallback() { return needsFallback; },
    resetTiming() {
      startedAt = null;
      slowSince = null;
      floorSince = null;
      holdUntil = 0;
      average = interval;
      trend = interval;
      frames = 0;
      needsFallback = false;
    },
    update(gap: number, timestamp: number) {
      startedAt ??= timestamp;
      frames += 1;
      average += (Math.min(gap, interval * 4) - average) * 0.2;
      trend += (gap - trend) * 0.3;
      if (frames < 8 || timestamp - startedAt < 350 || timestamp < holdUntil) return;
      if (average <= interval * 1.1) {
        slowSince = null;
        floorSince = null;
        needsFallback = false;
        return;
      }
      slowSince ??= timestamp;
      if (timestamp - slowSince < 200) return;
      if (scale > minimumScale) {
        const proportional = Math.sqrt(interval * 0.85 / Math.max(trend, interval));
        scale = Math.max(minimumScale, scale * Math.min(0.82, proportional));
        slowSince = null;
        floorSince = null;
        holdUntil = timestamp + 250;
        return;
      }
      if (interval < 1_000 / 30) {
        interval = 1_000 / 30;
        average = interval;
        trend = interval;
        slowSince = null;
        floorSince = null;
        holdUntil = timestamp + 500;
        return;
      }
      if (quality === "low" && average < 1_000 / 15) {
        floorSince = null;
        needsFallback = false;
        return;
      }
      floorSince ??= timestamp;
      needsFallback = timestamp - floorSince >= 750;
    },
  };
}
