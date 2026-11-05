/**
 * Geometry helpers: a builder that merges many parts into one mesh with
 * vertex colors (one draw call), smooth normals by welding, and a few shapes.
 */
import * as THREE from "three";
import { fractal3, type Random } from "./random";

export type ColorRule = THREE.Color | ((position: THREE.Vector3, normal: THREE.Vector3) => THREE.Color);
export type WeightRule = number | ((position: THREE.Vector3, local: THREE.Vector3) => number);

/**
 * Accumulates non-indexed triangles with position, normal, uv, color and a
 * per-vertex "sway" weight, then builds one BufferGeometry.
 */
export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private weights: number[] = [];

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.vertexCount / 3;
  }

  /**
   * Add a geometry, transformed by `matrix`. The color rule sees the
   * transformed position and normal. The weight rule also sees the local position.
   */
  add(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4, color: ColorRule = new THREE.Color(1, 1, 1), weight: WeightRule = 0) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!source.getAttribute("normal")) source.computeVertexNormals();
    const position = source.getAttribute("position");
    const normal = source.getAttribute("normal");
    const uv = source.getAttribute("uv");
    const normalMatrix = new THREE.Matrix3();
    if (matrix) normalMatrix.getNormalMatrix(matrix);
    const point = new THREE.Vector3();
    const local = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const flip = matrix ? matrix.determinant() < 0 : false;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    for (let triangle = 0; triangle < position.count; triangle += 3) {
      for (const corner of order) {
        const index = triangle + corner;
        local.fromBufferAttribute(position, index);
        point.copy(local);
        direction.fromBufferAttribute(normal, index);
        if (matrix) {
          point.applyMatrix4(matrix);
          direction.applyMatrix3(normalMatrix).normalize();
        }
        this.positions.push(point.x, point.y, point.z);
        this.normals.push(direction.x, direction.y, direction.z);
        if (uv) this.uvs.push(uv.getX(index), uv.getY(index));
        else this.uvs.push(0, 0);
        const value = typeof color === "function" ? color(point, direction) : color;
        this.colors.push(value.r, value.g, value.b);
        this.weights.push(typeof weight === "function" ? weight(point, local) : weight);
      }
    }
    if (source !== geometry) source.dispose();
    return this;
  }

  /** Build the merged geometry. */
  build(options: { weights?: boolean } = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    if (options.weights) geometry.setAttribute("swayWeight", new THREE.Float32BufferAttribute(this.weights, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/**
 * Average normals over vertices that share a position (within `precision`),
 * so displaced, non-indexed shapes shade smoothly.
 */
export function smoothNormals(geometry: THREE.BufferGeometry, precision = 1e-4) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const sums = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  const scale = 1 / precision;
  for (let index = 0; index < position.count; index += 1) {
    const key = `${Math.round(position.getX(index) * scale)},${Math.round(position.getY(index) * scale)},${Math.round(position.getZ(index) * scale)}`;
    keys.push(key);
    const sum = sums.get(key) ?? new THREE.Vector3();
    sum.x += normal.getX(index);
    sum.y += normal.getY(index);
    sum.z += normal.getZ(index);
    sums.set(key, sum);
  }
  for (let index = 0; index < position.count; index += 1) {
    const sum = sums.get(keys[index]) as THREE.Vector3;
    const length = sum.length() || 1;
    normal.setXYZ(index, sum.x / length, sum.y / length, sum.z / length);
  }
  normal.needsUpdate = true;
  return geometry;
}

/** A rock: an icosahedron pushed in and out by noise, flattened at the base. */
export function createRockGeometry(random: Random, detail: number, roughness = 0.35) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const seed = random() * 100;
  const stretch = new THREE.Vector3(0.8 + random() * 0.6, 0.55 + random() * 0.35, 0.8 + random() * 0.5);
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    const n = fractal3(point.x * 1.3 + seed, point.y * 1.3, point.z * 1.3 - seed, 4);
    const facet = Math.round(fractal3(point.x * 2.2 - seed, point.y * 2.2, point.z * 2.2, 2) * 4) / 4;
    point.multiplyScalar(1 + (n - 0.5) * roughness * 2 + (facet - 0.5) * roughness * 0.4);
    point.multiply(stretch);
    // A flat underside, so the rock sits in the sand.
    if (point.y < -0.2) point.y = -0.2 + (point.y + 0.2) * 0.25;
    position.setXYZ(index, point.x, point.y, point.z);
  }
  smoothNormals(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A box between two points, as a beam, rail, or strut. */
export function beamMatrix(from: THREE.Vector3, to: THREE.Vector3, width: number, height = width, twist = 0) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  if (twist) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist));
  return new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(width, length, height));
}

/** A tube between two points (unit cylinder scaled), for pipes, masts, and stipes. */
export function cylinderMatrix(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  return beamMatrix(from, to, radius, radius);
}

export function composeMatrix(x: number, y: number, z: number, rotation: THREE.Euler | null = null, sx = 1, sy = sx, sz = sx) {
  const quaternion = rotation ? new THREE.Quaternion().setFromEuler(rotation) : new THREE.Quaternion();
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(sx, sy, sz));
}

/** Project UVs per triangle along the dominant axis, so plate textures tile in meters. */
export function boxProjectUvs(geometry: THREE.BufferGeometry, metersPerTile: number) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (let triangle = 0; triangle < position.count; triangle += 3) {
    a.fromBufferAttribute(position, triangle);
    b.fromBufferAttribute(position, triangle + 1);
    c.fromBufferAttribute(position, triangle + 2);
    faceNormal.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const ax = Math.abs(faceNormal.x);
    const ay = Math.abs(faceNormal.y);
    const az = Math.abs(faceNormal.z);
    for (let corner = 0; corner < 3; corner += 1) {
      const p = corner === 0 ? a : corner === 1 ? b : c;
      let u: number;
      let v: number;
      if (ax >= ay && ax >= az) {
        u = p.z;
        v = p.y;
      } else if (ay >= az) {
        u = p.x;
        v = p.z;
      } else {
        u = p.x;
        v = p.y;
      }
      uv.setXY(triangle + corner, u / metersPerTile, v / metersPerTile);
    }
  }
  uv.needsUpdate = true;
}

/** Count triangles in a geometry. */
export function triangles(geometry: THREE.BufferGeometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
}
