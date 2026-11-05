import type { Vec3 } from "./player";

export type PhotoSubject = {
  id: string;
  position: Vec3;
  radius: number;
};

export type PhotoResult = {
  id: string;
  /** The part of the frame height that the subject fills. */
  fill: number;
  distance: number;
} | null;

/** Light under water fades with distance. Past this range a photo shows only blue. */
export const PHOTO_RANGE = 38;
/** A subject must fill this part of the frame height. */
export const PHOTO_MIN_FILL = 0.12;

/**
 * Find the subject that a photo captures.
 *
 * The subject must be in front of the camera, inside the frame, within the
 * photo range, and large enough in the frame. The best subject is the one that
 * fills the most of the frame, with a small penalty for distance from the
 * center of the frame.
 */
export function evaluatePhoto(
  camera: Vec3,
  forward: Vec3,
  up: Vec3,
  verticalFov: number,
  aspect: number,
  subjects: readonly PhotoSubject[],
): PhotoResult {
  const right: Vec3 = [
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0],
  ];
  const halfHeight = Math.tan(verticalFov / 2);
  let best: PhotoResult = null;
  let bestScore = 0;
  for (const subject of subjects) {
    const offset: Vec3 = [
      subject.position[0] - camera[0],
      subject.position[1] - camera[1],
      subject.position[2] - camera[2],
    ];
    const distance = Math.hypot(...offset);
    if (distance > PHOTO_RANGE + subject.radius) continue;
    const depth = offset[0] * forward[0] + offset[1] * forward[1] + offset[2] * forward[2];
    if (depth <= subject.radius * 0.5) continue;
    const screenX = (offset[0] * right[0] + offset[1] * right[1] + offset[2] * right[2]) / (depth * halfHeight * aspect);
    const screenY = (offset[0] * up[0] + offset[1] * up[1] + offset[2] * up[2]) / (depth * halfHeight);
    if (Math.abs(screenX) > 1 || Math.abs(screenY) > 1) continue;
    const fill = Math.min(subject.radius / (depth * halfHeight), 2);
    if (fill < PHOTO_MIN_FILL) continue;
    const score = Math.min(fill, 1) * (1 - 0.35 * Math.hypot(screenX, screenY) / Math.SQRT2);
    if (score > bestScore) {
      bestScore = score;
      best = { id: subject.id, fill, distance };
    }
  }
  return best;
}

export type JournalEntry = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  found: boolean;
  foundAt: number | null;
};

export function createJournal(entries: readonly Omit<JournalEntry, "found" | "foundAt">[]) {
  return entries.map(entry => ({ ...entry, found: false, foundAt: null }));
}

/** Mark an entry as found. Return true only the first time. */
export function recordDiscovery(journal: JournalEntry[], id: string, time: number) {
  const entry = journal.find(item => item.id === id);
  if (!entry || entry.found) return false;
  entry.found = true;
  entry.foundAt = time;
  return true;
}

export function journalProgress(journal: readonly JournalEntry[]) {
  const found = journal.filter(entry => entry.found).length;
  return { found, total: journal.length, complete: journal.length > 0 && found === journal.length };
}
