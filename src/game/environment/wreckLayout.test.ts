import * as THREE from "three";
import { seabedHeight } from "../world";
import { PROP_SITES, insideWreckArea, worldToWreck } from "./placement";
import { HATCHES, SHIP, createWreckLayout, deckY, halfWidth, keelY, pieceToWorld, sectionPoints, stationOf } from "./wreckLayout";

describe("hull shape", () => {
  it("has realistic proportions for a 70 m steamer", () => {
    expect(SHIP.length).toBe(70);
    expect(halfWidth(0.5, 0.5) * 2).toBeCloseTo(SHIP.beam, 1);
    expect(SHIP.length / SHIP.beam).toBeGreaterThan(5.5);
    expect(SHIP.length / SHIP.beam).toBeLessThan(7.5);
    expect(halfWidth(1, 0.5)).toBeLessThan(0.2);
    expect(deckY(0.95)).toBeGreaterThan(deckY(0.5) + 2);
    expect(keelY(0)).toBeGreaterThan(1);
  });

  it("builds closed U-shaped sections from deck edge to deck edge", () => {
    const section = sectionPoints(0.5);
    expect(section[0][0]).toBeGreaterThan(5);
    expect(section[section.length - 1][0]).toBeLessThan(-5);
    const lowest = Math.min(...section.map(([, y]) => y));
    expect(lowest).toBeCloseTo(0, 5);
  });

  it("keeps hatches inside the hull and clear of the break", () => {
    for (const hatch of HATCHES) {
      expect(halfWidth(stationOf(hatch.z0), 0.97)).toBeGreaterThan(hatch.halfWidth + 0.5);
      expect(halfWidth(stationOf(hatch.z1), 0.97)).toBeGreaterThan(hatch.halfWidth + 0.5);
      expect(hatch.z1 < SHIP.breakZ - 1 || hatch.z0 > SHIP.breakZ + 1).toBe(true);
    }
  });
});

describe("wreck pose", () => {
  const layout = createWreckLayout();

  it("lists about 12 degrees and the bow section is offset", () => {
    expect(THREE.MathUtils.radToDeg(Math.abs(layout.pieces[0].roll))).toBeCloseTo(12, 0);
    expect(Math.abs(layout.pieces[1].yaw)).toBeGreaterThan(0.15);
  });

  it("buries the keel and keeps the decks above the sand", () => {
    for (const piece of layout.pieces) {
      for (let z = piece.z0 + 3; z < piece.z1 - 3; z += 2) {
        const s = stationOf(z);
        const keel = pieceToWorld(layout, piece, 0, keelY(s), z);
        const deck = pieceToWorld(layout, piece, 0, deckY(s), z);
        expect(keel.y).toBeLessThan(seabedHeight(keel.x, keel.z));
        expect(deck.y).toBeGreaterThan(seabedHeight(deck.x, deck.z) + 2);
        expect(deck.y).toBeLessThan(-5);
      }
    }
  });

  it("is deterministic", () => {
    const again = createWreckLayout();
    expect(again.pieces[1].matrix.elements).toEqual(layout.pieces[1].matrix.elements);
  });

  it("ties the mooring line to the forecastle, below the surface", () => {
    expect(layout.mooringPoint.y).toBeLessThan(-3);
    expect(layout.mooringPoint.y).toBeGreaterThan(seabedHeight(layout.mooringPoint.x, layout.mooringPoint.z));
  });

  it("puts the strongbox on the sand beside the hull, inside the debris field", () => {
    const [x] = worldToWreck(PROP_SITES.chest.x, PROP_SITES.chest.z);
    expect(x).toBeGreaterThan(9);
    expect(insideWreckArea(PROP_SITES.chest.x, PROP_SITES.chest.z)).toBe(true);
  });
});
