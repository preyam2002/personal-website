/**
 * Small textures generated in code: steel plating, brain coral grooves,
 * sea fan lattices, and a glint star. No image files are needed.
 */
import * as THREE from "three";
import { fractal3, noise3, type Random } from "./random";

function heightsToNormalMap(heights: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heights[y * size + ((x + size - 1) % size)];
      const right = heights[y * size + ((x + 1) % size)];
      const down = heights[((y + size - 1) % size) * size + x];
      const up = heights[((y + 1) % size) * size + x];
      let nx = (left - right) * strength;
      let ny = (down - up) * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const offset = (y * size + x) * 4;
      data[offset] = (nx * 0.5 + 0.5) * 255;
      data[offset + 1] = (ny * 0.5 + 0.5) * 255;
      data[offset + 2] = (nz * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }
  return finishTexture(new THREE.DataTexture(data, size, size), false);
}

function finishTexture(texture: THREE.DataTexture, color: boolean) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Riveted steel plates, corroded: one tile is 2 x 4 plates. Returns a normal
 * map (seams, rivets, blisters) and a grayscale albedo map (mottling, streaks).
 */
export function createPlateTextures(random: Random) {
  const size = 256;
  const heights = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4);
  const seed = random() * 50;
  const plateWidth = size / 2;
  const plateHeight = size / 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / plateHeight);
      // Plates in alternate rows are offset by half a plate, like real strakes.
      const shifted = (x + (row % 2) * plateWidth * 0.5) % size;
      const localX = shifted % plateWidth;
      const localY = y % plateHeight;
      const seamDistance = Math.min(localX, plateWidth - localX, localY, plateHeight - localY);
      let height = seamDistance < 1.5 ? -0.55 : seamDistance < 3 ? -0.2 : 0;
      // Rivets in a line just inside each seam.
      const rivetLine = Math.min(Math.abs(localY - 5), Math.abs(plateHeight - localY - 5));
      const rivetAlong = (shifted % 8) - 4;
      if (rivetLine < 2 && Math.abs(rivetAlong) < 2) height += 0.9 * (1 - Math.hypot(rivetLine, rivetAlong) / 2.5);
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Tileable noise: sample on a torus.
      const corrosion = fractal3(Math.cos(u) * 3 + seed, Math.sin(u) * 3, Math.cos(v) * 3 + Math.sin(v) * 2, 4);
      const blister = noise3(Math.cos(u) * 9, Math.sin(u) * 9 + seed, Math.cos(v) * 9 + Math.sin(v) * 7);
      height += (corrosion - 0.5) * 0.9 + Math.max(blister - 0.7, 0) * 2.5;
      heights[y * size + x] = height;
      // Rust streaks run down from the seams.
      const streak = Math.max(0, 1 - localY / plateHeight) * noise3(shifted * 0.35, seed, row) * 0.25;
      let shade = 0.78 + (corrosion - 0.5) * 0.7 - streak - (seamDistance < 2 ? 0.07 : 0) + (random() - 0.5) * 0.06;
      shade = Math.min(Math.max(shade, 0.25), 1);
      const offset = (y * size + x) * 4;
      albedo[offset] = shade * 255;
      albedo[offset + 1] = shade * 250;
      albedo[offset + 2] = shade * 245;
      albedo[offset + 3] = 255;
    }
  }
  return {
    normalMap: heightsToNormalMap(heights, size, 2.2),
    map: finishTexture(new THREE.DataTexture(albedo, size, size), true),
  };
}

/** The winding valleys of a brain coral, tileable in u (around the dome). */
export function createBrainCoralNormalMap(random: Random) {
  const size = 256;
  const heights = new Float32Array(size * size);
  const seed = random() * 40;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2;
      const v = y / size;
      const warp = fractal3(Math.cos(u) * 2.5 + seed, Math.sin(u) * 2.5, v * 5, 3);
      const field = fractal3(Math.cos(u) * 4 + warp * 2, Math.sin(u) * 4 - seed, v * 8 + warp, 2);
      const ridge = Math.abs(Math.sin(field * 40));
      heights[y * size + x] = Math.pow(ridge, 0.6);
    }
  }
  return heightsToNormalMap(heights, size, 3.5);
}

/** A sea fan: a flat net of branches in white, with alpha for alpha testing. */
export function createSeaFanTexture(random: Random) {
  const size = 256;
  const alpha = new Float32Array(size * size);
  const stamp = (cx: number, cy: number, radius: number) => {
    const r = Math.ceil(radius + 1);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, cy + r); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, cx + r); x += 1) {
        const value = 1 - Math.max(Math.hypot(x - cx, y - cy) - radius, 0);
        if (value > 0) alpha[y * size + x] = Math.max(alpha[y * size + x], value);
      }
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, width: number) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / Math.max(steps, 1);
      stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width);
    }
  };
  const tips: [number, number][] = [];
  // The fan fills a half-ellipse above a short stalk; y = 0 is the top of the image.
  const inside = (x: number, y: number) => {
    const dx = (x - size / 2) / (size * 0.48);
    const dy = (size - 14 - y) / (size * 0.92);
    return dx * dx + dy * dy < 1 && y < size - 10;
  };
  const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
    let cx = x;
    let cy = y;
    const segments = 6;
    let heading = angle;
    for (let segment = 0; segment < segments; segment += 1) {
      heading += (random() - 0.5) * 0.25;
      const nx = cx + Math.sin(heading) * (length / segments);
      const ny = cy - Math.cos(heading) * (length / segments);
      if (!inside(nx, ny)) break;
      line(cx, cy, nx, ny, width);
      cx = nx;
      cy = ny;
    }
    tips.push([cx, cy]);
    if (depth <= 0) return;
    const spread = 0.35 + random() * 0.25;
    branch(cx, cy, heading - spread, length * 0.78, Math.max(width * 0.75, 0.7), depth - 1);
    branch(cx, cy, heading + spread, length * 0.78, Math.max(width * 0.75, 0.7), depth - 1);
  };
  line(size / 2, size - 1, size / 2, size - 22, 3.5);
  branch(size / 2, size - 22, -0.5, 70, 2.4, 5);
  branch(size / 2, size - 22, 0.5, 70, 2.4, 5);
  branch(size / 2, size - 22, 0, 80, 2.6, 5);
  // Cross links between nearby branch points make the net.
  const nodes = tips.concat(Array.from({ length: 260 }, () => [random() * size, random() * size] as [number, number]).filter(([x, y]) => inside(x, y) && alpha[Math.floor(y) * size + Math.floor(x)] > 0));
  for (let index = 0; index < 700; index += 1) {
    const a = nodes[Math.floor(random() * nodes.length)];
    let best: [number, number] | null = null;
    let bestDistance = 1e9;
    for (let probe = 0; probe < 12; probe += 1) {
      const b = nodes[Math.floor(random() * nodes.length)];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (distance > 3 && distance < bestDistance) {
        bestDistance = distance;
        best = b;
      }
    }
    if (best && bestDistance < 22) line(a[0], a[1], best[0], best[1], 0.8);
  }
  // A fine mesh between branches, as in Gorgonia nets.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!inside(x, y)) continue;
      const grid = Math.min(Math.abs(((x + y * 0.4) % 7) - 3.5), Math.abs(((y - x * 0.3) % 9) - 4.5));
      if (grid < 0.6 && random() < 0.85) alpha[y * size + x] = Math.max(alpha[y * size + x], 0.75);
    }
  }
  // The image was drawn top-down; a DataTexture's first row is v = 0 (the bottom).
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const target = ((size - 1 - y) * size + x) * 4;
      data[target] = 255;
      data[target + 1] = 255;
      data[target + 2] = 255;
      data[target + 3] = Math.min(alpha[y * size + x], 1) * 255;
    }
  }
  const texture = finishTexture(new THREE.DataTexture(data, size, size), true);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  return texture;
}

/** A soft four-point star for glints. */
export function createGlintTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const core = Math.exp(-radius * radius * 30);
      const rays = Math.exp(-Math.abs(dx) * 40) * Math.max(1 - Math.abs(dy), 0) + Math.exp(-Math.abs(dy) * 40) * Math.max(1 - Math.abs(dx), 0);
      const value = Math.min(core + rays * 0.6, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 245;
      data[offset + 2] = 210;
      data[offset + 3] = value * 255;
    }
  }
  const texture = finishTexture(new THREE.DataTexture(data, size, size), true);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
