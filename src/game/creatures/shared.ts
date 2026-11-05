/** Helpers shared by the creature systems. */

import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GameEnvironment } from "../types";
import { WORLD_HALF } from "../world";
import type { Swimmer, Threat } from "./motion";

/**
 * Predators in the water that fish schools flee from, besides the diver.
 * The shark systems add their sharks here; the schools read the list each frame.
 */
const predators = new Set<Threat>();

export function registerPredator(threat: Threat) {
  predators.add(threat);
  return () => predators.delete(threat);
}

export function predatorList(): readonly Threat[] {
  return [...predators];
}

/** Set an object's position and orientation from a swimmer (head along +z). */
export function poseFromSwimmer(object: THREE.Object3D, swimmer: Swimmer) {
  object.position.set(swimmer.position.x, swimmer.position.y, swimmer.position.z);
  object.rotation.set(-swimmer.pitch, swimmer.yaw, swimmer.roll, "YXZ");
}

export function loadModel(environment: GameEnvironment, url: string) {
  return new Promise<GLTF>((resolve, reject) => environment.gltf.load(url, resolve, undefined, reject));
}

/**
 * The seabed height on a 2 m grid, filled on demand and blended bilinearly.
 * Fish query the floor thousands of times per frame; the full noise is too slow for that.
 */
export function createSeabedCache(seabedHeight: (x: number, z: number) => number, cell = 2) {
  const size = Math.ceil((WORLD_HALF * 2) / cell) + 2;
  const values = new Float32Array(size * size).fill(Number.NaN);
  const sample = (ix: number, iz: number) => {
    const cx = Math.min(Math.max(ix, 0), size - 1);
    const cz = Math.min(Math.max(iz, 0), size - 1);
    const index = cz * size + cx;
    let value = values[index];
    if (Number.isNaN(value)) {
      value = seabedHeight(cx * cell - WORLD_HALF, cz * cell - WORLD_HALF);
      values[index] = value;
    }
    return value;
  };
  return (x: number, z: number) => {
    const gx = (x + WORLD_HALF) / cell;
    const gz = (z + WORLD_HALF) / cell;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const a = sample(ix, iz);
    const b = sample(ix + 1, iz);
    const c = sample(ix, iz + 1);
    const d = sample(ix + 1, iz + 1);
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
}

/** Convert a vector to the plain point type the motion code uses. */
export function toPoint(vector: THREE.Vector3) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

/** The threats from the engine (the diver) as plain points. */
export function environmentThreats(environment: GameEnvironment): Threat[] {
  return environment.threats().map(threat => ({ position: toPoint(threat.position), radius: threat.radius }));
}

/** Free every geometry, material, and texture under an object and remove it from its parent. */
export function disposeObject(object: THREE.Object3D, options: { geometries?: boolean; materials?: boolean } = {}) {
  const { geometries = true, materials = true } = options;
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (geometries && mesh.geometry) mesh.geometry.dispose();
    if (materials && mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    }
    const extra = child as THREE.Mesh & { customDepthMaterial?: THREE.Material };
    if (materials && extra.customDepthMaterial) extra.customDepthMaterial.dispose();
  });
  object.removeFromParent();
}

/** Copy a geometry's attributes into plain float arrays (glTF meshes are often quantized). */
export function toFloatGeometry(source: THREE.BufferGeometry, keep: string[]) {
  const geometry = new THREE.BufferGeometry();
  for (const name of keep) {
    const attribute = source.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!attribute) continue;
    const size = attribute.itemSize;
    const array = new Float32Array(attribute.count * size);
    for (let index = 0; index < attribute.count; index += 1) {
      array[index * size] = attribute.getX(index);
      if (size > 1) array[index * size + 1] = attribute.getY(index);
      if (size > 2) array[index * size + 2] = attribute.getZ(index);
      if (size > 3) array[index * size + 3] = attribute.getW(index);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const index = source.getIndex();
  if (index) geometry.setIndex(Array.from({ length: index.count }, (_, i) => index.getX(i)));
  return geometry;
}
