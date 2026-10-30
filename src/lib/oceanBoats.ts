import type { Vector3 } from "./oceanCamera";
import { ACTOR_TEXTURE_WIDTH, FLOATING_MARGIN, PELLET_SLOTS, type SchoolBounds } from "./oceanLife";
import type { ProbeSample } from "./oceanProbes";

export const BOAT_SLOTS = 3;
// The keel sits this fraction of the boat length below the waterline.
export const BOAT_DRAFT = 0.05;
export const BOAT_BOUND_RADIUS = 0.62;
export const BOAT_DRIFT_SPEED = 0.035;
const BOAT_REGION = { left: -3.2, right: 3.2, near: -2, far: 9 };
const BOAT_SPACING = 0.7;

export type PaperBoat = {
  anchor: [number, number];
  velocity: [number, number];
  yaw: number;
  yawRate: number;
  length: number;
  tint: number;
  position: Vector3;
  normal: Vector3;
};

const START_ANCHORS: [number, number][] = [[-1.6, 2.4], [1.9, 0.6], [0.3, 6.5]];

export function createBoats(count: number, random: () => number): PaperBoat[] {
  return START_ANCHORS.slice(0, Math.min(count, BOAT_SLOTS)).map(([x, z], index) => ({
    anchor: [x + (random() - 0.5) * 0.6, z + (random() - 0.5) * 0.6],
    velocity: [0, 0],
    yaw: random() * Math.PI * 2,
    yawRate: 0,
    length: 0.3 + random() * 0.08,
    tint: index / Math.max(BOAT_SLOTS - 1, 1),
    position: [x, 0, z],
    normal: [0, 1, 0],
  }));
}

/**
 * Advance the boat drift.
 *
 * Velocity relaxes toward a slow downwind drift. A soft wall keeps each boat
 * in the near water, and boats push apart when they come too close. The yaw
 * turns toward the direction of travel and keeps any spin from a push.
 */
export function stepBoats(boats: PaperBoat[], seconds: number, wind: readonly [number, number]) {
  if (seconds <= 0) return;
  const relax = 1 - Math.exp(-seconds * 0.6);
  for (const boat of boats) {
    const [x, z] = boat.anchor;
    let targetX = wind[0] * BOAT_DRIFT_SPEED;
    let targetZ = wind[1] * BOAT_DRIFT_SPEED;
    if (x < BOAT_REGION.left) targetX += (BOAT_REGION.left - x) * 0.3;
    if (x > BOAT_REGION.right) targetX -= (x - BOAT_REGION.right) * 0.3;
    if (z < BOAT_REGION.near) targetZ += (BOAT_REGION.near - z) * 0.3;
    if (z > BOAT_REGION.far) targetZ -= (z - BOAT_REGION.far) * 0.3;
    for (const other of boats) {
      if (other === boat) continue;
      const dx = x - other.anchor[0];
      const dz = z - other.anchor[1];
      const distance = Math.hypot(dx, dz);
      if (distance > 1e-6 && distance < BOAT_SPACING) {
        targetX += dx / distance * (BOAT_SPACING - distance) * 0.8;
        targetZ += dz / distance * (BOAT_SPACING - distance) * 0.8;
      }
    }
    boat.velocity[0] += (targetX - boat.velocity[0]) * relax;
    boat.velocity[1] += (targetZ - boat.velocity[1]) * relax;
    boat.anchor[0] += boat.velocity[0] * seconds;
    boat.anchor[1] += boat.velocity[1] * seconds;
    const speed = Math.hypot(boat.velocity[0], boat.velocity[1]);
    if (speed > 0.08) {
      const heading = Math.atan2(boat.velocity[0], boat.velocity[1]);
      // A boat can travel bow first or stern first. Turn toward the nearer end.
      let turn = ((heading - boat.yaw) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2;
      turn *= Math.min(speed, 0.6);
      boat.yawRate += turn * seconds * 4;
    }
    boat.yawRate *= Math.exp(-seconds * 1.2);
    boat.yaw = (boat.yaw + boat.yawRate * seconds) % (Math.PI * 2);
  }
}

/** Add a horizontal push. The spin follows the side of the boat that the push meets. */
export function pushBoat(boat: PaperBoat, velocity: readonly [number, number], spin: number) {
  boat.velocity[0] += velocity[0];
  boat.velocity[1] += velocity[1];
  const speed = Math.hypot(boat.velocity[0], boat.velocity[1]);
  if (speed > 1.2) {
    boat.velocity[0] *= 1.2 / speed;
    boat.velocity[1] *= 1.2 / speed;
  }
  boat.yawRate = Math.max(-3, Math.min(3, boat.yawRate + spin));
}

/** Push boats away from a ripple center. The push falls to zero at the radius. */
export function pushBoatsFromRipple(boats: PaperBoat[], x: number, z: number, strength: number, radius = 2.5) {
  for (const boat of boats) {
    const dx = boat.position[0] - x;
    const dz = boat.position[2] - z;
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    const push = strength * (1 - distance / radius) / Math.max(distance, 0.1);
    pushBoat(boat, [dx * push, dz * push], (dx > 0 ? 1 : -1) * strength * 2);
  }
}

/**
 * Put a boat on a surface sample.
 *
 * The position follows the sample at once. The normal blends toward the
 * sample with a short time constant, which models the inertia of the hull.
 */
export function placeBoat(boat: PaperBoat, sample: ProbeSample, seconds: number) {
  boat.position = [...sample.position];
  const blend = seconds > 0 ? 1 - Math.exp(-seconds * 5) : 1;
  const normal = boat.normal.map((value, axis) => value + (sample.normal[axis] - value) * blend);
  const length = Math.hypot(...normal) || 1;
  boat.normal = normal.map(value => value / length) as Vector3;
}

/**
 * Write the boats into row 3 after the pellets and grow both bounds.
 *
 * Each boat uses two texels: (probe slot, 0, 0, length) and
 * (0, 0, 0, tint * 10 + yaw). The shader reads the position and the normal
 * from the probe pass of the same frame. The tint index is 0, 1, or 2, and
 * the yaw lies in [0, 2π).
 */
export function packBoats(
  boats: readonly PaperBoat[],
  data: Float32Array,
  bounds: SchoolBounds,
  probeSlot: (index: number) => number,
) {
  let count = 0;
  for (let index = 0; index < Math.min(boats.length, BOAT_SLOTS); index += 1) {
    const { position, length, yaw, tint } = boats[index];
    const slot = probeSlot(index);
    if (slot < 0) continue;
    const texel = (ACTOR_TEXTURE_WIDTH * 3 + PELLET_SLOTS + count * 2) * 4;
    const turn = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    data.set([slot, 0, 0, length], texel);
    data.set([0, 0, 0, Math.round(tint * 2) * 10 + turn], texel + 4);
    const radius = length * (BOAT_BOUND_RADIUS + 0.3) + FLOATING_MARGIN;
    for (const [low, high] of [[bounds.low, bounds.high], [bounds.airLow, bounds.airHigh]]) {
      if (low[0] > high[0]) {
        low.fill(Infinity);
        high.fill(-Infinity);
      }
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], position[axis] - radius);
        high[axis] = Math.max(high[axis], position[axis] + radius);
      }
    }
    count += 1;
  }
  return count;
}
