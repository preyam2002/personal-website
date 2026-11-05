import { SPAWN, WORLD_HALF, ZONES, WRECK_POSITION, fractalNoise, seabedHeight, valueNoise, zoneAt } from "../world";

describe("game world", () => {
  it("keeps noise in the unit range", () => {
    for (let index = 0; index < 500; index += 1) {
      const x = index * 1.37 - 300;
      const y = index * 0.71 + 12;
      expect(valueNoise(x, y)).toBeGreaterThanOrEqual(0);
      expect(valueNoise(x, y)).toBeLessThanOrEqual(1);
      expect(fractalNoise(x, y)).toBeGreaterThanOrEqual(0);
      expect(fractalNoise(x, y)).toBeLessThanOrEqual(1);
    }
  });

  it("puts the seabed below the surface everywhere", () => {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 15) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 15) {
        expect(seabedHeight(x, z)).toBeLessThanOrEqual(-1.5);
      }
    }
  });

  it("is shallow at the reef, medium at the wreck, and deep past the drop-off", () => {
    const reef = ZONES.find(zone => zone.id === "reef")!;
    const dropoff = ZONES.find(zone => zone.id === "dropoff")!;
    expect(seabedHeight(reef.x, reef.z)).toBeGreaterThan(-14);
    expect(seabedHeight(WRECK_POSITION.x, WRECK_POSITION.z)).toBeLessThan(-18);
    expect(seabedHeight(dropoff.x, dropoff.z)).toBeLessThan(-40);
  });

  it("is continuous, so the mesh and the collision agree", () => {
    for (let index = 0; index < 200; index += 1) {
      const x = index * 2.9 - 290;
      const z = index * 2.3 - 230;
      expect(Math.abs(seabedHeight(x, z) - seabedHeight(x + 0.05, z))).toBeLessThan(0.2);
    }
  });

  it("names the zone around a point and returns null in open water", () => {
    expect(zoneAt(SPAWN.x + 10, SPAWN.z + 40)?.id).toBe("reef");
    expect(zoneAt(WRECK_POSITION.x, WRECK_POSITION.z)?.id).toBe("wreck");
    expect(zoneAt(-280, 280)).toBeNull();
  });
});
