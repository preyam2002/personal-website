/**
 * Geometry for reef life: corals, sponges, sea fans, and anemones. Each
 * function returns one merged geometry with vertex colors (white to gray
 * shading; instance colors tint them) and, where it sways, a swayWeight.
 */
import * as THREE from "three";
import { MeshBuilder, composeMatrix, cylinderMatrix, smoothNormals } from "./geometry";
import { noise3, range, type Random } from "./random";

export type BranchStyle = "staghorn" | "bush" | "finger";

const WHITE = new THREE.Color(1, 1, 1);

/** Branching coral grown as a small tree of tapered tubes; tips are paler. */
export function createBranchingCoral(random: Random, style: BranchStyle) {
  const builder = new MeshBuilder();
  const tube = new THREE.CylinderGeometry(0.72, 1, 1, 4, 1, true);
  const tip = new THREE.OctahedronGeometry(1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const settings = {
    staghorn: { trunks: 3, depth: 3, splits: 2, length: 0.32, radius: 0.045, spread: 0.55, rise: 0.35, shrink: 0.85 },
    bush: { trunks: 3, depth: 2, splits: 3, length: 0.16, radius: 0.04, spread: 0.6, rise: 0.5, shrink: 0.82 },
    finger: { trunks: 11, depth: 1, splits: 1, length: 0.22, radius: 0.05, spread: 0.12, rise: 0.9, shrink: 0.9 },
  }[style];
  const shade = (height: number) => new THREE.Color(1, 1, 1).multiplyScalar(0.62 + Math.min(height / 0.9, 1) * 0.4);
  const grow = (start: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number) => {
    const end = start.clone().addScaledVector(direction, length);
    builder.add(tube, cylinderMatrix(start, end, radius), position => shade(position.y));
    if (depth <= 0) {
      builder.add(tip, composeMatrix(end.x, end.y, end.z, null, radius * 0.75), new THREE.Color(1, 1, 1));
      return;
    }
    for (let index = 0; index < settings.splits; index += 1) {
      const axis = new THREE.Vector3(random() - 0.5, 0, random() - 0.5).normalize();
      const next = direction.clone().applyAxisAngle(axis, settings.spread * (0.6 + random() * 0.8));
      next.lerp(up, settings.rise * 0.5).normalize();
      grow(end, next, length * settings.shrink * range(random, 0.85, 1.15), radius * 0.74, depth - 1);
    }
  };
  for (let trunk = 0; trunk < settings.trunks; trunk += 1) {
    const angle = (trunk / settings.trunks) * Math.PI * 2 + random() * 0.8;
    const offset = style === "finger" ? range(random, 0.02, 0.22) : range(random, 0, 0.06);
    const start = new THREE.Vector3(Math.cos(angle) * offset, 0, Math.sin(angle) * offset);
    const lean = style === "finger" ? 0.15 : 0.75;
    const direction = new THREE.Vector3(Math.cos(angle) * lean, 1, Math.sin(angle) * lean).normalize();
    const length = settings.length * range(random, 0.8, 1.3) * (style === "finger" ? 1.4 : 1);
    if (style === "finger") {
      const middle = start.clone().addScaledVector(direction, length);
      builder.add(tube, cylinderMatrix(start, middle, settings.radius), position => shade(position.y));
      grow(middle, direction.clone().lerp(up, 0.5).normalize(), length * 0.8, settings.radius * 0.8, 0);
    } else {
      grow(start, direction, length, settings.radius, settings.depth);
    }
  }
  tube.dispose();
  tip.dispose();
  return builder.build();
}

/** A brain coral dome; the grooves come from a normal map on its UVs. */
export function createBrainCoral() {
  const geometry = new THREE.SphereGeometry(1, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const lump = 1 + (noise3(x * 1.7, y * 1.7, z * 1.7) - 0.5) * 0.18;
    position.setXYZ(index, x * lump, (y * 0.72 + 0.04) * lump, z * lump);
  }
  geometry.computeVertexNormals();
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, uv.getX(index) * 3, uv.getY(index) * 1.5);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const value = 0.7 + Math.max(position.getY(index), 0) * 0.35;
    colors.set([value, value, value], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A table coral: a short stalk and a flat, wavy-edged plate. */
export function createTableCoral(random: Random) {
  const builder = new MeshBuilder();
  const stalk = new THREE.CylinderGeometry(0.1, 0.16, 1, 7, 1, true);
  builder.add(stalk, composeMatrix(0, 0.22, 0, null, 1, 0.44, 1), new THREE.Color(0.7, 0.7, 0.7));
  stalk.dispose();
  const rings = 3;
  const segments = 26;
  const seed = random() * 10;
  const top: number[] = [];
  const point = (ring: number, segment: number, lower: boolean) => {
    const angle = (segment / segments) * Math.PI * 2;
    const edge = 1 + (noise3(Math.cos(angle) * 2 + seed, Math.sin(angle) * 2, 0) - 0.5) * 0.45;
    const radius = (ring / rings) * edge;
    const y = 0.44 + radius * radius * 0.12 + (lower ? -0.05 - (1 - ring / rings) * 0.03 : 0);
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  };
  for (const lower of [false, true]) {
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = point(ring, segment, lower);
        const b = point(ring + 1, segment, lower);
        const c = point(ring + 1, segment + 1, lower);
        const d = point(ring, segment + 1, lower);
        const quad = lower ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
        for (const vertex of quad) top.push(...vertex);
      }
    }
  }
  // The rim joins the top and bottom surfaces.
  for (let segment = 0; segment < segments; segment += 1) {
    const a = point(rings, segment, false);
    const b = point(rings, segment + 1, false);
    const c = point(rings, segment + 1, true);
    const d = point(rings, segment, true);
    for (const vertex of [a, b, c, a, c, d]) top.push(...vertex);
  }
  const plate = new THREE.BufferGeometry();
  plate.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
  smoothNormals(plate);
  builder.add(plate, undefined, (_position, normal) => (normal.y > 0 ? WHITE : new THREE.Color(0.55, 0.55, 0.55)));
  plate.dispose();
  return builder.build();
}

/** A sea fan: an alpha-tested card, bending from its base. */
export function createSeaFan() {
  const builder = new MeshBuilder();
  const plane = new THREE.PlaneGeometry(1, 1, 3, 4);
  plane.translate(0, 0.5, 0);
  // Fans curve slightly, like a shallow dish facing the current.
  const position = plane.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    position.setZ(index, x * x * 0.25);
  }
  plane.computeVertexNormals();
  builder.add(plane, undefined, WHITE, (_point, local) => local.y);
  plane.dispose();
  return builder.build({ weights: true });
}

/** A barrel sponge: a ridged vase, open at the top. */
export function createBarrelSponge(random: Random) {
  const profile = [
    [0.22, 0],
    [0.4, 0.15],
    [0.52, 0.45],
    [0.56, 0.78],
    [0.52, 1.0],
    [0.44, 1.0],
    [0.42, 0.78],
    [0.3, 0.35],
    [0.12, 0.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 14);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const ridges = 7 + Math.floor(random() * 4);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const ridge = 1 + Math.cos(angle * ridges) * 0.06;
    position.setX(index, x * ridge);
    position.setZ(index, z * ridge);
  }
  geometry.computeVertexNormals();
  const builder = new MeshBuilder();
  builder.add(geometry, undefined, (point, normal) => new THREE.Color(1, 1, 1).multiplyScalar(normal.y > 0.5 && point.y > 0.6 ? 0.55 : 0.8 + point.y * 0.2));
  geometry.dispose();
  return builder.build();
}

/** A cluster of open tube sponges; the tips can sway a little. */
export function createTubeSponges(random: Random, tubes = 4) {
  const builder = new MeshBuilder();
  const tube = new THREE.CylinderGeometry(1, 0.8, 1, 7, 2, true);
  for (let index = 0; index < tubes; index += 1) {
    const height = range(random, 0.35, 0.85);
    const angle = (index / tubes) * Math.PI * 2 + random();
    const distance = index > 0 ? 0.12 : 0;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    builder.add(tube, composeMatrix(x, height / 2, z, new THREE.Euler(z * 1.5, 0, -x * 1.5), 0.07, height, 0.07), position => new THREE.Color(1, 1, 1).multiplyScalar(0.7 + position.y * 0.4), (_point, local) => local.y + 0.5);
  }
  tube.dispose();
  return builder.build({ weights: true });
}

/** An encrusting sponge: a lumpy, flattened blob. */
export function createEncrustingSponge() {
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const position = blob.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const bump = 0.75 + noise3(x * 2.1 + 3, y * 2.1, z * 2.1) * 0.5;
    position.setXYZ(index, x * bump, (Math.max(y, -0.3) + 0.15) * 0.6 * bump, z * bump);
  }
  return smoothNormals(blob);
}

/** A sea anemone: a short column and a ring of curling tentacles that sway. */
export function createAnemone(random: Random) {
  const builder = new MeshBuilder();
  const column = new THREE.CylinderGeometry(0.13, 0.15, 0.12, 9, 1, false);
  builder.add(column, composeMatrix(0, 0.06, 0), new THREE.Color(0.55, 0.5, 0.45));
  column.dispose();
  const cone = new THREE.CylinderGeometry(0.6, 1, 1, 3, 1, true);
  const tentacles = 24;
  for (let index = 0; index < tentacles; index += 1) {
    const angle = (index / tentacles) * Math.PI * 2 + random() * 0.2;
    const ring = index % 2 === 0 ? 0.12 : 0.07;
    const length = range(random, 0.12, 0.2);
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const start = new THREE.Vector3(Math.cos(angle) * ring, 0.12, Math.sin(angle) * ring);
    const middle = start.clone().addScaledVector(outward, length * 0.45).add(new THREE.Vector3(0, length * 0.55, 0));
    const end = middle.clone().addScaledVector(outward, length * 0.55).add(new THREE.Vector3(0, length * 0.2, 0));
    const radius = 0.016;
    builder.add(cone, cylinderMatrix(start, middle, radius), position => new THREE.Color(0.8, 0.8, 0.8).lerp(WHITE, position.y), (point) => Math.min(point.distanceTo(start) / length, 1));
    builder.add(cone, cylinderMatrix(middle, end, radius * 0.6), WHITE, (point) => Math.min(point.distanceTo(start) / length, 1));
  }
  cone.dispose();
  return builder.build({ weights: true });
}
