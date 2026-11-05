/**
 * The shape and resting pose of the wreck, as plain math.
 *
 * The ship is built in a "piece" frame: keel at y = 0, centerline at x = 0,
 * stern at z = -35 and bow at z = +35. It broke in two at BREAK_Z. Each piece
 * has its own transform into the wreck frame, whose origin is WRECK_POSITION
 * at the seabed height there and whose +z points along the heading.
 */
import * as THREE from "three";
import { WRECK_POSITION, seabedHeight } from "../world";
import { wreckToWorld } from "./placement";

export const SHIP = {
  length: 70,
  beam: 11.4,
  depth: 6.2,
  breakZ: 9.5,
  sternZ: -35,
  bowZ: 35,
} as const;

export type Hatch = { z0: number; z1: number; halfWidth: number };

/** Cargo hatches, from aft to forward. */
export const HATCHES: readonly Hatch[] = [
  { z0: -26, z1: -20, halfWidth: 3 },
  { z0: -16.5, z1: -10.5, halfWidth: 3 },
  { z0: 12, z1: 17.5, halfWidth: 3 },
  { z0: 19.5, z1: 25.5, halfWidth: 3 },
];

export const SUPERSTRUCTURE = { z0: -8, z1: 7 } as const;

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Fraction along the hull, 0 at the stern and 1 at the bow. */
export function stationOf(z: number) {
  return clamp01((z - SHIP.sternZ) / SHIP.length);
}

/** Height of the keel above the baseline: it rises under the counter stern and the forefoot. */
export function keelY(s: number) {
  let y = 0;
  if (s > 0.9) y += 1.3 * ((s - 0.9) / 0.1) ** 2;
  if (s < 0.1) y += 2.6 * ((0.1 - s) / 0.1) ** 1.5;
  return y;
}

/** Main deck height: sheer toward the ends, a raised forecastle and poop. */
export function deckY(s: number) {
  return SHIP.depth + 0.9 * ((s - 0.5) / 0.5) ** 2 + 2.4 * smoothstep(0.866, 0.882, s) + 2.2 * (1 - smoothstep(0.112, 0.128, s));
}

/** Height of the bulwark plating above the deck (on the forecastle and poop). */
export function bulwarkHeight(s: number) {
  return 1.0 * Math.max(smoothstep(0.866, 0.882, s), 1 - smoothstep(0.112, 0.128, s));
}

/** How far a station has tapered toward the bow (b) and stern (t), at height fraction h. */
export function taper(s: number, h: number) {
  const bowStart = 0.69 + 0.1 * (1 - h);
  const bow = clamp01((s - bowStart) / (1 - bowStart));
  const sternStart = 0.17 - 0.07 * h;
  const stern = clamp01((sternStart - s) / sternStart);
  return { bow, stern };
}

/** Half the beam at a station and height fraction (0 keel, 1 deck). */
export function halfWidth(s: number, h: number) {
  const { bow, stern } = taper(s, h);
  let factor = 1;
  if (bow > 0) factor *= Math.max(Math.sqrt(Math.max(1 - bow ** 1.7, 0)), 0.015);
  if (stern > 0) {
    const transom = 0.1 + 0.55 * h;
    factor *= transom + (1 - transom) * Math.sqrt(Math.max(1 - stern * stern, 0));
  }
  // A slight flare above the waterline toward the bow.
  return (SHIP.beam / 2) * factor * (1 + 0.04 * h * bow);
}

/**
 * The cross-section at a station, from the starboard deck edge (+x) down
 * around the keel to the port deck edge (-x). Points are [x, y].
 */
export function sectionPoints(s: number, lowerSteps = 7, sideSteps = 5): [number, number][] {
  const keel = keelY(s);
  const top = deckY(s) + bulwarkHeight(s);
  const height = top - keel;
  const bilge = Math.min(1.8, height * 0.32);
  const { bow, stern } = taper(s, 0);
  const exponent = 2.2 + 2.8 * (1 - Math.max(bow, stern));
  const half: [number, number][] = [];
  for (let step = 0; step <= lowerSteps; step += 1) {
    const theta = (step / lowerSteps) * (Math.PI / 2);
    const xn = Math.pow(Math.sin(theta), 2 / exponent);
    const y = keel + bilge - bilge * Math.pow(Math.cos(theta), 2 / exponent);
    half.push([xn, y]);
  }
  for (let step = 1; step <= sideSteps; step += 1) {
    half.push([1, keel + bilge + (height - bilge) * (step / sideSteps)]);
  }
  const scaled = half.map(([xn, y]) => [xn * halfWidth(s, (y - keel) / height), y] as [number, number]);
  const starboard = [...scaled].reverse();
  const port = scaled.slice(1).map(([x, y]) => [-x, y] as [number, number]);
  return [...starboard, ...port];
}

// ---------------------------------------------------------------------------
// Resting pose.

export type PiecePose = {
  name: "stern" | "bow";
  z0: number;
  z1: number;
  pivotZ: number;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  matrix: THREE.Matrix4;
};

export type WreckLayout = {
  /** World position of the wreck frame origin. */
  origin: THREE.Vector3;
  heading: number;
  pieces: PiecePose[];
  /** The wreck frame to world. */
  frame: THREE.Matrix4;
  /** Seabed height in the wreck frame at a wreck-frame (x, z). */
  seabedLocal: (x: number, z: number) => number;
  /** Where the mooring line is tied on the forecastle, in world space. */
  mooringPoint: THREE.Vector3;
};

function poseMatrix(position: THREE.Vector3, pivotZ: number, yaw: number, pitch: number, roll: number) {
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
  return new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(rotation)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -pivotZ));
}

/**
 * Settle a piece: fit its pitch to the seabed under the keel, then sink it so
 * the keel line lies `burial` meters below the sand on average.
 */
function settle(seabedLocal: (x: number, z: number) => number, piece: Omit<PiecePose, "matrix" | "pitch" | "position"> & { offsetX: number; offsetZ: number; burial: number; extraPitch: number }) {
  const length = piece.z1 - piece.z0;
  const dirX = Math.sin(piece.yaw);
  const dirZ = Math.cos(piece.yaw);
  const startOffset = piece.z0 - piece.pivotZ;
  const samples: { t: number; height: number }[] = [];
  for (let index = 0; index <= 8; index += 1) {
    const along = startOffset + (index / 8) * length;
    samples.push({ t: along, height: seabedLocal(piece.offsetX + dirX * along, piece.offsetZ + dirZ * along) });
  }
  const meanT = samples.reduce((sum, item) => sum + item.t, 0) / samples.length;
  const meanH = samples.reduce((sum, item) => sum + item.height, 0) / samples.length;
  let numerator = 0;
  let denominator = 0;
  for (const item of samples) {
    numerator += (item.t - meanT) * (item.height - meanH);
    denominator += (item.t - meanT) ** 2;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  const pitch = -Math.atan(slope) + piece.extraPitch;
  // Height of the fitted seabed line at the pivot (t = 0).
  const pivotHeight = meanH - slope * meanT;
  const position = new THREE.Vector3(piece.offsetX, pivotHeight - piece.burial, piece.offsetZ);
  return { pitch, position };
}

export function createWreckLayout(): WreckLayout {
  const originY = seabedHeight(WRECK_POSITION.x, WRECK_POSITION.z);
  const origin = new THREE.Vector3(WRECK_POSITION.x, originY, WRECK_POSITION.z);
  const seabedLocal = (x: number, z: number) => {
    const [worldX, worldZ] = wreckToWorld(x, z);
    return seabedHeight(worldX, worldZ) - originY;
  };
  const sternBase = { name: "stern" as const, z0: SHIP.sternZ, z1: SHIP.breakZ, pivotZ: -12.75, yaw: 0, roll: -0.21, offsetX: 0, offsetZ: -12.75, burial: 1.7, extraPitch: 0 };
  const bowBase = { name: "bow" as const, z0: SHIP.breakZ, z1: SHIP.bowZ, pivotZ: SHIP.breakZ, yaw: 0.26, roll: -0.33, offsetX: 1.6, offsetZ: SHIP.breakZ + 2.2, burial: 2.1, extraPitch: 0.03 };
  const pieces: PiecePose[] = [sternBase, bowBase].map(base => {
    const { pitch, position } = settle(seabedLocal, base);
    return {
      name: base.name,
      z0: base.z0,
      z1: base.z1,
      pivotZ: base.pivotZ,
      yaw: base.yaw,
      roll: base.roll,
      pitch,
      position,
      matrix: poseMatrix(position, base.pivotZ, base.yaw, pitch, base.roll),
    };
  });
  const frame = new THREE.Matrix4().compose(origin, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), WRECK_POSITION.heading), new THREE.Vector3(1, 1, 1));
  const bow = pieces[1];
  const mooringPoint = new THREE.Vector3(0, deckY(stationOf(31.5)) + 0.5, 31.5).applyMatrix4(bow.matrix).applyMatrix4(frame);
  return { origin, heading: WRECK_POSITION.heading, pieces, frame, seabedLocal, mooringPoint };
}

/** A point in a piece's frame, in world space. */
export function pieceToWorld(layout: WreckLayout, piece: PiecePose, x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).applyMatrix4(piece.matrix).applyMatrix4(layout.frame);
}
