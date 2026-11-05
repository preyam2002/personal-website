/**
 * The whale shark: a 10 m filter feeder with a broad, flat head and a
 * terminal mouth, three ridges along each flank, and the checkerboard of pale
 * spots and transverse stripes of ID photographs, painted with normal,
 * roughness and occlusion maps (whaleSharkSkin.ts). Two remoras ride on its
 * belly. It swims with a lateral body wave and, like the tagged sharks at
 * Ningaloo, beats its tail to climb and glides to sink, over the sand flats
 * at 8–12 m.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { curve, eye, finStations, loftBody, loftFin, mergeParts, mirrorX, mixRGB, rgb, setUV, type RGB } from "./geometry";
import { BeatGlide, clamp, damp, LoopPath, PathSwimmer, smoothstep, strouhalFrequency } from "./motion";
import { WHALE_SHARK_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { createSkinTextures, skinSize, type SkinTextures } from "./skinTextures";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform } from "./swimMaterial";
import { paintWhaleSharkSkin, type WhaleSharkShape } from "./whaleSharkSkin";

const LENGTH = 10;
const HEAD_Z = LENGTH / 2;
const TAIL_AMPLITUDE = 0.05;
/** Strouhal number for the tail beat: about 2.8 s a beat at cruise. */
const STROUHAL = 0.4;

// A blunt, flat-topped head as broad as the body, a hump of shoulders behind it.
const width = curve([[0, 0.2], [0.012, 0.5], [0.04, 0.74], [0.12, 0.88], [0.25, 0.96], [0.4, 0.92], [0.55, 0.72], [0.7, 0.43], [0.8, 0.24], [0.9, 0.13], [1, 0.06]]);
const top = curve([[0, 0.1], [0.012, 0.18], [0.05, 0.27], [0.15, 0.5], [0.3, 0.78], [0.45, 0.8], [0.6, 0.6], [0.75, 0.37], [0.88, 0.22], [1, 0.1]]);
const bottom = curve([[0, 0.12], [0.012, 0.22], [0.05, 0.35], [0.15, 0.52], [0.3, 0.66], [0.45, 0.63], [0.6, 0.46], [0.75, 0.28], [0.88, 0.16], [1, 0.08]]);
const ridgeAngles = [0.5, 0.9, 1.3];

export const WHALE_SHARK_SHAPE: WhaleSharkShape = {
  length: LENGTH,
  radius: s => (width(s) + (top(s) + bottom(s)) / 2) / 2,
  ridges: ridgeAngles,
};

/** Paint and upload the skin for a quality level; the seed picks the individual's spots. */
export function createWhaleSharkSkin(quality: GameEnvironment["quality"], seed: number): SkinTextures {
  const { width: textureWidth, height: textureHeight } = skinSize(quality);
  return createSkinTextures(paintWhaleSharkSkin(textureWidth, textureHeight, WHALE_SHARK_SHAPE, seed), { normalStrength: 1, wrapY: true });
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
    // Gill slits, mouth, spots and stripes are all in the skin texture.
    color: () => white,
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
    stations: finStations([0, top(0.48) - 0.1, HEAD_Z - 0.45 * LENGTH], [0, 0.95, 0], [0, 0, -1], 12, t => 1.4 * (1 - t * 0.82), () => 0.13, t => Math.pow(t, 1.3) * 0.85),
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
  const skin = createWhaleSharkSkin(quality, Math.floor(random() * 1e9));
  const uniforms = createSwimUniforms({ uSwimAmp: TAIL_AMPLITUDE, uSwimWavelength: 1, uSwimLength: LENGTH, uSwimHeadZ: HEAD_Z });
  const deform = swimDeform("whale-shark", uniforms, { mode: "lateral", envelope: "fish" });
  const material = applyDeform(new THREE.MeshStandardMaterial({
      map: skin.map,
      normalMap: skin.normalMap,
      // Matte, sandpaper skin: roughness from the map (0.5–0.8), no clear coat.
      roughnessMap: skin.ormMap,
      roughness: 1,
      aoMap: skin.ormMap,
      aoMapIntensity: 0.8,
      vertexColors: true,
      metalness: 0,
      envMapIntensity: 0.6,
    }), deform, environment.patchMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "whale-shark";
  mesh.castShadow = quality === "high";
  mesh.customDepthMaterial = createDeformDepthMaterial(deform);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const path = new LoopPath(WHALE_SHARK_ROUTE);
  const swim = new PathSwimmer(path, { start: random() * path.length, lead: 18, clearance: 4, minDepth: 3, avoidMargin: 8, limits: { turnRate: 0.12, maxPitch: 0.25, acceleration: 0.08, bank: 1.5, pitchRate: 0.5 } }, 0.8);
  const rhythm = new BeatGlide([8, 18], [6, 14], random);
  let phase = 0;
  /** Height offset of the yo-yo: whale sharks are heavier than water, so they sink in glides and climb with beats. */
  let drift = 0;
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
      const speed = rhythm.gliding ? 0.55 : cruise;
      drift = clamp(drift + (rhythm.gliding ? -0.12 : 0.09) * delta, -2.5, 1.5);
      const height = -10 + Math.sin(wander * 0.05) * 0.8 + drift;
      const swimmer = swim.update(delta, seabedHeight, environmentThreats(environment), speed, height);
      phase += strouhalFrequency(Math.max(swimmer.speed, 0.4), LENGTH, TAIL_AMPLITUDE, STROUHAL) * delta * (0.3 + 0.7 * beat);
      amplitude = damp(amplitude, TAIL_AMPLITUDE * beat, 2, delta);
      uniforms.uSwimPhase.value = phase % 1000;
      uniforms.uSwimAmp.value = amplitude;
      poseFromSwimmer(mesh, swimmer);
    },
    dispose: () => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      skin.dispose();
      mesh.customDepthMaterial?.dispose();
    },
  };
};

