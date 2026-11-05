/**
 * Humpback whales: a mother (14 m) and, above low quality, her calf (4.5 m).
 *
 * The body is lofted through cross-sections with knobby tubercles on the
 * head and long scalloped pectoral fins. The skin (throat pleats, scars,
 * barnacles, the fluke ID pattern) is a painted atlas with normal, roughness
 * and occlusion maps (humpbackSkin.ts) on a lightly clear-coated material.
 *
 * Motion follows tagged and filmed humpbacks: fluke strokes of about 5 s at
 * cruise (Strouhal-locked to speed), a few strokes then a glide, flippers held
 * out like wings and tilted against the turn, slow rolls onto the side, and
 * a bushy blow every 15-25 s while at the surface.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystem, GameSystemFactory } from "../types";
import { cellBumps, curve, eye, finStations, loftBody, loftFin, mergeParts, mirrorX, noise3, setUV, type RGB } from "./geometry";
import { BODY_U, HUMPBACK_WHITE_UV, humpbackBodyUV, humpbackFinUV, paintHumpbackSkin, type HumpbackShape } from "./humpbackSkin";
import { BeatGlide, clamp, damp, LoopPath, PathSwimmer, smoothstep, strouhalFrequency, SurfacingSchedule, Swimmer, steerDirection, clampHeight, wrapAngle, type Point3 } from "./motion";
import { WHALE_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { createSkinTextures, remapUV, skinSize, type SkinTextures } from "./skinTextures";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform, type SwimUniforms, type VertexDeform } from "./swimMaterial";

const LENGTH = 14;
const HEAD_Z = LENGTH / 2;
const TAIL_AMPLITUDE = 0.085;
const WAVELENGTH = 1.1;
const DRAW_DISTANCE = 200;
const WHITE: RGB = [1, 1, 1];

const width = curve([[0, 0.12], [0.05, 0.62], [0.14, 1.1], [0.28, 1.5], [0.4, 1.55], [0.55, 1.32], [0.7, 0.88], [0.84, 0.36], [0.94, 0.16], [1, 0.05]]);
const top = curve([[0, 0.1], [0.05, 0.38], [0.14, 0.72], [0.28, 1.18], [0.42, 1.36], [0.56, 1.28], [0.7, 0.98], [0.84, 0.5], [0.94, 0.22], [1, 0.07]]);
const bottom = curve([[0, 0.14], [0.05, 0.6], [0.14, 1.1], [0.28, 1.62], [0.4, 1.58], [0.55, 1.3], [0.7, 0.86], [0.84, 0.4], [0.94, 0.17], [1, 0.06]]);

const PECTORAL_LENGTH = 4.5;
const pectoralChord = (t: number) => (1.05 - 0.15 * t) * (1 - Math.pow(t, 3.2)) + 0.04 + 0.03 * Math.sin(t * 40) * t;
const FLUKE_SPAN = 2.35;
const flukeChord = (t: number) => 0.95 * (1 - Math.pow(t, 2.6)) + 0.1 - 0.22 * (1 - smoothstep(0, 0.1, t)) + 0.04 * Math.sin(t * 31);

/** The shape facts the skin painter needs to keep features round and in place. */
export const HUMPBACK_SHAPE: HumpbackShape = {
  length: LENGTH,
  radius: s => (width(s) + (top(s) + bottom(s)) / 2) / 2,
  pectoralChord,
  pectoralLength: PECTORAL_LENGTH,
  flukeChord,
  flukeSpan: FLUKE_SPAN,
};

/** Build the humpback geometry, head along +z, 14 m long, centred on the origin. */
export function buildHumpbackGeometry(quality: GameEnvironment["quality"]) {
  const rings = quality === "high" ? 150 : quality === "medium" ? 110 : 70;
  const segments = quality === "high" ? 104 : quality === "medium" ? 68 : 40;

  const body = loftBody({
    length: LENGTH,
    headZ: HEAD_Z,
    rings,
    segments,
    section: s => ({ width: width(s), top: top(s), bottom: bottom(s), squareness: 2.15 }),
    detail: (s, angle) => {
      let scale = 1;
      const cos = Math.cos(angle);
      // The pleated throat is a little fuller than the flanks (the pleats themselves are in the normal map).
      scale += 0.01 * smoothstep(0.04, 0.1, s) * (1 - smoothstep(0.4, 0.52, s)) * smoothstep(-0.3, -0.7, cos);
      // Tubercles: fist-sized knobs on the top of the head (matched by the skin texture).
      if (s < 0.2) {
        const metersAlong = s * LENGTH;
        const around = angle * 1.1;
        const knob = cellBumps(metersAlong / 0.38, around / 0.38, 0.32, 3);
        const region = (1 - smoothstep(0.12, 0.2, s)) * smoothstep(0.1, 0.55, cos);
        scale += knob * region * 0.05 / Math.max(width(s), 0.3);
      }
      // A little lumpiness so the skin is not perfectly smooth.
      scale += (noise3(s * 30, Math.cos(angle) * 3, Math.sin(angle) * 3) - 0.5) * 0.01;
      return scale;
    },
    // All colour comes from the skin texture.
    color: () => WHITE,
  });
  remapUV(body, (u, v) => humpbackBodyUV(u, v));

  // Pectoral fins, a third of the body long, with knobs on the leading edge.
  const finRoot: [number, number, number] = [1.32, -0.75, HEAD_Z - 0.3 * LENGTH];
  const spanDirection = new THREE.Vector3(0.9, -0.3, -0.3).normalize().multiplyScalar(PECTORAL_LENGTH);
  // The fin's flat face is perpendicular to its span and chord, facing up.
  const finNormal = new THREE.Vector3().crossVectors(new THREE.Vector3(0, -0.1, -1), spanDirection).normalize();
  if (finNormal.y < 0) finNormal.negate();
  const fin = loftFin({
    stations: finStations(
      finRoot,
      [spanDirection.x, spanDirection.y, spanDirection.z],
      [0, -0.1, -1],
      quality === "low" ? 16 : 32,
      pectoralChord,
      t => 0.24 - 0.12 * t,
      t => -0.07 * Math.pow(Math.max(Math.sin(t * Math.PI * 9.5), 0), 2) * (0.3 + t) - t * 0.35,
    ),
    chordDirection: [0, -0.1, -1],
    normalDirection: [finNormal.x, finNormal.y, finNormal.z],
    segments: quality === "low" ? 10 : 16,
    color: () => WHITE,
    uv: (span, chord, upper) => humpbackFinUV(upper ? "pectoralUpper" : "pectoralLower", span, chord),
    flap: { rootX: finRoot[0], span: spanDirection.x },
  });

  // Flukes: swept, with a notch in the middle and a ragged trailing edge. The
  // two flukes share one underside image, notch in the middle, like an ID photo.
  const flukeRootZ = HEAD_Z - LENGTH * 0.965;
  const fluke = loftFin({
    stations: finStations(
      [0, 0, flukeRootZ],
      [FLUKE_SPAN, 0.05, 0],
      [0, 0, -1],
      quality === "low" ? 12 : 22,
      flukeChord,
      t => 0.16 - 0.08 * t,
      t => 0.62 * Math.pow(t, 1.6),
    ),
    chordDirection: [0, 0, -1],
    normalDirection: [0, 1, 0],
    segments: quality === "low" ? 10 : 14,
    color: () => WHITE,
    uv: (span, chord, upper) => humpbackFinUV(upper ? "flukeUpper" : "flukeLower", 0.5 + 0.5 * span, chord),
  });
  const otherFluke = remapUV(mirrorX(fluke), (u, v) => [1 + BODY_U - u, v]);

  // A small dorsal fin on a hump two thirds of the way back.
  const dorsalS = 0.66;
  const dorsalZ = HEAD_Z - dorsalS * LENGTH;
  const dorsal = loftFin({
    stations: finStations(
      [0, top(dorsalS) - 0.12, dorsalZ + 0.5],
      [0, 0.5, 0],
      [0, 0, -1],
      8,
      t => 1.2 * (1 - t) + 0.08,
      () => 0.3,
      t => 0.55 * t * t,
    ),
    chordDirection: [0, 0, -1],
    normalDirection: [1, 0, 0],
    segments: 10,
    color: () => WHITE,
    // The fin samples the mottled, scarred skin of the back around it.
    uv: (span, chord, upper) => humpbackBodyUV(0.62 + chord * 0.1, upper ? 0.004 + span * 0.02 : 0.996 - span * 0.02),
  });

  const eyeZ = HEAD_Z - 0.235 * LENGTH;
  const eyeX = width(0.235) * 0.93;
  const eyes = [eye([eyeX, -0.35, eyeZ], 0.07, 1), eye([-eyeX, -0.35, eyeZ], 0.07, -1)].map(part => setUV(part, ...HUMPBACK_WHITE_UV));
  const parts = [body, fin, mirrorX(fin), fluke, otherFluke, dorsal, ...eyes];
  return mergeParts(parts);
}

/** Paint and upload the skin for a quality level; the seed picks the individual. */
export function createHumpbackSkin(quality: GameEnvironment["quality"], seed: number): SkinTextures {
  const { width: textureWidth, height: textureHeight } = skinSize(quality);
  const layers = paintHumpbackSkin(textureWidth, textureHeight, HUMPBACK_SHAPE, seed);
  return createSkinTextures(layers, { normalStrength: 1, wrapY: false });
}

/**
 * Tilt both flippers about the body axis at their roots (uFinRoll, radians):
 * one flipper rises while the other drops, as humpbacks hold them against a turn.
 */
function withFinRoll(base: VertexDeform, finRoll: THREE.IUniform<number>): VertexDeform {
  return {
    ...base,
    key: `${base.key}:fin-roll`,
    declarations: `${base.declarations}
uniform float uFinRoll;`,
    body: `
  if (aFlap.y > 0.0 && uFinRoll != 0.0) {
    float rollSide = sign(aFlap.x);
    float rollSpan = abs(aFlap.x);
    float rollSin = sin(uFinRoll);
    float rollCos = cos(uFinRoll);
    p.y += rollSide * rollSpan * rollSin;
    p.x -= rollSide * rollSpan * (1.0 - rollCos);
    n = vec3(n.x * rollCos - n.y * rollSin, n.x * rollSin + n.y * rollCos, n.z);
  }
${base.body}`,
    uniforms: { ...base.uniforms, uFinRoll: finRoll },
  };
}

type Whale = {
  mesh: THREE.Mesh;
  uniforms: SwimUniforms;
  finRoll: THREE.IUniform<number>;
  length: number;
  phase: number;
  amplitude: number;
  lastYaw: number;
  /** Extra roll onto the side, on top of the bank into turns. */
  roll: number;
  rollTarget: number;
  rollTimer: number;
  rhythm: BeatGlide;
};

function createWhaleMesh(environment: GameEnvironment, geometry: THREE.BufferGeometry, skin: SkinTextures, length: number, name: string): Whale {
  const uniforms = createSwimUniforms({ uSwimAmp: TAIL_AMPLITUDE, uSwimWavelength: WAVELENGTH, uSwimLength: LENGTH, uSwimHeadZ: HEAD_Z, uFlapLag: 1.2, uFlapSweep: 0.1 });
  const finRoll = { value: 0 };
  const deform = withFinRoll(swimDeform("humpback", uniforms, { mode: "vertical", envelope: "whale" }), finRoll);
  const maps = { map: skin.map, normalMap: skin.normalMap, roughnessMap: skin.ormMap, aoMap: skin.ormMap, aoMapIntensity: 0.8 };
  // Wet skin: a thin, smooth clear coat over the textured, satin skin.
  const material =
    environment.quality === "low"
      ? new THREE.MeshStandardMaterial({ ...maps, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.7 })
      : new THREE.MeshPhysicalMaterial({ ...maps, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.35, sheen: 0 });
  applyDeform(material, deform, environment.patchMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.setScalar(length / LENGTH);
  mesh.castShadow = environment.quality === "high";
  mesh.customDepthMaterial = createDeformDepthMaterial(deform);
  // The body wave moves vertices beyond the rest bounds; keep the whale from being culled early.
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    finRoll,
    length,
    phase: 0,
    amplitude: TAIL_AMPLITUDE,
    lastYaw: 0,
    roll: 0,
    rollTarget: 0,
    rollTimer: 20,
    // A few fluke strokes, then a glide (both in seconds).
    rhythm: new BeatGlide([12, 28], [6, 14], environment.random),
  };
}

/**
 * Advance the stroke for a speed and effort (1 = cruising), set the shader
 * uniforms, and return the speed factor (gliding whales slow a little).
 */
function animateWhale(whale: Whale, speed: number, delta: number, effort: number, yaw: number) {
  const beat = whale.rhythm.update(delta);
  const frequency = strouhalFrequency(speed, whale.length, TAIL_AMPLITUDE);
  whale.phase += frequency * delta * (0.25 + 0.75 * beat) * (0.5 + 0.5 * effort);
  whale.amplitude = damp(whale.amplitude, TAIL_AMPLITUDE * beat * (0.4 + 0.6 * Math.min(effort, 1.2)), 1.2, delta);
  whale.uniforms.uSwimPhase.value = whale.phase % 1000;
  whale.uniforms.uSwimAmp.value = whale.amplitude;
  // Flippers stay out like wings: a small trim with the stroke, lagging by about 0.15 cycle...
  whale.uniforms.uFlapPhase.value = whale.phase - 0.15;
  whale.uniforms.uFlapAmp.value = 0.1 * beat * effort + 0.03;
  // ...and tilted against the turn: the inside flipper drops. Yaw toward +x is a turn to the whale's left (+x side).
  const yawRate = delta > 0 ? wrapAngle(yaw - whale.lastYaw) / delta : 0;
  whale.lastYaw = yaw;
  whale.finRoll.value = damp(whale.finRoll.value, clamp(-yawRate * 3, -0.3, 0.3), 1.5, delta);
  return 0.88 + 0.12 * beat;
}

/** Slow rolls onto the side, as whales do to look at a diver or a calf. */
function updateRoll(whale: Whale, delta: number, random: () => number, playful: boolean) {
  whale.rollTimer -= delta;
  if (whale.rollTimer <= 0) {
    const roll = random() < (playful ? 0.6 : 0.3);
    const side = random() < 0.5 ? -1 : 1;
    whale.rollTarget = roll ? side * (playful ? 0.6 + random() * 0.8 : 0.35 + random() * 0.5) : 0;
    whale.rollTimer = roll ? 8 + random() * 10 : 20 + random() * 40;
  }
  whale.roll = damp(whale.roll, whale.rollTarget, 0.35, delta);
}

/** A soft white puff for the blow. */
function createPuffTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.45, "rgba(240,245,248,0.45)");
    gradient.addColorStop(1, "rgba(240,245,248,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The blow: a bushy column of spray about 3 m tall that rises in a second
 * and drifts away over three or four, built from a few camera-facing puffs.
 */
function createBlow(scene: THREE.Scene, random: () => number) {
  const texture = createPuffTexture();
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const group = new THREE.Group();
  group.name = "humpback-blow";
  const puffs: { sprite: THREE.Sprite; height: number; spread: number }[] = [];
  for (let index = 0; index < 7; index += 1) {
    const sprite = new THREE.Sprite(material);
    const height = (index + 0.5) / 7;
    puffs.push({ sprite, height, spread: (random() - 0.5) * 0.6 });
    group.add(sprite);
  }
  group.visible = false;
  scene.add(group);
  let age = -1;
  const origin = new THREE.Vector3();
  return {
    start(position: THREE.Vector3) {
      origin.copy(position);
      age = 0;
    },
    update(delta: number) {
      if (age < 0) return;
      age += delta;
      const duration = 4;
      const t = age / duration;
      if (t >= 1) {
        age = -1;
        group.visible = false;
        return;
      }
      group.visible = true;
      const rise = Math.sqrt(smoothstep(0, 0.3, t));
      material.opacity = 0.7 * Math.pow(1 - t, 1.6) * smoothstep(0, 0.05, t);
      for (const puff of puffs) {
        const y = 0.3 + puff.height * 3.2 * rise;
        // Spray drifts downwind and spreads as it rises.
        puff.sprite.position.set(origin.x + puff.spread * puff.height + t * 1.2, origin.y + y, origin.z + t * 0.4);
        const size = (0.5 + puff.height * 1.6) * (0.6 + 0.8 * rise);
        puff.sprite.scale.set(size, size * 1.1, 1);
      }
    },
    dispose() {
      group.removeFromParent();
      material.dispose();
      texture.dispose();
    },
  };
}

export const createHumpbackWhales: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildHumpbackGeometry(quality);
  const skin = createHumpbackSkin(quality, Math.floor(random() * 1e9));
  const path = new LoopPath(WHALE_ROUTE);
  const mother = createWhaleMesh(environment, geometry, skin, LENGTH, "humpback-whale");
  scene.add(mother.mesh);
  const limits = { turnRate: 0.09, maxPitch: 0.4, acceleration: 0.12, bank: 2.2, pitchRate: 0.5 };
  const motherSwim = new PathSwimmer(path, { start: random() * path.length, lead: 28, clearance: 7, minDepth: 6, avoidMargin: 10, limits }, 1.5);
  const schedule = new SurfacingSchedule([150, 260], [35, 60], random);
  const blow = createBlow(scene, random);
  const blowhole = new THREE.Vector3();
  let breathTimer = 3;

  let calf: Whale | null = null;
  let calfSwimmer: Swimmer | null = null;
  if (quality !== "low") {
    calf = createWhaleMesh(environment, geometry, skin, 4.5, "humpback-calf");
    scene.add(calf.mesh);
    const start = motherSwim.swimmer.position;
    calfSwimmer = new Swimmer({ x: start.x + 4, y: start.y + 1.5, z: start.z }, motherSwim.swimmer.yaw, 1.5, { ...limits, turnRate: 0.4, acceleration: 0.5 });
  }

  const target: Point3 = { x: 0, y: 0, z: 0 };
  const direction: Point3 = { x: 0, y: 0, z: 1 };
  let cruiseWander = random() * 100;
  let speedFactor = 1;

  environment.addDiscoverable({
    id: "humpback-whale",
    name: "Humpback whale",
    subtitle: "Megaptera novaeangliae",
    description:
      "Humpbacks grow to 14–16 m and have the longest flippers of any whale, up to a third of their body length; the knobs on the leading edge help them turn tightly. Males sing long, complex songs that change from year to year and carry for many kilometres. Many populations migrate more than 8,000 km between cold feeding grounds and warm breeding waters.",
    radius: 7,
    position: target => target.copy(mother.mesh.position),
    object: mother.mesh,
  });

  const system: GameSystem = {
    update: ({ delta, time, diver }) => {
      if (delta <= 0) {
        poseFromSwimmer(mother.mesh, motherSwim.swimmer);
        mother.lastYaw = motherSwim.swimmer.yaw;
        return;
      }
      const threats = environmentThreats(environment);
      const surfacing = schedule.update(delta);
      cruiseWander += delta;
      // Cruise at 10–16 m; at the surface the back breaks the water.
      const cruiseHeight = -13 + Math.sin(cruiseWander * 0.02) * 3;
      const height = cruiseHeight + (-1.0 - cruiseHeight) * surfacing;
      const speed = (1.6 - 0.5 * surfacing) * speedFactor;
      const swimmer = motherSwim.update(delta, seabedHeight, threats, speed, height, schedule.atSurface || surfacing > 0.05 ? 0.4 : 6);
      // Lazier at the surface; stroke harder when climbing (pitch up is negative).
      const effort = Math.min(1 - 0.5 * surfacing + Math.max(-swimmer.pitch, 0) * 0.8, 1.2);
      speedFactor = animateWhale(mother, swimmer.speed, delta, effort, swimmer.yaw);
      updateRoll(mother, delta, random, false);
      poseFromSwimmer(mother.mesh, swimmer);
      // No sideways rolls while breathing at the surface.
      mother.mesh.rotation.z += mother.roll * (1 - surfacing);
      mother.mesh.visible = mother.mesh.position.distanceTo(diver.position) < DRAW_DISTANCE;

      // Breathe: a blow every 15–25 s while the blowhole is out of the water.
      mother.mesh.updateMatrixWorld();
      mother.mesh.localToWorld(blowhole.set(0, top(0.245) * 0.98, HEAD_Z - 0.245 * LENGTH));
      breathTimer -= delta;
      if (!schedule.atSurface) breathTimer = Math.min(breathTimer, 3);
      else if (breathTimer <= 0 && blowhole.y > -0.4) {
        blow.start(blowhole);
        breathTimer = 15 + random() * 10;
      }
      blow.update(delta);

      if (calf && calfSwimmer) {
        // The calf keeps station beside the mother's flipper, a little above her.
        const cos = Math.cos(swimmer.yaw);
        const sin = Math.sin(swimmer.yaw);
        const side = 3.8;
        const back = -1.5 + Math.sin(time * 0.05) * 1.5;
        target.x = swimmer.position.x + cos * side + sin * back;
        target.z = swimmer.position.z - sin * side + cos * back;
        target.y = clampHeight(swimmer.position.y + 1.8, seabedHeight(target.x, target.z), 3, schedule.atSurface ? 0.3 : 2);
        const gap = Math.hypot(target.x - calfSwimmer.position.x, target.y - calfSwimmer.position.y, target.z - calfSwimmer.position.z);
        // Aim a few meters ahead of the station so the calf swims alongside rather than at it.
        target.x += Math.sin(swimmer.yaw) * 6;
        target.z += Math.cos(swimmer.yaw) * 6;
        steerDirection(calfSwimmer.position, target, threats, 6, direction);
        calfSwimmer.step(direction, swimmer.speed + Math.min(gap * 0.15, 1.2), delta);
        calfSwimmer.position.y = Math.min(calfSwimmer.position.y, -0.3);
        animateWhale(calf, calfSwimmer.speed, delta, 1, calfSwimmer.yaw);
        updateRoll(calf, delta, random, true);
        poseFromSwimmer(calf.mesh, calfSwimmer);
        calf.mesh.rotation.z += calf.roll;
        calf.mesh.visible = mother.mesh.visible;
      }
    },
    dispose: () => {
      for (const whale of [mother, calf]) {
        if (!whale) continue;
        whale.mesh.removeFromParent();
        (whale.mesh.material as THREE.Material).dispose();
        whale.mesh.customDepthMaterial?.dispose();
      }
      blow.dispose();
      skin.dispose();
      geometry.dispose();
    },
  };
  system.update({ delta: 0, time: 0 } as Parameters<GameSystem["update"]>[0]);
  return system;
};
