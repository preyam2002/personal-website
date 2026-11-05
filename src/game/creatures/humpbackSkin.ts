/**
 * The humpback's skin, painted from underwater footage and ID photographs:
 *
 * - back and flanks blue-black with grey mottling, pale sloughing patches,
 *   orca rake marks (parallel pale lines) and round cookie-cutter scars;
 * - a white, black-marbled belly with ~22 throat pleats a side from the chin
 *   to the navel, dark in the furrows;
 * - fist-sized tubercles on the rostrum and along the lower lip, each with a
 *   dark hair pit; paired blowhole slits behind a splash guard;
 * - clusters of Coronula barnacles (pale crowns with a dark centre, with
 *   orange whale lice around them) on the chin, the lip line, the throat,
 *   the knobs of the flipper's leading edge and the fluke tips;
 * - North Atlantic style flippers, white above beyond a dark root, white below;
 * - a fluke underside pattern of black trailing margin, blotches and white
 *   scratches that differs with the seed, like a real ID photograph.
 *
 * The atlas: the body fills u in [0, 0.75] (u = s, v = angle around the body,
 * 0 on the back, 0.25 on the right side). The flipper (upper, lower) and the
 * flukes (upper, lower) are four bands of the right quarter.
 */

import { cellBumps, rgb, type RGB } from "./geometry";
import {
  coarseField,
  createSkinLayers,
  fbm,
  forEachTexel,
  hash2,
  seededRandom,
  shade,
  smooth,
  stamp,
  tint,
  type SkinLayers,
} from "./skinTextures";

const TAU = Math.PI * 2;

/** Fraction of the atlas width taken by the body. */
export const BODY_U = 0.75;

export type FinBand = "pectoralUpper" | "pectoralLower" | "flukeUpper" | "flukeLower";
const BANDS: Record<FinBand, number> = { pectoralUpper: 0, pectoralLower: 1, flukeUpper: 2, flukeLower: 3 };

/** Texture coordinates of a body point (s along, v around). */
export function humpbackBodyUV(s: number, v: number): [number, number] {
  return [s * BODY_U, v];
}

/** Texture coordinates on a fin band; `across` and `chord` in [0, 1], with a small margin. */
export function humpbackFinUV(band: FinBand, across: number, chord: number): [number, number] {
  const u = BODY_U + (1 - BODY_U) * (0.03 + 0.94 * across);
  const v = (BANDS[band] + 0.04 + 0.92 * chord) / 4;
  return [u, v];
}

/** A plain white texel (for parts with their own vertex colours, such as the eyes). */
export const HUMPBACK_WHITE_UV: [number, number] = [0.999, 0.999];

export type HumpbackShape = {
  length: number;
  /** Mean radius of the body section at s (m), for keeping features round. */
  radius: (s: number) => number;
  /** Chord of the flipper at span fraction t (m), and its length (m). */
  pectoralChord: (t: number) => number;
  pectoralLength: number;
  /** Chord of a fluke at span fraction t (m), and the span of one fluke (m). */
  flukeChord: (t: number) => number;
  flukeSpan: number;
};

const DARK = rgb(0x1f2327);
const SLATE = rgb(0x3b4146);
const DARKER = rgb(0x15181b);
const BELLY = rgb(0xdedfd8);
const BELLY_GREY = rgb(0xaeb1ad);
const SCAR = rgb(0x9a9f9f);
const SHELL = rgb(0xc4bfb0);
const SHELL_PIT = rgb(0x2d2b27);
const LICE = rgb(0xc98a62);
const FIN_WHITE = rgb(0xe4e5df);

type Painter = {
  layers: SkinLayers;
  /** Body: texel x of s, texels per meter along, texels per meter around at s. */
  bodyWidth: number;
  random: () => number;
};

function bodyX(p: Painter, s: number) {
  return s * p.bodyWidth;
}

function bodyY(p: Painter, angle: number) {
  return ((angle / TAU) % 1 + 1) % 1 * p.layers.height;
}

/** A Coronula barnacle: a raised pale crown of six plates around a dark pit. */
function barnacle(layers: SkinLayers, cx: number, cy: number, rx: number, ry: number, heightTexels: number, options: Parameters<typeof stamp>[6]) {
  stamp(layers, cx, cy, rx, ry, (index, dx, dy, d) => {
    const plates = 0.85 + 0.15 * Math.cos(Math.atan2(dy, dx) * 6);
    const pit = 1 - smooth(0.22, 0.38, d);
    const crown = 1 - smooth(0.75, 1, d);
    tint(layers, index, SHELL, crown * 0.95);
    shade(layers, index, plates);
    tint(layers, index, SHELL_PIT, pit);
    layers.relief[index] += heightTexels * (crown * (0.6 + 0.4 * (1 - d)) - pit * 1.4);
    layers.roughness[index] = Math.max(layers.roughness[index], 0.55 + 0.35 * crown);
    layers.occlusion[index] *= 1 - 0.45 * pit - 0.25 * smooth(0.7, 1, d) * crown;
  }, options);
}

/** A cluster of barnacles around a centre, sizes in texels per meter. */
function barnacleCluster(
  p: Painter,
  cx: number,
  cy: number,
  radiusMeters: number,
  count: number,
  perMeterX: number,
  perMeterY: number,
  options: Parameters<typeof stamp>[6],
) {
  const { layers, random } = p;
  // A darker, roughened patch of skin under the cluster.
  stamp(layers, cx, cy, radiusMeters * perMeterX * 1.15, radiusMeters * perMeterY * 1.15, (index, _dx, _dy, d) => {
    const amount = (1 - smooth(0.5, 1, d)) * 0.35;
    shade(layers, index, 1 - amount * 0.5);
    layers.roughness[index] = Math.max(layers.roughness[index], 0.5 * (1 - d));
  }, options);
  for (let index = 0; index < count; index += 1) {
    const angle = random() * TAU;
    const distance = Math.sqrt(random()) * radiusMeters;
    const size = 0.018 + random() * 0.026;
    const x = cx + Math.cos(angle) * distance * perMeterX;
    const y = cy + Math.sin(angle) * distance * perMeterY;
    barnacle(layers, x, y, size * perMeterX, size * perMeterY, size * 0.6 * perMeterX, options);
  }
  // Whale lice gather in the crevices around barnacles.
  for (let index = 0; index < count * 0.6; index += 1) {
    const angle = random() * TAU;
    const distance = (0.6 + random() * 0.5) * radiusMeters;
    const size = 0.012 + random() * 0.008;
    stamp(layers, cx + Math.cos(angle) * distance * perMeterX, cy + Math.sin(angle) * distance * perMeterY, size * perMeterX, size * perMeterY, (i, _dx, _dy, d) => {
      tint(layers, i, LICE, 0.75 * (1 - d * d));
      layers.relief[i] += 0.01 * perMeterX * (1 - d * d);
    }, options);
  }
}

/** A thin line of texels from a to b (texel coordinates), with a tapered width. */
function line(
  layers: SkinLayers,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  visit: (index: number, along: number, distance: number) => void,
  options: Parameters<typeof stamp>[6],
) {
  const length = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(Math.ceil(length / Math.max(width * 0.5, 0.5)), 1);
  const seen = new Set<number>();
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const taper = Math.sin(Math.PI * Math.min(Math.max(t, 0.02), 0.98));
    const radius = Math.max(width * 0.5 * (0.4 + 0.6 * taper), 0.5);
    stamp(layers, ax + (bx - ax) * t, ay + (by - ay) * t, radius, radius, (index, _dx, _dy, d) => {
      if (seen.has(index)) return;
      seen.add(index);
      visit(index, t, d);
    }, options);
  }
}

/** Orca rake marks: two to four parallel pale lines. */
function rakeMarks(layers: SkinLayers, random: () => number, cx: number, cy: number, perMeterX: number, perMeterY: number, color: RGB, strength: number, options: Parameters<typeof stamp>[6]) {
  const direction = random() * Math.PI;
  const length = 0.35 + random() * 0.8;
  const lines = 2 + Math.floor(random() * 3);
  const spacing = 0.05 + random() * 0.04;
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  for (let k = 0; k < lines; k += 1) {
    const offset = (k - (lines - 1) / 2) * spacing;
    const ox = cx - dy * offset * perMeterX;
    const oy = cy + dx * offset * perMeterY;
    const half = (length * (0.7 + random() * 0.3)) / 2;
    const width = (0.012 + random() * 0.01) * perMeterX;
    line(layers, ox - dx * half * perMeterX, oy - dy * half * perMeterY, ox + dx * half * perMeterX, oy + dy * half * perMeterY, width, (index, _along, d) => {
      tint(layers, index, color, strength * (1 - d * d));
      layers.relief[index] -= 0.004 * perMeterX * (1 - d * d);
    }, options);
  }
}

function paintBody(p: Painter, shape: HumpbackShape, seed: number) {
  const { layers } = p;
  const { length } = shape;
  const height = layers.height;
  const perMeterX = p.bodyWidth / length;
  const perMeterY = (s: number) => height / (TAU * Math.max(shape.radius(s), 0.08));
  const bounds: [number, number, number, number] = [0, 0, Math.floor(p.bodyWidth), height];
  // Noise fields on coarse grids, in meters along and turns around the body.
  const field = (step: number, evaluate: (meters: number, v: number) => number) =>
    coarseField(bounds[2], height, Math.max(step * (layers.width / 2048), 1), (x, y) => evaluate((x / p.bodyWidth) * length, y / height));
  const largeField = field(8, (m, v) => fbm(m * 0.45, v * 12, 4, seed, 12));
  const fineField = field(3, (m, v) => fbm(m * 2.4, v * 64, 3, seed + 31, 64));
  const fleckField = field(2, (m, v) => fbm(m * 9, v * 256, 2, seed + 3, 256));
  const marbleField = field(8, (m, v) => fbm(m * 0.9 + 40, v * 20, 3, seed + 11, 20));
  const wobbleField = field(8, (m, v) => fbm(m * 0.5, v * 10, 2, seed + 17, 10));
  forEachTexel(layers, bounds, (index, x, y) => {
    const s = (x + 0.5) / p.bodyWidth;
    const v = (y + 0.5) / height;
    const angle = v * TAU;
    const cos = Math.cos(angle);
    const meters = s * length;
    const large = largeField(x, y);
    const fine = fineField(x, y);
    const grain = hash2(x, y, seed + 7);
    // Back and flanks: blue-black with soft grey mottling.
    let color: RGB = [DARK[0], DARK[1], DARK[2]];
    const mottle = smooth(0.5, 0.78, large) * 0.6;
    color = [color[0] + (SLATE[0] - color[0]) * mottle, color[1] + (SLATE[1] - color[1]) * mottle, color[2] + (SLATE[2] - color[2]) * mottle];
    const deep = smooth(0.58, 0.8, fine) * 0.45;
    color = [color[0] + (DARKER[0] - color[0]) * deep, color[1] + (DARKER[1] - color[1]) * deep, color[2] + (DARKER[2] - color[2]) * deep];
    layers.albedo.set(color, index * 3);
    // Pale flecks and freckles on the flanks (healed scratches, diatom film).
    const fleck = smooth(0.83, 0.9, fleckField(x, y));
    tint(layers, index, SCAR, fleck * 0.35 * smooth(0.6, -0.4, cos));
    // Countershading: the belly is white with black marbling; the border is ragged.
    const boundary = -0.38 + (large - 0.5) * 0.55 + smooth(0.55, 0.85, s) * 0.45;
    const belly = smooth(boundary, boundary - 0.2, cos) * (1 - smooth(0.6, 0.82, s) * 0.8);
    if (belly > 0) {
      const marble = smooth(0.52, 0.72, marbleField(x, y));
      const white: RGB = fine > 0.5 ? BELLY : BELLY_GREY;
      tint(layers, index, white, belly * (1 - marble * 0.85) * (0.8 + 0.2 * fine));
    }
    // Fine skin texture: wrinkles along the body and a faint grain.
    layers.relief[index] += ((fine - 0.5) * 0.004 + (grain - 0.5) * 0.0012) * perMeterX;
    layers.roughness[index] = 0.32 + 0.1 * fine + 0.06 * grain;
    // Throat pleats: ~22 a side, chin to navel, wavy, a little branching.
    const pleatRegion = smooth(0.025, 0.07, s) * (1 - smooth(0.42, 0.52, s)) * smooth(-0.12, -0.42, cos);
    if (pleatRegion > 0) {
      const wobble = (wobbleField(x, y) - 0.5) * 2.2;
      const phase = angle * 17 + wobble;
      const f = phase - Math.floor(phase);
      const furrow = 1 - smooth(0.03, 0.16, Math.abs(f - 0.5));
      const ridge = Math.cos((f - 0.5) * TAU) * -0.5 + 0.5;
      layers.relief[index] += pleatRegion * (ridge * 0.012 - furrow * 0.018) * perMeterX;
      shade(layers, index, 1 - pleatRegion * furrow * 0.65);
      layers.occlusion[index] *= 1 - pleatRegion * furrow * 0.5;
      layers.roughness[index] -= pleatRegion * 0.06;
    }
    if (s < 0.26) {
      // Mouth line, from the tip of the snout to the corner of the jaw.
      const mouthCos = 0.15 - (s / 0.25) * 0.55;
      const seam = (1 - smooth(0.012, 0.04, Math.abs(cos - mouthCos))) * (1 - smooth(0.23, 0.26, s));
      tint(layers, index, [0.004, 0.005, 0.006], seam * 0.9);
      layers.relief[index] -= seam * 0.012 * perMeterX;
      layers.occlusion[index] *= 1 - seam * 0.6;
      // Tubercles: knobs on the rostrum (as in the mesh) and along the lower lip.
      const topRegion = (1 - smooth(0.12, 0.2, s)) * smooth(0.1, 0.55, cos);
      const lipRegion = (1 - smooth(0.02, 0.09, Math.abs(cos - (mouthCos - 0.1)))) * (1 - smooth(0.16, 0.22, s)) * smooth(0.0, 0.02, s);
      let knob = 0;
      if (topRegion > 0) knob = Math.max(knob, cellBumps(meters / 0.38, (angle * 1.1) / 0.38, 0.32, 3) * topRegion);
      if (lipRegion > 0) knob = Math.max(knob, cellBumps(meters / 0.3, (angle * 1.1) / 0.3, 0.3, 8) * lipRegion);
      if (knob > 0) {
        layers.relief[index] += knob * 0.035 * perMeterX;
        tint(layers, index, SLATE, knob * 0.35);
        // The single hair in its follicle at the top of each knob.
        const hair = smooth(0.9, 0.96, knob);
        tint(layers, index, [0.003, 0.003, 0.003], hair);
        layers.relief[index] -= hair * 0.01 * perMeterX;
        layers.roughness[index] += knob * 0.12;
      }
    }
    // Paired blowholes behind a raised splash guard.
    const signed = Math.atan2(Math.sin(angle), cos);
    if (s > 0.22 && s < 0.27 && Math.abs(signed) < 0.2) {
      const slit = ((s - 0.247) / 0.012) ** 2 + ((Math.abs(signed) - 0.045) / 0.014) ** 2;
      if (slit < 1) {
        tint(layers, index, [0.002, 0.002, 0.002], 1 - slit * 0.5);
        layers.relief[index] -= (1 - slit) * 0.03 * perMeterX;
        layers.occlusion[index] *= 0.5 + 0.5 * slit;
      }
      const guard = (1 - smooth(0.0, 0.008, Math.abs(s - 0.232))) * (1 - smooth(0.08, 0.16, Math.abs(signed)));
      layers.relief[index] += guard * 0.03 * perMeterX;
    }
  });

  const random = p.random;
  const wrap = { wrapY: true, bounds: bounds };
  const at = (s: number, angle: number) => [bodyX(p, s), bodyY(p, angle)] as const;
  // Sloughing skin: big pale patches with ragged edges.
  for (let k = 0; k < 6; k += 1) {
    const s = 0.2 + random() * 0.6;
    const angle = (random() < 0.5 ? 1 : -1) * (0.3 + random() * 1.3);
    const [x, y] = at(s, angle);
    const r = 0.2 + random() * 0.35;
    const patchSeed = seed + 100 + k;
    stamp(layers, x, y, r * 2.2 * perMeterX, r * perMeterY(s), (index, dx, dy, d) => {
      const edge = fbm(dx * 4 + 10, dy * 4, 3, patchSeed) - 0.5;
      const amount = smooth(1, 0.5, d + edge * 0.8) * 0.12;
      tint(layers, index, SCAR, amount);
      layers.roughness[index] += amount * 0.6;
    }, wrap);
  }
  // Orca rake marks on the flanks and the tail stock.
  for (let k = 0; k < 8; k += 1) {
    const s = 0.3 + random() * 0.6;
    const angle = (random() < 0.5 ? 1 : -1) * (0.7 + random() * 1.4);
    const [x, y] = at(s, angle);
    rakeMarks(layers, random, x, y, perMeterX, perMeterY(s), SCAR, 0.55 + random() * 0.3, wrap);
  }
  // Cookie-cutter shark bites: pale ovals with a darker rim.
  for (let k = 0; k < 45; k += 1) {
    const s = 0.15 + random() * 0.75;
    const angle = (random() - 0.5) * TAU * 0.8;
    const [x, y] = at(s, angle);
    const r = 0.025 + random() * 0.03;
    stamp(layers, x, y, r * perMeterX * (1 + random() * 0.4), r * perMeterY(s), (index, _dx, _dy, d) => {
      tint(layers, index, SCAR, 0.7 * (1 - smooth(0.6, 1, d)));
      layers.relief[index] -= 0.005 * perMeterX * (1 - d);
    }, wrap);
  }
  // Short fine scratches.
  for (let k = 0; k < 60; k += 1) {
    const s = 0.1 + random() * 0.85;
    const angle = (random() - 0.5) * TAU * 0.9;
    const [x, y] = at(s, angle);
    const direction = random() * Math.PI;
    const len = 0.15 + random() * 0.4;
    line(layers, x, y, x + Math.cos(direction) * len * perMeterX, y + Math.sin(direction) * len * perMeterY(s), 0.01 * perMeterX, index => tint(layers, index, SCAR, 0.3), wrap);
  }
  // Barnacle clusters: chin, snout tip, lower lip, throat, genital slit, tail stock.
  const clusters: [number, number, number, number][] = [];
  for (const side of [1, -1]) {
    for (let k = 0; k < 4; k += 1) clusters.push([0.01 + random() * 0.05, side * (2.3 + random() * 0.8), 0.12 + random() * 0.14, 10 + Math.floor(random() * 16)]);
    for (let k = 0; k < 3; k += 1) {
      const s = 0.04 + random() * 0.15;
      const mouthCos = 0.15 - (s / 0.25) * 0.55 - 0.1;
      clusters.push([s, side * Math.acos(Math.max(Math.min(mouthCos, 1), -1)), 0.08 + random() * 0.08, 6 + Math.floor(random() * 8)]);
    }
  }
  clusters.push([0.005, 0, 0.1, 8], [0.012, Math.PI, 0.18, 20]);
  for (let k = 0; k < 2; k += 1) clusters.push([0.12 + random() * 0.18, Math.PI + (random() - 0.5) * 1.2, 0.1 + random() * 0.1, 8 + Math.floor(random() * 8)]);
  clusters.push([0.64 + random() * 0.04, Math.PI, 0.12, 10]);
  for (const [s, angle, radius, count] of clusters) {
    const [x, y] = at(s, angle);
    barnacleCluster(p, x, y, radius, count, perMeterX, perMeterY(s), wrap);
  }
}

function paintPectoral(p: Painter, shape: HumpbackShape, seed: number) {
  const { layers, random } = p;
  const { width, height } = layers;
  const left = Math.floor(p.bodyWidth);
  const across = width - left;
  const bandHeight = height / 4;
  const perMeterX = (across * 0.94) / shape.pectoralLength;
  for (const band of ["pectoralUpper", "pectoralLower"] as const) {
    const top = BANDS[band] * bandHeight;
    const upper = band === "pectoralUpper";
    const bounds: [number, number, number, number] = [left, top, width, top + bandHeight];
    forEachTexel(layers, bounds, (index, x, y) => {
      const span = Math.min(Math.max(((x + 0.5 - left) / across - 0.03) / 0.94, 0), 1);
      const chord = Math.min(Math.max(((y + 0.5 - top) / bandHeight - 0.04) / 0.92, 0), 1);
      const n = fbm(span * 9, chord * 3, 3, seed + (upper ? 1 : 2));
      const speck = fbm(span * 40, chord * 10, 2, seed + 5);
      let color: RGB;
      if (upper) {
        // North Atlantic flippers: dark at the root, white beyond, a grey trailing edge.
        const white = smooth(0.12 + n * 0.32, 0.3 + n * 0.32, span);
        color = [DARK[0] + (FIN_WHITE[0] - DARK[0]) * white, DARK[1] + (FIN_WHITE[1] - DARK[1]) * white, DARK[2] + (FIN_WHITE[2] - DARK[2]) * white];
        layers.albedo.set(color, index * 3);
        tint(layers, index, DARK, smooth(0.72, 0.8, speck) * 0.7 * white);
        tint(layers, index, BELLY_GREY, smooth(0.82, 0.98, chord) * 0.5 * white);
      } else {
        color = FIN_WHITE;
        layers.albedo.set(color, index * 3);
        tint(layers, index, BELLY_GREY, smooth(0.6, 0.8, n) * 0.5);
        tint(layers, index, DARK, smooth(0.78, 0.85, speck) * 0.4 + (1 - smooth(0.0, 0.08, span)) * 0.6);
      }
      layers.relief[index] += ((n - 0.5) * 0.004 + (speck - 0.5) * 0.002) * perMeterX;
      layers.roughness[index] = 0.34 + 0.12 * n;
    });
    // Barnacles on the knobs of the leading edge (where the mesh bulges) and at the tip.
    const bandBounds = { bounds: bounds };
    for (let m = 1; m < 5; m += 1) {
      const knob = (2 * m + 0.5) / 9.5;
      if (random() < 0.25) continue;
      const chordMeters = Math.max(shape.pectoralChord(knob), 0.15);
      const perMeterY = (bandHeight * 0.92) / chordMeters;
      const [u, v] = humpbackFinUV(band, knob, 0.03 + random() * 0.05);
      barnacleCluster(p, u * width, v * height, 0.07 + random() * 0.05, 4 + Math.floor(random() * 6), perMeterX, perMeterY, bandBounds);
    }
    const [u, v] = humpbackFinUV(band, 0.95, 0.2);
    barnacleCluster(p, u * width, v * height, 0.08, 6, perMeterX, (bandHeight * 0.92) / Math.max(shape.pectoralChord(0.95), 0.15), bandBounds);
  }
}

function paintFlukes(p: Painter, shape: HumpbackShape, seed: number) {
  const { layers, random } = p;
  const { width, height } = layers;
  const left = Math.floor(p.bodyWidth);
  const across = width - left;
  const bandHeight = height / 4;
  // One fluke spans from the notch (across 0.5) to a tip (0.03 or 0.97).
  const perMeterX = (across * 0.47) / shape.flukeSpan;
  const blackness = 0.15 + random() * 0.45;
  for (const band of ["flukeUpper", "flukeLower"] as const) {
    const top = BANDS[band] * bandHeight;
    const upper = band === "flukeUpper";
    const bounds: [number, number, number, number] = [left, top, width, top + bandHeight];
    forEachTexel(layers, bounds, (index, x, y) => {
      const q = (x + 0.5 - left) / across;
      const signed = Math.min(Math.max((q - 0.5) / 0.47, -1), 1);
      const span = Math.abs(signed);
      const chord = Math.min(Math.max(((y + 0.5 - top) / bandHeight - 0.04) / 0.92, 0), 1);
      const n = fbm(signed * 4 + 8, chord * 2.5, 4, seed + 41);
      const fine = fbm(signed * 30 + 8, chord * 12, 2, seed + 43);
      if (upper) {
        layers.albedo.set(DARK, index * 3);
        tint(layers, index, SLATE, smooth(0.55, 0.75, n) * 0.5);
        tint(layers, index, SCAR, smooth(0.8, 0.88, fine) * 0.3);
      } else {
        // The ID pattern: white, with a black serrated trailing margin, a dark
        // wash at the notch and leading edge, and blotches that vary per whale.
        layers.albedo.set(FIN_WHITE, index * 3);
        const margin = smooth(0.84 - 0.12 * fine, 0.9 - 0.12 * fine, chord);
        const notch = 1 - smooth(0.08 + n * 0.15, 0.2 + n * 0.15, span);
        const lead = 1 - smooth(0.04, 0.1 + 0.08 * n, chord);
        const blotch = smooth(1 - blackness - 0.04, 1 - blackness + 0.04, n);
        const black = Math.min(margin + notch * 0.9 + lead * 0.7 + blotch, 1);
        tint(layers, index, DARKER, black);
        tint(layers, index, BELLY_GREY, smooth(0.75, 0.82, fine) * 0.4 * black);
      }
      layers.relief[index] += (fine - 0.5) * 0.003 * perMeterX;
      layers.roughness[index] = 0.34 + 0.1 * n;
    });
    const options = { bounds: bounds };
    const perMeterY = (bandHeight * 0.92) / Math.max(shape.flukeChord(0.4), 0.2);
    // Scratches and rake marks are white on the black underside, pale on top.
    for (let k = 0; k < (upper ? 3 : 5); k += 1) {
      const [u, v] = humpbackFinUV(band, 0.1 + random() * 0.8, 0.2 + random() * 0.6);
      rakeMarks(layers, random, u * width, v * height, perMeterX, perMeterY, upper ? SCAR : FIN_WHITE, upper ? 0.6 : 0.85, options);
    }
    // Barnacles cling to the fluke tips.
    for (const across01 of [0.02, 0.98]) {
      const [u, v] = humpbackFinUV(band, across01 < 0.5 ? 0.035 : 0.965, 0.3);
      barnacleCluster(p, u * width, v * height, 0.07, 5, perMeterX, perMeterY * 2, options);
    }
  }
}

/**
 * Paint the humpback atlas. `seed` picks the individual's scars, barnacles and
 * fluke pattern; the size is the texture size in texels (width = 2 x height).
 */
export function paintHumpbackSkin(width: number, height: number, shape: HumpbackShape, seed: number) {
  const layers = createSkinLayers(width, height, FIN_WHITE, 0.4);
  const painter: Painter = { layers, bodyWidth: width * BODY_U, random: seededRandom(seed) };
  paintBody(painter, shape, seed);
  paintPectoral(painter, shape, seed);
  paintFlukes(painter, shape, seed);
  // The white texel in the corner (outside every band's used area).
  forEachTexel(layers, [width - 4, height - 4, width, height], index => {
    layers.albedo.set([1, 1, 1], index * 3);
    layers.relief[index] = 0;
  });
  return layers;
}
