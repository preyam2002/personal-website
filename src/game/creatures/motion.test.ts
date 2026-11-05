import { seabedHeight, WORLD_HALF } from "../world";
import {
  BeatGlide,
  bodyWaveOffset,
  clampHeight,
  ellipseLoop,
  fishEnvelope,
  LoopPath,
  PathSwimmer,
  pulseContraction,
  steerDirection,
  strouhalFrequency,
  SurfacingSchedule,
  whaleEnvelope,
  wrapAngle,
} from "./motion";
import { BOTTOM, GREAT_WHITE_ROUTE, MANTA_ROUTE, REEF_SHARK_ROUTES, TURTLE_ROUTES, WHALE_ROUTE, WHALE_SHARK_ROUTE } from "./routes";

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("body wave math", () => {
  it("has the carangiform envelope: 0.2 at the snout, smallest near a quarter, 1 at the tail", () => {
    expect(fishEnvelope(0)).toBeCloseTo(0.2);
    expect(fishEnvelope(1)).toBeCloseTo(1);
    expect(fishEnvelope(0.25)).toBeLessThan(fishEnvelope(0));
    expect(fishEnvelope(0.25)).toBeLessThan(fishEnvelope(0.6));
  });

  it("concentrates the whale stroke behind 55 % of the body", () => {
    expect(whaleEnvelope(0.3)).toBeCloseTo(0.01 / 0.09);
    expect(whaleEnvelope(1)).toBeCloseTo(1 + 0.01 / 0.09);
    expect(whaleEnvelope(0.8)).toBeGreaterThan(whaleEnvelope(0.6));
  });

  it("locks tail-beat frequency to speed with Strouhal 0.3", () => {
    // The spec's example: a 14 m humpback at 2 m/s with 0.08 BL tail amplitude beats at about 0.27 Hz.
    expect(strouhalFrequency(2, 14, 0.08)).toBeCloseTo(0.268, 2);
    expect(strouhalFrequency(0, 14, 0.08)).toBe(0);
    expect(strouhalFrequency(2, 1, 0.1)).toBeCloseTo(3);
  });

  it("is a wave that travels from head to tail as the phase grows", () => {
    // Track the crest near the tail: with a larger phase, the same displacement is found further back.
    const crestAt = (phase: number) => {
      let best = 0;
      let bestX = 0;
      for (let x = 0.5; x <= 1; x += 0.001) {
        const y = bodyWaveOffset(x, phase, 1, 0.1, 1);
        if (y > best) {
          best = y;
          bestX = x;
        }
      }
      return bestX;
    };
    expect(crestAt(0.6)).toBeGreaterThan(crestAt(0.5));
    // The tail swings by the full tail amplitude.
    let max = 0;
    for (let phase = 0; phase < 1; phase += 0.01) max = Math.max(max, Math.abs(bodyWaveOffset(1, phase, 2, 0.09, 1)));
    expect(max).toBeCloseTo(0.18, 2);
  });

  it("contracts a moon jelly quickly and relaxes it slowly", () => {
    expect(pulseContraction(0)).toBeCloseTo(0);
    expect(pulseContraction(0.35)).toBeCloseTo(1);
    expect(pulseContraction(0.999)).toBeLessThan(0.01);
    // Rising over 35 % of the cycle, falling over 65 %.
    expect(pulseContraction(0.2)).toBeGreaterThan(pulseContraction(0.1));
    expect(pulseContraction(0.6)).toBeLessThan(pulseContraction(0.4));
    expect(pulseContraction(1.35)).toBeCloseTo(1);
  });

  it("wraps angles to (-PI, PI]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 4 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });
});

describe("paths", () => {
  it("measures a closed loop by arc length", () => {
    const path = new LoopPath(ellipseLoop(0, 0, 50, 50, -10, 16));
    // A Catmull-Rom loop through 16 points on a circle is close to the circle.
    expect(path.length).toBeGreaterThan(2 * Math.PI * 50 * 0.97);
    expect(path.length).toBeLessThan(2 * Math.PI * 50 * 1.03);
    const a = path.pointAt(0, { x: 0, y: 0, z: 0 });
    const b = path.pointAt(path.length, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    // Equal arc steps give equal chord steps.
    const p1 = path.pointAt(10, { x: 0, y: 0, z: 0 });
    const p2 = path.pointAt(20, { x: 0, y: 0, z: 0 });
    const p3 = path.pointAt(30, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeCloseTo(Math.hypot(p3.x - p2.x, p3.z - p2.z), 1);
  });

  const routes: [string, { x: number; y: number; z: number }[], number, number][] = [
    ["whale", WHALE_ROUTE, 7, 6],
    ["whale shark", WHALE_SHARK_ROUTE, 4, 3],
    ["great white", GREAT_WHITE_ROUTE, 4, 2],
    ["manta", MANTA_ROUTE, 4, 3],
    ...REEF_SHARK_ROUTES.map((route, index) => [`reef shark ${index}`, route, 1.6, 2] as [string, typeof route, number, number]),
    ...TURTLE_ROUTES.map((route, index) => [`turtle ${index}`, route, 1.6, 1.5] as [string, typeof route, number, number]),
  ];

  it.each(routes)("keeps the %s route inside the world, in water deep enough for the animal", (_name, points, clearance, minDepth) => {
    const path = new LoopPath(points);
    for (let distance = 0; distance < path.length; distance += 2) {
      const p = path.pointAt(distance, { x: 0, y: 0, z: 0 });
      expect(Math.abs(p.x)).toBeLessThan(WORLD_HALF - 50);
      expect(Math.abs(p.z)).toBeLessThan(WORLD_HALF - 40);
      const floor = seabedHeight(p.x, p.z);
      // The water column must hold the animal between its clearance and its least depth.
      expect(floor + clearance).toBeLessThan(-minDepth);
      const y = clampHeight(p.y, floor, clearance, minDepth);
      expect(y).toBeGreaterThanOrEqual(floor + clearance - 1e-9);
      expect(y).toBeLessThanOrEqual(-minDepth);
    }
  });

  it("keeps the whales over deep water: at least 20 m everywhere on their loop", () => {
    const path = new LoopPath(WHALE_ROUTE);
    for (let distance = 0; distance < path.length; distance += 2) {
      const p = path.pointAt(distance, { x: 0, y: 0, z: 0 });
      expect(seabedHeight(p.x, p.z)).toBeLessThan(-20);
    }
  });

  it("uses BOTTOM to mean 'follow the seabed'", () => {
    expect(clampHeight(BOTTOM, -9, 2, 1)).toBe(-7);
  });
});

describe("path swimmers", () => {
  const limits = { turnRate: 0.09, maxPitch: 0.4, acceleration: 0.12, bank: 2.2, pitchRate: 0.5 };

  it("follows the whale loop for ten minutes without leaving the water or the path", () => {
    const path = new LoopPath(WHALE_ROUTE);
    const swimmer = new PathSwimmer(path, { lead: 28, clearance: 7, minDepth: 6, avoidMargin: 10, limits }, 1.5);
    const sample = { x: 0, y: 0, z: 0 };
    let travelled = 0;
    let last = { ...swimmer.swimmer.position };
    for (let step = 0; step < 600 * 30; step += 1) {
      const s = swimmer.update(1 / 30, seabedHeight, [], 1.6);
      travelled += Math.hypot(s.position.x - last.x, s.position.z - last.z);
      last = { ...s.position };
      expect(s.position.y).toBeLessThan(0);
      expect(s.position.y).toBeGreaterThan(seabedHeight(s.position.x, s.position.z) + 3);
      if (step % 300 === 0) {
        // Never far from the loop: find the nearest sampled loop point.
        let nearest = Infinity;
        for (let d = 0; d < path.length; d += 4) {
          path.pointAt(d, sample);
          nearest = Math.min(nearest, Math.hypot(sample.x - s.position.x, sample.z - s.position.z));
        }
        expect(nearest).toBeLessThan(40);
      }
    }
    // About 1.6 m/s for ten minutes.
    expect(travelled).toBeGreaterThan(600 * 1.3);
    expect(travelled).toBeLessThan(600 * 1.8);
  });

  it("swerves to keep its distance from a diver on its path", () => {
    const route = ellipseLoop(0, -60, 30, 30, -12, 8);
    const path = new LoopPath(route);
    const swimmer = new PathSwimmer(path, { lead: 8, clearance: 3, minDepth: 2, avoidMargin: 8, limits: { ...limits, turnRate: 0.6, acceleration: 0.5 } }, 1);
    const diver = { position: path.pointAt(40, { x: 0, y: 0, z: 0 }), radius: 6 };
    let closest = Infinity;
    for (let step = 0; step < 200 * 30; step += 1) {
      const s = swimmer.update(1 / 30, seabedHeight, [diver], 1);
      closest = Math.min(closest, Math.hypot(s.position.x - diver.position.x, s.position.y - diver.position.y, s.position.z - diver.position.z));
    }
    expect(closest).toBeGreaterThan(5);
  });

  it("points away from close threats", () => {
    const direction = steerDirection({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, [{ position: { x: 0, y: 0, z: 2 }, radius: 1 }], 4);
    expect(direction.z).toBeLessThan(0);
    const free = steerDirection({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, [{ position: { x: 50, y: 0, z: 2 }, radius: 1 }], 4);
    expect(free.z).toBeCloseTo(1);
  });
});

describe("rhythms", () => {
  it("alternates beats and glides, dropping the amplitude to about 20 % in a glide", () => {
    const rhythm = new BeatGlide([2, 2], [3, 3], seeded(1));
    let minimum = 1;
    let glidingSeen = false;
    for (let step = 0; step < 300; step += 1) {
      minimum = Math.min(minimum, rhythm.update(1 / 30));
      glidingSeen ||= rhythm.gliding;
    }
    expect(glidingSeen).toBe(true);
    expect(minimum).toBeLessThan(0.35);
    expect(minimum).toBeGreaterThanOrEqual(0.2);
  });

  it("surfaces to breathe and dives again", () => {
    const schedule = new SurfacingSchedule([10, 10], [20, 20], seeded(2));
    let peak = 0;
    for (let step = 0; step < 30 * 30; step += 1) peak = Math.max(peak, schedule.update(1 / 30));
    expect(peak).toBeGreaterThan(0.9);
    // Back down from 30 s to 40 s.
    for (let step = 0; step < 5 * 30; step += 1) schedule.update(1 / 30);
    expect(schedule.atSurface).toBe(false);
  });
});
