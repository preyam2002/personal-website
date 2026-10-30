import {
  BOAT_DRIFT_SPEED,
  BOAT_SLOTS,
  createBoats,
  packBoats,
  placeBoat,
  pushBoat,
  pushBoatsFromRipple,
  stepBoats,
} from "./oceanBoats";
import { ACTOR_TEXTURE_WIDTH, PELLET_SLOTS, type SchoolBounds } from "./oceanLife";
import { seededRandom } from "./oceanWaves";

const emptyBounds = (): SchoolBounds => ({
  count: 0,
  low: [1, 1, 1],
  high: [-1, -1, -1],
  airLow: [1, 1, 1],
  airHigh: [-1, -1, -1],
  boatLow: [1, 1, 1],
  boatHigh: [-1, -1, -1],
});

describe("paper boats", () => {
  it("creates at most one boat per slot, each with a different paper tint", () => {
    const boats = createBoats(5, seededRandom(1));
    expect(boats).toHaveLength(BOAT_SLOTS);
    expect(new Set(boats.map(boat => boat.tint)).size).toBe(BOAT_SLOTS);
  });

  it("drifts downwind at a slow speed", () => {
    const [boat] = createBoats(1, seededRandom(2));
    const start = [...boat.anchor];
    for (let step = 0; step < 600; step += 1) stepBoats([boat], 1 / 60, [1, 0]);
    expect(boat.anchor[0] - start[0]).toBeGreaterThan(BOAT_DRIFT_SPEED * 5);
    expect(boat.anchor[0] - start[0]).toBeLessThan(BOAT_DRIFT_SPEED * 10.5);
    expect(Math.abs(boat.anchor[1] - start[1])).toBeLessThan(0.01);
  });

  it("returns into the near water after a hard push and keeps boats apart", () => {
    const boats = createBoats(2, seededRandom(3));
    boats[1].anchor = [boats[0].anchor[0] + 0.1, boats[0].anchor[1]];
    pushBoat(boats[0], [0, 5], 0);
    expect(Math.hypot(...boats[0].velocity)).toBeLessThanOrEqual(1.2 + 1e-9);
    for (let step = 0; step < 60 * 90; step += 1) stepBoats(boats, 1 / 60, [0, 0]);
    expect(boats[0].anchor[1]).toBeLessThan(9.5);
    expect(Math.hypot(boats[0].anchor[0] - boats[1].anchor[0], boats[0].anchor[1] - boats[1].anchor[1]))
      .toBeGreaterThan(0.6);
  });

  it("turns toward the direction of travel", () => {
    const [boat] = createBoats(1, seededRandom(4));
    boat.yaw = 0.6;
    for (let step = 0; step < 600; step += 1) {
      pushBoat(boat, [0.5 - boat.velocity[0], -boat.velocity[1]], 0);
      stepBoats([boat], 1 / 60, [0, 0]);
    }
    const offset = Math.abs(((boat.yaw - Math.PI / 2) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2);
    expect(offset).toBeLessThan(0.15);
  });

  it("moves away from a nearby ripple and ignores a distant one", () => {
    const boats = createBoats(2, seededRandom(5));
    boats[0].position = [0.5, 0, 2];
    boats[1].position = [6, 0, 2];
    pushBoatsFromRipple(boats, 0, 2, 0.25);
    expect(boats[0].velocity[0]).toBeGreaterThan(0);
    expect(boats[1].velocity).toEqual([0, 0]);
  });

  it("follows the surface sample and eases its tilt", () => {
    const [boat] = createBoats(1, seededRandom(6));
    const normal = [0.3, 0.9, 0].map(value => value / Math.hypot(0.3, 0.9)) as [number, number, number];
    placeBoat(boat, { position: [1, -0.2, 3], normal }, 1 / 60);
    expect(boat.position).toEqual([1, -0.2, 3]);
    expect(boat.normal[0]).toBeGreaterThan(0);
    expect(boat.normal[0]).toBeLessThan(normal[0]);
    expect(Math.hypot(...boat.normal)).toBeCloseTo(1, 9);
  });

  it("packs the probe slot, length, tint, and yaw after the pellet texels", () => {
    const boats = createBoats(2, seededRandom(7));
    boats[1].yaw = -1;
    const data = new Float32Array(ACTOR_TEXTURE_WIDTH * 16);
    const bounds = emptyBounds();
    expect(packBoats(boats, data, bounds, index => [4, -1][index])).toBe(1);
    const texel = (ACTOR_TEXTURE_WIDTH * 3 + PELLET_SLOTS) * 4;
    expect(data[texel]).toBe(4);
    expect(data[texel + 3]).toBeCloseTo(boats[0].length, 6);
    const code = data[texel + 7];
    expect(Math.floor(code / 10)).toBe(0);
    expect(code % 10).toBeLessThan(Math.PI * 2);
    expect(bounds.boatLow[0]).toBeLessThan(boats[0].position[0]);
    expect(bounds.boatHigh[2]).toBeGreaterThan(boats[0].position[2]);
    expect(bounds.low[0]).toBeGreaterThan(bounds.high[0]);
  });
});
