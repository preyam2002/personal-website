// Compute a "magazine edition" number: weeks since 2026-01-01.
// Stable inside a single render pass.

const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();

export function getEditionNumber(now: Date = new Date()): number {
  const weeks = Math.floor((now.getTime() - EPOCH) / (7 * 86400000));
  return Math.max(1, weeks + 1);
}

export function getEditionLabel(now: Date = new Date()): string {
  return `Nº ${String(getEditionNumber(now)).padStart(3, "0")}`;
}

export function getInitialIst(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(now);
}

export function getDateline(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return fmt.format(now);
}
