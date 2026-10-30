import type { OceanCamera, Vector3 } from "./oceanCamera";

export const FISH_NEIGHBOR_RADIUS = 1.3;
export const FISH_SEPARATION_RADIUS = 0.5;
export const FISH_MIN_SPEED = 0.22;
export const FISH_CRUISE_SPEED = 1.1;
export const FISH_FEEDING_SPEED = 1.5;
export const FISH_DART_SPEED = 2.6;
export const FISH_MIGRATION_SPEED = 3.2;
export const FISH_SURFACE_CLEARANCE = 0.32;
export const FISH_FEEDING_CLEARANCE = 0.1;
export const FISH_FLOOR_CLEARANCE = 1.2;
export const FISH_FOOD_RADIUS = 7;
export const FISH_BITE_RADIUS = 0.12;
export const FISH_JUMP_SPEED = 2.8;
export const PELLET_RADIUS = 0.028;
export const PELLET_LIFETIME_SECONDS = 45;
export const PELLET_DISSOLVE_DEPTH = 4;
const GRAVITY = 9.81;

export type FishJump = {
  stage: "rise" | "air" | "dive";
  time: number;
};

export type Fish = {
  position: Vector3;
  velocity: Vector3;
  length: number;
  tailPhase: number;
  variant: number;
  wander: number;
  alarm: number;
  jump: FishJump | null;
};

export type Pellet = {
  id: number;
  anchor: [number, number];
  position: Vector3;
  age: number;
  floatSeconds: number;
  sinkSpeed: number;
  floating: boolean;
  eaten: boolean;
};

export type SchoolStimulus = {
  position: Vector3;
  radius: number;
  strength: number;
  mode: "follow" | "flee";
};

export type SchoolEnvironment = {
  time: number;
  home: Vector3;
  homeRadius: number;
  floor: number;
  surfaceAt: (x: number, z: number) => number;
  stimuli: readonly SchoolStimulus[];
  pellets: Pellet[];
};

export type LifeEvent =
  | { type: "breach"; position: Vector3; velocity: Vector3 }
  | { type: "splash"; position: Vector3; velocity: Vector3 }
  | { type: "bite"; position: Vector3; pelletId: number; floating: boolean };

type Random = () => number;

function length3(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z);
}

export function createSchool(count: number, home: Vector3, random: Random): Fish[] {
  const heading = random() * Math.PI * 2;
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 1.6;
    const turn = heading + (random() - 0.5) * 0.5;
    const speed = 0.4 + random() * 0.2;
    return {
      position: [
        home[0] + Math.cos(angle) * radius,
        home[1] + (random() - 0.5) * 0.8,
        home[2] + Math.sin(angle) * radius,
      ],
      velocity: [Math.cos(turn) * speed, 0, Math.sin(turn) * speed],
      length: 0.3 + random() * 0.12,
      tailPhase: random() * Math.PI * 2,
      variant: random(),
      wander: random() * Math.PI * 2,
      alarm: 0,
      jump: null,
    };
  });
}

/** Return the head position. Fish eat with the head, not the body center. */
export function fishMouth(fish: Fish): Vector3 {
  const [vx, vy, vz] = fish.velocity;
  const speed = length3(vx, vy, vz) || 1;
  const reach = fish.length * 0.45 / speed;
  return [fish.position[0] + vx * reach, fish.position[1] + vy * reach, fish.position[2] + vz * reach];
}

function nearestPellet(fish: Fish, pellets: readonly Pellet[]) {
  let best: Pellet | null = null;
  let bestDistance = FISH_FOOD_RADIUS;
  for (const pellet of pellets) {
    if (pellet.eaten) continue;
    const distance = length3(
      pellet.position[0] - fish.position[0],
      pellet.position[1] - fish.position[1],
      pellet.position[2] - fish.position[2],
    );
    if (distance < bestDistance) {
      best = pellet;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Advance a jump. A jump has three stages: a fast rise to the surface, a
 * ballistic flight under gravity, and a short dive with water drag.
 */
function stepJump(fish: Fish, environment: SchoolEnvironment, seconds: number, events: LifeEvent[]) {
  const jump = fish.jump!;
  const { position, velocity } = fish;
  jump.time += seconds;
  const surface = environment.surfaceAt(position[0], position[2]);
  if (jump.stage === "rise") {
    const horizontal = Math.hypot(velocity[0], velocity[2]) || 1;
    const target: Vector3 = [
      velocity[0] / horizontal * FISH_JUMP_SPEED * 0.5,
      FISH_JUMP_SPEED,
      velocity[2] / horizontal * FISH_JUMP_SPEED * 0.5,
    ];
    const blend = 1 - Math.exp(-seconds * 9);
    for (let axis = 0; axis < 3; axis += 1) velocity[axis] += (target[axis] - velocity[axis]) * blend;
    if (position[1] >= surface) {
      jump.stage = "air";
      jump.time = 0;
      events.push({ type: "breach", position: [position[0], surface, position[2]], velocity: [...velocity] });
    } else if (jump.time > 2.5) {
      fish.jump = null;
    }
  } else if (jump.stage === "air") {
    velocity[1] -= GRAVITY * seconds;
    if (position[1] < surface && velocity[1] < 0) {
      jump.stage = "dive";
      jump.time = 0;
      events.push({ type: "splash", position: [position[0], surface, position[2]], velocity: [...velocity] });
    }
  } else {
    const drag = Math.exp(-seconds * 3.2);
    velocity[0] *= drag;
    velocity[1] = velocity[1] * drag + 1.5 * seconds;
    velocity[2] *= drag;
    if (jump.time > 0.7) fish.jump = null;
  }
  for (let axis = 0; axis < 3; axis += 1) position[axis] += velocity[axis] * seconds;
}

/**
 * Advance the school with the three boid rules plus the scene rules.
 *
 * Separation, alignment, and cohesion act inside the neighbor radius. A soft
 * pull keeps the school near its home point. The water surface and the seabed
 * bound the depth. Stimuli attract or scatter the fish, and fish chase the
 * nearest pellet in range. A bite marks the pellet as eaten.
 */
export function stepSchool(
  school: Fish[],
  environment: SchoolEnvironment,
  seconds: number,
  events: LifeEvent[] = [],
) {
  if (seconds <= 0) return events;
  const { home, homeRadius, floor, surfaceAt, stimuli, pellets, time } = environment;
  const accelerations = school.map((): Vector3 => [0, 0, 0]);
  const targets: (Pellet | null)[] = school.map(fish => fish.jump ? null : nearestPellet(fish, pellets));

  for (let index = 0; index < school.length; index += 1) {
    const fish = school[index];
    if (fish.jump) continue;
    const [px, py, pz] = fish.position;
    const [vx, vy, vz] = fish.velocity;
    const acceleration = accelerations[index];
    let neighbors = 0;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    let headingX = 0;
    let headingY = 0;
    let headingZ = 0;
    let separationX = 0;
    let separationY = 0;
    let separationZ = 0;
    for (let other = 0; other < school.length; other += 1) {
      if (other === index) continue;
      const neighbor = school[other];
      const dx = neighbor.position[0] - px;
      const dy = neighbor.position[1] - py;
      const dz = neighbor.position[2] - pz;
      const distance = length3(dx, dy, dz);
      if (distance >= FISH_NEIGHBOR_RADIUS || distance < 1e-6) continue;
      neighbors += 1;
      centerX += dx;
      centerY += dy;
      centerZ += dz;
      headingX += neighbor.velocity[0];
      headingY += neighbor.velocity[1];
      headingZ += neighbor.velocity[2];
      if (distance < FISH_SEPARATION_RADIUS) {
        const push = (FISH_SEPARATION_RADIUS - distance) / (FISH_SEPARATION_RADIUS * distance);
        separationX -= dx * push;
        separationY -= dy * push;
        separationZ -= dz * push;
      }
    }
    if (neighbors > 0) {
      acceleration[0] += centerX / neighbors * 0.9 + (headingX / neighbors - vx) * 1.4 + separationX * 4;
      acceleration[1] += centerY / neighbors * 0.9 + (headingY / neighbors - vy) * 1.4 + separationY * 4;
      acceleration[2] += centerZ / neighbors * 0.9 + (headingZ / neighbors - vz) * 1.4 + separationZ * 4;
    }

    const homeX = home[0] - px;
    const homeY = home[1] - py;
    const homeZ = home[2] - pz;
    const homeDistance = length3(homeX, homeY, homeZ);
    const pull = 0.12 + Math.max(homeDistance - homeRadius, 0) * 0.8 / Math.max(homeDistance, 1e-6);
    acceleration[0] += homeX * pull;
    acceleration[1] += homeY * pull;
    acceleration[2] += homeZ * pull;

    const wander = fish.wander;
    acceleration[0] += Math.sin(time * 0.71 + wander) * 0.3;
    acceleration[1] += Math.sin(time * 0.53 + wander * 2) * 0.08;
    acceleration[2] += Math.cos(time * 0.61 + wander * 3) * 0.3;

    for (const stimulus of stimuli) {
      const dx = stimulus.position[0] - px;
      const dy = stimulus.position[1] - py;
      const dz = stimulus.position[2] - pz;
      const distance = length3(dx, dy, dz);
      if (distance >= stimulus.radius || distance < 1e-6) continue;
      if (stimulus.mode === "flee") {
        const push = stimulus.strength * (1 - distance / stimulus.radius) / distance;
        acceleration[0] -= dx * push;
        acceleration[1] -= dy * push * 0.3;
        acceleration[2] -= dz * push;
        fish.alarm = Math.max(fish.alarm, 0.9);
      } else {
        // Approach, then slow down within half a meter so the fish circle the point.
        const pull = stimulus.strength * Math.min(distance / 0.5, 1) / distance;
        acceleration[0] += dx * pull;
        acceleration[1] += dy * pull;
        acceleration[2] += dz * pull;
      }
    }

    const target = targets[index];
    if (target) {
      const mouth = fishMouth(fish);
      const dx = target.position[0] - mouth[0];
      const dy = target.position[1] - mouth[1];
      const dz = target.position[2] - mouth[2];
      const distance = length3(dx, dy, dz);
      if (distance < FISH_BITE_RADIUS) {
        target.eaten = true;
        events.push({ type: "bite", position: [...target.position], pelletId: target.id, floating: target.floating });
      } else {
        const chase = 2.6 / distance;
        acceleration[0] += dx * chase;
        acceleration[1] += dy * chase;
        acceleration[2] += dz * chase;
      }
    }

    const ceiling = surfaceAt(px, pz) - (target?.floating ? FISH_FEEDING_CLEARANCE : FISH_SURFACE_CLEARANCE);
    if (py > ceiling - 0.4) acceleration[1] -= (py - ceiling + 0.4) * 6;
    if (py < floor + FISH_FLOOR_CLEARANCE) acceleration[1] += (floor + FISH_FLOOR_CLEARANCE - py) * 4;

    const limit = fish.alarm > 0 ? 10 : 3.2;
    const magnitude = length3(acceleration[0], acceleration[1], acceleration[2]);
    if (magnitude > limit) {
      acceleration[0] *= limit / magnitude;
      acceleration[1] *= limit / magnitude;
      acceleration[2] *= limit / magnitude;
    }
  }

  for (let index = 0; index < school.length; index += 1) {
    const fish = school[index];
    if (fish.jump) {
      stepJump(fish, environment, seconds, events);
    } else {
      const { position, velocity } = fish;
      const acceleration = accelerations[index];
      for (let axis = 0; axis < 3; axis += 1) velocity[axis] += acceleration[axis] * seconds;
      const homeDistance = length3(home[0] - position[0], home[1] - position[1], home[2] - position[2]);
      let maximum = fish.alarm > 0 ? FISH_DART_SPEED : targets[index] ? FISH_FEEDING_SPEED : FISH_CRUISE_SPEED;
      // A distant home, for example after a fast scroll, lets the school catch up.
      if (homeDistance > homeRadius * 2) maximum = Math.max(maximum, Math.min(FISH_MIGRATION_SPEED, homeDistance * 0.3));
      const horizontal = Math.hypot(velocity[0], velocity[2]);
      velocity[1] = Math.max(-0.45, Math.min(0.45, velocity[1] / Math.max(horizontal, 1e-6))) * horizontal;
      const speed = length3(velocity[0], velocity[1], velocity[2]);
      const clamped = Math.min(Math.max(speed, FISH_MIN_SPEED), maximum);
      if (speed > 1e-6) {
        for (let axis = 0; axis < 3; axis += 1) velocity[axis] *= clamped / speed;
      } else {
        velocity[0] = FISH_MIN_SPEED;
      }
      for (let axis = 0; axis < 3; axis += 1) position[axis] += velocity[axis] * seconds;
      const ceiling = surfaceAt(position[0], position[2])
        - (targets[index]?.floating ? FISH_FEEDING_CLEARANCE : FISH_SURFACE_CLEARANCE);
      if (position[1] > ceiling) {
        position[1] = ceiling;
        velocity[1] = Math.min(velocity[1], 0);
      }
      position[1] = Math.max(position[1], floor + 0.3);
    }
    const speed = length3(fish.velocity[0], fish.velocity[1], fish.velocity[2]);
    fish.tailPhase = (fish.tailPhase + seconds * (5 + speed * 9)) % (Math.PI * 200);
    fish.alarm = Math.max(fish.alarm - seconds, 0);
  }
  return events;
}

/** Pick a fish that can jump inside the visible area. Return null if none qualifies. */
export function startFishJump(school: Fish[], random: Random, visible: (fish: Fish) => boolean) {
  const candidates = school.filter(fish => !fish.jump && fish.alarm === 0 && visible(fish));
  if (candidates.length === 0) return null;
  const fish = candidates[Math.floor(random() * candidates.length)];
  fish.jump = { stage: "rise", time: 0 };
  return fish;
}

export function dropPellets(
  pellets: Pellet[],
  x: number,
  z: number,
  count: number,
  capacity: number,
  surfaceAt: (x: number, z: number) => number,
  random: Random,
  nextId: number,
) {
  let id = nextId;
  for (let index = 0; index < count; index += 1) {
    if (pellets.length >= capacity) {
      const oldest = pellets.reduce((best, pellet) => pellet.age > best.age ? pellet : best, pellets[0]);
      pellets.splice(pellets.indexOf(oldest), 1);
    }
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 0.22;
    const anchor: [number, number] = [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius];
    pellets.push({
      id,
      anchor,
      position: [anchor[0], surfaceAt(anchor[0], anchor[1]), anchor[1]],
      age: 0,
      floatSeconds: 2.5 + random() * 2,
      sinkSpeed: 0.07 + random() * 0.04,
      floating: true,
      eaten: false,
    });
    id += 1;
  }
  return id;
}

/**
 * Advance the pellets. A pellet floats on the surface for a few seconds, then
 * it sinks with a small sideways wobble and dissolves at depth.
 */
export function stepPellets(
  pellets: Pellet[],
  seconds: number,
  surfaceAt: (x: number, z: number) => number,
) {
  for (let index = pellets.length - 1; index >= 0; index -= 1) {
    const pellet = pellets[index];
    pellet.age += seconds;
    if (pellet.floating && pellet.age >= pellet.floatSeconds) pellet.floating = false;
    if (pellet.floating) {
      pellet.position = [pellet.anchor[0], surfaceAt(pellet.anchor[0], pellet.anchor[1]), pellet.anchor[1]];
    } else {
      pellet.position[0] += Math.sin(pellet.age * 2.1 + pellet.id) * 0.02 * seconds;
      pellet.position[1] -= pellet.sinkSpeed * seconds;
      pellet.position[2] += Math.cos(pellet.age * 1.7 + pellet.id * 2) * 0.02 * seconds;
    }
    if (pellet.eaten || pellet.position[1] < -PELLET_DISSOLVE_DEPTH || pellet.age > PELLET_LIFETIME_SECONDS) {
      pellets.splice(index, 1);
    }
  }
}

export const ACTOR_TEXTURE_WIDTH = 64;
export const PELLET_SLOTS = 12;
export const ACTOR_TEXTURE_ROWS = 4;
export const FISH_BOUND_RADIUS = 0.72;

export type SchoolBounds = {
  count: number;
  low: Vector3;
  high: Vector3;
  airLow: Vector3;
  airHigh: Vector3;
};

/**
 * Write the school into rows 0 to 2 of the actor texture.
 *
 * Row 0 holds (position, length). Row 1 holds (heading, tail phase). Row 2
 * holds (swim amplitude, variant, air flag, 0). The air flag marks fish that
 * can reach above the surface, so the above-water path tests only those fish.
 * Empty bounds have the low corner above the high corner.
 */
export function packSchool(
  school: readonly Fish[],
  data: Float32Array,
  surfaceAt: (x: number, z: number) => number,
): SchoolBounds {
  const count = Math.min(school.length, ACTOR_TEXTURE_WIDTH);
  const low: Vector3 = [Infinity, Infinity, Infinity];
  const high: Vector3 = [-Infinity, -Infinity, -Infinity];
  const airLow: Vector3 = [Infinity, Infinity, Infinity];
  const airHigh: Vector3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < count; index += 1) {
    const fish = school[index];
    const [x, y, z] = fish.position;
    const [vx, vy, vz] = fish.velocity;
    const speed = length3(vx, vy, vz) || 1;
    const radius = fish.length * FISH_BOUND_RADIUS;
    const air = fish.jump !== null || y + radius > surfaceAt(x, z) - 0.05;
    const swim = fish.jump?.stage === "air" ? 0.12 : 0.05 + 0.05 * Math.min(speed / FISH_DART_SPEED, 1);
    data.set([x, y, z, fish.length], index * 4);
    data.set([vx / speed, vy / speed, vz / speed, fish.tailPhase], (ACTOR_TEXTURE_WIDTH + index) * 4);
    data.set([swim, fish.variant, air ? 1 : 0, 0], (ACTOR_TEXTURE_WIDTH * 2 + index) * 4);
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], fish.position[axis] - radius);
      high[axis] = Math.max(high[axis], fish.position[axis] + radius);
      if (air) {
        airLow[axis] = Math.min(airLow[axis], fish.position[axis] - radius);
        airHigh[axis] = Math.max(airHigh[axis], fish.position[axis] + radius);
      }
    }
  }
  const empty = (bound: Vector3, sign: number) => bound.map(value => Number.isFinite(value) ? value : sign) as Vector3;
  return {
    count,
    low: empty(low, 1),
    high: empty(high, -1),
    airLow: empty(airLow, 1),
    airHigh: empty(airHigh, -1),
  };
}

/**
 * Place the school home point for the current view.
 *
 * Above the water, the home drifts slowly below the near water, where the
 * refracted view can see the fish. During the descent, the home moves ahead
 * of the camera so the school stays in view.
 */
export function getSchoolHome(time: number, camera: OceanCamera, scroll: number, floor: number): Vector3 {
  const surfaceHome: Vector3 = [
    Math.sin(time * 0.05) * 1.4,
    -0.8,
    -1.5 + Math.sin(time * 0.031 + 1) * 1,
  ];
  const ahead = 5.5;
  const deepHome: Vector3 = [
    camera.origin[0] + camera.forward[0] * ahead,
    Math.min(Math.max(camera.origin[1] + camera.forward[1] * ahead, floor + 2), -0.9),
    camera.origin[2] + camera.forward[2] * ahead,
  ];
  const t = Math.min(Math.max((scroll - 0.1) / 0.2, 0), 1);
  const blend = t * t * (3 - 2 * t);
  return [0, 1, 2].map(axis => surfaceHome[axis] + (deepHome[axis] - surfaceHome[axis]) * blend) as Vector3;
}

/**
 * Write the pellets into row 3 of the actor texture and grow the bounds.
 *
 * Each texel holds (position, radius). A floating pellet stores a negative
 * radius and also grows the air bounds, because part of it sits above water.
 */
export function packPellets(pellets: readonly Pellet[], data: Float32Array, bounds: SchoolBounds) {
  const count = Math.min(pellets.length, PELLET_SLOTS);
  const grow = (low: Vector3, high: Vector3, position: Vector3) => {
    if (low[0] > high[0]) {
      low.fill(Infinity);
      high.fill(-Infinity);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], position[axis] - PELLET_RADIUS);
      high[axis] = Math.max(high[axis], position[axis] + PELLET_RADIUS);
    }
  };
  for (let index = 0; index < count; index += 1) {
    const { position, floating } = pellets[index];
    data.set([...position, floating ? -PELLET_RADIUS : PELLET_RADIUS], (ACTOR_TEXTURE_WIDTH * 3 + index) * 4);
    grow(bounds.low, bounds.high, position);
    if (floating) grow(bounds.airLow, bounds.airHigh, position);
  }
  return count;
}
