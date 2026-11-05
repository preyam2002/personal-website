import { DEFAULT_SCHOOL, School, type SchoolParams } from "./boids";

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const bounds = () => ({ floor: -40, ceiling: -1 });
const home = { x: 0, y: -15, z: 0 };

function makeSchool(count: number, overrides: Partial<SchoolParams> = {}, seed = 3) {
  return new School({ ...DEFAULT_SCHOOL, count, length: 0.2, ...overrides }, home, seeded(seed));
}

function spread(school: School) {
  const c = school.center();
  let total = 0;
  for (let i = 0; i < school.count; i += 1) {
    total += Math.hypot(school.positions[i * 3] - c.x, school.positions[i * 3 + 1] - c.y, school.positions[i * 3 + 2] - c.z);
  }
  return total / school.count;
}

function nearestNeighbourMean(school: School) {
  let total = 0;
  for (let i = 0; i < school.count; i += 1) {
    let best = Infinity;
    for (let j = 0; j < school.count; j += 1) {
      if (i === j) continue;
      best = Math.min(best, Math.hypot(school.positions[i * 3] - school.positions[j * 3], school.positions[i * 3 + 1] - school.positions[j * 3 + 1], school.positions[i * 3 + 2] - school.positions[j * 3 + 2]));
    }
    total += best;
  }
  return total / school.count;
}

describe("fish school boids", () => {
  it("forms a cohesive, aligned school with spacing near the separation radius", () => {
    const school = makeSchool(200);
    for (let step = 0; step < 600; step += 1) school.step(1 / 30, home, [], bounds);
    // Cohesive: the school stays a few meters across around its home.
    expect(spread(school)).toBeLessThan(4);
    const c = school.center();
    expect(Math.hypot(c.x - home.x, c.z - home.z)).toBeLessThan(DEFAULT_SCHOOL.homeRadius * 1.5);
    // Separation: fish keep apart, about 0.5–2 body lengths to the nearest neighbour.
    const nn = nearestNeighbourMean(school) / 0.2;
    expect(nn).toBeGreaterThan(0.3);
    expect(nn).toBeLessThan(3);
    // Polarised: mean heading has a large magnitude.
    let hx = 0;
    let hy = 0;
    let hz = 0;
    for (let i = 0; i < school.count; i += 1) {
      const vx = school.velocities[i * 3];
      const vy = school.velocities[i * 3 + 1];
      const vz = school.velocities[i * 3 + 2];
      const speed = Math.hypot(vx, vy, vz);
      hx += vx / speed;
      hy += vy / speed;
      hz += vz / speed;
    }
    expect(Math.hypot(hx, hy, hz) / school.count).toBeGreaterThan(0.5);
  });

  it("stays between the floor and the ceiling", () => {
    const school = makeSchool(150);
    const tight = () => ({ floor: -16, ceiling: -14 });
    for (let step = 0; step < 300; step += 1) school.step(1 / 30, home, [], tight);
    for (let i = 0; i < school.count; i += 1) {
      expect(school.positions[i * 3 + 1]).toBeGreaterThanOrEqual(-16);
      expect(school.positions[i * 3 + 1]).toBeLessThanOrEqual(-14);
    }
  });

  it("flees a threat, splitting around it, and closes again after it leaves", () => {
    const school = makeSchool(250);
    for (let step = 0; step < 300; step += 1) school.step(1 / 30, home, [], bounds);
    const c = { ...school.center() };
    const threat = { x: c.x, y: c.y, z: c.z, radius: 2 };
    const minimumDistance = () => {
      let best = Infinity;
      for (let i = 0; i < school.count; i += 1) {
        best = Math.min(best, Math.hypot(school.positions[i * 3] - threat.x, school.positions[i * 3 + 1] - threat.y, school.positions[i * 3 + 2] - threat.z));
      }
      return best;
    };
    let maxSpeed = 0;
    for (let step = 0; step < 60; step += 1) {
      school.step(1 / 30, home, [threat], bounds);
      for (let i = 0; i < school.count; i += 1) {
        maxSpeed = Math.max(maxSpeed, Math.hypot(school.velocities[i * 3], school.velocities[i * 3 + 1], school.velocities[i * 3 + 2]));
      }
    }
    // A hole opens around the predator (the fountain), and fish sprint to open it.
    expect(minimumDistance()).toBeGreaterThan(threat.radius);
    expect(maxSpeed / 0.2).toBeGreaterThan(DEFAULT_SCHOOL.cruise * 2);
    // Fish are alarmed while it is there, and calm down once it has gone.
    expect(Math.max(...school.alarm)).toBeGreaterThan(0.5);
    for (let step = 0; step < 300; step += 1) school.step(1 / 30, home, [], bounds);
    expect(Math.max(...school.alarm)).toBeLessThan(0.05);
    expect(spread(school)).toBeLessThan(5);
  });

  it("splits sideways rather than reversing when a threat comes head-on", () => {
    // All fish start heading +z; a threat sits ahead of them.
    const school = makeSchool(200, { homeRadius: 4, weights: { ...DEFAULT_SCHOOL.weights, home: 0 } });
    school.step(1 / 30, home, [], bounds);
    for (let i = 0; i < school.count; i += 1) {
      school.velocities[i * 3] = 0;
      school.velocities[i * 3 + 1] = 0;
      school.velocities[i * 3 + 2] = 0.3;
    }
    const c = { ...school.center() };
    const threat = { x: c.x, y: c.y, z: c.z + 6, radius: 2 };
    // Track how the school moves in the first half second, as the threat looms.
    let peakLateral = 0;
    let forwardAtPeak = 0;
    for (let step = 0; step < 15; step += 1) {
      school.step(1 / 30, home, [threat], bounds);
      let forward = 0;
      let lateral = 0;
      for (let i = 0; i < school.count; i += 1) {
        forward += school.velocities[i * 3 + 2];
        lateral += Math.hypot(school.velocities[i * 3], school.velocities[i * 3 + 1]);
      }
      if (lateral > peakLateral) {
        peakLateral = lateral;
        forwardAtPeak = forward;
      }
    }
    // The school opens sideways around the threat (more sideways than forward motion)
    // instead of every fish reversing on the spot.
    expect(peakLateral / school.count).toBeGreaterThan(2 * 0.2);
    expect(peakLateral).toBeGreaterThan(Math.abs(forwardAtPeak));
  });

  it("advances tail phases at a rate set by speed", () => {
    const school = makeSchool(50);
    const before = Array.from(school.phases);
    for (let step = 0; step < 30; step += 1) school.step(1 / 30, home, [], bounds);
    for (let i = 0; i < school.count; i += 1) {
      const cycles = school.phases[i] - before[i];
      // About 1.5 BL/s gives 2.5 Hz with a 0.09 BL tail amplitude.
      expect(cycles).toBeGreaterThan(1);
      expect(cycles).toBeLessThan(8);
    }
  });

  it("steps 1,500 fish in a few milliseconds", () => {
    const schools = [makeSchool(560), makeSchool(260, { cruise: 0.9 }, 4), makeSchool(240, {}, 5), makeSchool(130, {}, 6), makeSchool(110, {}, 7), makeSchool(120, {}, 8), makeSchool(80, {}, 9)];
    for (let step = 0; step < 30; step += 1) for (const school of schools) school.step(1 / 60, home, [], bounds);
    const frames = 60;
    const start = performance.now();
    for (let step = 0; step < frames; step += 1) for (const school of schools) school.step(1 / 60, home, [{ x: 0, y: -15, z: 3, radius: 2 }], bounds);
    const perFrame = (performance.now() - start) / frames;
    // The game target is under 2 ms on a desktop browser; Jest under jsdom on a CI machine is slower.
    console.log(`boids: ${perFrame.toFixed(2)} ms per frame for 1500 fish`);
    expect(perFrame).toBeLessThan(10);
  });
});
