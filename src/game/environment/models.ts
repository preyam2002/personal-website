/**
 * Loading the staged glTF models and textures (see public/game/CREDITS.md).
 *
 * Models arrive Meshopt-compressed with quantized positions. For instancing we
 * bake each model's node transforms into one float geometry, recentred so the
 * base sits at y = 0 over the origin, and keep the model's own material.
 */
import * as THREE from "three";
import type { GameEnvironment } from "../types";
import { MeshBuilder } from "./geometry";

export const MODEL_PATH = "/game/models/";
export const TEXTURE_PATH = "/game/textures/";

export type BakedModel = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  size: THREE.Vector3;
};

/** Copy any (possibly quantized) attribute into a float attribute. */
function floatAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const array = new Float32Array(attribute.count * attribute.itemSize);
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      array[index * attribute.itemSize + component] = attribute.getComponent(index, component);
    }
  }
  return new THREE.BufferAttribute(array, attribute.itemSize);
}

/**
 * Load a model and bake all its meshes into one geometry. Meshes with other
 * materials are merged too, using the first material (the staged props have one).
 * Returns null when the file is missing or fails to load.
 */
export async function loadBakedModel(environment: GameEnvironment, file: string, options: { targetHeight?: number; scale?: number } = {}): Promise<BakedModel | null> {
  let gltf;
  try {
    gltf = await environment.gltf.loadAsync(MODEL_PATH + file);
  } catch (error) {
    console.warn(`Environment model ${file} did not load; using procedural scenery instead.`, error);
    return null;
  }
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const builder = new MeshBuilder();
  let material: THREE.MeshStandardMaterial | null = null;
  const loaded: THREE.Mesh[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    loaded.push(mesh);
    const source = mesh.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", floatAttribute(source.getAttribute("position")));
    if (source.getAttribute("normal")) geometry.setAttribute("normal", floatAttribute(source.getAttribute("normal")));
    if (source.getAttribute("uv")) geometry.setAttribute("uv", floatAttribute(source.getAttribute("uv")));
    if (source.index) geometry.setIndex(source.index.clone());
    builder.add(geometry, mesh.matrixWorld);
    geometry.dispose();
    const meshMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material && meshMaterial instanceof THREE.MeshStandardMaterial) material = meshMaterial;
  });
  if (!material || builder.vertexCount === 0) {
    for (const mesh of loaded) mesh.geometry.dispose();
    return null;
  }
  const chosen = material as THREE.MeshStandardMaterial;
  // Free what we do not keep: the compressed geometries and any other materials.
  for (const mesh of loaded) {
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const other of materials) if (other !== chosen) other.dispose();
  }
  const geometry = builder.build();
  geometry.deleteAttribute("color");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  const size = box.getSize(new THREE.Vector3());
  const scale = options.scale ?? (options.targetHeight ? options.targetHeight / Math.max(size.y, 1e-6) : 1);
  if (scale !== 1) geometry.scale(scale, scale, scale);
  size.multiplyScalar(scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, material: chosen, size };
}

const textureLoader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;

/** Load a staged texture, or null when it is missing. */
export async function loadTexture(file: string, color: boolean, repeat = 1): Promise<THREE.Texture | null> {
  if (!textureLoader) return null;
  try {
    const texture = await textureLoader.loadAsync(TEXTURE_PATH + file);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = 4;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch (error) {
    console.warn(`Environment texture ${file} did not load.`, error);
    return null;
  }
}
