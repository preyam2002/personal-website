/**
 * Pure placement logic for the scenery: where things stand, how deep they sit
 * in the sand, and which places stay clear. Nothing here touches the GPU, so
 * the rules can be tested in Node.
 */
import type { GameQuality } from "../types";
import { WORLD_HALF, WRECK_POSITION, ZONES, fractalNoise, seabedHeight, type Zone } from "../world";
import type { Random } from "./random";

export const QUALITY_SCALE: Record<GameQuality, number> = { high: 1, medium: 0.55, low: 0.3 };

/** Scale a count for the quality level, never below one. */
export function scaledCount(base: number, quality: GameQuality) {
  return Math.max(1, Math.round(base * QUALITY_SCALE[quality]));
}

export function zone(id: string): Zone {
  const found = ZONES.find(item => item.id === id);
  if (!found) throw new Error(`Unknown zone ${id}`);
  return found;
}

/** The unit normal of the seabed at a point, as [x, y, z]. */
export function seabedNormal(x: number, z: number, step = 0.5): [number, number, number] {
  const dx = (seabedHeight(x + step, z) - seabedHeight(x - step, z)) / (2 * step);
  const dz = (seabedHeight(x, z + step) - seabedHeight(x, z - step)) / (2 * step);
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}

/**
 * The height at which an object of a given footprint radius stands so that
 * no part of its base floats: the lowest seabed point under the footprint.
 */
export function groundY(x: number, z: number, radius = 0) {
  let lowest = seabedHeight(x, z);
  if (radius > 0) {
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      lowest = Math.min(lowest, seabedHeight(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
  }
  return lowest;
}

// ---------------------------------------------------------------------------
// The wreck frame: local +z is the bow, local +x the port-to-starboard axis.

const WRECK_SIN = Math.sin(WRECK_POSITION.heading);
const WRECK_COS = Math.cos(WRECK_POSITION.heading);

/** Convert a point in the wreck's horizontal frame to world x and z. */
export function wreckToWorld(localX: number, localZ: number): [number, number] {
  // The same rotation as Object3D.rotation.y = heading.
  return [
    WRECK_POSITION.x + localX * WRECK_COS + localZ * WRECK_SIN,
    WRECK_POSITION.z - localX * WRECK_SIN + localZ * WRECK_COS,
  ];
}

/** Convert world x and z to the wreck's horizontal frame. */
export function worldToWreck(x: number, z: number): [number, number] {
  const dx = x - WRECK_POSITION.x;
  const dz = z - WRECK_POSITION.z;
  return [dx * WRECK_COS - dz * WRECK_SIN, dx * WRECK_SIN + dz * WRECK_COS];
}

/** True when a point lies on the wreck or its debris field, plus a margin. */
export function insideWreckArea(x: number, z: number, margin = 0) {
  const [localX, localZ] = worldToWreck(x, z);
  return Math.abs(localZ) < 38 + margin && localX > -10 - margin && localX < 18 + margin;
}

// ---------------------------------------------------------------------------
// Fixed sites for the discoverable props. Other scenery keeps clear of them.

export const PROP_SITES = {
  anchor: { x: 78, z: -48, radius: 7 },
  amphorae: { x: -38, z: -104, radius: 10 },
  clam: { x: 32, z: -168, radius: 2.5 },
  chest: (() => {
    const [x, z] = wreckToWorld(11.5, 5.5);
    return { x, z, radius: 2 };
  })(),
} as const;

export type ClearArea = { x: number; z: number; radius: number };

export const KEEP_CLEAR: readonly ClearArea[] = [
  PROP_SITES.anchor,
  PROP_SITES.amphorae,
  PROP_SITES.clam,
  PROP_SITES.chest,
];

export function insideClearArea(x: number, z: number, margin = 0, areas: readonly ClearArea[] = KEEP_CLEAR) {
  return areas.some(area => Math.hypot(x - area.x, z - area.z) < area.radius + margin);
}

export function insideWorld(x: number, z: number, margin = 20) {
  return Math.abs(x) < WORLD_HALF - margin && Math.abs(z) < WORLD_HALF - margin;
}

// ---------------------------------------------------------------------------
// Scattering.

export type ScatterPoint = { x: number; z: number };

export type ScatterOptions = {
  random: Random;
  count: number;
  /** Where to sample: a disc, or the whole world when omitted. */
  center?: { x: number; z: number };
  radius?: number;
  /** Minimum distance between points. */
  spacing?: number;
  /** Extra rule; return false to reject a point. */
  accept?: (x: number, z: number) => boolean;
  /** Bias toward the center of the disc: 1 is uniform, higher is denser in the middle. */
  falloff?: number;
  maxAttempts?: number;
};

/**
 * Scatter points with a minimum spacing (dart throwing on a hash grid).
 * Returns at most `count` points; fewer when the rules reject too many.
 */
export function scatter(options: ScatterOptions): ScatterPoint[] {
  const { random, count, center, radius = WORLD_HALF, spacing = 0, accept, falloff = 1 } = options;
  const maxAttempts = options.maxAttempts ?? count * 30;
  const points: ScatterPoint[] = [];
  const cell = Math.max(spacing, 1e-3);
  const grid = new Map<string, ScatterPoint[]>();
  const key = (gx: number, gz: number) => `${gx},${gz}`;
  for (let attempt = 0; attempt < maxAttempts && points.length < count; attempt += 1) {
    let x: number;
    let z: number;
    if (center) {
      const angle = random() * Math.PI * 2;
      const distance = radius * Math.pow(random(), 0.5 * falloff);
      x = center.x + Math.cos(angle) * distance;
      z = center.z + Math.sin(angle) * distance;
    } else {
      x = (random() * 2 - 1) * radius;
      z = (random() * 2 - 1) * radius;
    }
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    if (spacing > 0) {
      let tooClose = false;
      for (let ox = -1; ox <= 1 && !tooClose; ox += 1) {
        for (let oz = -1; oz <= 1 && !tooClose; oz += 1) {
          for (const other of grid.get(key(gx + ox, gz + oz)) ?? []) {
            if (Math.hypot(other.x - x, other.z - z) < spacing) {
              tooClose = true;
              break;
            }
          }
        }
      }
      if (tooClose) continue;
    }
    if (accept && !accept(x, z)) continue;
    const point = { x, z };
    points.push(point);
    const list = grid.get(key(gx, gz));
    if (list) list.push(point);
    else grid.set(key(gx, gz), [point]);
  }
  return points;
}

/** A coarse density field in [0, 1] for patchy growth (meadows, coral heads). */
export function patchiness(x: number, z: number, scale: number, seed = 0) {
  return fractalNoise(x * scale + seed * 13.1, z * scale - seed * 7.3, 3);
}

/** Distance-based falloff: 1 inside 60% of a zone, 0 at its edge. */
export function zoneWeight(x: number, z: number, area: { x: number; z: number; radius: number }) {
  const t = Math.hypot(x - area.x, z - area.z) / area.radius;
  if (t <= 0.6) return 1;
  if (t >= 1) return 0;
  const s = (t - 0.6) / 0.4;
  return 1 - s * s * (3 - 2 * s);
}

// ---------------------------------------------------------------------------
// Instances standing on the seabed.

export type Placement = {
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical axis. */
  yaw: number;
  scale: number;
  /** How far the base was pushed into the sand, in meters. */
  burial: number;
};

/**
 * Stand an object on the seabed: at the lowest point under its footprint,
 * pushed `burial` meters deeper, so it never floats.
 */
export function standOnSeabed(x: number, z: number, footprint: number, burial: number, yaw = 0, scale = 1): Placement {
  return { x, y: groundY(x, z, footprint) - burial, z, yaw, scale, burial };
}

export type KelpStalk = {
  x: number;
  y: number;
  z: number;
  /** Height from the holdfast to just below the surface. */
  height: number;
  yaw: number;
  lean: number;
  phase: number;
};

export type KelpHoldfast = { x: number; y: number; z: number; scale: number };

/**
 * Giant kelp grows in clumps: each holdfast sends up several stipes that
 * reach the surface. Returns holdfasts and stalks; stalk tops stop below the surface.
 */
export function placeKelp(random: Random, stalkCount: number, currentAngle: number) {
  const kelpZone = zone("kelp");
  const holdfastTarget = Math.max(1, Math.round(stalkCount / 2.8));
  const points = scatter({
    random,
    count: holdfastTarget,
    center: kelpZone,
    radius: kelpZone.radius * 0.65,
    spacing: 2.6,
    falloff: 1.25,
    accept: (x, z) =>
      insideWorld(x, z) && !insideClearArea(x, z, 3) && patchiness(x, z, 0.035, 2) > 0.3 && seabedHeight(x, z) < -8,
  });
  const holdfasts: KelpHoldfast[] = [];
  const stalks: KelpStalk[] = [];
  let remaining = stalkCount;
  points.forEach((point, index) => {
    const y = groundY(point.x, point.z, 0.6);
    holdfasts.push({ x: point.x, y: y - 0.1, z: point.z, scale: 0.7 + random() * 0.6 });
    const left = points.length - index;
    const jitter = Math.round(remaining / left + (random() - 0.5) * 3);
    const stipes = left === 1 ? remaining : Math.max(1, Math.min(remaining - (left - 1), jitter));
    remaining -= stipes;
    for (let stipe = 0; stipe < stipes; stipe += 1) {
      const angle = random() * Math.PI * 2;
      const offset = random() * 0.35;
      const x = point.x + Math.cos(angle) * offset;
      const z = point.z + Math.sin(angle) * offset;
      const base = seabedHeight(x, z) - 0.05;
      const height = Math.max(-base - 0.4 - random() * 1.6, 2);
      stalks.push({
        x,
        y: base,
        z,
        height,
        yaw: currentAngle + (random() - 0.5) * 0.9,
        lean: random(),
        phase: random() * Math.PI * 2,
      });
    }
  });
  return { holdfasts, stalks };
}

// ---------------------------------------------------------------------------
// Rocks across the map.

export type RockClass = "small" | "medium" | "boulder" | "garden";

export type RockPlacement = Placement & { kind: RockClass; tiltX: number; tiltZ: number; stretch: number };

const ROCK_SPECS: Record<RockClass, { base: number; spacing: number; scale: [number, number]; burial: number }> = {
  small: { base: 340, spacing: 1.5, scale: [0.18, 0.6], burial: 0.12 },
  medium: { base: 150, spacing: 4, scale: [0.6, 1.6], burial: 0.15 },
  boulder: { base: 30, spacing: 12, scale: [1.8, 4.2], burial: 0.2 },
  garden: { base: 10, spacing: 30, scale: [0.45, 0.8], burial: 0.08 },
};

/** How rocky the bottom is: the kelp zone and drop-off are rocky, the reef has bommies, the flats are sand. */
export function rockiness(x: number, z: number) {
  const kelp = zoneWeight(x, z, zone("kelp"));
  const reef = zoneWeight(x, z, zone("reef"));
  const dropoff = zoneWeight(x, z, zone("dropoff"));
  const edge = Math.min(Math.max((Math.max(Math.abs(x), Math.abs(z)) - (WORLD_HALF - 70)) / 40, 0), 1);
  return Math.min(0.08 + kelp * 0.9 + reef * 0.35 + dropoff * 0.8 + edge * 0.5, 1) * (0.4 + patchiness(x, z, 0.05, 5) * 0.9);
}

/**
 * The rock layout for a quality level. Deterministic for a seed, so the reef
 * can avoid the same rocks the rock system builds.
 */
export function placeRocks(random: Random, quality: GameQuality): RockPlacement[] {
  const rocks: RockPlacement[] = [];
  const taken: ClearArea[] = [];
  for (const kind of ["garden", "boulder", "medium", "small"] as RockClass[]) {
    const spec = ROCK_SPECS[kind];
    const count = kind === "garden" ? (quality === "low" ? 4 : quality === "medium" ? 7 : 10) : scaledCount(spec.base, quality);
    const points = scatter({
      random,
      count,
      radius: WORLD_HALF - 15,
      spacing: spec.spacing,
      maxAttempts: count * 80,
      accept: (x, z) =>
        !insideWreckArea(x, z, kind === "small" ? 1 : 4) &&
        !insideClearArea(x, z, 2) &&
        !taken.some(area => Math.hypot(area.x - x, area.z - z) < area.radius) &&
        random() < rockiness(x, z) * (kind === "garden" ? 0.8 : 1),
    });
    for (const point of points) {
      const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * Math.pow(random(), 1.6);
      const footprint = kind === "garden" ? scale * 6 : scale * 0.9;
      const burial = spec.burial * scale;
      rocks.push({
        ...standOnSeabed(point.x, point.z, footprint, burial, random() * Math.PI * 2, scale),
        kind,
        tiltX: (random() - 0.5) * 0.3,
        tiltZ: (random() - 0.5) * 0.3,
        stretch: 0.8 + random() * 0.4,
      });
      if (kind !== "small") taken.push({ x: point.x, z: point.z, radius: kind === "garden" ? 9 * scale : scale * 1.1 });
    }
  }
  return rocks;
}

/** Areas that big rocks cover, so corals and grass do not grow inside them. */
export function rockClearAreas(rocks: readonly RockPlacement[]): ClearArea[] {
  return rocks.filter(rock => rock.kind === "boulder" || rock.kind === "medium").map(rock => ({ x: rock.x, z: rock.z, radius: rock.scale * 1.05 }));
}

export const ROCK_SEED = 4242;

// ---------------------------------------------------------------------------
// The coral reef.

export type ReefKind = "staghorn" | "bush" | "finger" | "brain" | "table" | "fan" | "barrel" | "tube" | "anemone";

type ReefSpec = { scale: [number, number]; burial: number; footprint: number };

export const REEF_SPECS: Record<ReefKind, ReefSpec> = {
  staghorn: { scale: [1.1, 2.2], burial: 0.04, footprint: 0.3 },
  bush: { scale: [1.0, 1.9], burial: 0.03, footprint: 0.2 },
  finger: { scale: [1.0, 1.8], burial: 0.03, footprint: 0.2 },
  brain: { scale: [0.45, 1.3], burial: 0.12, footprint: 0.8 },
  table: { scale: [0.9, 2.0], burial: 0.03, footprint: 0.15 },
  fan: { scale: [0.7, 1.6], burial: 0.02, footprint: 0.05 },
  barrel: { scale: [0.5, 1.3], burial: 0.04, footprint: 0.4 },
  tube: { scale: [0.7, 1.4], burial: 0.02, footprint: 0.15 },
  anemone: { scale: [0.9, 2.1], burial: 0.02, footprint: 0.15 },
};

export type ReefPlacement = Placement & {
  kind: ReefKind;
  tiltX: number;
  tiltZ: number;
  /** Surface normal under the colony when it grows on a reef head; otherwise the seabed's. */
  normal?: [number, number, number];
};

/** A patch reef: a low dome of old coral rock with colonies on and around it. */
export type ReefHead = { x: number; y: number; z: number; radius: number; height: number };

/** Height of a reef head's dome at (x, z), inside the lumpy real surface (which dents by at most 20%). */
export function reefHeadHeight(head: ReefHead, x: number, z: number) {
  const t = Math.hypot(x - head.x, z - head.z) / head.radius;
  return t >= 1 ? -Infinity : head.y + head.height * 0.8 * Math.sqrt(1 - t * t);
}

/** Share of each kind on a reef head, and of the scattered colonies between heads. */
const HEAD_MIX: [ReefKind, number][] = [
  ["staghorn", 3],
  ["bush", 2.5],
  ["finger", 2],
  ["brain", 2],
  ["table", 1],
  ["fan", 2],
  ["barrel", 1],
  ["tube", 1.2],
  ["anemone", 1.3],
];

function pickKind(random: Random): ReefKind {
  const total = HEAD_MIX.reduce((sum, [, weight]) => sum + weight, 0);
  let value = random() * total;
  for (const [kind, weight] of HEAD_MIX) {
    value -= weight;
    if (value <= 0) return kind;
  }
  return "staghorn";
}

/**
 * Place reef heads and the colonies that grow on them. Most heads are on the
 * reef; a few stand at the top of the drop-off. Colonies on a head sit on its
 * dome, the rest on the seabed. Nothing grows inside big rocks or on prop sites.
 */
export function placeReef(random: Random, quality: GameQuality, rockAreas: readonly ClearArea[] = []) {
  const reef = zone("reef");
  const dropoff = zone("dropoff");
  const dropoffSite = { x: dropoff.x - 40, z: dropoff.z - 40, radius: 45 };
  const headCount = scaledCount(44, quality);
  const perHead = quality === "low" ? 10 : 14;
  const clearOf = (x: number, z: number, margin: number) =>
    insideWorld(x, z) && !insideClearArea(x, z, margin) && !insideClearArea(x, z, margin, rockAreas) && !insideWreckArea(x, z, 2);
  const heads: ReefHead[] = [];
  const sites = [
    { area: reef, radius: reef.radius * 0.9, count: Math.round(headCount * 0.86) },
    { area: dropoffSite, radius: dropoffSite.radius, count: headCount - Math.round(headCount * 0.86) },
  ];
  for (const site of sites) {
    const points = scatter({
      random,
      count: site.count,
      center: site.area,
      radius: site.radius,
      spacing: 9,
      falloff: 1.1,
      maxAttempts: site.count * 80,
      accept: (x, z) => clearOf(x, z, 5) && patchiness(x, z, 0.05, 3) > 0.3,
    });
    for (const point of points) {
      const radius = 1.6 + random() * 2;
      const height = radius * (0.3 + random() * 0.25);
      // Settle into the sand without burying the dome on a slope.
      const seabed = seabedHeight(point.x, point.z);
      const y = Math.min(Math.max(groundY(point.x, point.z, radius * 0.6), seabed - height * 0.5), seabed) - 0.1;
      heads.push({ x: point.x, y, z: point.z, radius, height });
    }
  }
  const placements: ReefPlacement[] = [];
  const add = (kind: ReefKind, x: number, z: number, head: ReefHead | null) => {
    const spec = REEF_SPECS[kind];
    const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * random();
    const yaw = random() * Math.PI * 2;
    const tiltX = (random() - 0.5) * 0.25;
    const tiltZ = (random() - 0.5) * 0.25;
    const dome = head ? reefHeadHeight(head, x, z) : -Infinity;
    const ground = standOnSeabed(x, z, spec.footprint * scale, spec.burial * scale, yaw, scale);
    if (head && dome - spec.burial * scale > ground.y) {
      // On the dome: embed the base a little and lean with the dome's surface.
      const dx = (x - head.x) / (head.radius * head.radius);
      const dz = (z - head.z) / (head.radius * head.radius);
      const dy = Math.max(dome - head.y, 0.01) / (head.height * head.height);
      const length = Math.hypot(dx, dy, dz);
      placements.push({ ...ground, y: dome - spec.burial * scale - 0.05, kind, tiltX, tiltZ, normal: [dx / length, dy / length, dz / length] });
    } else {
      placements.push({ ...ground, kind, tiltX, tiltZ });
    }
  };
  for (const head of heads) {
    const count = Math.round(perHead * (0.7 + random() * 0.6) * (head.radius / 3.3));
    const colonies = scatter({
      random,
      count,
      center: head,
      radius: head.radius * 1.2,
      spacing: 0.7,
      maxAttempts: count * 30,
      accept: (x, z) => clearOf(x, z, 0.4),
    });
    for (const colony of colonies) add(pickKind(random), colony.x, colony.z, head);
  }
  // Scattered colonies on the sand between heads.
  const scattered = scatter({
    random,
    count: scaledCount(70, quality),
    center: reef,
    radius: reef.radius * 0.95,
    spacing: 1.5,
    maxAttempts: 8000,
    accept: (x, z) => clearOf(x, z, 0.6) && !heads.some(head => Math.hypot(head.x - x, head.z - z) < head.radius * 1.3) && patchiness(x, z, 0.07, 4) > 0.42,
  });
  for (const point of scattered) add(pickKind(random), point.x, point.z, null);
  return { heads, placements };
}

// ---------------------------------------------------------------------------
// Sea floor detail: seagrass, starfish, shells.

export type FloorKind = "grass" | "starfish" | "conch" | "cockle";

/** Seagrass meadows: on sand, in shallow-to-mid water, in patches. */
export function seagrassDensity(x: number, z: number) {
  const flats = zoneWeight(x, z, zone("flats"));
  const reef = zone("reef");
  // A sandy fringe around the reef and the shallows at the spawn.
  const reefDistance = Math.hypot(x - reef.x, z - reef.z);
  const fringe = Math.max(0, 1 - Math.abs(reefDistance - reef.radius * 0.95) / 35);
  const depth = -seabedHeight(x, z);
  const depthOk = depth > 3 && depth < 27 ? 1 : 0;
  return Math.min(flats + fringe * 0.8, 1) * depthOk * (1 - Math.min(rockiness(x, z) * 1.5, 1) * 0.6);
}

export function placeSeaFloor(random: Random, quality: GameQuality, avoid: readonly ClearArea[] = []) {
  const counts: Record<FloorKind, number> = {
    grass: scaledCount(1150, quality),
    starfish: scaledCount(130, quality),
    conch: scaledCount(90, quality),
    cockle: scaledCount(150, quality),
  };
  const flats = zone("flats");
  const reef = zone("reef");
  const result: Record<FloorKind, Placement[]> = { grass: [], starfish: [], conch: [], cockle: [] };
  const clear = (x: number, z: number, margin: number) =>
    insideWorld(x, z) && !insideWreckArea(x, z, 1) && !insideClearArea(x, z, margin) && !insideClearArea(x, z, 0.2, avoid);
  // Grass grows in meadows: pick meadow centers, then clumps around them.
  const meadows = scatter({
    random,
    count: Math.max(6, Math.round(counts.grass / 60)),
    center: { x: flats.x - 20, z: flats.z - 30 },
    radius: flats.radius + 70,
    spacing: 14,
    maxAttempts: 4000,
    accept: (x, z) => clear(x, z, 4) && seagrassDensity(x, z) > 0.35,
  });
  const perMeadow = Math.ceil(counts.grass / Math.max(meadows.length, 1));
  for (const meadow of meadows) {
    const clumps = scatter({
      random,
      count: perMeadow,
      center: meadow,
      radius: 3.5 + random() * 3,
      spacing: 0.3,
      falloff: 1.2,
      accept: (x, z) => clear(x, z, 2) && seagrassDensity(x, z) > 0.2,
    });
    for (const clump of clumps) {
      if (result.grass.length >= counts.grass) break;
      result.grass.push(standOnSeabed(clump.x, clump.z, 0.15, 0.03, random() * Math.PI * 2, 0.7 + random() * 0.6));
    }
  }
  const smallThings: [FloorKind, number, number][] = [["starfish", 0.12, 0.01], ["conch", 0.08, 0.03], ["cockle", 0.05, 0.015]];
  for (const [kind, footprint, burial] of smallThings) {
    const points = scatter({
      random,
      count: counts[kind],
      center: random() < 0.5 ? flats : { x: (flats.x + reef.x) / 2, z: (flats.z + reef.z) / 2 },
      radius: flats.radius + 60,
      spacing: 1.5,
      maxAttempts: counts[kind] * 40,
      accept: (x, z) => clear(x, z, 1) && -seabedHeight(x, z) < 30,
    });
    result[kind] = points.map(point => standOnSeabed(point.x, point.z, footprint, burial, random() * Math.PI * 2, 0.7 + random() * 0.7));
  }
  return result;
}
