import * as THREE from "three";
import { BODY_U, humpbackFinUV, paintHumpbackSkin } from "./humpbackSkin";
import { createSkinLayers, fbm, reliefToNormals, valueNoise } from "./skinTextures";
import { buildHumpbackGeometry, HUMPBACK_SHAPE } from "./whales";
import { buildWhaleSharkGeometry, WHALE_SHARK_SHAPE } from "./whaleShark";
import { paintWhaleSharkSkin } from "./whaleSharkSkin";

const triangles = (geometry: THREE.BufferGeometry) => (geometry.getIndex()?.count ?? 0) / 3;

describe("whale and whale shark budgets", () => {
  it.each(["low", "medium", "high"] as const)("keeps the %s quality meshes within budget", quality => {
    const humpback = triangles(buildHumpbackGeometry(quality));
    const shark = triangles(buildWhaleSharkGeometry(quality));
    expect(humpback).toBeLessThanOrEqual(quality === "high" ? 40000 : quality === "medium" ? 24000 : 9000);
    expect(shark).toBeLessThanOrEqual(quality === "high" ? 25000 : quality === "medium" ? 16000 : 9000);
  });

  it("keeps every humpback texture coordinate inside the atlas", () => {
    const uv = buildHumpbackGeometry("medium").getAttribute("uv");
    for (let index = 0; index < uv.count; index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(index)).toBeLessThanOrEqual(1 + 1e-6);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(index)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("maps the fin bands to the right quarter of the atlas", () => {
    const [u0, v0] = humpbackFinUV("pectoralUpper", 0, 0);
    const [u1, v1] = humpbackFinUV("flukeLower", 1, 1);
    expect(u0).toBeGreaterThan(BODY_U);
    expect(v0).toBeGreaterThan(0);
    expect(u1).toBeLessThan(1);
    expect(v1).toBeLessThan(1);
  });
});

describe("skin painting", () => {
  it("makes noise that wraps around the body", () => {
    expect(valueNoise(3.3, 0.25, 1, 8)).toBeCloseTo(valueNoise(3.3, 8.25, 1, 8), 6);
    expect(fbm(1.7, 0.4, 3, 2, 4)).toBeCloseTo(fbm(1.7, 4.4, 3, 2, 4), 6);
  });

  it("turns a bump into normals that lean away from it", () => {
    const layers = createSkinLayers(8, 8, [0.5, 0.5, 0.5], 0.5);
    layers.relief[3 * 8 + 4] = 2;
    const normals = reliefToNormals(layers, 1, false);
    // Left of the bump the normal leans to -x, right of it to +x.
    expect(normals[(3 * 8 + 3) * 4]).toBeLessThan(128);
    expect(normals[(3 * 8 + 5) * 4]).toBeGreaterThan(128);
  });

  it("paints a humpback skin with finite values and a fluke pattern that depends on the seed", () => {
    const a = paintHumpbackSkin(256, 128, HUMPBACK_SHAPE, 1);
    const b = paintHumpbackSkin(256, 128, HUMPBACK_SHAPE, 2);
    for (const value of a.albedo) expect(Number.isFinite(value)).toBe(true);
    for (const value of a.relief) expect(Number.isFinite(value)).toBe(true);
    // The back is dark, the belly pale.
    const at = (x: number, y: number) => a.albedo[(y * 256 + x) * 3 + 1];
    const mean = (rows: [number, number]) => {
      let sum = 0;
      let count = 0;
      for (let y = rows[0]; y < rows[1]; y += 1) {
        for (let x = Math.round(0.25 * 192); x < Math.round(0.5 * 192); x += 1) {
          sum += at(x, y);
          count += 1;
        }
      }
      return sum / count;
    };
    expect(mean([0, 6])).toBeLessThan(0.06);
    expect(mean([56, 72])).toBeGreaterThan(0.25);
    // Fluke undersides differ between individuals.
    let difference = 0;
    for (let y = 96; y < 128; y += 1) for (let x = 192; x < 256; x += 1) difference += Math.abs(a.albedo[(y * 256 + x) * 3] - b.albedo[(y * 256 + x) * 3]);
    expect(difference).toBeGreaterThan(1);
  });

  it("paints a whale shark with a dark spotted back and a white belly", () => {
    const layers = paintWhaleSharkSkin(512, 256, WHALE_SHARK_SHAPE, 3);
    for (const value of layers.albedo) expect(Number.isFinite(value)).toBe(true);
    let pale = 0;
    let dark = 0;
    // Along the back behind the gills, pale spots and stripes cover part of the dark skin.
    for (let x = Math.round(0.25 * 512); x < Math.round(0.6 * 512); x += 1) {
      for (let y = 10; y < 40; y += 1) {
        const g = layers.albedo[(y * 512 + x) * 3 + 1];
        if (g > 0.3) pale += 1;
        else if (g < 0.08) dark += 1;
      }
    }
    expect(pale / (pale + dark)).toBeGreaterThan(0.08);
    expect(pale / (pale + dark)).toBeLessThan(0.6);
    expect(layers.albedo[(128 * 512 + 256) * 3 + 1]).toBeGreaterThan(0.5);
  });
});
