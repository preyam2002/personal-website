/**
 * The explorable sea: a 600 m square around the origin.
 *
 * North is +z and east is -x (Three.js is right-handed and y is up).
 * The diver starts at the surface near the south edge, above a shallow reef.
 * North of the reef, sand flats lead to a kelp forest in the east (x < 0), a
 * wreck on the sand in the middle, and a drop-off into deep water in the north
 * west (x > 0, z > 0).
 * Heights are in meters; the water surface is at y = 0 and y is negative below.
 */

export const WORLD_SIZE = 600;
export const WORLD_HALF = WORLD_SIZE / 2;
export const SPAWN = { x: 0, y: 0, z: -230 } as const;

export type Zone = {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
};

export const ZONES: readonly Zone[] = [
  { id: "reef", name: "Coral reef", x: 10, z: -190, radius: 70 },
  { id: "kelp", name: "Kelp forest", x: -150, z: -20, radius: 80 },
  { id: "wreck", name: "Wreck site", x: 40, z: 40, radius: 45 },
  { id: "flats", name: "Sand flats", x: 60, z: -90, radius: 90 },
  { id: "dropoff", name: "The drop-off", x: 170, z: 170, radius: 110 },
];

export const WRECK_POSITION = { x: 40, z: 40, heading: 0.6 } as const;

function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fx = x - cellX;
  const fy = y - cellY;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(cellX, cellY);
  const b = hash(cellX + 1, cellY);
  const c = hash(cellX, cellY + 1);
  const d = hash(cellX + 1, cellY + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fractalNoise(x: number, y: number, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise(x * frequency + octave * 17.3, y * frequency - octave * 9.1) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Return the seabed height (negative, in meters) at a point.
 *
 * The base depth falls from about 7 m at the reef to 24 m on the flats and to
 * 55 m past the drop-off. Dunes, reef mounds, and a scour pit around the wreck
 * add detail. The function is continuous, so the mesh and the collision agree.
 */
export function seabedHeight(x: number, z: number) {
  const reef = ZONES[0];
  const reefDistance = Math.hypot(x - reef.x, z - reef.z);
  const toDropoff = (x + z - 230) / Math.SQRT2;
  let depth = 24;
  depth -= 15 * (1 - smoothstep(30, 120, reefDistance));
  depth += 31 * smoothstep(-20, 40, toDropoff);
  // Long dunes across the current on the sand.
  depth += 0.9 * Math.sin(x * 0.11 + Math.sin(z * 0.03) * 2.2) * smoothstep(40, 110, reefDistance);
  depth += (fractalNoise(x * 0.02, z * 0.02) - 0.5) * 7;
  // Reef mounds and bommies near the reef.
  depth -= (fractalNoise(x * 0.09 + 3.1, z * 0.09 - 1.7, 3) - 0.35) * 5 * (1 - smoothstep(20, 90, reefDistance));
  // The current scours a shallow pit around the wreck.
  const wreckDistance = Math.hypot(x - WRECK_POSITION.x, z - WRECK_POSITION.z);
  depth += 1.5 * (1 - smoothstep(14, 40, wreckDistance));
  // The edges of the world rise into a shallow bank, so the player cannot leave by the seabed.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  depth -= 18 * smoothstep(WORLD_HALF - 60, WORLD_HALF, edge);
  return -Math.max(depth, 1.5);
}

/** Return the nearest named zone within its radius, or null in open water. */
export function zoneAt(x: number, z: number) {
  let best: Zone | null = null;
  let bestRatio = 1;
  for (const zone of ZONES) {
    const ratio = Math.hypot(x - zone.x, z - zone.z) / zone.radius;
    if (ratio < bestRatio) {
      best = zone;
      bestRatio = ratio;
    }
  }
  return best;
}
