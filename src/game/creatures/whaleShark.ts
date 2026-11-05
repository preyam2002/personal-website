/**
 * The whale shark: a 10 m filter feeder with a broad flat head, three ridges
 * along each flank, and a pattern of pale spots between pale vertical stripes
 * (painted into a canvas texture mapped along the body). Two remoras ride on
 * its belly. It swims with a lateral body wave, alternating slow tail beats
 * with long glides, over the sand flats at 8–12 m.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { curve, eye, finStations, loftBody, loftFin, mergeParts, mirrorX, mixRGB, rgb, setUV, type RGB } from "./geometry";
import { BeatGlide, damp, LoopPath, PathSwimmer, smoothstep, strouhalFrequency } from "./motion";
import { WHALE_SHARK_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform } from "./swimMaterial";

const LENGTH = 10;
const HEAD_Z = LENGTH / 2;
const TAIL_AMPLITUDE = 0.045;

const width = curve([[0, 0.12], [0.012, 0.42], [0.04, 0.68], [0.12, 0.84], [0.25, 0.94], [0.4, 0.9], [0.55, 0.7], [0.7, 0.42], [0.8, 0.24], [0.9, 0.13], [1, 0.06]]);
const top = curve([[0, 0.06], [0.012, 0.17], [0.05, 0.3], [0.15, 0.5], [0.3, 0.72], [0.45, 0.76], [0.6, 0.58], [0.75, 0.36], [0.88, 0.22], [1, 0.1]]);
const bottom = curve([[0, 0.06], [0.012, 0.19], [0.05, 0.33], [0.15, 0.5], [0.3, 0.62], [0.45, 0.6], [0.6, 0.45], [0.75, 0.28], [0.88, 0.16], [1, 0.08]]);
const ridgeAngles = [0.5, 0.9, 1.3];

/** Paint the spots and stripes: u runs along the body, v around it (0 on the back, 0.5 on the belly). */
function paintPattern(random: () => number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas for the whale shark pattern");
  const back = "#2d3c47";
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, back);
  gradient.addColorStop(0.3, "#34444f");
  gradient.addColorStop(0.4, "#8e979a");
  gradient.addColorStop(0.45, "#d6dbd8");
  gradient.addColorStop(0.55, "#d6dbd8");
  gradient.addColorStop(0.6, "#8e979a");
  gradient.addColorStop(0.7, "#34444f");
  gradient.addColorStop(1, back);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 512);
  const circumference = (s: number) => width(s) + (top(s) + bottom(s)) / 2;
  const widest = circumference(0.3);
  const spot = (u: number, v: number, radius: number, alpha: number) => {
    const stretch = Math.min(widest / Math.max(circumference(u), 0.15), 4);
    context.fillStyle = `rgba(226, 232, 228, ${alpha})`;
    for (const wrap of [-1, 0, 1]) {
      context.beginPath();
      context.ellipse(u * 1024, (v + wrap) * 512, radius, radius * stretch * 0.5, 0, 0, Math.PI * 2);
      context.fill();
    }
  };
  // Only paint the dark upper side: v in [0, 0.38] and [0.62, 1].
  const upper = (v: number) => v < 0.36 || v > 0.64;
  // Vertical pale stripes from behind the gills to the tail, with rows of spots between them.
  for (let u = 0.2; u < 0.92; u += 0.032 + random() * 0.006) {
    context.strokeStyle = "rgba(220, 228, 224, 0.75)";
    context.lineWidth = 3.5 + random() * 2;
    for (const [from, to] of [[-0.04, 0.35], [0.65, 1.04]]) {
      context.beginPath();
      for (let v = from; v <= to; v += 0.02) {
        const x = (u + Math.sin(v * 20 + u * 30) * 0.003) * 1024;
        if (v === from) context.moveTo(x, v * 512);
        else context.lineTo(x, v * 512);
      }
      context.stroke();
    }
    for (let v = 0; v < 1; v += 0.035 + random() * 0.01) {
      if (upper(v)) spot(u + 0.016 + (random() - 0.5) * 0.004, v, 4 + random() * 2, 0.9);
    }
  }
  // The head is covered in smaller, denser spots.
  for (let index = 0; index < 900; index += 1) {
    const u = 0.01 + random() * 0.2;
    const v = random();
    if (upper(v)) spot(u, v, 2 + random() * 1.8, 0.85);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** A remora riding on the host's belly, as a small lofted fish built in place. */
function remora(z: number, y: number, x: number, length: number) {
  const grey = rgb(0x4a4d4f);
  return loftBody({
    length,
    headZ: z,
    rings: 16,
    segments: 10,
    section: s => ({ width: length * 0.07 * Math.sin(Math.min(s * 3.2, 1) * Math.PI * 0.5) * (1 - s * 0.6) + 0.004, top: length * 0.05 * (1 - s * 0.5) + 0.003, bottom: length * 0.06 * (1 - s * 0.5) + 0.003, center: y + length * 0.06 }),
    color: (_s, angle): RGB => mixRGB(grey, rgb(0x2a2c2e), smoothstep(0.3, 1, Math.abs(Math.sin(angle)))),
  }).translate(x, 0, 0);
}

export function buildWhaleSharkGeometry(quality: GameEnvironment["quality"]) {
  const rings = quality === "high" ? 120 : quality === "medium" ? 90 : 60;
  const segments = quality === "high" ? 72 : quality === "medium" ? 56 : 36;
  const white: RGB = [1, 1, 1];
  const body = loftBody({
    length: LENGTH,
    headZ: HEAD_Z,
    rings,
    segments,
    section: s => ({ width: width(s), top: top(s), bottom: bottom(s), squareness: 2.4 - s * 0.4 }),
    detail: (s, angle) => {
      const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
      let scale = 1;
      const along = smoothstep(0.1, 0.2, s) * (1 - smoothstep(0.75, 0.9, s));
      for (const ridge of ridgeAngles) scale += 0.035 * along * Math.exp(-Math.pow((a - ridge) / 0.06, 2));
      // The lowest ridge becomes a keel on the tail stock.
      scale += 0.16 * smoothstep(0.72, 0.85, s) * Math.exp(-Math.pow((a - Math.PI / 2) / 0.12, 2));
      // The wide mouth is a shallow groove across the front.
      scale -= 0.04 * (1 - smoothstep(0.0, 0.03, s)) * Math.exp(-Math.pow((a - 1.95) / 0.12, 2));
      return scale;
    },
    color: (s, angle) => {
      const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
      // Five gill slits on each side, and the dark mouth.
      const gill = s > 0.13 && s < 0.21 && a > 1.25 && a < 2.05 && Math.abs(((s - 0.13) / 0.016) % 1 - 0.5) < 0.12;
      const mouth = s < 0.03 && Math.abs(a - 1.95) < 0.12;
      return gill || mouth ? [0.08, 0.09, 0.1] : white;
    },
  });
  // The texture coordinates of fins point into the pattern: upper side spotted, under side pale.
  const finUV = (u0: number, u1: number) => (span: number, chord: number, upper: boolean): [number, number] =>
    upper ? [u0 + (u1 - u0) * chord, 0.05 + span * 0.25] : [u0 + (u1 - u0) * chord, 0.5];
  const pectoral = loftFin({
    stations: finStations([0.78, -0.35, HEAD_Z - 0.22 * LENGTH], [1.55, -0.55, -0.75], [0, 0, -1], 14, t => 1.0 * (1 - t * 0.75), t => 0.13 - t * 0.05, t => t * t * 0.4),
    chordDirection: [0, 0, -1],
    normalDirection: [0.33, 0.94, 0],
    segments: 12,
    color: () => white,
    uv: finUV(0.25, 0.35),
  });
  const dorsal = loftFin({
    stations: finStations([0, top(0.48) - 0.1, HEAD_Z - 0.45 * LENGTH], [0, 1.0, 0], [0, 0, -1], 12, t => 1.15 * (1 - t * 0.8), () => 0.12, t => Math.pow(t, 1.4) * 0.75),
    chordDirection: [0, 0, -1],
    normalDirection: [1, 0, 0],
    segments: 12,
    color: () => white,
    uv: finUV(0.45, 0.58),
  });
  const secondDorsal = loftFin({
    stations: finStations([0, top(0.72) - 0.05, HEAD_Z - 0.7 * LENGTH], [0, 0.4, 0], [0, 0, -1], 8, t => 0.45 * (1 - t * 0.7), () => 0.12, t => t * 0.3),
    chordDirection: [0, 0, -1],
    normalDirection: [1, 0, 0],
    segments: 10,
    color: () => white,
    uv: finUV(0.7, 0.75),
  });
  // Caudal fin: a tall crescent, the upper lobe a little longer.
  const tailZ = HEAD_Z - 0.94 * LENGTH;
  const upperLobe = loftFin({
    stations: finStations([0, 0.05, tailZ], [0, 1.85, -1.25], [0, -0.15, -1], 14, t => 0.9 * Math.pow(1 - t, 0.9) + 0.03, () => 0.11, t => t * 0.1),
    chordDirection: [0, -0.15, -1],
    normalDirection: [1, 0, 0],
    segments: 12,
    color: () => white,
    uv: finUV(0.92, 0.99),
  });
  const lowerLobe = loftFin({
    stations: finStations([0, -0.05, tailZ - 0.1], [0, -1.35, -1.0], [0, 0.15, -1], 12, t => 0.75 * Math.pow(1 - t, 0.9) + 0.03, () => 0.11, t => t * 0.1),
    chordDirection: [0, 0.15, -1],
    normalDirection: [1, 0, 0],
    segments: 12,
    color: () => white,
    uv: finUV(0.92, 0.99),
  });
  const pelvic = loftFin({
    stations: finStations([0.3, -bottom(0.62) * 0.8, HEAD_Z - 0.6 * LENGTH], [0.35, -0.3, -0.25], [0, 0, -1], 6, t => 0.4 * (1 - t * 0.6), () => 0.12),
    chordDirection: [0, 0, -1],
    normalDirection: [0.5, 0.86, 0],
    segments: 10,
    color: () => white,
    uv: () => [0.6, 0.5],
  });
  const eyeZ = HEAD_Z - 0.07 * LENGTH;
  const parts = [
    body,
    pectoral,
    mirrorX(pectoral),
    dorsal,
    secondDorsal,
    upperLobe,
    lowerLobe,
    pelvic,
    mirrorX(pelvic),
    // Eyes and remoras have their own colours, so their texture coordinates point at the pale belly.
    setUV(eye([width(0.07) * 0.96, 0.04, eyeZ], 0.035, 1), 0.6, 0.5),
    setUV(eye([-width(0.07) * 0.96, 0.04, eyeZ], 0.035, -1), 0.6, 0.5),
    setUV(remora(HEAD_Z - 0.32 * LENGTH, -bottom(0.36) - 0.02, 0.15, 0.55), 0.6, 0.5),
    setUV(remora(HEAD_Z - 0.5 * LENGTH, -bottom(0.5) - 0.02, -0.22, 0.45), 0.6, 0.5),
  ];
  pectoral.dispose();
  pelvic.dispose();
  return mergeParts(parts);
}

export const createWhaleShark: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildWhaleSharkGeometry(quality);
  const texture = paintPattern(random);
  const uniforms = createSwimUniforms({ uSwimAmp: TAIL_AMPLITUDE, uSwimWavelength: 1, uSwimLength: LENGTH, uSwimHeadZ: HEAD_Z });
  const deform = swimDeform("whale-shark", uniforms, { mode: "lateral", envelope: "fish" });
  const material = applyDeform(new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 0.6, metalness: 0 }), deform, environment.patchMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "whale-shark";
  mesh.castShadow = quality === "high";
  mesh.customDepthMaterial = createDeformDepthMaterial(deform);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const path = new LoopPath(WHALE_SHARK_ROUTE);
  const swim = new PathSwimmer(path, { start: random() * path.length, lead: 18, clearance: 4, minDepth: 3, avoidMargin: 8, limits: { turnRate: 0.12, maxPitch: 0.25, acceleration: 0.08, bank: 1.5, pitchRate: 0.5 } }, 0.8);
  const rhythm = new BeatGlide([8, 18], [4, 10], random);
  let phase = 0;
  let amplitude = TAIL_AMPLITUDE;
  let wander = random() * 100;

  environment.addDiscoverable({
    id: "whale-shark",
    name: "Whale shark",
    subtitle: "Rhincodon typus",
    description:
      "The whale shark is the largest living fish, reaching 12 m or more, yet it eats plankton and small fish that it filters from the water through its gills. The pattern of pale spots behind its gills is unique to each animal, so researchers identify individuals from photographs. It is listed as Endangered by the IUCN.",
    radius: 4.5,
    position: target => target.copy(mesh.position),
    object: mesh,
  });

  poseFromSwimmer(mesh, swim.swimmer);
  return {
    update: ({ delta, diver }) => {
      mesh.visible = mesh.position.distanceTo(diver.position) < 170;
      if (delta <= 0) return;
      wander += delta;
      const beat = rhythm.update(delta);
      // Gliding sheds about 0.1 m/s per second; beats bring it back toward 0.5–1.1 m/s.
      const cruise = 0.8 + 0.3 * Math.sin(wander * 0.03);
      const speed = rhythm.gliding ? 0.5 : cruise;
      const swimmer = swim.update(delta, seabedHeight, environmentThreats(environment), speed);
      phase += strouhalFrequency(Math.max(swimmer.speed, 0.4), LENGTH, TAIL_AMPLITUDE) * delta * (0.3 + 0.7 * beat);
      amplitude = damp(amplitude, TAIL_AMPLITUDE * beat, 2, delta);
      uniforms.uSwimPhase.value = phase % 1000;
      uniforms.uSwimAmp.value = amplitude;
      poseFromSwimmer(mesh, swimmer);
    },
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      mesh.customDepthMaterial?.dispose();
    },
  };
};

