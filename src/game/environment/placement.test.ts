import { seabedHeight, ZONES } from "../world";
import {
  KEEP_CLEAR,
  PROP_SITES,
  ROCK_SEED,
  groundY,
  insideWreckArea,
  placeKelp,
  placeReef,
  placeRocks,
  placeSeaFloor,
  reefHeadHeight,
  rockClearAreas,
  scaledCount,
  scatter,
  worldToWreck,
  wreckToWorld,
} from "./placement";
import { createRandom } from "./random";

const zone = (id: string) => ZONES.find(item => item.id === id)!;

describe("random", () => {
  it("is deterministic for a seed and differs between seeds", () => {
    const a = createRandom(1);
    const b = createRandom(1);
    const c = createRandom(2);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(first);
    for (const value of first) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of first) expect(value).toBeLessThan(1);
  });
});

describe("scatter", () => {
  it("keeps the minimum spacing and stays in the disc", () => {
    const points = scatter({ random: createRandom(5), count: 200, center: { x: 10, z: -5 }, radius: 30, spacing: 2 });
    expect(points.length).toBeGreaterThan(100);
    for (let i = 0; i < points.length; i += 1) {
      expect(Math.hypot(points[i].x - 10, points[i].z + 5)).toBeLessThanOrEqual(30);
      for (let j = i + 1; j < points.length; j += 1) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("respects the accept rule", () => {
    const points = scatter({ random: createRandom(9), count: 50, radius: 100, accept: x => x > 0 });
    for (const point of points) expect(point.x).toBeGreaterThan(0);
  });
});

describe("ground placement", () => {
  it("never floats: the base is at or below the seabed under the whole footprint", () => {
    const random = createRandom(3);
    for (let index = 0; index < 200; index += 1) {
      const x = (random() - 0.5) * 560;
      const z = (random() - 0.5) * 560;
      const y = groundY(x, z, 1.5);
      expect(y).toBeLessThanOrEqual(seabedHeight(x, z) + 1e-9);
      expect(y).toBeGreaterThan(seabedHeight(x, z) - 1.5);
    }
  });

  it("converts between world and wreck frames", () => {
    const [x, z] = wreckToWorld(3, 17);
    const [lx, lz] = worldToWreck(x, z);
    expect(lx).toBeCloseTo(3);
    expect(lz).toBeCloseTo(17);
    // The bow (+z in the wreck frame) points north-east-ish, toward the drop-off.
    const [bowX, bowZ] = wreckToWorld(0, 30);
    expect(bowX).toBeGreaterThan(40);
    expect(bowZ).toBeGreaterThan(40);
  });
});

describe("rocks", () => {
  const rocks = placeRocks(createRandom(ROCK_SEED), "high");

  it("is deterministic", () => {
    expect(placeRocks(createRandom(ROCK_SEED), "high")).toEqual(rocks);
  });

  it("sits in the sand, never below its own size, and keeps clear of the wreck and props", () => {
    expect(rocks.length).toBeGreaterThan(300);
    for (const rock of rocks) {
      const seabed = seabedHeight(rock.x, rock.z);
      expect(rock.y).toBeLessThanOrEqual(seabed);
      // Gardens (a staged 18 m cluster) sit at the lowest point of their wider footprint.
      const tolerance = rock.kind === "garden" ? 3 : Math.max(rock.scale, 1) * 1.2;
      expect(rock.y).toBeGreaterThan(seabed - tolerance);
      expect(insideWreckArea(rock.x, rock.z)).toBe(false);
      for (const area of KEEP_CLEAR) expect(Math.hypot(rock.x - area.x, rock.z - area.z)).toBeGreaterThan(area.radius);
    }
  });

  it("scales with quality", () => {
    expect(placeRocks(createRandom(ROCK_SEED), "low").length).toBeLessThan(rocks.length * 0.5);
  });
});

describe("reef", () => {
  const rocks = placeRocks(createRandom(ROCK_SEED), "high");
  const { heads, placements: reef } = placeReef(createRandom(9002), "high", rockClearAreas(rocks));

  it("builds reef heads with every kind of colony, near the reef or the drop-off", () => {
    expect(heads.length).toBeGreaterThan(30);
    expect(reef.length).toBeGreaterThan(300);
    expect(new Set(reef.map(item => item.kind)).size).toBe(9);
    const reefZone = zone("reef");
    const dropoff = zone("dropoff");
    for (const item of reef) {
      const nearReef = Math.hypot(item.x - reefZone.x, item.z - reefZone.z) <= reefZone.radius + 6;
      const nearDropoff = Math.hypot(item.x - (dropoff.x - 40), item.z - (dropoff.z - 40)) <= 52;
      expect(nearReef || nearDropoff).toBe(true);
    }
  });

  it("grows on the seabed or a reef head: never floating, never deeply buried", () => {
    for (const item of reef) {
      const seabed = seabedHeight(item.x, item.z);
      const surface = Math.max(seabed, ...heads.map(head => reefHeadHeight(head, item.x, item.z)));
      expect(item.y).toBeLessThanOrEqual(surface + 1e-9);
      expect(item.y).toBeGreaterThan(surface - 0.5 * item.scale - 0.25);
      expect(Math.hypot(item.x - PROP_SITES.clam.x, item.z - PROP_SITES.clam.z)).toBeGreaterThan(PROP_SITES.clam.radius);
    }
  });

  it("sits the heads in the sand", () => {
    for (const head of heads) {
      expect(head.y).toBeLessThan(seabedHeight(head.x, head.z));
      expect(head.y + head.height).toBeGreaterThan(seabedHeight(head.x, head.z));
    }
  });

  it("is deterministic", () => {
    expect(placeReef(createRandom(9002), "high", rockClearAreas(rocks))).toEqual({ heads, placements: reef });
  });
});

describe("kelp", () => {
  const { holdfasts, stalks } = placeKelp(createRandom(5151), 250, 0.7);

  it("makes the requested number of stalks in clumps", () => {
    expect(stalks.length).toBe(250);
    expect(holdfasts.length).toBeGreaterThan(40);
    expect(holdfasts.length).toBeLessThan(stalks.length);
  });

  it("rises from the seabed to just below the surface", () => {
    const kelpZone = zone("kelp");
    for (const stalk of stalks) {
      const seabed = seabedHeight(stalk.x, stalk.z);
      expect(stalk.y).toBeLessThanOrEqual(seabed);
      expect(stalk.y).toBeGreaterThan(seabed - 0.2);
      const top = stalk.y + stalk.height;
      expect(top).toBeLessThan(-0.3);
      expect(top).toBeGreaterThan(-2.5);
      expect(Math.hypot(stalk.x - kelpZone.x, stalk.z - kelpZone.z)).toBeLessThan(kelpZone.radius + 1);
    }
  });

  it("scales the count with quality", () => {
    expect(scaledCount(250, "medium")).toBeLessThan(250);
    expect(placeKelp(createRandom(5151), scaledCount(250, "low"), 0.7).stalks.length).toBe(scaledCount(250, "low"));
  });
});

describe("sea floor", () => {
  const layout = placeSeaFloor(createRandom(31338), "high");

  it("places grass, starfish and shells on (not under) the sand, away from the wreck", () => {
    expect(layout.grass.length).toBeGreaterThan(1000);
    expect(layout.starfish.length).toBeGreaterThan(50);
    for (const items of Object.values(layout)) {
      for (const item of items) {
        const seabed = seabedHeight(item.x, item.z);
        expect(item.y).toBeLessThanOrEqual(seabed + 1e-9);
        expect(item.y).toBeGreaterThan(seabed - 0.3);
        expect(insideWreckArea(item.x, item.z)).toBe(false);
      }
    }
  });
});
