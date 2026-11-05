import { WORLD_HALF } from "./world";

export type Vec3 = [number, number, number];

export type DiverInput = {
  /** -1 to 1: swim forward or back along the view. */
  forward: number;
  /** -1 to 1: swim right or left. */
  strafe: number;
  /** -1 to 1: kick up or sink down. */
  rise: number;
  sprint: boolean;
};

export type DiverState = {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  /** 0 to 1. */
  oxygen: number;
};

export type DiverEvent = "dived" | "surfaced" | "blackout";

export const SWIM_SPEED = 3.2;
export const SPRINT_SPEED = 7;
export const BREATH_SECONDS = 110;
export const SURFACE_HEIGHT = 0.15;
export const SEABED_CLEARANCE = 0.7;
const WATER_DRAG = 2.4;
const REFILL_PER_SECOND = 0.3;

export function createDiver(x: number, z: number, yaw = 0): DiverState {
  return { position: [x, SURFACE_HEIGHT, z], velocity: [0, 0, 0], yaw, pitch: -0.15, oxygen: 1 };
}

/**
 * Return the unit view direction. Yaw 0 looks north, along +z. East is -x.
 * Positive yaw turns left (west); positive pitch looks up.
 */
export function viewDirection(yaw: number, pitch: number): Vec3 {
  const cosine = Math.cos(pitch);
  return [Math.sin(yaw) * cosine, Math.sin(pitch), Math.cos(yaw) * cosine];
}

export function isUnderwater(diver: DiverState) {
  return diver.position[1] < -0.35;
}

/**
 * Advance the diver.
 *
 * Under water the diver swims along the view, so looking down and swimming
 * forward dives. At the surface the diver floats, swims level, and breathes.
 * Water drag sets a top speed. The seabed and the world edge stop the diver.
 * Oxygen falls under water, faster in a sprint, and refills at the surface.
 * An empty tank causes a blackout: the caller returns the diver to the surface.
 */
export function stepDiver(
  diver: DiverState,
  input: DiverInput,
  seconds: number,
  seabedHeight: (x: number, z: number) => number,
): DiverEvent[] {
  const events: DiverEvent[] = [];
  if (seconds <= 0) return events;
  const wasUnderwater = isUnderwater(diver);
  const speed = input.sprint ? SPRINT_SPEED : SWIM_SPEED;
  const atSurface = !wasUnderwater;
  // At the surface, forward swimming stays level unless the diver looks down to dive.
  const pitch = atSurface && diver.pitch > -0.35 ? 0 : diver.pitch;
  const view = viewDirection(diver.yaw, pitch);
  // The screen right of a camera that looks along the view: forward x up.
  const right: Vec3 = [-Math.cos(diver.yaw), 0, Math.sin(diver.yaw)];
  const thrust = speed * WATER_DRAG;
  const acceleration: Vec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    acceleration[axis] = (view[axis] * input.forward + right[axis] * input.strafe) * thrust;
  }
  acceleration[1] += input.rise * thrust * 0.8;
  // Near the surface, buoyancy lifts the diver back to a floating position.
  if (diver.position[1] > -1.2 && input.rise >= 0 && input.forward <= 0.1) {
    acceleration[1] += (SURFACE_HEIGHT - diver.position[1]) * 6;
  }
  const drag = Math.exp(-WATER_DRAG * seconds);
  for (let axis = 0; axis < 3; axis += 1) {
    diver.velocity[axis] = diver.velocity[axis] * drag + acceleration[axis] / WATER_DRAG * (1 - drag);
    diver.position[axis] += diver.velocity[axis] * seconds;
  }
  if (diver.position[1] > SURFACE_HEIGHT) {
    diver.position[1] = SURFACE_HEIGHT;
    diver.velocity[1] = Math.min(diver.velocity[1], 0);
  }
  const floor = seabedHeight(diver.position[0], diver.position[2]) + SEABED_CLEARANCE;
  if (diver.position[1] < floor) {
    diver.position[1] = floor;
    diver.velocity[1] = Math.max(diver.velocity[1], 0);
  }
  const limit = WORLD_HALF - 8;
  for (const axis of [0, 2]) {
    if (Math.abs(diver.position[axis]) > limit) {
      diver.position[axis] = Math.sign(diver.position[axis]) * limit;
      diver.velocity[axis] = 0;
    }
  }
  const underwater = isUnderwater(diver);
  if (underwater && !wasUnderwater) events.push("dived");
  if (!underwater && wasUnderwater) events.push("surfaced");
  if (underwater) {
    diver.oxygen -= seconds / BREATH_SECONDS * (input.sprint ? 1.8 : 1);
    if (diver.oxygen <= 0) {
      diver.oxygen = 0;
      events.push("blackout");
    }
  } else {
    diver.oxygen = Math.min(1, diver.oxygen + seconds * REFILL_PER_SECOND);
  }
  return events;
}

/** Turn the view. Pitch stays short of straight up and straight down. */
export function turnDiver(diver: DiverState, yawDelta: number, pitchDelta: number) {
  diver.yaw = (diver.yaw + yawDelta) % (Math.PI * 2);
  diver.pitch = Math.max(-1.45, Math.min(1.45, diver.pitch + pitchDelta));
}
