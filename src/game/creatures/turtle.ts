/**
 * Green sea turtles over the reef. The shell is a low, lens-shaped loft; the
 * front flippers are long airfoil paddles, the rear ones short rudders.
 *
 * Skin and shell come from one baked atlas: the carapace carries five
 * vertebral scutes, four pairs of costals and a rim of marginals, butted edge
 * to edge (not overlapping, as in a hawksbill), each olive-brown with dark and
 * amber streaks radiating from its growth centre; the plastron is creamy
 * yellow. The head has large dark scales with pale cream borders and a single
 * pair of prefrontal scales between the eyes; the flippers have the same
 * pale-edged scales on top and are pale underneath.
 *
 * Swimming follows wild-turtle footage: a quick power stroke (about 30 % of
 * a 4–4.5 s limb-beat cycle, a downstroke faster than the recovery) and a long
 * glide with the flippers swept back along the shell. Turtles rise to breathe
 * every few minutes.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { bakeSkin, fbm, fillColor, remapUV, skinSize, smooth, srgb, valueNoise, worley, type Cell, type Texel } from "./creatureTextures";
import { curve, eye, finStations, loftBody, loftFin, loftTube, mergeParts, mirrorX, rgb, setUV } from "./geometry";
import { damp, LoopPath, PathSwimmer, smoothstep, SurfacingSchedule, TAU } from "./motion";
import { TURTLE_ROUTES } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform, type SwimUniforms } from "./swimMaterial";

const SHELL_LENGTH = 1.05;
const SHELL_FRONT = 0.5;
const HEAD_LENGTH = 0.32;

const shellWidth = curve([[0, 0.5], [0.08, 0.82], [0.3, 1], [0.6, 0.95], [0.85, 0.68], [1, 0.2]]);
const shellTop = curve([[0, 0.3], [0.12, 0.75], [0.4, 1], [0.7, 0.85], [0.9, 0.45], [1, 0.12]]);
const shellBottom = curve([[0, 0.35], [0.12, 0.8], [0.45, 1], [0.8, 0.8], [1, 0.2]]);
const headWidth = curve([[0, 0.35], [0.15, 0.85], [0.4, 1], [0.7, 0.9], [1, 1.1]]);
const headTop = curve([[0, 0.3], [0.2, 0.85], [0.45, 1], [1, 1]]);
const headBottom = curve([[0, 0.35], [0.25, 0.9], [1, 1]]);

/** Atlas rectangles (u0, v0, u1, v1). */
const SHELL_RECT = [0, 0, 1, 0.62] as const;
const HEAD_RECT = [0, 0.64, 0.48, 0.82] as const;
const FLIPPER_RECT = [0.5, 0.64, 1, 1] as const;
const NEUTRAL_UV = [0.2, 0.92] as const;

/** Flipper texture coordinates: span along u; v folded at the trailing edge (upper 0–0.5, lower 0.5–1). */
const flipperUV = (span: number, chord: number, upper: boolean): [number, number] => [span, upper ? 0.5 * chord : 1 - 0.5 * chord];

export function buildTurtleGeometry(quality: GameEnvironment["quality"]) {
  const rings = quality === "high" ? 64 : quality === "medium" ? 48 : 30;
  const segments = quality === "high" ? 72 : quality === "medium" ? 52 : 32;
  const white: [number, number, number] = [1, 1, 1];
  const skin = rgb(0x6b6a55);

  const shell = loftBody({
    length: SHELL_LENGTH,
    headZ: SHELL_FRONT,
    rings,
    segments,
    section: s => ({ width: 0.42 * shellWidth(s), top: 0.21 * shellTop(s), bottom: 0.095 * shellBottom(s), squareness: 1.65 }),
    detail: (_s, angle) => {
      // A low keel along the back; the rim flares slightly as a lip.
      const lateral = Math.abs(Math.sin(angle));
      const back = Math.cos(angle) > 0;
      const rim = Math.exp(-Math.pow(Math.cos(angle) / 0.12, 2));
      return 1 + (back ? 0.025 * (1 - smoothstep(0, 0.14, lateral)) : 0) + 0.02 * rim;
    },
    color: () => white,
  });
  remapUV(shell, ...SHELL_RECT);

  // Head and neck: a short, blunt head on a thick neck.
  const head = loftBody({
    length: HEAD_LENGTH,
    headZ: SHELL_FRONT + 0.27,
    rings: quality === "low" ? 14 : 20,
    segments: quality === "low" ? 14 : 18,
    section: s => ({ width: 0.075 * headWidth(s), top: 0.07 * headTop(s), bottom: 0.06 * headBottom(s), center: -0.01 }),
    color: () => white,
  });
  remapUV(head, ...HEAD_RECT);

  // Front flippers: long curved paddles.
  const flipperRoot: [number, number, number] = [0.3, -0.02, 0.27];
  const front = loftFin({
    stations: finStations(flipperRoot, [0.5, -0.06, -0.22], [0, 0, -1], quality === "low" ? 8 : 14, t => 0.2 * (1 - t * 0.55) * (1 - Math.pow(t, 4)) + 0.015, t => 0.16 - t * 0.08, t => 0.06 * t * t, t => [0, 0, -0.1 * t * t]),
    chordDirection: [0, 0, -1],
    normalDirection: [0.1, 1, 0],
    segments: 12,
    color: () => white,
    uv: flipperUV,
    flap: { rootX: flipperRoot[0], span: 0.5 },
  });
  remapUV(front, ...FLIPPER_RECT);
  const rear = loftFin({
    stations: finStations([0.18, -0.04, SHELL_FRONT - SHELL_LENGTH * 0.88], [0.15, -0.02, -0.14], [0, 0, -1], 6, t => 0.11 * (1 - t * 0.5), () => 0.14),
    chordDirection: [0.6, 0, -0.8],
    normalDirection: [0, 1, 0],
    segments: 10,
    color: () => white,
    uv: (span, chord, upper) => flipperUV(0.1 + span * 0.5, chord, upper),
  });
  remapUV(rear, ...FLIPPER_RECT);
  const tailPoints: [number, number, number][] = [0, 1, 2, 3].map(i => [0, -0.03, SHELL_FRONT - SHELL_LENGTH * 0.95 - i * 0.04]);
  const tail = setUV(loftTube(tailPoints, t => 0.03 * (1 - t) + 0.004, 8, () => skin), ...NEUTRAL_UV);
  const eyeZ = SHELL_FRONT + 0.2;
  const eyes = [eye([0.06, 0.02, eyeZ], 0.018, 1), eye([-0.06, 0.02, eyeZ], 0.018, -1)].map(part => setUV(part, ...NEUTRAL_UV));
  const parts = [fillColor(shell, white), fillColor(head, white), front, mirrorX(front), rear, mirrorX(rear), tail, ...eyes];
  front.dispose();
  rear.dispose();
  return mergeParts(parts);
}

type Seed = { lateral: number; s: number; weight: number; kind: number };

/** Vertebral and costal scute centres (lateral 0 on the midline, 1 at the rim; s from the front). */
const CARAPACE_SEEDS: Seed[] = [
  { lateral: 0, s: 0.035, weight: -0.02, kind: 0 },
  ...[0.13, 0.31, 0.49, 0.67, 0.84].map(s => ({ lateral: 0, s, weight: 0.045, kind: 1 })),
  ...[0.19, 0.4, 0.6, 0.78].map((s, index) => ({ lateral: 0.62, s, weight: index === 0 ? 0.035 : 0.03, kind: 2 })),
];

/**
 * The atlas pattern: shell, head and flippers each painted in their own
 * surface coordinates. Colors in sRGB.
 */
export function turtlePattern(seed: number) {
  const shellBase = srgb(0x5c4a2b);
  const shellDark = srgb(0x2c2013);
  const shellAmber = srgb(0xa07c42);
  const shellOlive = srgb(0x5d5c34);
  const seamPale = srgb(0xc8b07a);
  const plastron = srgb(0xcdbb86);
  const scaleDark = srgb(0x3a2b19);
  const scaleOlive = srgb(0x4f4a2c);
  const scaleEdge = srgb(0xd3bd83);
  const skinPale = srgb(0xdacb9c);
  const beak = srgb(0x2b251c);
  const cell: Cell = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };

  const shell = (s: number, angle: number, out: Texel) => {
    const folded = angle <= Math.PI ? angle : TAU - angle;
    const lateral = folded / (Math.PI / 2);
    const halfArc = 0.42 * shellWidth(s) * 1.25;
    const Y = s * SHELL_LENGTH;
    const X = lateral * halfArc;
    const grain = fbm(Y * 8 + seed, folded * 6, 3, 4, 0, 0);
    if (lateral > 1.1) {
      // Plastron: creamy yellow with faint seams.
      out.r = plastron[0] * (0.92 + 0.08 * grain);
      out.g = plastron[1] * (0.92 + 0.08 * grain);
      out.b = plastron[2] * (0.9 + 0.1 * grain);
      const rows = [0.16, 0.31, 0.52, 0.73, 0.88];
      let seam = Math.abs(lateral - 2) * halfArc;
      for (const row of rows) seam = Math.min(seam, Math.abs(s - row) * SHELL_LENGTH);
      seam = Math.min(seam, Math.abs(lateral - 1.3) * halfArc);
      const line = 1 - smooth(0.002, 0.006, seam);
      out.r *= 1 - 0.25 * line;
      out.g *= 1 - 0.25 * line;
      out.b *= 1 - 0.3 * line;
      out.height = -line + grain * 0.3;
      out.roughness = 0.55 + 0.1 * line;
      out.occlusion = 1 - 0.3 * line;
      return;
    }
    // Carapace scutes: marginals in a rim band, vertebrals and costals inside it (a weighted Voronoi).
    const rimSeam = 0.86 + 0.015 * Math.sin(s * 40);
    let seamDistance: number;
    let cx: number;
    let cy: number;
    let id: number;
    if (lateral > rimSeam) {
      const count = 12;
      const row = Math.min(Math.floor(s * count), count - 1);
      const local = s * count - row;
      seamDistance = Math.min((lateral - rimSeam) * halfArc, Math.min(local, 1 - local) * (SHELL_LENGTH / count));
      cx = (rimSeam + 1.15) / 2 * halfArc;
      cy = (row + 0.5) / count * SHELL_LENGTH;
      id = 0.3 + row * 0.05;
    } else {
      let best = 9;
      let second = 9;
      let bestSeed = CARAPACE_SEEDS[0];
      for (const candidate of CARAPACE_SEEDS) {
        const dx = (lateral - candidate.lateral) * halfArc;
        const dy = (s - candidate.s) * SHELL_LENGTH;
        const distance = Math.sqrt(dx * dx + dy * dy) - candidate.weight;
        if (distance < best) {
          second = best;
          best = distance;
          bestSeed = candidate;
        } else if (distance < second) {
          second = distance;
        }
      }
      seamDistance = Math.min((second - best) / 2, (rimSeam - lateral) * halfArc);
      cx = bestSeed.lateral * halfArc;
      cy = bestSeed.s * SHELL_LENGTH + 0.03;
      id = bestSeed.kind * 0.2 + bestSeed.s;
    }
    // Irregular streaks radiating from each scute's growth centre (just behind its middle), broken up by mottling.
    const dx = X - cx;
    const dy = Y - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const mottle = fbm(X * 14 + id * 9, Y * 14, 47, 4);
    const ray = Math.atan2(dy, dx) + (mottle - 0.5) * 1.6;
    const streak = valueNoise((ray / TAU + 0.5) * 18, id * 13 + radius * 9, 41, 18, 0);
    const streakFine = valueNoise((ray / TAU + 0.5) * 48, id * 7 + radius * 14, 43, 48, 0);
    const blotch = fbm(X * 30 + id, Y * 30, 45, 3);
    const dark = smooth(0.5, 0.8, streak * 0.55 + streakFine * 0.25 + blotch * 0.2) * smooth(0.0, 0.05, radius);
    const amber = smooth(0.5, 0.85, (1 - streak) * 0.5 + mottle * 0.5);
    const tint = 0.85 + 0.3 * hashTint(id);
    out.r = (shellBase[0] + (shellAmber[0] - shellBase[0]) * amber * 0.7) * tint;
    out.g = (shellBase[1] + (shellAmber[1] - shellBase[1]) * amber * 0.7) * tint;
    out.b = (shellBase[2] + (shellAmber[2] - shellBase[2]) * amber * 0.7) * tint;
    out.r += (shellDark[0] - out.r) * dark * 0.7;
    out.g += (shellDark[1] - out.g) * dark * 0.7;
    out.b += (shellDark[2] - out.b) * dark * 0.7;
    // A film of algae toward the rim and the back.
    const algae = smooth(0.55, 0.8, fbm(X * 5, Y * 5 + seed, 49, 3)) * (0.3 + 0.5 * smooth(0.5, 1, lateral + s * 0.3));
    out.r += (shellOlive[0] - out.r) * algae * 0.5;
    out.g += (shellOlive[1] - out.g) * algae * 0.5;
    out.b += (shellOlive[2] - out.b) * algae * 0.5;
    // Seams: a narrow groove with a pale line, as the scutes butt edge to edge.
    const seam = 1 - smooth(0.0015, 0.005, seamDistance);
    const shoulder = 1 - smooth(0.004, 0.012, seamDistance);
    out.r += (seamPale[0] - out.r) * seam * 0.65;
    out.g += (seamPale[1] - out.g) * seam * 0.65;
    out.b += (seamPale[2] - out.b) * seam * 0.65;
    // Growth rings around the centre and a slight dome to each scute.
    const rings = Math.sin(radius * 260 + mottle * 4) * 0.025 * smooth(0.02, 0.08, radius);
    out.height = -1.2 * seam - 0.4 * shoulder + rings + mottle * 0.25 + 0.4 * smooth(0, 0.05, seamDistance);
    out.roughness = 0.32 + 0.18 * algae + 0.25 * seam;
    out.occlusion = 1 - 0.35 * shoulder;
  };

  /** Large polygonal scales with pale borders. */
  const scales = (X: number, Y: number, size: number, salt: number, out: Texel) => {
    worley(X / size, Y / size, salt, 0.85, 0, 0, cell);
    const edge = (cell.f2 - cell.f1) * size;
    const border = 1 - smooth(0.0012, 0.0032, edge);
    const centre = smooth(0, 0.6, cell.f1);
    const base = cell.id < 0.5 ? scaleDark : scaleOlive;
    out.r = base[0] * (0.85 + 0.3 * cell.id) + (scaleEdge[0] - base[0]) * (border * 0.9 + centre * 0.15);
    out.g = base[1] * (0.85 + 0.3 * cell.id) + (scaleEdge[1] - base[1]) * (border * 0.9 + centre * 0.15);
    out.b = base[2] * (0.85 + 0.3 * cell.id) + (scaleEdge[2] - base[2]) * (border * 0.9 + centre * 0.15);
    out.height = (1 - smooth(0, 0.004, edge)) * -1 + (1 - cell.f1) * 0.4;
    out.occlusion = 1 - 0.3 * (1 - smooth(0, 0.002, edge));
    return border;
  };

  const headSkin = (s: number, angle: number, out: Texel) => {
    const folded = angle <= Math.PI ? angle : TAU - angle;
    const lateral = folded / (Math.PI / 2);
    const Y = s * HEAD_LENGTH;
    const X = lateral * 0.075 * headWidth(s) * 1.2;
    const grain = fbm(Y * 30, folded * 8, 51, 3, 0, 0);
    if (lateral > 1.2 || s > 0.6) {
      // Throat and neck: pale, finely wrinkled skin; the top of the neck darker with small scales.
      const neckTop = (1 - smooth(0.9, 1.3, lateral)) * smooth(0.5, 0.65, s);
      scales(X, Y, 0.007, 53, out);
      const k = 1 - neckTop * 0.7;
      out.r = out.r * (1 - k) + skinPale[0] * k * (0.9 + 0.1 * grain);
      out.g = out.g * (1 - k) + skinPale[1] * k * (0.9 + 0.1 * grain);
      out.b = out.b * (1 - k) + skinPale[2] * k * (0.88 + 0.1 * grain);
      out.height = out.height * (1 - k) + Math.sin(Y * 900 + grain * 6) * 0.15 * k;
      out.roughness = 0.6;
      return;
    }
    if (s < 0.07) {
      // The horny beak, with a serrated lower edge.
      out.r = beak[0] * (0.9 + 0.2 * grain);
      out.g = beak[1] * (0.9 + 0.2 * grain);
      out.b = beak[2] * (0.9 + 0.2 * grain);
      out.height = grain * 0.3;
      out.roughness = 0.35;
      return;
    }
    // One pair of prefrontal scales between the eyes, then scales getting smaller down the sides.
    if (s < 0.2 && lateral < 0.45) {
      const seamDistance = Math.min(lateral * 0.07, Math.abs(s - 0.07) * HEAD_LENGTH, Math.abs(s - 0.2) * HEAD_LENGTH, Math.abs(lateral - 0.45) * 0.07);
      const border = 1 - smooth(0.0012, 0.0032, seamDistance);
      out.r = scaleDark[0] + (scaleEdge[0] - scaleDark[0]) * border * 0.9;
      out.g = scaleDark[1] + (scaleEdge[1] - scaleDark[1]) * border * 0.9;
      out.b = scaleDark[2] + (scaleEdge[2] - scaleDark[2]) * border * 0.9;
      out.height = -border + grain * 0.2;
    } else {
      scales(X, Y, lateral < 0.7 ? 0.017 : 0.011, 55, out);
    }
    // The mouth line along the side.
    const mouth = (1 - smooth(0.003, 0.008, Math.abs(lateral - 1.08) * 0.08)) * (1 - smooth(0.16, 0.22, s));
    out.r *= 1 - 0.7 * mouth;
    out.g *= 1 - 0.7 * mouth;
    out.b *= 1 - 0.7 * mouth;
    out.roughness = 0.42;
  };

  const flipper = (span: number, v: number, out: Texel) => {
    const upper = v < 0.5;
    const chordFraction = upper ? 2 * v : 2 * (1 - v);
    const chord = 0.2 * (1 - span * 0.55) * (1 - Math.pow(span, 4)) + 0.015;
    const X = span * 0.5;
    const Y = chordFraction * chord;
    if (upper) {
      // Big scales along the leading edge, small ones behind and at the root.
      const size = span < 0.12 ? 0.008 : chordFraction < 0.4 ? 0.021 : 0.012;
      scales(X, Y, size, chordFraction < 0.4 ? 57 : 59, out);
      // A single claw on the leading edge.
      const claw = Math.sqrt(((span - 0.36) / 0.03) ** 2 + ((chordFraction - 0.04) / 0.08) ** 2);
      if (claw < 1.2) {
        const k = 1 - smooth(0.6, 1.2, claw);
        out.r += (0.78 - out.r) * k;
        out.g += (0.72 - out.g) * k;
        out.b += (0.6 - out.b) * k;
      }
      // A pale trailing margin.
      const margin = smooth(0.85, 0.97, chordFraction) * 0.6;
      out.r += (skinPale[0] - out.r) * margin;
      out.g += (skinPale[1] - out.g) * margin;
      out.b += (skinPale[2] - out.b) * margin;
      out.roughness = 0.45;
      return;
    }
    scales(X, Y, 0.016, 61, out);
    const grey = 0.15 + 0.25 * smooth(0.6, 1, span);
    out.r = skinPale[0] * (1 - grey) + out.r * grey;
    out.g = skinPale[1] * (1 - grey) + out.g * grey;
    out.b = skinPale[2] * (1 - grey) + out.b * grey;
    out.height *= 0.5;
    out.roughness = 0.55;
  };

  const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
  return (u: number, v: number, out: Texel) => {
    if (v < 0.63) {
      shell(clamp01(u), clamp01(v / SHELL_RECT[3]) * TAU, out);
    } else if (u < 0.49 && v < 0.83) {
      headSkin(clamp01(u / HEAD_RECT[2]), clamp01((v - HEAD_RECT[1]) / (HEAD_RECT[3] - HEAD_RECT[1])) * TAU, out);
    } else if (u >= 0.49) {
      flipper(clamp01((u - FLIPPER_RECT[0]) / (FLIPPER_RECT[2] - FLIPPER_RECT[0])), clamp01((v - FLIPPER_RECT[1]) / (FLIPPER_RECT[3] - FLIPPER_RECT[1])), out);
    } else {
      out.roughness = 0.3;
    }
  };
}

function hashTint(value: number) {
  const h = Math.sin(value * 91.7) * 43758.5453;
  return h - Math.floor(h);
}

type Turtle = {
  mesh: THREE.Mesh;
  uniforms: SwimUniforms;
  swim: PathSwimmer;
  schedule: SurfacingSchedule;
  phase: number;
  stroking: boolean;
  strokesLeft: number;
  timer: number;
  amplitude: number;
};

/** One power stroke (downstroke and recovery), then a glide. */
const STROKE_SECONDS = 1.5;

export const createSeaTurtles: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildTurtleGeometry(quality);
  const size = skinSize(quality);
  const skin = await bakeSkin({ width: size, height: size, normalStrength: size / 384 }, turtlePattern(random() * 30));
  const count = quality === "low" ? 1 : 2;
  const turtles: Turtle[] = [];
  for (let index = 0; index < count; index += 1) {
    const uniforms = createSwimUniforms({ uSwimAmp: 0, uFlapAmp: 0.3, uFlapLag: 0.7, uFlapSweep: 0.14 });
    const deform = swimDeform("turtle-chelonia", uniforms, { mode: "lateral", envelope: "fish" });
    const material = applyDeform(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: skin.map,
        normalMap: skin.normalMap,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: skin.orm,
        aoMap: skin.orm,
        roughness: 1,
        metalness: 0,
      }),
      deform,
      environment.patchMaterial,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "green-turtle";
    mesh.scale.setScalar(0.92 + random() * 0.16);
    mesh.castShadow = quality === "high";
    mesh.customDepthMaterial = createDeformDepthMaterial(deform);
    scene.add(mesh);
    const path = new LoopPath(TURTLE_ROUTES[index % TURTLE_ROUTES.length]);
    const swim = new PathSwimmer(path, { start: random() * path.length, lead: 4, clearance: 1.6, minDepth: 1.5, avoidMargin: 3, limits: { turnRate: 0.4, maxPitch: 0.45, acceleration: 0.25, bank: 0.8, pitchRate: 1 } }, 0.5);
    turtles.push({ mesh, uniforms, swim, schedule: new SurfacingSchedule([100, 220], [8, 14], random), phase: 0.5, stroking: false, strokesLeft: 0, timer: random() * 2, amplitude: 0.06 });
  }

  const diverPosition = new THREE.Vector3();
  environment.addDiscoverable({
    id: "green-turtle",
    name: "Green sea turtle",
    subtitle: "Chelonia mydas",
    description:
      "Green turtles are named for the green fat under their shells, coloured by the seagrass and algae that adults graze. Females return to the beach where they hatched to lay their eggs, some after migrating more than 2,000 km. A resting turtle can stay under for hours, but an active one comes up to breathe every few minutes.",
    radius: 0.6,
    position: target => {
      let best = turtles[0];
      for (const turtle of turtles) if (turtle.mesh.position.distanceToSquared(diverPosition) < best.mesh.position.distanceToSquared(diverPosition)) best = turtle;
      return target.copy(best.mesh.position);
    },
  });

  for (const turtle of turtles) poseFromSwimmer(turtle.mesh, turtle.swim.swimmer);
  return {
    update: ({ delta, diver }) => {
      diverPosition.copy(diver.position);
      if (delta <= 0) return;
      const threats = environmentThreats(environment);
      for (const turtle of turtles) {
        const surfacing = turtle.schedule.update(delta);
        // A power stroke takes 1.5 s, then the flippers glide swept back (phase 0.5) for 2.5–3.5 s:
        // propulsion is about a third of a 4–5 s limb-beat cycle. Climbing to breathe takes back-to-back strokes.
        if (turtle.stroking) {
          const before = turtle.phase;
          turtle.phase += delta / STROKE_SECONDS;
          if (Math.floor(before - 0.5) !== Math.floor(turtle.phase - 0.5)) {
            turtle.strokesLeft -= 1;
            if (turtle.strokesLeft <= 0) {
              turtle.stroking = false;
              turtle.phase = Math.floor(turtle.phase - 0.5) + 0.5;
              turtle.timer = surfacing > 0.02 ? 0.6 + random() * 0.6 : 2.5 + random();
            }
          }
        } else {
          turtle.timer -= delta;
          if (turtle.timer <= 0) {
            turtle.stroking = true;
            turtle.strokesLeft = random() < 0.25 ? 2 : 1;
          }
        }
        turtle.amplitude = damp(turtle.amplitude, turtle.stroking ? 0.3 : 0.05, 4, delta);
        // The downstroke (phase 0.25 to 0.75 of each cycle) is quicker than the recovery.
        const warped = turtle.phase - (0.25 * Math.sin(turtle.phase * TAU)) / TAU;
        turtle.uniforms.uFlapPhase.value = warped % 1000;
        turtle.uniforms.uFlapAmp.value = turtle.amplitude;
        const speed = turtle.stroking ? 0.72 : 0.5;
        const height = surfacing > 0.02 ? -12 + (-0.25 + 12) * surfacing : null;
        const swimmer = turtle.swim.update(delta, seabedHeight, threats, speed, height === null ? null : Math.max(height, -0.25), turtle.schedule.atSurface ? 0.15 : 1.5);
        poseFromSwimmer(turtle.mesh, swimmer);
        turtle.mesh.visible = turtle.mesh.position.distanceTo(diverPosition) < 130;
        // A slight nose-up surge on each power stroke.
        turtle.mesh.rotation.x -= 0.05 * Math.sin(warped * TAU) * (turtle.amplitude / 0.3);
      }
    },
    dispose: () => {
      for (const turtle of turtles) {
        turtle.mesh.removeFromParent();
        (turtle.mesh.material as THREE.Material).dispose();
        turtle.mesh.customDepthMaterial?.dispose();
      }
      skin.map.dispose();
      skin.normalMap.dispose();
      skin.orm.dispose();
      geometry.dispose();
    },
  };
};
