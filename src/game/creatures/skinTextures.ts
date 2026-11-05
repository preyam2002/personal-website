/**
 * Procedural skin textures for the large animals, painted into plain typed
 * arrays (no canvas, so they also build in Jest) and uploaded as DataTextures.
 *
 * A skin is four layers at one resolution: linear albedo, height (for the
 * normal map), roughness, and ambient occlusion. Painting happens in texel
 * space; callers convert meters on the animal to texels themselves, because
 * each animal maps its body differently.
 */

import * as THREE from "three";
import type { RGB } from "./geometry";

export type SkinLayers = {
  width: number;
  height: number;
  /** Linear RGB, three floats per texel. */
  albedo: Float32Array;
  /** Relief in texels (a height of 1 rises as much as one texel is wide). */
  relief: Float32Array;
  roughness: Float32Array;
  occlusion: Float32Array;
};

export function createSkinLayers(width: number, height: number, base: RGB, roughness: number): SkinLayers {
  const count = width * height;
  const albedo = new Float32Array(count * 3);
  for (let index = 0; index < count * 3; index += 3) {
    albedo[index] = base[0];
    albedo[index + 1] = base[1];
    albedo[index + 2] = base[2];
  }
  return { width, height, albedo, relief: new Float32Array(count), roughness: new Float32Array(count).fill(roughness), occlusion: new Float32Array(count).fill(1) };
}

/** A small seeded random generator (mulberry32), so a pattern repeats for a seed. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash in [0, 1). */
export function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth 2D value noise in [0, 1]. With a period above zero the noise repeats
 * every `period` cells along y, for textures that wrap around a body.
 */
export function valueNoise(x: number, y: number, seed: number, period = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const y0 = period > 0 ? ((iy % period) + period) % period : iy;
  const y1 = period > 0 ? (y0 + 1) % period : iy + 1;
  const a = hash2(ix, y0, seed);
  const b = hash2(ix + 1, y0, seed);
  const c = hash2(ix, y1, seed);
  const d = hash2(ix + 1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise in [0, 1]; the period doubles with each octave so wrapping holds. */
export function fbm(x: number, y: number, octaves: number, seed: number, period = 0) {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 17, period > 0 ? period * frequency : 0);
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / weight;
}

/**
 * A smooth field sampled on a coarse grid (every `step` texels) and blended
 * bilinearly: noise that changes over many texels costs a fraction to paint.
 * `evaluate` gets texel coordinates, which may run one step past the edge.
 */
export function coarseField(width: number, height: number, step: number, evaluate: (x: number, y: number) => number) {
  const columns = Math.ceil(width / step) + 2;
  const rows = Math.ceil(height / step) + 2;
  const values = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) values[row * columns + column] = evaluate(column * step, row * step);
  }
  return (x: number, y: number) => {
    const gx = Math.min(Math.max(x / step, 0), columns - 1.001);
    const gy = Math.min(Math.max(y / step, 0), rows - 1.001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const index = iy * columns + ix;
    const a = values[index];
    const b = values[index + 1];
    const c = values[index + columns];
    const d = values[index + columns + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function smooth(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Blend a colour into the albedo at a texel. */
export function tint(layers: SkinLayers, index: number, color: RGB, amount: number) {
  if (amount <= 0) return;
  const t = Math.min(amount, 1);
  const offset = index * 3;
  layers.albedo[offset] += (color[0] - layers.albedo[offset]) * t;
  layers.albedo[offset + 1] += (color[1] - layers.albedo[offset + 1]) * t;
  layers.albedo[offset + 2] += (color[2] - layers.albedo[offset + 2]) * t;
}

/** Multiply the albedo at a texel. */
export function shade(layers: SkinLayers, index: number, factor: number) {
  const offset = index * 3;
  layers.albedo[offset] *= factor;
  layers.albedo[offset + 1] *= factor;
  layers.albedo[offset + 2] *= factor;
}

/**
 * Visit the texels inside an ellipse centred at (cx, cy) with radii (rx, ry),
 * in texels. `visit` gets the texel index and the offset in radii (so the
 * rim is at distance 1). With wrapY, the ellipse wraps across the top and
 * bottom rows; `bounds` keeps it inside a rectangle of an atlas.
 */
export function stamp(
  layers: SkinLayers,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  visit: (index: number, dx: number, dy: number, distance: number) => void,
  options: { wrapY?: boolean; bounds?: [number, number, number, number] } = {},
) {
  const { width, height } = layers;
  const [left, top, right, bottom] = options.bounds ?? [0, 0, width, height];
  const radiusX = Math.max(rx, 0.5);
  const radiusY = Math.max(ry, 0.5);
  const x0 = Math.max(Math.floor(cx - radiusX), left);
  const x1 = Math.min(Math.ceil(cx + radiusX), right - 1);
  const y0 = Math.floor(cy - radiusY);
  const y1 = Math.ceil(cy + radiusY);
  for (let y = y0; y <= y1; y += 1) {
    let row = y;
    if (options.wrapY) row = ((y % height) + height) % height;
    else if (y < top || y >= bottom) continue;
    const dy = (y + 0.5 - cy) / radiusY;
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x + 0.5 - cx) / radiusX;
      const distance2 = dx * dx + dy * dy;
      if (distance2 < 1) visit(row * width + x, dx, dy, Math.sqrt(distance2));
    }
  }
}

/** Visit every texel of a rectangle with its texel coordinates. */
export function forEachTexel(layers: SkinLayers, bounds: [number, number, number, number], visit: (index: number, x: number, y: number) => void) {
  const [left, top, right, bottom] = bounds;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) visit(y * layers.width + x, x, y);
  }
}

const SRGB_TABLE = (() => {
  const table = new Uint8Array(4096);
  for (let index = 0; index < 4096; index += 1) {
    const linear = index / 4095;
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    table[index] = Math.round(Math.min(Math.max(srgb, 0), 1) * 255);
  }
  return table;
})();

function toSRGB(linear: number) {
  return SRGB_TABLE[Math.min(Math.max(Math.round(linear * 4095), 0), 4095)];
}

/**
 * Tangent-space normals from the relief (OpenGL convention: +x along u, +y along v).
 * `wrapY` makes the rows wrap (for a body painted all the way around).
 */
export function reliefToNormals(layers: SkinLayers, strength: number, wrapY: boolean) {
  const { width, height, relief } = layers;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const up = wrapY ? (y + 1) % height : Math.min(y + 1, height - 1);
    const down = wrapY ? (y - 1 + height) % height : Math.max(y - 1, 0);
    for (let x = 0; x < width; x += 1) {
      const right = Math.min(x + 1, width - 1);
      const left = Math.max(x - 1, 0);
      const dx = (relief[y * width + right] - relief[y * width + left]) * 0.5 * strength;
      const dy = (relief[up * width + x] - relief[down * width + x]) * 0.5 * strength;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * width + x) * 4;
      data[offset] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  return data;
}

export type SkinTextures = { map: THREE.DataTexture; normalMap: THREE.DataTexture; ormMap: THREE.DataTexture; dispose: () => void };

function dataTexture(data: Uint8Array, width: number, height: number, color: boolean, wrapY: boolean) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = wrapY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Upload the layers: an sRGB albedo map, a normal map, and an occlusion /
 * roughness / metalness map (R = occlusion, G = roughness, B = 0), the
 * channel layout three.js reads for aoMap and roughnessMap.
 */
export function createSkinTextures(layers: SkinLayers, options: { normalStrength: number; wrapY: boolean }): SkinTextures {
  const { width, height } = layers;
  const count = width * height;
  const color = new Uint8Array(count * 4);
  const orm = new Uint8Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    color[index * 4] = toSRGB(layers.albedo[index * 3]);
    color[index * 4 + 1] = toSRGB(layers.albedo[index * 3 + 1]);
    color[index * 4 + 2] = toSRGB(layers.albedo[index * 3 + 2]);
    color[index * 4 + 3] = 255;
    orm[index * 4] = Math.round(Math.min(Math.max(layers.occlusion[index], 0), 1) * 255);
    orm[index * 4 + 1] = Math.round(Math.min(Math.max(layers.roughness[index], 0.02), 1) * 255);
    orm[index * 4 + 2] = 0;
    orm[index * 4 + 3] = 255;
  }
  const map = dataTexture(color, width, height, true, options.wrapY);
  const normalMap = dataTexture(reliefToNormals(layers, options.normalStrength, options.wrapY), width, height, false, options.wrapY);
  const ormMap = dataTexture(orm, width, height, false, options.wrapY);
  return {
    map,
    normalMap,
    ormMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      ormMap.dispose();
    },
  };
}

/** Texture size per quality: 2048 x 1024 at high, halving below. */
export function skinSize(quality: "low" | "medium" | "high") {
  const width = quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
  return { width, height: width / 2 };
}

/** Remap a geometry's texture coordinates into a rectangle of an atlas. */
export function remapUV(geometry: THREE.BufferGeometry, map: (u: number, v: number) => [number, number]) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index += 1) {
    const [u, v] = map(uv.getX(index), uv.getY(index));
    uv.setXY(index, u, v);
  }
  return geometry;
}

/** Set every vertex colour of a geometry (white lets the texture alone colour it). */
export function setColor(geometry: THREE.BufferGeometry, color: RGB) {
  const attribute = geometry.getAttribute("color") as THREE.BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) attribute.setXYZ(index, color[0], color[1], color[2]);
  return geometry;
}
