/**
 * Procedural animal geometry: bodies lofted through cross-sections along a
 * spine, and fins lofted through airfoil sections along their span.
 *
 * Every geometry built here carries the same attributes, so parts merge into
 * one mesh: position, normal, uv, color (linear RGB, for countershading and
 * patterns), and aFlap (signed span in meters, span fraction, chord fraction),
 * which the swim shader uses to flap fins and wings.
 */

import * as THREE from "three";
import { TAU } from "./motion";

export type RGB = [number, number, number];

/** A linear RGB triple from an sRGB hex colour. */
export function rgb(hex: number): RGB {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRGB(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** Repeatable hash noise in [0, 1). */
export function hash3(x: number, y: number, z: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), ux), lerp(corner(0, 1, 0), corner(1, 1, 0), ux), uy),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), ux), lerp(corner(0, 1, 1), corner(1, 1, 1), ux), uy),
    uz,
  );
}

type Vertex = { x: number; y: number; z: number; color: RGB; u: number; v: number; flap?: [number, number, number] };

/**
 * Build a closed tube through rings of points. Each ring has the same number
 * of points, wound the same way. The ends are closed with a fan to the ring's
 * centre. The seam is duplicated for texture coordinates, and the normals on
 * both sides of it are averaged so it does not show.
 */
export function loftRings(rings: Vertex[][], options: { capStart?: boolean; capEnd?: boolean } = {}) {
  const { capStart = true, capEnd = true } = options;
  const ringCount = rings.length;
  const perRing = rings[0].length;
  const columns = perRing + 1;
  const vertices: Vertex[] = [];
  for (const ring of rings) {
    if (ring.length !== perRing) throw new Error("All rings need the same number of points");
    for (let index = 0; index <= perRing; index += 1) {
      const vertex = ring[index % perRing];
      vertices.push(index === perRing ? { ...vertex, v: 1 } : vertex);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < ringCount - 1; r += 1) {
    for (let c = 0; c < perRing; c += 1) {
      const a = r * columns + c;
      const b = r * columns + c + 1;
      const d = (r + 1) * columns + c;
      const e = (r + 1) * columns + c + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const cap = (ringIndex: number, flip: boolean) => {
    const ring = rings[ringIndex];
    const center: Vertex = { x: 0, y: 0, z: 0, color: [0, 0, 0], u: ring[0].u, v: 0.5, flap: ring[0].flap ? [0, 0, 0] : undefined };
    for (const vertex of ring) {
      center.x += vertex.x / perRing;
      center.y += vertex.y / perRing;
      center.z += vertex.z / perRing;
      center.color = [center.color[0] + vertex.color[0] / perRing, center.color[1] + vertex.color[1] / perRing, center.color[2] + vertex.color[2] / perRing];
      if (vertex.flap && center.flap) {
        center.flap = [center.flap[0] + vertex.flap[0] / perRing, center.flap[1] + vertex.flap[1] / perRing, center.flap[2] + vertex.flap[2] / perRing];
      }
    }
    const centerIndex = vertices.length;
    vertices.push(center);
    for (let c = 0; c < perRing; c += 1) {
      const a = ringIndex * columns + c;
      const b = ringIndex * columns + c + 1;
      if (flip) indices.push(centerIndex, a, b);
      else indices.push(centerIndex, b, a);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(ringCount - 1, true);

  const count = vertices.length;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const flap = new Float32Array(count * 3);
  vertices.forEach((vertex, index) => {
    position.set([vertex.x, vertex.y, vertex.z], index * 3);
    color.set(vertex.color, index * 3);
    uv.set([vertex.u, vertex.v], index * 2);
    if (vertex.flap) flap.set(vertex.flap, index * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("aFlap", new THREE.BufferAttribute(flap, 3));
  // Wind the triangles so that normals point out of the closed surface.
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const p0 = vertices[indices[index]];
    const p1 = vertices[indices[index + 1]];
    const p2 = vertices[indices[index + 2]];
    volume += p0.x * (p1.y * p2.z - p1.z * p2.y) - p0.y * (p1.x * p2.z - p1.z * p2.x) + p0.z * (p1.x * p2.y - p1.y * p2.x);
  }
  if (volume < 0) {
    for (let index = 0; index < indices.length; index += 3) {
      const swap = indices[index + 1];
      indices[index + 1] = indices[index + 2];
      indices[index + 2] = swap;
    }
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Average the normals across the duplicated seam.
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  for (let r = 0; r < ringCount; r += 1) {
    const a = r * columns;
    const b = r * columns + perRing;
    const nx = normal.getX(a) + normal.getX(b);
    const ny = normal.getY(a) + normal.getY(b);
    const nz = normal.getZ(a) + normal.getZ(b);
    const length = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(a, nx / length, ny / length, nz / length);
    normal.setXYZ(b, nx / length, ny / length, nz / length);
  }
  return geometry;
}

export type BodySection = {
  /** Half width (m). */
  width: number;
  /** Height above the spine (m). */
  top: number;
  /** Depth below the spine (m). */
  bottom: number;
  /** Height of the spine (m). */
  center?: number;
  /** Superellipse exponent: 2 is an ellipse, larger is boxier. */
  squareness?: number;
};

export type BodySpec = {
  length: number;
  /** z of the snout; the tail is at headZ - length. */
  headZ: number;
  rings: number;
  segments: number;
  section: (s: number) => BodySection;
  /**
   * Optional surface detail: a radial scale factor at (s, angle), where angle
   * is 0 on the back, PI/2 on the right side, and PI on the belly.
   * `segment` is the index around the ring, for detail at the mesh resolution.
   */
  detail?: (s: number, angle: number, segment: number) => number;
  color: (s: number, angle: number, point: { x: number; y: number; z: number }) => RGB;
};

/** Loft a body along the z axis, snout at headZ, through cross-sections. */
export function loftBody(spec: BodySpec) {
  const rings: Vertex[][] = [];
  for (let r = 0; r < spec.rings; r += 1) {
    // Rings bunch up at the snout and the tail, where the shape changes fastest.
    const t = r / (spec.rings - 1);
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI) * 0.92 - (0.5 - t) * 0.08;
    const section = spec.section(s);
    const exponent = 2 / (section.squareness ?? 2);
    const z = spec.headZ - s * spec.length;
    const ring: Vertex[] = [];
    for (let c = 0; c < spec.segments; c += 1) {
      const angle = (c / spec.segments) * TAU;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const scale = spec.detail ? spec.detail(s, angle, c) : 1;
      const x = Math.sign(sin) * Math.pow(Math.abs(sin), exponent) * section.width * scale;
      const height = cos >= 0 ? section.top : section.bottom;
      const y = (section.center ?? 0) + Math.sign(cos) * Math.pow(Math.abs(cos), exponent) * height * scale;
      const point = { x, y, z };
      ring.push({ x, y, z, color: spec.color(s, angle, point), u: s, v: c / spec.segments });
    }
    rings.push(ring);
  }
  return loftRings(rings);
}

/** NACA four-digit symmetric thickness, as a fraction of chord, at chord fraction x. */
export function nacaThickness(x: number, ratio: number) {
  const t = Math.max(x, 0);
  return 5 * ratio * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);
}

export type FinStation = {
  /** Leading-edge point (m). */
  lead: [number, number, number];
  /** Chord length (m). */
  chord: number;
  /** Thickness as a fraction of chord. */
  thickness: number;
};

export type FinSpec = {
  stations: FinStation[];
  /** Unit direction from leading to trailing edge. */
  chordDirection: [number, number, number];
  /** Unit direction of the fin's thickness (its surface normal). */
  normalDirection: [number, number, number];
  /** Points around each airfoil section. */
  segments: number;
  color: (span: number, chord: number, upper: boolean) => RGB;
  /** Fill aFlap for wings and flippers: the root x, and how much of the span flaps. */
  flap?: { rootX: number; span: number };
  /** Texture coordinates for the fin: maps (span, chord) to uv. */
  uv?: (span: number, chord: number, upper: boolean) => [number, number];
  /** Optional per-station chord direction override (for curved fins). */
  chordAt?: (span: number) => [number, number, number];
};

/** Loft a fin through airfoil sections from root to tip. */
export function loftFin(spec: FinSpec) {
  const rings: Vertex[][] = [];
  const count = spec.stations.length;
  for (let index = 0; index < count; index += 1) {
    const station = spec.stations[index];
    const span = index / (count - 1);
    const chordDirection = spec.chordAt ? spec.chordAt(span) : spec.chordDirection;
    const n = spec.normalDirection;
    const ring: Vertex[] = [];
    for (let c = 0; c < spec.segments; c += 1) {
      const angle = (c / spec.segments) * TAU;
      // Cosine spacing packs points at the rounded leading edge.
      const x = 0.5 * (1 - Math.cos(angle));
      const upper = angle < Math.PI;
      const half = nacaThickness(x, station.thickness) * station.chord * (upper ? 1 : -1);
      const px = station.lead[0] + chordDirection[0] * x * station.chord + n[0] * half;
      const py = station.lead[1] + chordDirection[1] * x * station.chord + n[1] * half;
      const pz = station.lead[2] + chordDirection[2] * x * station.chord + n[2] * half;
      let flap: [number, number, number] | undefined;
      if (spec.flap) {
        const signed = px - spec.flap.rootX;
        const fraction = Math.min(Math.abs(signed) / spec.flap.span, 1);
        flap = [signed, fraction, x];
      }
      const [u, v] = spec.uv ? spec.uv(span, x, upper) : [0.5, 0.5];
      ring.push({ x: px, y: py, z: pz, color: spec.color(span, x, upper), u, v, flap });
    }
    rings.push(ring);
  }
  return loftRings(rings);
}

/** A tube along a polyline with a radius per point, for tails, arms, and tentacles. */
export function loftTube(points: [number, number, number][], radius: (t: number) => number, segments: number, color: (t: number, angle: number) => RGB, flatten = 1) {
  const rings: Vertex[][] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const t = index / (points.length - 1);
    const a = points[Math.max(index - 1, 0)];
    const b = points[Math.min(index + 1, points.length - 1)];
    tangent.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    side.crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    normal.crossVectors(side, tangent).normalize();
    const r = radius(t);
    const ring: Vertex[] = [];
    for (let c = 0; c < segments; c += 1) {
      const angle = (c / segments) * TAU;
      const cos = Math.cos(angle) * r * flatten;
      const sin = Math.sin(angle) * r;
      const p = points[index];
      ring.push({
        x: p[0] + side.x * sin + normal.x * cos,
        y: p[1] + side.y * sin + normal.y * cos,
        z: p[2] + side.z * sin + normal.z * cos,
        color: color(t, angle),
        u: t,
        v: c / segments,
      });
    }
    rings.push(ring);
  }
  return loftRings(rings);
}

/**
 * Merge indexed parts that share the same attributes into one geometry, and
 * free the parts. (A small version of BufferGeometryUtils.mergeGeometries that
 * also runs in Jest, which does not transform the three.js examples.)
 */
export function mergeParts(parts: THREE.BufferGeometry[]) {
  const names = Object.keys(parts[0].attributes);
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    for (const name of names) if (!part.getAttribute(name)) throw new Error(`A creature part lacks the ${name} attribute`);
    vertexCount += part.getAttribute("position").count;
    indexCount += part.getIndex()?.count ?? part.getAttribute("position").count;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const size = parts[0].getAttribute(name).itemSize;
    const array = new Float32Array(vertexCount * size);
    let offset = 0;
    for (const part of parts) {
      const attribute = part.getAttribute(name);
      for (let index = 0; index < attribute.count; index += 1) {
        for (let k = 0; k < size; k += 1) array[(offset + index) * size + k] = attribute.getComponent(index, k);
      }
      offset += attribute.count;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vertexOffset = 0;
  let cursor = 0;
  for (const part of parts) {
    const index = part.getIndex();
    const count = part.getAttribute("position").count;
    if (index) for (let i = 0; i < index.count; i += 1) indices[cursor++] = index.getX(i) + vertexOffset;
    else for (let i = 0; i < count; i += 1) indices[cursor++] = i + vertexOffset;
    vertexOffset += count;
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Mirror a geometry across the x = 0 plane, flipping the winding and the flap sign. */
export function mirrorX(geometry: THREE.BufferGeometry) {
  const copy = geometry.clone();
  const position = copy.getAttribute("position") as THREE.BufferAttribute;
  const normal = copy.getAttribute("normal") as THREE.BufferAttribute;
  const flap = copy.getAttribute("aFlap") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    position.setX(index, -position.getX(index));
    normal.setX(index, -normal.getX(index));
    flap.setX(index, -flap.getX(index));
  }
  const indices = copy.getIndex();
  if (indices) {
    for (let index = 0; index < indices.count; index += 3) {
      const b = indices.getX(index + 1);
      indices.setX(index + 1, indices.getX(index + 2));
      indices.setX(index + 2, b);
    }
  }
  return copy;
}

/** Rotate and move a part in place (for placing fins built in their own frame). */
export function placePart(geometry: THREE.BufferGeometry, rotation: THREE.Euler, offset: THREE.Vector3) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation).setPosition(offset);
  geometry.applyMatrix4(matrix);
  return geometry;
}

/** A small eye: a dark, glossy lens shape at a point on the body. */
export function eye(center: [number, number, number], radius: number, side: 1 | -1, segments = 10) {
  const points: [number, number, number][] = [];
  for (let index = 0; index <= 4; index += 1) {
    const t = index / 4;
    points.push([center[0] + side * (t - 0.5) * radius * 0.9, center[1], center[2]]);
  }
  return loftTube(
    points,
    t => radius * Math.sqrt(Math.max(1 - (2 * t - 1) * (2 * t - 1), 0.02)),
    segments,
    (t, angle) => (Math.abs(t - 0.5) < 0.3 || Math.cos(angle) < 0 ? rgb(0x0b0b0c) : rgb(0x2a2420)),
  );
}

/**
 * A smooth curve through (s, value) keys, for body outlines. Uses a monotone
 * cubic (Fritsch-Carlson), so it does not overshoot between keys.
 */
export function curve(keys: readonly (readonly [number, number])[]) {
  const n = keys.length;
  const xs = keys.map(key => key[0]);
  const ys = keys.map(key => key[1]);
  const slopes: number[] = [];
  for (let index = 0; index < n - 1; index += 1) slopes.push((ys[index + 1] - ys[index]) / (xs[index + 1] - xs[index]));
  const tangents: number[] = [slopes[0]];
  for (let index = 1; index < n - 1; index += 1) {
    const a = slopes[index - 1];
    const b = slopes[index];
    tangents.push(a * b <= 0 ? 0 : Math.sign(a) * Math.min((Math.abs(a) + Math.abs(b)) / 2, 3 * Math.min(Math.abs(a), Math.abs(b))));
  }
  tangents.push(slopes[n - 2]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let index = 0;
    while (index < n - 2 && x > xs[index + 1]) index += 1;
    const h = xs[index + 1] - xs[index];
    const t = (x - xs[index]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[index] + (t3 - 2 * t2 + t) * h * tangents[index] + (-2 * t3 + 3 * t2) * ys[index + 1] + (t3 - t2) * h * tangents[index + 1];
  };
}

/** Bumps at jittered cell centres in a 2D domain: 1 at a bump's centre, 0 outside it. */
export function cellBumps(u: number, v: number, radius: number, seed = 0) {
  const cu = Math.floor(u);
  const cv = Math.floor(v);
  let best = 0;
  for (let du = -1; du <= 1; du += 1) {
    for (let dv = -1; dv <= 1; dv += 1) {
      const iu = cu + du;
      const iv = cv + dv;
      const px = iu + 0.2 + 0.6 * hash3(iu, iv, seed);
      const py = iv + 0.2 + 0.6 * hash3(iv, iu, seed + 7);
      const distance = Math.hypot(u - px, v - py);
      if (distance < radius) best = Math.max(best, 1 - (distance / radius) * (distance / radius));
    }
  }
  return best;
}

/** Distance to the nearest jittered cell centre and to the second nearest (for scute and scale seams). */
export function cellular(u: number, v: number, seed = 0) {
  const cu = Math.floor(u);
  const cv = Math.floor(v);
  let first = 9;
  let second = 9;
  let id = 0;
  for (let du = -1; du <= 1; du += 1) {
    for (let dv = -1; dv <= 1; dv += 1) {
      const iu = cu + du;
      const iv = cv + dv;
      const px = iu + 0.15 + 0.7 * hash3(iu, iv, seed);
      const py = iv + 0.15 + 0.7 * hash3(iv, iu, seed + 3);
      const distance = Math.hypot(u - px, v - py);
      if (distance < first) {
        second = first;
        first = distance;
        id = hash3(iu, iv, seed + 11);
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return { first, second, id };
}

/**
 * Stations for a fin from its root along a span vector (its length is the fin
 * length). Sweep moves the leading edge along the chord direction, in meters.
 */
export function finStations(
  root: [number, number, number],
  span: [number, number, number],
  chordDirection: [number, number, number],
  count: number,
  chord: (t: number) => number,
  thickness: (t: number) => number,
  sweep: (t: number) => number = () => 0,
  bend: (t: number) => [number, number, number] = () => [0, 0, 0],
): FinStation[] {
  const stations: FinStation[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const offset = sweep(t);
    const extra = bend(t);
    stations.push({
      lead: [
        root[0] + span[0] * t + chordDirection[0] * offset + extra[0],
        root[1] + span[1] * t + chordDirection[1] * offset + extra[1],
        root[2] + span[2] * t + chordDirection[2] * offset + extra[2],
      ],
      chord: Math.max(chord(t), 0.002),
      thickness: thickness(t),
    });
  }
  return stations;
}

/** Normalize a direction. */
export function unit(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** Cross product. */
export function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Set every texture coordinate of a geometry to one point. */
export function setUV(geometry: THREE.BufferGeometry, u: number, v: number) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, u, v);
  return geometry;
}
