/**
 * The whale shark's skin, laid out as in Ningaloo ID photographs:
 *
 * - dark blue-grey back and flanks, a white belly from just below the
 *   pectoral level with a soft, uneven border;
 * - on the head (ahead of the gills) small, dense, randomly placed pale spots;
 * - from the gills to the tail, pale transverse stripes a quarter to a third
 *   of a meter apart, with columns of larger round spots between them, and
 *   pale lines along the crests of the three lateral ridges, which together
 *   make the "checkerboard";
 * - five long gill slits (the posterior three over the pectoral base, the
 *   fifth a little apart), a terminal mouth with pale lips, a small spiracle
 *   behind the eye, and a few pale scars;
 * - rough, sandpaper denticle grain in the normal map and a matte roughness.
 *
 * Mapping: u = s along the body (0 at the snout), v = angle around it
 * (0 on the back, 0.25 on the right side, 0.5 on the belly).
 */

import { rgb, type RGB } from "./geometry";
import { coarseField, createSkinLayers, fbm, forEachTexel, hash2, seededRandom, smooth, stamp, tint } from "./skinTextures";

const TAU = Math.PI * 2;

export type WhaleSharkShape = {
  length: number;
  /** Mean radius of the body section at s (m). */
  radius: (s: number) => number;
  /** Angles (from the back) of the lateral ridges. */
  ridges: readonly number[];
};

const DORSAL = rgb(0x2f3b45);
const FLANK = rgb(0x3e4a53);
const BROWN = rgb(0x2b3236);
const BELLY = rgb(0xe3e6e1);
const BELLY_SHADE = rgb(0xb9bfbe);
const PALE = rgb(0xdfe5e0);
const SLIT = rgb(0x0b0d0f);

/** Angle (from the back) where the white belly starts, at s. */
function bellyAngle(s: number) {
  return 1.95 - 0.12 * smooth(0.0, 0.1, 0.1 - s) - 0.2 * smooth(0.75, 1, s);
}

/** Gill slit positions along the body. */
export const GILL_SLITS = [0.132, 0.149, 0.166, 0.183, 0.205];

export function paintWhaleSharkSkin(width: number, height: number, shape: WhaleSharkShape, seed: number) {
  const random = seededRandom(seed);
  const layers = createSkinLayers(width, height, DORSAL, 0.62);
  const { length } = shape;
  const perMeterX = width / length;
  const perMeterY = (s: number) => height / (TAU * Math.max(shape.radius(s), 0.08));
  const all: [number, number, number, number] = [0, 0, width, height];

  const field = (step: number, evaluate: (meters: number, v: number) => number) =>
    coarseField(width, height, Math.max(step * (width / 2048), 1), (x, y) => evaluate((x / width) * length, y / height));
  const largeField = field(8, (m, v) => fbm(m * 0.6, v * 12, 4, seed, 12));
  const fineField = field(2, (m, v) => fbm(m * 4, v * 96, 2, seed + 9, 96));
  const brokenFields = shape.ridges.map(ridge => field(4, (m, v) => fbm(m * 3, v * 40 + ridge * 7, 2, seed + 21, 40)));
  forEachTexel(layers, all, (index, x, y) => {
    const s = (x + 0.5) / width;
    const v = (y + 0.5) / height;
    const angle = v * TAU;
    const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    const large = largeField(x, y);
    const fine = fineField(x, y);
    const grain = hash2(x, y, seed + 3);
    // Back to flank, with a brownish mottle.
    const flank = smooth(0.2, 1.6, a);
    let color: RGB = [DORSAL[0] + (FLANK[0] - DORSAL[0]) * flank, DORSAL[1] + (FLANK[1] - DORSAL[1]) * flank, DORSAL[2] + (FLANK[2] - DORSAL[2]) * flank];
    const mottle = smooth(0.5, 0.75, large) * 0.5;
    color = [color[0] + (BROWN[0] - color[0]) * mottle, color[1] + (BROWN[1] - color[1]) * mottle, color[2] + (BROWN[2] - color[2]) * mottle];
    layers.albedo.set(color, index * 3);
    // The white belly.
    const border = bellyAngle(s) + (large - 0.5) * 0.3;
    const belly = smooth(border - 0.06, border + 0.14, a);
    tint(layers, index, BELLY, belly);
    tint(layers, index, BELLY_SHADE, belly * smooth(0.6, 0.8, large) * 0.35);
    // Pale lines along the crests of the lateral ridges.
    const along = smooth(0.17, 0.24, s) * (1 - smooth(0.82, 0.92, s));
    if (along > 0) {
      for (let k = 0; k < shape.ridges.length; k += 1) {
        const ridge = shape.ridges[k];
        const crest = Math.exp(-(((a - ridge) / 0.016) ** 2));
        if (crest < 0.001) continue;
        const broken = smooth(0.35, 0.5, brokenFields[k](x, y));
        tint(layers, index, PALE, crest * along * broken * 0.7);
        layers.relief[index] += Math.exp(-(((a - ridge) / 0.04) ** 2)) * along * 0.01 * perMeterX;
      }
    }
    // Sandpaper: dermal denticles too small to resolve, as grain and a matte finish.
    layers.relief[index] += ((grain - 0.5) * 0.0016 + (fine - 0.5) * 0.003) * perMeterX;
    layers.roughness[index] = 0.6 + 0.12 * fine + 0.08 * grain - 0.08 * belly;
  });

  const wrap = { wrapY: true };
  const toY = (signedAngle: number) => ((signedAngle / TAU) % 1 + 1) % 1 * height;
  const spot = (s: number, signedAngle: number, radius: number, strength: number) => {
    const a = Math.abs(signedAngle);
    // Spots fade out into the white belly.
    const fade = 1 - smooth(bellyAngle(s) - 0.25, bellyAngle(s) + 0.02, a);
    if (fade <= 0) return;
    const squash = 0.85 + random() * 0.3;
    stamp(layers, s * width, toY(signedAngle), radius * perMeterX * squash, (radius * perMeterY(s)) / squash, (index, _dx, _dy, d) => {
      tint(layers, index, PALE, strength * fade * (1 - smooth(0.7, 1, d)));
    }, wrap);
  };

  // Transverse stripes from behind the gills to the tail, over the back from one side to the other.
  const stripes: number[] = [];
  const widest = Math.max(...Array.from({ length: 20 }, (_, k) => shape.radius(k / 20)));
  // The first stripe runs just behind the fifth gill slit, above the pectoral fin.
  for (let s = 0.215; s < 0.94; ) {
    stripes.push(s);
    const spacing = 0.12 + 0.2 * (shape.radius(s) / widest);
    s += (spacing / length) * (0.85 + random() * 0.3);
  }
  for (const s0 of stripes) {
    const end = bellyAngle(s0) - 0.12;
    const phase = random() * TAU;
    const lean = (random() - 0.5) * 0.006;
    const stripeWidth = 0.028 + random() * 0.014;
    const strength = 0.7 + random() * 0.25;
    let gap = -1;
    for (let signedAngle = -end; signedAngle <= end; signedAngle += 0.01) {
      if (gap < 0 && random() < 0.004) gap = signedAngle + 0.06 + random() * 0.12;
      if (gap > 0) {
        if (signedAngle < gap) continue;
        gap = -1;
      }
      const s = s0 + 0.003 * Math.sin(signedAngle * 3 + phase) + lean * signedAngle;
      const fade = 1 - smooth(end - 0.2, end, Math.abs(signedAngle));
      stamp(layers, s * width, toY(signedAngle), stripeWidth * 0.5 * perMeterX, stripeWidth * 0.5 * perMeterY(s), (index, _dx, _dy, d) => {
        tint(layers, index, PALE, strength * (0.4 + 0.6 * fade) * (1 - smooth(0.6, 1, d)));
      }, wrap);
    }
  }
  // Columns of round spots between the stripes.
  for (let k = 0; k < stripes.length - 1; k += 1) {
    const sA = stripes[k];
    const sB = stripes[k + 1];
    const mid = (sA + sB) / 2;
    const r = shape.radius(mid);
    const gapMeters = (sB - sA) * length;
    const columns = gapMeters > 0.32 && random() < 0.35 ? 2 : 1;
    const end = bellyAngle(mid) - 0.05;
    for (let column = 0; column < columns; column += 1) {
      const s = columns === 1 ? mid : sA + (sB - sA) * (column === 0 ? 0.33 : 0.67);
      const step = (0.13 + random() * 0.05) / r;
      for (let signedAngle = -end + random() * step; signedAngle < end; signedAngle += step * (0.7 + random() * 0.6)) {
        const radius = Math.min(0.02 + 0.09 * gapMeters / columns, 0.055) * (0.75 + random() * 0.5);
        spot(s + (random() - 0.5) * (sB - sA) * 0.3, signedAngle, radius, 0.75 + random() * 0.2);
      }
    }
  }
  // The head ahead of the stripes: small, dense spots on a jittered grid.
  const cell = 0.075;
  for (let meters = 0.08; meters < stripes[0] * length; meters += cell) {
    const s = meters / length;
    const r = shape.radius(s);
    const end = bellyAngle(s) - 0.05;
    const rows = Math.max(Math.floor((2 * end * r) / cell), 1);
    for (let row = 0; row < rows; row += 1) {
      const signedAngle = -end + ((row + 0.2 + random() * 0.6) / rows) * 2 * end;
      const jitter = (random() - 0.5) * cell * 0.6;
      const radius = (0.011 + 0.012 * smooth(0.0, 0.12, s)) * (0.75 + random() * 0.5);
      spot((meters + jitter) / length, signedAngle, radius, 0.75 + random() * 0.2);
    }
  }
  // Gill slits: long, slightly bowed, dark inside, with a raised trailing flap.
  forEachTexel(layers, [Math.floor(0.11 * width), 0, Math.ceil(0.23 * width), height], (index, x, y) => {
    const s = (x + 0.5) / width;
    const angle = ((y + 0.5) / height) * TAU;
    const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    for (let k = 0; k < GILL_SLITS.length; k += 1) {
      const top = 1.08 + k * 0.03;
      const bottom = 2.12 - k * 0.02;
      if (a < top - 0.05 || a > bottom + 0.05) continue;
      const t = (a - top) / (bottom - top);
      const ends = smooth(-0.05, 0.08, t) * smooth(1.05, 0.92, t);
      const centre = GILL_SLITS[k] - 0.004 * Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI);
      const d = ((s - centre) * length) / 0.018;
      const slit = (1 - smooth(0.5, 1, Math.abs(d))) * ends;
      const flap = Math.exp(-(((d - 1.5) / 0.9) ** 2)) * ends;
      tint(layers, index, SLIT, slit * 0.95);
      layers.relief[index] += (flap * 0.012 - slit * 0.02) * perMeterX;
      layers.occlusion[index] *= 1 - slit * 0.7;
      layers.roughness[index] -= slit * 0.2;
    }
  });
  // The terminal mouth with pale lips, and the spiracle behind each eye.
  forEachTexel(layers, [0, 0, Math.ceil(0.1 * width), height], (index, x, y) => {
    const s = (x + 0.5) / width;
    const angle = ((y + 0.5) / height) * TAU;
    const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (s < 0.034) {
      const fadeBack = 1 - smooth(0.024, 0.034, s);
      const mouth = (1 - smooth(0.03, 0.06, Math.abs(a - 1.95))) * fadeBack;
      const lips = (1 - smooth(0.06, 0.13, Math.abs(a - 1.95))) * fadeBack - mouth;
      tint(layers, index, rgb(0x9da4a5), lips * 0.6);
      tint(layers, index, SLIT, mouth);
      layers.relief[index] += (lips * 0.012 - mouth * 0.03) * perMeterX;
      layers.occlusion[index] *= 1 - mouth * 0.7;
    }
    const spiracle = ((s - 0.086) / 0.0018) ** 2 + ((a - 1.42) / 0.022) ** 2;
    if (spiracle < 1) {
      tint(layers, index, SLIT, 1 - spiracle);
      layers.relief[index] -= (1 - spiracle) * 0.01 * perMeterX;
    }
  });
  // A few pale scars: propeller nicks and scratches on the back.
  for (let k = 0; k < 5; k += 1) {
    const s = 0.25 + random() * 0.5;
    const signedAngle = (random() - 0.5) * 1.6;
    const direction = random() * Math.PI;
    const len = 0.2 + random() * 0.5;
    const steps = 30;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps - 0.5;
      const ss = s + (Math.cos(direction) * len * t) / length;
      const aa = signedAngle + (Math.sin(direction) * len * t) / shape.radius(s);
      stamp(layers, ss * width, toY(aa), 0.012 * perMeterX, 0.012 * perMeterY(s), (index, _dx, _dy, d) => {
        tint(layers, index, PALE, 0.5 * (1 - d));
        layers.relief[index] -= 0.004 * perMeterX * (1 - d);
      }, wrap);
    }
  }
  return layers;
}
