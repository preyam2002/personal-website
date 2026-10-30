import type { Vector3 } from "./oceanCamera";
import { getOceanCamera } from "./oceanCamera";
import {
  ACTOR_TEXTURE_WIDTH,
  FISH_BOUND_RADIUS,
  FISH_CRUISE_SPEED,
  FISH_DART_SPEED,
  FISH_MIN_SPEED,
  FISH_SEPARATION_RADIUS,
  FISH_SURFACE_CLEARANCE,
  PELLET_DISSOLVE_DEPTH,
  createSchool,
  dropPellets,
  fishMouth,
  getSchoolHome,
  packPellets,
  packSchool,
  startFishJump,
  stepPellets,
  stepSchool,
  type Fish,
  type LifeEvent,
  type Pellet,
  type SchoolEnvironment,
} from "./oceanLife";
import { seededRandom } from "./oceanWaves";

const flat = () => 0;
const home: Vector3 = [0, -1.2, 5];

function environment(overrides: Partial<SchoolEnvironment> = {}): SchoolEnvironment {
  return {
    time: 0,
    home,
    homeRadius: 2.5,
    floor: -24,
    surfaceAt: flat,
    stimuli: [],
    pellets: [],
    ...overrides,
  };
}

function fish(position: Vector3, velocity: Vector3): Fish {
  return { position, velocity, length: 0.35, tailPhase: 0, variant: 0, wander: 0, alarm: 0, jump: null };
}

function run(school: Fish[], seconds: number, overrides: Partial<SchoolEnvironment> = {}) {
  const events: LifeEvent[] = [];
  for (let step = 0; step < Math.round(seconds * 60); step += 1) {
    stepSchool(school, environment({ time: step / 60, ...overrides }), 1 / 60, events);
  }
  return events;
}

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const speed = (entry: Fish) => Math.hypot(...entry.velocity);

describe("fish school rules", () => {
  it("creates a seeded school around its home point", () => {
    const first = createSchool(24, home, seededRandom(7));
    const second = createSchool(24, home, seededRandom(7));
    expect(first).toEqual(second);
    for (const entry of first) expect(distance(entry.position, home)).toBeLessThan(2);
  });

  it("separates two fish that start too close", () => {
    const school = [fish([0, -1, 5], [0.5, 0, 0]), fish([0.1, -1, 5], [0.5, 0, 0])];
    run(school, 1.5);
    expect(distance(school[0].position, school[1].position)).toBeGreaterThan(FISH_SEPARATION_RADIUS * 0.7);
  });

  it("aligns the headings of neighbors", () => {
    const school = [fish([0, -1, 5], [0.6, 0, 0]), fish([0.6, -1, 5], [0, 0, 0.6])];
    const before = school[0].velocity[0] * school[1].velocity[0] + school[0].velocity[2] * school[1].velocity[2];
    run(school, 1);
    const after = (school[0].velocity[0] * school[1].velocity[0] + school[0].velocity[2] * school[1].velocity[2])
      / (speed(school[0]) * speed(school[1]));
    expect(after).toBeGreaterThan(before / 0.36 + 0.5);
  });

  it("keeps a large school cohesive, near home, and inside its speed limits", () => {
    const school = createSchool(32, home, seededRandom(11));
    run(school, 20);
    const center = school.reduce((sum, entry) => sum.map((value, axis) => value + entry.position[axis] / school.length), [0, 0, 0]);
    expect(distance(center, home)).toBeLessThan(3.5);
    for (const entry of school) {
      expect(speed(entry)).toBeGreaterThanOrEqual(FISH_MIN_SPEED - 1e-9);
      expect(speed(entry)).toBeLessThanOrEqual(FISH_CRUISE_SPEED + 1e-9);
      expect(entry.position[1]).toBeLessThanOrEqual(-FISH_SURFACE_CLEARANCE + 1e-9);
    }
  });

  it("stays below a moving surface", () => {
    const school = createSchool(16, [0, -0.5, 5], seededRandom(3));
    const surfaceAt = (x: number, z: number) => 0.3 * Math.sin(x * 0.4 + z * 0.2);
    run(school, 6, { home: [0, 0.2, 5], surfaceAt });
    for (const entry of school) {
      expect(entry.position[1]).toBeLessThanOrEqual(surfaceAt(entry.position[0], entry.position[2]) - FISH_SURFACE_CLEARANCE + 1e-9);
    }
  });
});

describe("fish responses", () => {
  it("scatters from a fast stimulus at dart speed", () => {
    const school = [fish([0.6, -1, 5], [0.4, 0, 0])];
    const flee = { position: [0, -1, 5] as Vector3, radius: 2.5, strength: 9, mode: "flee" as const };
    const start = distance(school[0].position, flee.position);
    run(school, 0.6, { stimuli: [flee] });
    expect(distance(school[0].position, flee.position)).toBeGreaterThan(start + 0.6);
    expect(speed(school[0])).toBeGreaterThan(FISH_CRUISE_SPEED);
    expect(speed(school[0])).toBeLessThanOrEqual(FISH_DART_SPEED + 1e-9);
  });

  it("follows a slow stimulus", () => {
    const school = [fish([0, -1, 5], [0.3, 0, 0])];
    const target: Vector3 = [0, -0.8, 7.5];
    run(school, 4, { stimuli: [{ position: target, radius: 6, strength: 2.4, mode: "follow" }] });
    expect(distance(school[0].position, target)).toBeLessThan(1.2);
    expect(school[0].alarm).toBe(0);
  });

  it("chases and eats a pellet in range", () => {
    const pellets: Pellet[] = [];
    dropPellets(pellets, 1.5, 6, 1, 4, () => -0.6, seededRandom(1), 1);
    pellets[0].floating = false;
    const school = [fish([0, -0.8, 5], [0.4, 0, 0])];
    const events = run(school, 4, { pellets });
    expect(pellets[0].eaten).toBe(true);
    const bite = events.find(event => event.type === "bite");
    expect(bite).toMatchObject({ type: "bite", pelletId: 1, floating: false });
    expect(distance((bite as { position: Vector3 }).position, pellets[0].position)).toBeLessThan(1e-9);
    expect(distance(fishMouth(school[0]), school[0].position)).toBeCloseTo(school[0].length * 0.45, 9);
  });
});

describe("fish jumps", () => {
  it("breaches the surface, flies, and splashes back into the school", () => {
    const school = [fish([0, -0.6, 5], [0.5, 0, 0])];
    expect(startFishJump(school, seededRandom(2), () => true)).toBe(school[0]);
    let highest = -Infinity;
    const events: LifeEvent[] = [];
    for (let step = 0; step < 240; step += 1) {
      stepSchool(school, environment({ time: step / 60 }), 1 / 60, events);
      highest = Math.max(highest, school[0].position[1]);
    }
    expect(events.map(event => event.type)).toEqual(["breach", "splash"]);
    expect(highest).toBeGreaterThan(0.2);
    expect(highest).toBeLessThan(0.8);
    expect(school[0].jump).toBeNull();
    expect(school[0].position[1]).toBeLessThan(0);
  });

  it("selects only visible fish that are not already jumping", () => {
    const school = [fish([0, -1, 5], [0.4, 0, 0]), fish([0, -1, 40], [0.4, 0, 0])];
    school[0].jump = { stage: "air", time: 0 };
    expect(startFishJump(school, seededRandom(2), entry => entry.position[2] < 10)).toBeNull();
  });
});

describe("food pellets", () => {
  it("float on the surface, sink, and dissolve at depth", () => {
    const pellets: Pellet[] = [];
    const surfaceAt = (x: number) => 0.1 * Math.sin(x);
    dropPellets(pellets, 0, 4, 3, 8, surfaceAt, seededRandom(4), 10);
    expect(pellets.map(pellet => pellet.id)).toEqual([10, 11, 12]);
    for (const pellet of pellets) {
      expect(pellet.position[1]).toBeCloseTo(surfaceAt(pellet.anchor[0]), 9);
      expect(Math.hypot(pellet.anchor[0], pellet.anchor[1] - 4)).toBeLessThanOrEqual(0.22);
    }
    stepPellets(pellets, 1, surfaceAt);
    expect(pellets.every(pellet => pellet.floating)).toBe(true);
    stepPellets(pellets, 5, surfaceAt);
    expect(pellets.every(pellet => !pellet.floating)).toBe(true);
    for (let step = 0; step < 60; step += 1) stepPellets(pellets, 1, surfaceAt);
    expect(pellets).toHaveLength(0);
    expect(PELLET_DISSOLVE_DEPTH).toBeGreaterThan(1);
  });

  it("replace the oldest pellet at capacity and remove eaten pellets", () => {
    const pellets: Pellet[] = [];
    let id = dropPellets(pellets, 0, 0, 2, 2, flat, seededRandom(5), 0);
    stepPellets(pellets, 0.5, flat);
    id = dropPellets(pellets, 1, 1, 1, 2, flat, seededRandom(6), id);
    expect(id).toBe(3);
    expect(pellets.map(pellet => pellet.id)).toEqual([1, 2]);
    pellets[0].eaten = true;
    stepPellets(pellets, 0.1, flat);
    expect(pellets.map(pellet => pellet.id)).toEqual([2]);
  });
});

describe("school packing", () => {
  it("writes position, heading, and style rows and bounds the school", () => {
    const school = [fish([1, -1, 4], [0, 0, 0.5]), fish([-1, -0.2, 6], [0.3, 0, 0.4])];
    school[1].jump = { stage: "air", time: 0 };
    const data = new Float32Array(ACTOR_TEXTURE_WIDTH * 4 * 4);
    const bounds = packSchool(school, data, flat);
    expect(bounds.count).toBe(2);
    expect(Array.from(data.subarray(0, 4))).toEqual([1, -1, 4, Math.fround(0.35)]);
    const heading = data.subarray(ACTOR_TEXTURE_WIDTH * 4 + 4, ACTOR_TEXTURE_WIDTH * 4 + 7);
    expect(Math.hypot(...heading)).toBeCloseTo(1, 6);
    expect(data[ACTOR_TEXTURE_WIDTH * 8 + 2]).toBe(0);
    expect(data[ACTOR_TEXTURE_WIDTH * 8 + 6]).toBe(1);
    const radius = 0.35 * FISH_BOUND_RADIUS;
    expect(bounds.low[0]).toBeCloseTo(-1 - radius, 6);
    expect(bounds.high[2]).toBeCloseTo(6 + radius, 6);
    expect(bounds.airLow[2]).toBeCloseTo(6 - radius, 6);
    expect(bounds.airHigh[0]).toBeCloseTo(-1 + radius, 6);
  });

  it("returns inverted bounds for an empty school so the shader skips the test", () => {
    const bounds = packSchool([], new Float32Array(ACTOR_TEXTURE_WIDTH * 16), flat);
    expect(bounds.count).toBe(0);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(bounds.low[axis]).toBeGreaterThan(bounds.high[axis]);
      expect(bounds.airLow[axis]).toBeGreaterThan(bounds.airHigh[axis]);
    }
  });
});

describe("school home", () => {
  it("stays below the near water above the surface and ahead of the camera below it", () => {
    for (const time of [0, 30, 300]) {
      const top = getSchoolHome(time, getOceanCamera(0, 0), 0, -24);
      expect(top[1]).toBeLessThan(-0.5);
      expect(Math.abs(top[0])).toBeLessThan(2);
      const camera = getOceanCamera(0.8, 0);
      const deep = getSchoolHome(time, camera, 0.8, -24);
      expect(deep[1]).toBeGreaterThanOrEqual(-22);
      expect(deep[1]).toBeLessThanOrEqual(-0.9);
      const offset = deep.map((value, axis) => value - camera.origin[axis]);
      expect(offset[0] * camera.forward[0] + offset[1] * camera.forward[1] + offset[2] * camera.forward[2])
        .toBeGreaterThan(3);
    }
  });
});

describe("pellet packing", () => {
  it("writes pellets into row 3 and grows the water and air bounds", () => {
    const school = [fish([0, -1, 5], [0.4, 0, 0])];
    const data = new Float32Array(ACTOR_TEXTURE_WIDTH * 16);
    const bounds = packSchool(school, data, flat);
    const pellets: Pellet[] = [];
    dropPellets(pellets, 3, 8, 2, 4, flat, seededRandom(9), 0);
    pellets[1].floating = false;
    pellets[1].position = [3, -2, 8];
    expect(packPellets(pellets, data, bounds)).toBe(2);
    const row = ACTOR_TEXTURE_WIDTH * 3 * 4;
    expect(data[row + 3]).toBeLessThan(0);
    expect(data[row + 7]).toBeGreaterThan(0);
    expect(bounds.low[1]).toBeLessThanOrEqual(-2);
    expect(bounds.high[2]).toBeGreaterThanOrEqual(pellets[0].position[2]);
    expect(bounds.airLow[0]).toBeLessThanOrEqual(pellets[0].position[0]);
    expect(bounds.airHigh[0]).toBeGreaterThanOrEqual(pellets[0].position[0]);
    expect(bounds.airLow[1]).toBeGreaterThan(-1);
  });
});
