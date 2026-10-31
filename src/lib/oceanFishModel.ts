import type { Vector3 } from "./oceanCamera";
import { WATER_IOR } from "./iwave";

export const FISH_MODEL_PATH = "/water/models/barramundi";
// Each vertex holds position (3), normal (3), texture coordinate (2), and tangent (4).
export const FISH_VERTEX_FLOATS = 12;

export type FishMesh = {
  vertices: Float32Array;
  indices: Uint16Array;
};

export type FishModel = {
  mesh: FishMesh;
  color: ImageBitmap;
  normal: ImageBitmap;
  material: ImageBitmap;
};

/**
 * Read the mesh file of the fish model.
 *
 * The file holds the vertex count and index count as unsigned 32-bit
 * integers, the interleaved vertex floats, and 16-bit indices. The mesh has
 * unit length with the head along +z.
 */
export function parseFishMesh(buffer: ArrayBuffer): FishMesh {
  const header = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error("The fish mesh file is too short");
  const vertexCount = header.getUint32(0, true);
  const indexCount = header.getUint32(4, true);
  const vertexBytes = vertexCount * FISH_VERTEX_FLOATS * 4;
  if (buffer.byteLength !== 8 + vertexBytes + indexCount * 2) throw new Error("The fish mesh file has a wrong size");
  return {
    vertices: new Float32Array(buffer.slice(8, 8 + vertexBytes)),
    indices: new Uint16Array(buffer.slice(8 + vertexBytes)),
  };
}

async function loadImage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`The fish texture ${url} did not load`);
  return createImageBitmap(await response.blob());
}

/** Load the fish model. The caller draws no fish if this fails. */
export async function loadFishModel(signal: AbortSignal): Promise<FishModel> {
  const [meshResponse, color, normal, material] = await Promise.all([
    fetch(`${FISH_MODEL_PATH}/mesh.bin`, { signal }),
    loadImage(`${FISH_MODEL_PATH}/color.jpg`, signal),
    loadImage(`${FISH_MODEL_PATH}/normal.jpg`, signal),
    loadImage(`${FISH_MODEL_PATH}/orm.jpg`, signal),
  ]);
  if (!meshResponse.ok) throw new Error("The fish mesh did not load");
  return { mesh: parseFishMesh(await meshResponse.arrayBuffer()), color, normal, material };
}

/**
 * Find where a point under a flat water surface appears to a camera above it.
 *
 * The camera ray bends at the surface point where Snell's law holds. The
 * apparent point lies on the camera ray through that surface point, at the
 * full optical path length, so a depth test still sorts points by path.
 * Bisection is robust because the refraction mismatch rises monotonically
 * along the horizontal line from the camera to the point.
 */
export function apparentUnderwaterPoint(camera: Vector3, point: Vector3, surfaceHeight = 0, ior = WATER_IOR) {
  const height = camera[1] - surfaceHeight;
  const depth = surfaceHeight - point[1];
  const dx = point[0] - camera[0];
  const dz = point[2] - camera[2];
  const reach = Math.hypot(dx, dz);
  let low = 0;
  let high = reach;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    const above = middle / Math.hypot(middle, height);
    const below = (reach - middle) / Math.hypot(reach - middle, depth);
    if (above < ior * below) low = middle;
    else high = middle;
  }
  const along = (low + high) / 2;
  const scale = reach > 1e-9 ? along / reach : 0;
  const surface: Vector3 = [camera[0] + dx * scale, surfaceHeight, camera[2] + dz * scale];
  const toSurface = Math.hypot(surface[0] - camera[0], surface[1] - camera[1], surface[2] - camera[2]);
  const path = toSurface + Math.hypot(point[0] - surface[0], point[1] - surface[1], point[2] - surface[2]);
  const apparent = surface.map((value, axis) => camera[axis] + (value - camera[axis]) * path / toSurface) as Vector3;
  return { apparent, surface, path };
}

/** Shader version of `apparentUnderwaterPoint`, with fewer bisection steps. */
export const fishRefractionShader = `
vec3 apparentUnderwaterPoint(vec3 camera, vec3 point, out float path) {
  float height = camera.y;
  float depth = -point.y;
  vec2 offset = point.xz - camera.xz;
  float reach = length(offset);
  float low = 0.0;
  float high = reach;
  for (int step = 0; step < 16; step += 1) {
    float middle = 0.5 * (low + high);
    float above = middle / length(vec2(middle, height));
    float below = (reach - middle) / length(vec2(reach - middle, depth));
    if (above < ${WATER_IOR.toFixed(6)} * below) low = middle;
    else high = middle;
  }
  float scale = reach > 0.000001 ? 0.5 * (low + high) / reach : 0.0;
  vec3 surface = vec3(camera.x + offset.x * scale, 0.0, camera.z + offset.y * scale);
  float toSurface = length(surface - camera);
  path = toSurface + length(point - surface);
  return camera + (surface - camera) * (path / max(toSurface, 0.000001));
}
`;
