/**
 * The wreck: a 70 m steel cargo steamer broken in two on the sand.
 *
 * All the steel is one merged, vertex-colored mesh (one draw call) with a
 * generated plate normal map. Sponges are two instanced meshes on its
 * surfaces. A mooring line runs up to a buoy at the surface. Debris from the
 * staged glTF models (planks, oil drums, the ship's wheel) lies around it.
 */
import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { createEncrustingSponge, createTubeSponges } from "./corals";
import { MeshBuilder, beamMatrix, boxProjectUvs, composeMatrix, cylinderMatrix, smoothNormals } from "./geometry";
import { Resources, createInstancedMesh, prepareMaterial, type InstanceSpec } from "./materials";
import { loadBakedModel } from "./models";
import { createRandom, fractal3, noise3, pick, range, type Random } from "./random";
import { createPlateTextures } from "./textures";
import {
  HATCHES,
  SHIP,
  SUPERSTRUCTURE,
  createWreckLayout,
  deckY,
  halfWidth,
  sectionPoints,
  stationOf,
  type PiecePose,
  type WreckLayout,
} from "./wreckLayout";

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

const RUST = new THREE.Color(0.27, 0.15, 0.09);
const STEEL = new THREE.Color(0.3, 0.33, 0.35);
const ENCRUSTED = new THREE.Color(0.33, 0.34, 0.27);
const CORALLINE = new THREE.Color(0.48, 0.3, 0.33);
const SILT = new THREE.Color(0.55, 0.5, 0.4);

/** The color of encrusted steel at a point in the wreck frame. */
export function wreckColor(position: THREE.Vector3, normal: THREE.Vector3) {
  const color = new THREE.Color();
  const n1 = fractal3(position.x * 0.22, position.y * 0.22, position.z * 0.22, 3);
  const n2 = noise3(position.x * 0.7 + 11, position.y * 0.7, position.z * 0.7 - 4);
  const n3 = noise3(position.x * 1.6 - 3, position.y * 1.6 + 7, position.z * 1.6);
  color.copy(RUST).lerp(STEEL, Math.min(Math.max((n1 - 0.35) * 2.2, 0), 1));
  color.lerp(ENCRUSTED, Math.min(Math.max((n2 - 0.4) * 1.8, 0), 0.85));
  if (n3 > 0.68) color.lerp(CORALLINE, Math.min((n3 - 0.68) * 5, 0.8));
  // Silt settles on surfaces that face up; undersides stay dark.
  const up = normal.y;
  if (up > 0.45) color.lerp(SILT, Math.min((up - 0.45) * 1.6, 0.75) * (0.6 + n2 * 0.4));
  if (up < -0.3) color.multiplyScalar(0.65);
  return color;
}

type Part = { builder: MeshBuilder; matrix: THREE.Matrix4 };

/** Sponges only grow on broad surfaces; the vertex weight marks them (1) or not (0). */
const BROAD = 1;
const NARROW = 0;

function addBox(part: Part, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation: THREE.Euler | null = null) {
  const sizes = [sx, sy, sz].sort((a, b) => a - b);
  part.builder.add(UNIT_BOX, part.matrix.clone().multiply(composeMatrix(x, y, z, rotation, sx, sy, sz)), wreckColor, sizes[1] > 0.8 ? BROAD : NARROW);
}

function addBeam(part: Part, from: THREE.Vector3, to: THREE.Vector3, width: number, height = width) {
  part.builder.add(UNIT_BOX, part.matrix.clone().multiply(beamMatrix(from, to, width, height)), wreckColor, NARROW);
}

function addCylinder(part: Part, from: THREE.Vector3, to: THREE.Vector3, radiusBottom: number, radiusTop: number, sides = 8, open = false) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, sides, 1, open);
  part.builder.add(geometry, part.matrix.clone().multiply(cylinderMatrix(from, to, 1)), wreckColor, Math.max(radiusBottom, radiusTop) > 0.6 ? BROAD : NARROW);
  geometry.dispose();
}

/** A quad from four corners, facing the side of `hint`. */
function addQuad(part: Part, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, hint: THREE.Vector3) {
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const corners = normal.dot(hint) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  geometry.computeVertexNormals();
  part.builder.add(geometry, part.matrix, wreckColor, BROAD);
  geometry.dispose();
}

/**
 * A wall in the x-y plane from (0, 0) to (width, height), with rectangular
 * openings cut out. The wall is split into boxes around the openings.
 */
function addWall(part: Part, local: THREE.Matrix4, width: number, height: number, thickness: number, openings: { x: number; y: number; w: number; h: number }[]) {
  const xs = new Set([0, width]);
  const ys = new Set([0, height]);
  for (const opening of openings) {
    xs.add(opening.x);
    xs.add(opening.x + opening.w);
    ys.add(opening.y);
    ys.add(opening.y + opening.h);
  }
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const matrix = part.matrix.clone().multiply(local);
  for (let ix = 0; ix < sortedX.length - 1; ix += 1) {
    for (let iy = 0; iy < sortedY.length - 1; iy += 1) {
      const x0 = sortedX[ix];
      const x1 = sortedX[ix + 1];
      const y0 = sortedY[iy];
      const y1 = sortedY[iy + 1];
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) continue;
      if (openings.some(o => cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h)) continue;
      part.builder.add(UNIT_BOX, matrix.clone().multiply(composeMatrix(cx, cy, 0, null, x1 - x0, y1 - y0, thickness)), wreckColor, Math.min(x1 - x0, y1 - y0) > 0.6 ? BROAD : NARROW);
    }
  }
}

function windowsRow(width: number, count: number, w: number, h: number, y: number, skip: number[] = []) {
  const openings: { x: number; y: number; w: number; h: number }[] = [];
  const gap = width / count;
  for (let index = 0; index < count; index += 1) {
    if (skip.includes(index)) continue;
    openings.push({ x: gap * (index + 0.5) - w / 2, y, w, h });
  }
  return openings;
}

/** A deck house: four walls with windows and doors, and a roof slab. */
function addHouse(part: Part, options: { x: number; z0: number; z1: number; y: number; height: number; front: ReturnType<typeof windowsRow>; side: ReturnType<typeof windowsRow>; back: ReturnType<typeof windowsRow>; roofOverhang: number }) {
  const { x, z0, z1, y, height } = options;
  const length = z1 - z0;
  const t = 0.16;
  // Front wall faces +z.
  addWall(part, composeMatrix(-x, y, z1), x * 2, height, t, options.front);
  addWall(part, composeMatrix(x, y, z0, new THREE.Euler(0, Math.PI, 0)), x * 2, height, t, options.back);
  addWall(part, composeMatrix(x, y, z1, new THREE.Euler(0, Math.PI / 2, 0)), length, height, t, options.side);
  addWall(part, composeMatrix(-x, y, z0, new THREE.Euler(0, -Math.PI / 2, 0)), length, height, t, options.side);
  const o = options.roofOverhang;
  addBox(part, 0, y + height + 0.1, (z0 + z1) / 2, x * 2 + o * 2, 0.2, length + o * 2);
}

function addRailing(part: Part, random: Random, points: THREE.Vector3[], height = 1.05) {
  const tops: (THREE.Vector3 | null)[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const base = points[index];
    if (random() < 0.18) {
      tops.push(null);
      continue;
    }
    const bend = random() < 0.15 ? (random() - 0.5) * 1.3 : (random() - 0.5) * 0.12;
    const top = base.clone().add(new THREE.Vector3(Math.sin(bend) * height, Math.cos(bend) * height, 0));
    addBeam(part, base, top, 0.07);
    tops.push(top);
  }
  for (let index = 0; index < tops.length - 1; index += 1) {
    const a = tops[index];
    const b = tops[index + 1];
    if (!a || !b || random() < 0.12) continue;
    addBeam(part, a, b, 0.06);
    const midA = points[index].clone().lerp(a, 0.5);
    const midB = points[index + 1].clone().lerp(b, 0.5);
    addBeam(part, midA, midB, 0.05);
  }
}

function rag(index: number, seed: number) {
  return noise3(index * 0.9, seed, 1.7) * 1.8 + noise3(index * 2.7, seed, 4.1) * 0.6;
}

/** The hull shell of a piece: stations of cross-sections with a ragged broken end. */
function addHull(part: Part, piece: PiecePose) {
  const isStern = piece.name === "stern";
  const stations: number[] = [];
  if (isStern) {
    for (let z = piece.z0; z <= piece.z1 - 2; z += 1) stations.push(z);
  } else {
    for (let z = piece.z0 + 2; z <= piece.z1 + 1e-6; z += 1) stations.push(z);
  }
  const sections = stations.map(z => sectionPoints(stationOf(z)).map(([x, y]) => new THREE.Vector3(x, y, z)));
  // The broken end: every point of the last section is torn at a different length.
  const breakSection = sectionPoints(stationOf(SHIP.breakZ)).map(([x, y], index) => {
    const torn = rag(index, isStern ? 3 : 9);
    const buckle = (noise3(index * 1.3, isStern ? 1 : 5, 0) - 0.5) * 0.7;
    return new THREE.Vector3(x * (1 + buckle * 0.08), y + buckle * 0.3, isStern ? SHIP.breakZ - 0.1 - torn : SHIP.breakZ + 0.1 + torn);
  });
  if (isStern) sections.push(breakSection);
  else sections.unshift(breakSection);
  const columns = sections[0].length;
  const positions: number[] = [];
  for (const section of sections) for (const point of section) positions.push(point.x, point.y, point.z);
  const indices: number[] = [];
  for (let row = 0; row < sections.length - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Make sure the shell faces outward: the keel normal must point down.
  const keelIndex = Math.floor(sections.length / 2) * columns + Math.floor(columns / 2);
  if ((geometry.getAttribute("normal") as THREE.BufferAttribute).getY(keelIndex) > 0) {
    for (let index = 0; index < indices.length; index += 3) [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  part.builder.add(geometry, part.matrix, wreckColor, BROAD);
  geometry.dispose();
  if (isStern) {
    // The transom closes the stern.
    const section = sections[0];
    const center = section.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(section.length);
    for (let index = 0; index < section.length - 1; index += 1) {
      addQuad(part, center, section[index], section[index + 1], section[index + 1], new THREE.Vector3(0, 0, -1));
    }
  }
}

/** Deck plating with holes for the hatches, from z0 to z1. */
function addDeck(part: Part, z0: number, z1: number) {
  const samples = new Set<number>();
  for (let z = z0; z < z1; z += 1) samples.add(z);
  samples.add(z1);
  for (const hatch of HATCHES) {
    if (hatch.z0 > z0 && hatch.z0 < z1) samples.add(hatch.z0);
    if (hatch.z1 > z0 && hatch.z1 < z1) samples.add(hatch.z1);
  }
  const zs = [...samples].sort((a, b) => a - b);
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < zs.length - 1; index += 1) {
    const za = zs[index];
    const zb = zs[index + 1];
    const mid = (za + zb) / 2;
    const hatch = HATCHES.find(item => mid > item.z0 && mid < item.z1);
    const ya = deckY(stationOf(za));
    const yb = deckY(stationOf(zb));
    const wa = halfWidth(stationOf(za), 0.97) - 0.05;
    const wb = halfWidth(stationOf(zb), 0.97) - 0.05;
    const cells: [number, number][] = hatch ? [[-1, -hatch.halfWidth / 10], [hatch.halfWidth / 10, 1]] : [[-1, 1]];
    for (const [from, to] of cells) {
      // Inner edges at the hatch are fixed in meters; outer edges follow the hull.
      const xa0 = Math.abs(from) === 1 ? from * wa : from * 10;
      const xa1 = Math.abs(to) === 1 ? to * wa : to * 10;
      const xb0 = Math.abs(from) === 1 ? from * wb : from * 10;
      const xb1 = Math.abs(to) === 1 ? to * wb : to * 10;
      addQuad(part, new THREE.Vector3(xa0, ya, za), new THREE.Vector3(xa1, ya, za), new THREE.Vector3(xb1, yb, zb), new THREE.Vector3(xb0, yb, zb), up);
    }
  }
}

/** An open hold under a hatch: coaming, a floor, end bulkheads, some cargo. */
function addHold(part: Part, random: Random, hatch: (typeof HATCHES)[number]) {
  const deck = deckY(stationOf((hatch.z0 + hatch.z1) / 2));
  const w = hatch.halfWidth;
  const coaming = 0.9;
  const t = 0.22;
  addBox(part, -w - t / 2, deck + coaming / 2, (hatch.z0 + hatch.z1) / 2, t, coaming, hatch.z1 - hatch.z0 + t * 2);
  addBox(part, w + t / 2, deck + coaming / 2, (hatch.z0 + hatch.z1) / 2, t, coaming, hatch.z1 - hatch.z0 + t * 2);
  addBox(part, 0, deck + coaming / 2, hatch.z0 - t / 2, w * 2, coaming, t);
  addBox(part, 0, deck + coaming / 2, hatch.z1 + t / 2, w * 2, coaming, t);
  const floor = 1.3;
  const h0 = hatch.z0 - 1.6;
  const h1 = hatch.z1 + 1.6;
  const floorWidth = Math.min(halfWidth(stationOf(h0), 0.2), halfWidth(stationOf(h1), 0.2)) - 0.2;
  addBox(part, 0, floor, (h0 + h1) / 2, floorWidth * 2, 0.15, h1 - h0);
  for (const z of [h0, h1]) {
    const s = stationOf(z);
    const top = deckY(s);
    const width = halfWidth(s, 0.6) * 2 - 0.3;
    addBox(part, 0, (floor + top) / 2, z, width, top - floor, 0.15);
  }
  // Cargo: crates and a bundle of pipes, shifted to the low side.
  const crates = 3 + Math.floor(random() * 4);
  for (let index = 0; index < crates; index += 1) {
    const size = range(random, 0.9, 1.6);
    addBox(part, range(random, 0.5, floorWidth - 0.8), floor + size / 2 + (random() < 0.3 ? size : 0), range(random, h0 + 1, h1 - 1), size, size * range(random, 0.7, 1), size * range(random, 0.9, 1.4), new THREE.Euler(0, random() * 0.6, (random() - 0.5) * 0.4));
  }
  if (random() < 0.7) {
    for (let index = 0; index < 5; index += 1) {
      const x = -floorWidth + 0.8 + index * 0.45;
      addCylinder(part, new THREE.Vector3(x, floor + 0.3, h0 + 0.6), new THREE.Vector3(x + 0.2, floor + 0.3 + (index % 2) * 0.35, h1 - 0.6), 0.2, 0.2, 7, true);
    }
  }
  // A cover pontoon that fell into the hold, leaning on the coaming.
  if (random() < 0.8) addBox(part, -0.5, deck - 1.5, (hatch.z0 + hatch.z1) / 2, w * 2 + 0.4, 0.22, 1.6, new THREE.Euler(0.9, 0, 0.15));
}

function deckEdge(z0: number, z1: number, side: number, step: number) {
  const points: THREE.Vector3[] = [];
  for (let z = z0; z <= z1; z += step) {
    const s = stationOf(z);
    points.push(new THREE.Vector3(side * (halfWidth(s, 0.97) - 0.12), deckY(s), z));
  }
  return points;
}

function addSternPiece(part: Part, random: Random, piece: PiecePose) {
  addHull(part, piece);
  addDeck(part, piece.z0, SHIP.breakZ - 1.1);
  for (const hatch of HATCHES.filter(item => item.z1 < SHIP.breakZ)) addHold(part, random, hatch);
  const base = deckY(stationOf(0));
  // Midship deck house with portholes, and the bridge on top of it.
  addHouse(part, {
    x: 4.6,
    z0: SUPERSTRUCTURE.z0,
    z1: SUPERSTRUCTURE.z1,
    y: base,
    height: 2.6,
    front: [...windowsRow(9.2, 5, 0.6, 0.6, 1.3, [2]), { x: 4.15, y: 0, w: 0.9, h: 2 }],
    side: [...windowsRow(15, 7, 0.55, 0.55, 1.35, [3]), { x: 7.05, y: 0, w: 0.9, h: 2 }],
    back: [{ x: 4.15, y: 0, w: 0.9, h: 2 }],
    roofOverhang: 0.7,
  });
  const bridgeY = base + 2.8;
  addHouse(part, {
    x: 3.6,
    z0: 1.6,
    z1: 6.4,
    y: bridgeY,
    height: 2.4,
    front: windowsRow(7.2, 5, 0.95, 0.85, 1.15),
    side: windowsRow(4.8, 2, 0.8, 0.8, 1.2),
    back: [{ x: 3.15, y: 0, w: 0.9, h: 2 }],
    roofOverhang: 0.4,
  });
  // Funnel base, torn where the funnel broke off.
  const stub = new THREE.CylinderGeometry(1.25, 1.3, 1.1, 18, 2, true);
  const stubPosition = stub.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < stubPosition.count; index += 1) {
    if (stubPosition.getY(index) > 0.5) stubPosition.setY(index, 0.55 - noise3(stubPosition.getX(index) * 3, 0, stubPosition.getZ(index) * 3) * 0.6);
  }
  part.builder.add(stub, part.matrix.clone().multiply(composeMatrix(0, bridgeY + 0.5, -3, null, 1.25, 1, 1)), wreckColor);
  stub.dispose();
  // Ventilator cowls and empty lifeboat davits.
  for (const [x, z] of [[-2.6, -6], [2.6, -6], [-2.8, 0], [2.8, 0]] as const) {
    addCylinder(part, new THREE.Vector3(x, bridgeY, z), new THREE.Vector3(x, bridgeY + 1.6, z), 0.28, 0.28, 8, true);
    addCylinder(part, new THREE.Vector3(x, bridgeY + 1.6, z - 0.2), new THREE.Vector3(x, bridgeY + 1.9, z + 0.35), 0.42, 0.46, 8, true);
  }
  for (const side of [-1, 1]) {
    for (const z of [-6.5, -2.5]) {
      const foot = new THREE.Vector3(side * 5.1, bridgeY, z);
      const knee = new THREE.Vector3(side * 5.25, bridgeY + 2.2, z);
      const tip = new THREE.Vector3(side * (5.25 + (side > 0 ? 1.1 : 0.4)), bridgeY + 2.6, z);
      addBeam(part, foot, knee, 0.14);
      addBeam(part, knee, tip, 0.12);
    }
    addRailing(part, random, deckEdge(SUPERSTRUCTURE.z0 - 0.5, SUPERSTRUCTURE.z1, side, 1.5).map(point => new THREE.Vector3(side * 5.2, bridgeY, point.z)));
  }
  // Main mast, broken off above the mast house.
  const mastZ = -18.25;
  const mastDeck = deckY(stationOf(mastZ));
  addBox(part, 0, mastDeck + 0.8, mastZ, 2, 1.6, 1.8);
  addCylinder(part, new THREE.Vector3(0, mastDeck + 1.6, mastZ), new THREE.Vector3(0.05, mastDeck + 3.6, mastZ), 0.32, 0.3, 10);
  // Winches by the hatches.
  for (const z of [-27.2, -19.2, -9.7]) {
    const y = deckY(stationOf(z));
    addBox(part, 0, y + 0.45, z, 1.4, 0.9, 1);
    addCylinder(part, new THREE.Vector3(-1.1, y + 0.6, z), new THREE.Vector3(1.1, y + 0.6, z), 0.32, 0.32, 10);
  }
  // Railing along the main deck, from the poop to the break.
  for (const side of [-1, 1]) addRailing(part, random, deckEdge(-26.5, SHIP.breakZ - 2, side, 1.6));
  // Rudder, jammed over, and the four-bladed propeller.
  addBox(part, 0.3, 2.3, -35.3, 0.28, 3.4, 2.1, new THREE.Euler(0, 0.45, 0));
  addCylinder(part, new THREE.Vector3(0, 2.4, -33.4), new THREE.Vector3(0, 2.4, -34.4), 0.4, 0.3, 10);
  for (let blade = 0; blade < 4; blade += 1) {
    const angle = blade * (Math.PI / 2) + 0.4;
    addBox(part, Math.cos(angle) * 0.9, 2.4 + Math.sin(angle) * 0.9, -33.9, 1.5, 0.08, 0.75, new THREE.Euler(0, 0.35, angle));
  }
}

function addBowPiece(part: Part, random: Random, piece: PiecePose) {
  addHull(part, piece);
  addDeck(part, SHIP.breakZ + 1.1, piece.z1);
  for (const hatch of HATCHES.filter(item => item.z0 > SHIP.breakZ)) addHold(part, random, hatch);
  // Foremast with its crosstree, and the derrick booms.
  const mastZ = 18.5;
  const deck = deckY(stationOf(mastZ));
  addBox(part, 0, deck + 0.9, mastZ, 2.2, 1.8, 1.8);
  addCylinder(part, new THREE.Vector3(0, deck + 1.8, mastZ), new THREE.Vector3(0, deck + 13, mastZ), 0.28, 0.17, 10);
  addBox(part, 0, deck + 10, mastZ, 3.4, 0.2, 0.25);
  addBeam(part, new THREE.Vector3(-1.6, deck + 10, mastZ), new THREE.Vector3(-0.1, deck + 12.5, mastZ), 0.05);
  addBeam(part, new THREE.Vector3(1.6, deck + 10, mastZ), new THREE.Vector3(0.1, deck + 12.5, mastZ), 0.05);
  addCylinder(part, new THREE.Vector3(0.3, deck + 2.2, mastZ + 0.8), new THREE.Vector3(0.6, deck + 3.4, 25.2), 0.16, 0.12, 8);
  addCylinder(part, new THREE.Vector3(-0.3, deck + 2.2, mastZ - 0.8), new THREE.Vector3(-1.2, deck - 2.4, 13.4), 0.16, 0.12, 8);
  // Forecastle machinery: windlass and mooring bitts.
  const fore = deckY(stationOf(30));
  addBox(part, 0, fore + 0.4, 29, 2.4, 0.8, 1.1);
  for (const x of [-1.6, 1.6]) addCylinder(part, new THREE.Vector3(x, fore + 0.6, 29), new THREE.Vector3(x * 0.6, fore + 0.6, 29), 0.42, 0.42, 10);
  for (const x of [-0.45, 0.45]) addCylinder(part, new THREE.Vector3(x, fore, 31.5), new THREE.Vector3(x, fore + 0.7, 31.5), 0.2, 0.2, 8);
  for (const side of [-1, 1]) addRailing(part, random, deckEdge(SHIP.breakZ + 2, 26.5, side, 1.6));
}

/** Debris on the sand, in the wreck frame: the fallen funnel and mast, plates, hatch covers. */
function addDebris(part: Part, random: Random, layout: WreckLayout) {
  const sand = layout.seabedLocal;
  // The funnel fell to the low side and lies on the sand, dented and half full of sand.
  const funnel = new THREE.CylinderGeometry(1, 1, 6.5, 22, 6, true);
  const position = funnel.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const dent = 1 - noise3(x * 1.5, y * 0.6, z * 1.5) * 0.18;
    position.setXYZ(index, x * dent, y, z * dent);
  }
  smoothNormals(funnel);
  const funnelX = 11.5;
  const funnelZ = -4.5;
  const funnelY = sand(funnelX, funnelZ) + 0.9;
  part.builder.add(funnel, composeMatrix(funnelX, funnelY, funnelZ, new THREE.Euler(0.08, 0.5, Math.PI / 2 + 0.06, "YXZ"), 1.45, 1, 1.15), wreckColor, BROAD);
  funnel.dispose();
  // The top of the main mast, broken off and lying across the rail to the sand.
  const stern = layout.pieces[0];
  const mastZ = -18.25;
  const mastTop = new THREE.Vector3(0.05, deckY(stationOf(mastZ)) + 3.6, mastZ).applyMatrix4(stern.matrix);
  const mastEnd = new THREE.Vector3(14.5, sand(14.5, -23) + 0.2, -23);
  addCylinder(part, mastTop.clone().lerp(mastEnd, 0.04), mastEnd, 0.28, 0.2, 10);
  // Torn plates and hatch covers on the sand around the break.
  for (let index = 0; index < 9; index += 1) {
    const x = range(random, -7, 16);
    const z = range(random, 4, 15) * (random() < 0.3 ? -1.4 : 1);
    if (Math.abs(x) < 7 && Math.abs(z) < 30) continue;
    const width = range(random, 1.2, 3.2);
    addBox(part, x, sand(x, z) + 0.06, z, width, 0.1, range(random, 0.8, 2), new THREE.Euler((random() - 0.5) * 0.3, random() * Math.PI, (random() - 0.5) * 0.4, "YXZ"));
  }
  for (const [x, z] of [[9.5, -14], [-8.5, -12], [10.5, 21]] as const) {
    addBox(part, x, sand(x, z) + 0.12, z, 6.2, 0.24, 1.6, new THREE.Euler(0.06, random() * Math.PI, 0.05, "YXZ"));
  }
  // A pipe and a steel drum spilled from the holds.
  addCylinder(part, new THREE.Vector3(-7.5, sand(-7.5, 16) + 0.18, 16), new THREE.Vector3(-9, sand(-9, 21) + 0.18, 21), 0.2, 0.2, 7, true);
  addCylinder(part, new THREE.Vector3(-6.5, sand(-6.5, 3) + 0.2, 3), new THREE.Vector3(-8.5, sand(-8.5, -1.5) + 0.2, -1.5), 0.2, 0.2, 7, true);
}

/** Low sand drifts piled against the hull on the side it settled toward. */
function createSandDrifts(layout: WreckLayout) {
  const builder = new MeshBuilder();
  const dome = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const sandColor = (position: THREE.Vector3) => {
    const n = noise3(position.x * 0.4, position.y, position.z * 0.4);
    return new THREE.Color(0.58, 0.52, 0.4).lerp(new THREE.Color(0.45, 0.4, 0.32), n * 0.6);
  };
  for (const piece of layout.pieces) {
    for (let z = piece.z0 + 3; z < piece.z1 - 2; z += 5.5) {
      for (const side of [1, -1]) {
        const s = stationOf(z);
        const hull = new THREE.Vector3(side * halfWidth(s, 0.2) * 1.02, 0.4, z).applyMatrix4(piece.matrix);
        const y = layout.seabedLocal(hull.x, hull.z);
        const size = side > 0 ? 1 : 0.6;
        builder.add(dome, composeMatrix(hull.x + side * 0.6, y - 0.25, hull.z, new THREE.Euler(0, piece.yaw, 0), 2.4 * size, 1.1 * size, 3.6), sandColor);
      }
    }
  }
  dome.dispose();
  return builder.build();
}

/** Sample points on the surface of a non-indexed geometry, area-weighted. */
function sampleSurface(geometry: THREE.BufferGeometry, random: Random, count: number, accept: (point: THREE.Vector3, normal: THREE.Vector3) => boolean) {
  const position = geometry.getAttribute("position");
  const broad = geometry.getAttribute("swayWeight");
  const triangleCount = position.count / 3;
  const areas = new Float64Array(triangleCount);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let total = 0;
  for (let index = 0; index < triangleCount; index += 1) {
    a.fromBufferAttribute(position, index * 3);
    b.fromBufferAttribute(position, index * 3 + 1);
    c.fromBufferAttribute(position, index * 3 + 2);
    if (!broad || broad.getX(index * 3) > 0.5) total += new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
    areas[index] = total;
  }
  const results: { point: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  for (let attempt = 0; attempt < count * 6 && results.length < count; attempt += 1) {
    const target = random() * total;
    let low = 0;
    let high = triangleCount - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (areas[mid] < target) low = mid + 1;
      else high = mid;
    }
    a.fromBufferAttribute(position, low * 3);
    b.fromBufferAttribute(position, low * 3 + 1);
    c.fromBufferAttribute(position, low * 3 + 2);
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const point = a.clone().addScaledVector(new THREE.Vector3().subVectors(b, a), u).addScaledVector(new THREE.Vector3().subVectors(c, a), v);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (accept(point, normal)) results.push({ point, normal });
  }
  return results;
}

const SPONGE_COLORS = [
  new THREE.Color(0.75, 0.33, 0.1),
  new THREE.Color(0.72, 0.58, 0.16),
  new THREE.Color(0.36, 0.12, 0.38),
  new THREE.Color(0.6, 0.14, 0.12),
  new THREE.Color(0.66, 0.62, 0.52),
  new THREE.Color(0.5, 0.3, 0.22),
];

const createWreck: GameSystemFactory = async (environment: GameEnvironment) => {
  const random = createRandom(7123);
  const resources = new Resources();
  const highQuality = environment.quality === "high";
  const layout = createWreckLayout();
  const group = new THREE.Group();
  group.name = "wreck";
  group.position.copy(layout.origin);
  group.rotation.y = layout.heading;
  resources.add(environment.scene, group);

  // Steel.
  const steel = new MeshBuilder();
  for (const piece of layout.pieces) {
    const part = { builder: steel, matrix: piece.matrix };
    if (piece.name === "stern") addSternPiece(part, random, piece);
    else addBowPiece(part, random, piece);
  }
  addDebris({ builder: steel, matrix: new THREE.Matrix4() }, random, layout);
  const steelGeometry = steel.build({ weights: true });
  boxProjectUvs(steelGeometry, 6);
  const plates = createPlateTextures(random);
  const steelMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: plates.map,
    normalMap: plates.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.88,
    metalness: 0.12,
    side: THREE.DoubleSide,
  }));
  const hull = new THREE.Mesh(steelGeometry, steelMaterial);
  hull.name = "wreck-steel";
  hull.castShadow = highQuality;
  hull.receiveShadow = environment.quality !== "low";
  group.add(hull);

  // Sand drifts against the hull hide where it meets the seabed.
  const drifts = new THREE.Mesh(createSandDrifts(layout), prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  drifts.receiveShadow = environment.quality !== "low";
  group.add(drifts);

  // Sponges and their colors.
  const sponges = { blob: createEncrustingSponge(), tubes: createTubeSponges(random) };
  const blobCount = Math.round(420 * (environment.quality === "high" ? 1 : environment.quality === "medium" ? 0.6 : 0.3));
  const tubeCount = Math.round(blobCount * 0.35);
  const surface = sampleSurface(steelGeometry, random, blobCount + tubeCount, (point, normal) => normal.y > -0.25 && point.y > layout.seabedLocal(point.x, point.z) + 0.15);
  steelGeometry.deleteAttribute("swayWeight");
  const blobs: InstanceSpec[] = [];
  const tubes: InstanceSpec[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  surface.forEach(({ point, normal }, index) => {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal).multiply(new THREE.Quaternion().setFromAxisAngle(up, random() * Math.PI * 2));
    const color = pick(random, SPONGE_COLORS).clone().multiplyScalar(range(random, 0.75, 1.1));
    if (index < blobCount) {
      const size = range(random, 0.12, 0.42);
      blobs.push({ matrix: new THREE.Matrix4().compose(point, quaternion, new THREE.Vector3(size * range(random, 0.9, 1.4), size * range(random, 0.9, 1.6), size)), color });
    } else {
      const tubeUp = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().lerp(up, 0.6).normalize());
      tubes.push({ matrix: new THREE.Matrix4().compose(point, tubeUp, new THREE.Vector3(1, 1, 1).multiplyScalar(range(random, 0.7, 1.5))), color });
    }
  });
  const spongeMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  const tubeMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }));
  group.add(createInstancedMesh(sponges.blob, spongeMaterial, blobs));
  group.add(createInstancedMesh(sponges.tubes, tubeMaterial, tubes));

  // Debris from the staged models.
  const [boards, drum, wheel] = await Promise.all([
    loadBakedModel(environment, "wreck_boards.glb", { scale: 0.55 }),
    !highQuality ? Promise.resolve(null) : loadBakedModel(environment, "oil_drum.glb", { targetHeight: 0.9 }),
    loadBakedModel(environment, "ship_wheel.glb", { targetHeight: 1.6 }),
  ]);
  const onSand = (x: number, z: number, lift: number, rotation: THREE.Euler, scale = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, layout.seabedLocal(x, z) + lift, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(scale, scale, scale));
  if (boards) {
    prepareMaterial(environment, boards.material);
    const specs: InstanceSpec[] = [];
    for (let index = 0; index < 14; index += 1) {
      const x = range(random, -9, 17);
      const z = range(random, -30, 32);
      if (x > -7.5 && x < 8.5) continue;
      specs.push({ matrix: onSand(x, z, -0.05, new THREE.Euler((random() - 0.5) * 0.15, random() * Math.PI * 2, (random() - 0.5) * 0.15, "YXZ"), range(random, 0.7, 1.1)) });
    }
    group.add(createInstancedMesh(boards.geometry, boards.material, specs));
  }
  if (drum) {
    prepareMaterial(environment, drum.material);
    const drums: InstanceSpec[] = [
      { matrix: onSand(9.2, 12.5, 0.35, new THREE.Euler(0, 0.4, Math.PI / 2)) },
      { matrix: onSand(-8.2, 8, -0.15, new THREE.Euler(0.2, 1.2, 0.1)) },
    ];
    const drumMesh = createInstancedMesh(drum.geometry, drum.material, drums);
    drumMesh.castShadow = highQuality;
    group.add(drumMesh);
  }
  if (wheel) {
    prepareMaterial(environment, wheel.material);
    // The bridge's wheel lies on the sand below the wheelhouse.
    const wheelMesh = new THREE.Mesh(wheel.geometry, wheel.material);
    wheelMesh.matrixAutoUpdate = false;
    wheelMesh.matrix.copy(onSand(9, 1.5, 0.12, new THREE.Euler(-Math.PI / 2 + 0.12, 0.7, 0, "YXZ")));
    group.add(wheelMesh);
  }
  // Re-register the group so models added after the first add are tracked too.
  resources.add(environment.scene, group);

  // Mooring line from the forecastle bitts to a buoy at the surface.
  const anchor = layout.mooringPoint.clone();
  const buoyPosition = new THREE.Vector3(anchor.x + 4.5, 0, anchor.z + 7);
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24;
    const point = anchor.clone().lerp(new THREE.Vector3(buoyPosition.x, -0.55, buoyPosition.z), t);
    // The line bellies out with the current.
    point.x += Math.sin(t * Math.PI) * 2.2;
    point.z += Math.sin(t * Math.PI) * 1.2;
    points.push(point);
  }
  const lineGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.035, 5, false);
  const ropeColor = new THREE.Color(0.45, 0.42, 0.3);
  const rope = new THREE.Mesh(lineGeometry, prepareMaterial(environment, new THREE.MeshStandardMaterial({ color: ropeColor, roughness: 0.9 })));
  resources.add(environment.scene, rope);
  const buoyBuilder = new MeshBuilder();
  const sphere = new THREE.SphereGeometry(0.55, 18, 12);
  buoyBuilder.add(sphere, undefined, new THREE.Color(0.85, 0.28, 0.08));
  const ring = new THREE.TorusGeometry(0.12, 0.03, 6, 12);
  buoyBuilder.add(ring, composeMatrix(0, 0.62, 0), new THREE.Color(0.3, 0.3, 0.3));
  buoyBuilder.add(ring, composeMatrix(0, -0.62, 0), new THREE.Color(0.3, 0.3, 0.3));
  sphere.dispose();
  ring.dispose();
  const buoy = new THREE.Mesh(buoyBuilder.build(), prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 })));
  buoy.position.copy(buoyPosition);
  resources.add(environment.scene, buoy);

  environment.addDiscoverable({
    id: "wreck",
    name: "The wreck of the Maren Holt",
    subtitle: "Steel cargo steamer, 1924 (fictional)",
    description:
      "A fictional ship: the Maren Holt was a 70 m coastal steamer that foundered in a winter gale in 1957 with a cargo of machinery and pipe; her crew of 22 reached the lifeboats, which is why the davits are empty. Real steel wrecks like her become artificial reefs: within a few years sponges, hydroids, and corals cover the plating, and fish shelter in the open holds. Steel corrodes into brittle concretion, so wrecks this old slowly collapse from the inside.",
    radius: 16,
    position: target => target.copy(layout.origin).add(new THREE.Vector3(0, 5, 0)),
    object: hull,
  });

  return {
    update(context) {
      buoy.position.y = Math.sin(context.time * 1.1) * 0.12 + 0.05;
      buoy.rotation.x = Math.sin(context.time * 0.9) * 0.08;
      buoy.rotation.z = Math.cos(context.time * 0.7) * 0.08;
    },
    dispose() {
      resources.dispose();
    },
  };
};

export default createWreck;
