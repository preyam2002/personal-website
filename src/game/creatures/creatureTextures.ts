/**
 * Skin textures baked in code for the hand-modelled animals: an albedo map, a
 * normal map from a height field, and an occlusion-roughness map (occlusion in
 * red, roughness in green, the glTF ORM layout three.js reads for both aoMap
 * and roughnessMap). The pattern is a function of the texture coordinate, so
 * each animal paints its own markings in its own surface coordinates.
 *
 * Baking runs on the main thread in slices and yields between them, so the
 * loading screen keeps drawing while a 2048 px map fills.
 */

import * as THREE from "three";

/** Integer hash to [0, 1). */
export function hashInt(x: number, y: number, seed: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrap = (value: number, period: number) => (period > 0 ? ((value % period) + period) % period : value);

/**
 * Smooth value noise in [0, 1] on a unit lattice. With periods it tiles:
 * px and py are the lattice periods along x and y (0 for no wrap).
 */
export function valueNoise(x: number, y: number, seed: number, px = 0, py = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, px);
  const x1 = wrap(ix + 1, px);
  const y0 = wrap(iy, py);
  const y1 = wrap(iy + 1, py);
  const a = hashInt(x0, y0, seed);
  const b = hashInt(x1, y0, seed);
  const c = hashInt(x0, y1, seed);
  const d = hashInt(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise in [0, 1]; each octave doubles the frequency (and the period, so it still tiles). */
export function fbm(x: number, y: number, seed: number, octaves: number, px = 0, py = 0) {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 17, px * frequency, py * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

export type Cell = { f1: number; f2: number; id: number; cx: number; cy: number };

/** Worley cells on a unit lattice: distance to the nearest and second-nearest jittered point, the nearest cell's id and centre. */
export function worley(x: number, y: number, seed: number, jitter = 0.8, px = 0, py = 0, out: Cell = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 }) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 81;
  let f2 = 81;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx;
      const cy = iy + dy;
      const wx = wrap(cx, px);
      const wy = wrap(cy, py);
      const sx = cx + 0.5 + (hashInt(wx, wy, seed) - 0.5) * jitter;
      const sy = cy + 0.5 + (hashInt(wx, wy, seed + 1) - 0.5) * jitter;
      const ddx = x - sx;
      const ddy = y - sy;
      const distance = ddx * ddx + ddy * ddy;
      if (distance < f1) {
        f2 = f1;
        f1 = distance;
        out.id = hashInt(wx, wy, seed + 2);
        out.cx = sx;
        out.cy = sy;
      } else if (distance < f2) {
        f2 = distance;
      }
    }
  }
  out.f1 = Math.sqrt(f1);
  out.f2 = Math.sqrt(f2);
  return out;
}

/** What a pattern returns for one texel. Colors are sRGB in [0, 1]. */
export type Texel = { r: number; g: number; b: number; height: number; roughness: number; occlusion: number };

export type SkinTextures = { map: THREE.DataTexture; normalMap: THREE.DataTexture; orm: THREE.DataTexture };

export type BakeOptions = {
  width: number;
  height: number;
  /** Normal map strength: height units per texel of slope. */
  normalStrength: number;
  /** Whether the pattern tiles in u (x) and v (y); otherwise the edges clamp. */
  repeatU?: boolean;
  repeatV?: boolean;
  /** Rows to fill before yielding to the browser. */
  rowsPerSlice?: number;
};

const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function finish(texture: THREE.DataTexture, options: BakeOptions, color: boolean) {
  texture.wrapS = options.repeatU ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = options.repeatV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Fill albedo, normal and ORM maps from a pattern function of (u, v) in [0, 1].
 * Row 0 of a DataTexture is v = 0.
 */
export async function bakeSkin(options: BakeOptions, pattern: (u: number, v: number, out: Texel) => void): Promise<SkinTextures> {
  const { width, height } = options;
  const albedo = new Uint8Array(width * height * 4);
  const orm = new Uint8Array(width * height * 4);
  const heights = new Float32Array(width * height);
  const texel: Texel = { r: 0, g: 0, b: 0, height: 0, roughness: 0.5, occlusion: 1 };
  const slice = options.rowsPerSlice ?? Math.max(8, Math.floor(262144 / width));
  const byte = (value: number) => (value <= 0 ? 0 : value >= 1 ? 255 : (value * 255 + 0.5) | 0);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      texel.r = 1;
      texel.g = 1;
      texel.b = 1;
      texel.height = 0;
      texel.roughness = 0.5;
      texel.occlusion = 1;
      pattern((x + 0.5) / width, v, texel);
      const index = y * width + x;
      const offset = index * 4;
      albedo[offset] = byte(texel.r);
      albedo[offset + 1] = byte(texel.g);
      albedo[offset + 2] = byte(texel.b);
      albedo[offset + 3] = 255;
      orm[offset] = byte(texel.occlusion);
      orm[offset + 1] = byte(texel.roughness);
      orm[offset + 2] = 0;
      orm[offset + 3] = 255;
      heights[index] = texel.height;
    }
    if (y % slice === slice - 1) await yieldToBrowser();
  }
  const normals = new Uint8Array(width * height * 4);
  const strength = options.normalStrength;
  for (let y = 0; y < height; y += 1) {
    const up = options.repeatV ? (y + 1) % height : Math.min(y + 1, height - 1);
    const down = options.repeatV ? (y + height - 1) % height : Math.max(y - 1, 0);
    for (let x = 0; x < width; x += 1) {
      const right = options.repeatU ? (x + 1) % width : Math.min(x + 1, width - 1);
      const left = options.repeatU ? (x + width - 1) % width : Math.max(x - 1, 0);
      let nx = (heights[y * width + left] - heights[y * width + right]) * strength;
      let ny = (heights[down * width + x] - heights[up * width + x]) * strength;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= length;
      ny /= length;
      const offset = (y * width + x) * 4;
      normals[offset] = byte(nx * 0.5 + 0.5);
      normals[offset + 1] = byte(ny * 0.5 + 0.5);
      normals[offset + 2] = byte(1 / length * 0.5 + 0.5);
      normals[offset + 3] = 255;
    }
    if (y % (slice * 2) === slice * 2 - 1) await yieldToBrowser();
  }
  return {
    map: finish(new THREE.DataTexture(albedo, width, height), options, true),
    normalMap: finish(new THREE.DataTexture(normals, width, height), options, false),
    orm: finish(new THREE.DataTexture(orm, width, height), options, false),
  };
}

/** Texture size for a creature skin at each quality level. */
export function skinSize(quality: "high" | "medium" | "low") {
  return quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
}

/** Remap a part's texture coordinates into a rectangle of an atlas. */
export function remapUV(geometry: THREE.BufferGeometry, u0: number, v0: number, u1: number, v1: number) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, u0 + uv.getX(index) * (u1 - u0), v0 + uv.getY(index) * (v1 - v0));
  return geometry;
}

/** Set every vertex color of a part (textured parts carry white and take their color from the map). */
export function fillColor(geometry: THREE.BufferGeometry, color: readonly [number, number, number]) {
  const attribute = geometry.getAttribute("color") as THREE.BufferAttribute;
  for (let index = 0; index < attribute.count; index += 1) attribute.setXYZ(index, color[0], color[1], color[2]);
  return geometry;
}

/** sRGB hex to an [r, g, b] triple in [0, 1] (texture space, not linear). */
export function srgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Write a mix of two sRGB colors into a texel. */
export function setMix(out: Texel, a: readonly number[], b: readonly number[], t: number) {
  const k = Math.max(0, Math.min(1, t));
  out.r = a[0] + (b[0] - a[0]) * k;
  out.g = a[1] + (b[1] - a[1]) * k;
  out.b = a[2] + (b[2] - a[2]) * k;
}

export function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
