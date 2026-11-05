/**
 * Humpback whales: a mother (14 m) and, above low quality, her calf (4.5 m).
 *
 * The body is lofted through cross-sections with throat grooves cut into the
 * mesh, knobby tubercles on the head, and long scalloped pectoral fins. The
 * flukes stroke with a vertical body wave locked to speed by the Strouhal
 * number. The pair cruises a wide loop over the drop-off and the open water
 * and surfaces to breathe every few minutes.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystem, GameSystemFactory } from "../types";
import {
  cellBumps,
  curve,
  eye,
  finStations,
  hash3,
  loftBody,
  loftFin,
  mergeParts,
  mirrorX,
  mixRGB,
  noise3,
  rgb,
  scaleRGB,
  type RGB,
} from "./geometry";
import { damp, LoopPath, PathSwimmer, smoothstep, strouhalFrequency, SurfacingSchedule, Swimmer, steerDirection, clampHeight, type Point3 } from "./motion";
import { WHALE_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform, type SwimUniforms } from "./swimMaterial";

const LENGTH = 14;
const HEAD_Z = LENGTH / 2;
const TAIL_AMPLITUDE = 0.085;
const WAVELENGTH = 1.1;
const DRAW_DISTANCE = 200;

const width = curve([[0, 0.12], [0.05, 0.62], [0.14, 1.1], [0.28, 1.5], [0.4, 1.55], [0.55, 1.32], [0.7, 0.88], [0.84, 0.36], [0.94, 0.16], [1, 0.05]]);
const top = curve([[0, 0.1], [0.05, 0.38], [0.14, 0.72], [0.28, 1.18], [0.42, 1.36], [0.56, 1.28], [0.7, 0.98], [0.84, 0.5], [0.94, 0.22], [1, 0.07]]);
const bottom = curve([[0, 0.14], [0.05, 0.6], [0.14, 1.1], [0.28, 1.62], [0.4, 1.58], [0.55, 1.3], [0.7, 0.86], [0.84, 0.4], [0.94, 0.17], [1, 0.06]]);

/** Build the humpback geometry, head along +z, 14 m long, centred on the origin. */
export function buildHumpbackGeometry(quality: GameEnvironment["quality"]) {
  const rings = quality === "high" ? 150 : quality === "medium" ? 110 : 70;
  const segments = quality === "high" ? 96 : quality === "medium" ? 64 : 40;
  const dark = rgb(0x1d2125);
  const slate = rgb(0x2d3338);
  const white = rgb(0xd6d8d2);
  const barnacle = rgb(0x8f8c82);

  const body = loftBody({
    length: LENGTH,
    headZ: HEAD_Z,
    rings,
    segments,
    section: s => ({ width: width(s), top: top(s), bottom: bottom(s), squareness: 2.15 }),
    detail: (s, angle, segment) => {
      let scale = 1;
      const cos = Math.cos(angle);
      // Throat grooves: alternate ridges and furrows, one per mesh column, from the chin to the navel.
      const groove = smoothstep(0.02, 0.07, s) * (1 - smoothstep(0.42, 0.52, s)) * smoothstep(-0.25, -0.55, cos);
      scale += groove * (segment % 2 === 0 ? 0.014 : -0.014);
      // Tubercles: fist-sized knobs on the top of the head and along the jaw line.
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
    color: (s, angle, point) => {
      const cos = Math.cos(angle);
      const mottling = noise3(point.x * 0.9, point.y * 0.9, point.z * 0.9);
      // Countershading with a ragged boundary: white throat and belly, dark back and flanks.
      const boundary = -0.45 + (mottling - 0.5) * 0.3 + smoothstep(0.55, 0.85, s) * 0.5;
      let color: RGB = mixRGB(dark, slate, smoothstep(0.6, -0.2, cos) * 0.8);
      const belly = smoothstep(boundary, boundary - 0.25, cos) * (1 - smoothstep(0.6, 0.8, s) * 0.7);
      color = mixRGB(color, white, belly);
      // Dark furrows in the grooves.
      const groove = smoothstep(0.02, 0.07, s) * (1 - smoothstep(0.42, 0.52, s)) * smoothstep(-0.25, -0.55, cos);
      const segmentPhase = Math.round((angle / (Math.PI * 2)) * segments) % 2;
      if (segmentPhase === 1) color = mixRGB(color, scaleRGB(color, 0.55), groove);
      // Mouth line: a dark seam from the snout tip down to the corner of the jaw.
      if (s < 0.25) {
        const mouthCos = 0.15 - (s / 0.25) * 0.55;
        const seam = 1 - smoothstep(0.02, 0.06, Math.abs(cos - mouthCos));
        color = mixRGB(color, rgb(0x0d0f10), seam * 0.85);
      }
      // Pale barnacle clusters on the chin and the head knobs.
      const clusters = noise3(point.x * 2.4 + 5, point.y * 2.4, point.z * 2.4);
      const barnacleRegion = (1 - smoothstep(0.12, 0.22, s)) * smoothstep(0.62, 0.78, clusters);
      color = mixRGB(color, barnacle, barnacleRegion * 0.8);
      // Old scars: a few pale scratches on the flanks.
      const scar = smoothstep(0.93, 0.97, hash3(Math.round(point.z * 3), Math.round(point.y * 9), 1)) * smoothstep(0.3, -0.1, Math.abs(cos));
      color = mixRGB(color, rgb(0x9a9c98), scar * 0.4);
      return color;
    },
  });

  // Pectoral fins, a third of the body long, with knobs on the leading edge.
  const finRoot: [number, number, number] = [1.32, -0.75, HEAD_Z - 0.3 * LENGTH];
  const finLength = 4.5;
  const spanDirection = new THREE.Vector3(0.9, -0.3, -0.3).normalize().multiplyScalar(finLength);
  // The fin's flat face is perpendicular to its span and chord, facing up.
  const finNormal = new THREE.Vector3().crossVectors(new THREE.Vector3(0, -0.1, -1), spanDirection).normalize();
  if (finNormal.y < 0) finNormal.negate();
  const fin = loftFin({
    stations: finStations(
      finRoot,
      [spanDirection.x, spanDirection.y, spanDirection.z],
      [0, -0.1, -1],
      quality === "low" ? 16 : 32,
      t => (1.05 - 0.15 * t) * (1 - Math.pow(t, 3.2)) + 0.04 + 0.03 * Math.sin(t * 40) * t,
      t => 0.24 - 0.12 * t,
      t => -0.07 * Math.pow(Math.max(Math.sin(t * Math.PI * 9.5), 0), 2) * (0.3 + t) - t * 0.35,
    ),
    chordDirection: [0, -0.1, -1],
    normalDirection: [finNormal.x, finNormal.y, finNormal.z],
    segments: quality === "low" ? 10 : 16,
    color: (span, chord, upper) => {
      const n = noise3(span * 9, chord * 3, upper ? 1 : 5);
      if (!upper) return mixRGB(white, rgb(0xb8bab4), n * 0.4);
      return mixRGB(dark, white, smoothstep(0.15 + n * 0.4, 0.55 + n * 0.4, span));
    },
    flap: { rootX: finRoot[0], span: spanDirection.x },
  });

  // Flukes: swept, with a notch in the middle and a ragged trailing edge.
  const flukeRootZ = HEAD_Z - LENGTH * 0.965;
  const flukeSpan = 2.35;
  const fluke = loftFin({
    stations: finStations(
      [0, 0, flukeRootZ],
      [flukeSpan, 0.05, 0],
      [0, 0, -1],
      quality === "low" ? 12 : 22,
      t => 0.95 * (1 - Math.pow(t, 2.6)) + 0.1 - 0.22 * (1 - smoothstep(0, 0.1, t)) + 0.04 * Math.sin(t * 31),
      t => 0.16 - 0.08 * t,
      t => 0.62 * Math.pow(t, 1.6),
    ),
    chordDirection: [0, 0, -1],
    normalDirection: [0, 1, 0],
    segments: quality === "low" ? 10 : 14,
    color: (span, chord, upper) => {
      if (upper) return dark;
      // The underside pattern differs between whales, like a fingerprint.
      const n = noise3(span * 6, chord * 4, 2);
      return mixRGB(white, dark, smoothstep(0.45, 0.6, n) * 0.9 + smoothstep(0.8, 1, chord) * 0.6);
    },
  });

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
    color: () => dark,
  });

  const eyeZ = HEAD_Z - 0.235 * LENGTH;
  const eyeX = width(0.235) * 0.93;
  const parts = [body, fin, mirrorX(fin), fluke, mirrorX(fluke), dorsal, eye([eyeX, -0.35, eyeZ], 0.07, 1), eye([-eyeX, -0.35, eyeZ], 0.07, -1)];
  fin.dispose();
  fluke.dispose();
  return mergeParts(parts);
}

type Whale = {
  mesh: THREE.Mesh;
  uniforms: SwimUniforms;
  length: number;
  phase: number;
  amplitude: number;
};

function createWhaleMesh(environment: GameEnvironment, geometry: THREE.BufferGeometry, length: number, name: string): Whale {
  const uniforms = createSwimUniforms({ uSwimAmp: TAIL_AMPLITUDE, uSwimWavelength: WAVELENGTH, uSwimLength: LENGTH, uSwimHeadZ: HEAD_Z, uFlapLag: 1.2 });
  const deform = swimDeform("humpback", uniforms, { mode: "vertical", envelope: "whale" });
  const material = applyDeform(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0, envMapIntensity: 0.7 }), deform, environment.patchMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.setScalar(length / LENGTH);
  mesh.castShadow = environment.quality === "high";
  mesh.customDepthMaterial = createDeformDepthMaterial(deform);
  // The body wave moves vertices beyond the rest bounds; keep the whale from being culled early.
  mesh.frustumCulled = false;
  return { mesh, uniforms, length, phase: 0, amplitude: TAIL_AMPLITUDE };
}

/** Advance the tail beat for a speed, and set the shader uniforms. */
function animateWhale(whale: Whale, speed: number, delta: number, glide: number) {
  const frequency = strouhalFrequency(speed, whale.length, TAIL_AMPLITUDE);
  whale.phase += frequency * delta * (0.3 + 0.7 * glide);
  whale.amplitude = damp(whale.amplitude, TAIL_AMPLITUDE * (0.25 + 0.75 * glide), 1.5, delta);
  whale.uniforms.uSwimPhase.value = whale.phase % 1000;
  whale.uniforms.uSwimAmp.value = whale.amplitude;
  // Pectorals trim slowly with the stroke, lagging by about 0.15 cycle.
  whale.uniforms.uFlapPhase.value = whale.phase - 0.15;
  whale.uniforms.uFlapAmp.value = 0.22 * glide + 0.05;
}

export const createHumpbackWhales: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildHumpbackGeometry(quality);
  const path = new LoopPath(WHALE_ROUTE);
  const mother = createWhaleMesh(environment, geometry, LENGTH, "humpback-whale");
  scene.add(mother.mesh);
  const limits = { turnRate: 0.09, maxPitch: 0.4, acceleration: 0.12, bank: 2.2, pitchRate: 0.5 };
  const motherSwim = new PathSwimmer(path, { start: random() * path.length, lead: 28, clearance: 7, minDepth: 6, avoidMargin: 10, limits }, 1.5);
  const schedule = new SurfacingSchedule([150, 260], [35, 60], random);

  let calf: Whale | null = null;
  let calfSwimmer: Swimmer | null = null;
  if (quality !== "low") {
    calf = createWhaleMesh(environment, geometry, 4.5, "humpback-calf");
    scene.add(calf.mesh);
    const start = motherSwim.swimmer.position;
    calfSwimmer = new Swimmer({ x: start.x + 4, y: start.y + 1.5, z: start.z }, motherSwim.swimmer.yaw, 1.5, { ...limits, turnRate: 0.4, acceleration: 0.5 });
  }

  const target: Point3 = { x: 0, y: 0, z: 0 };
  const direction: Point3 = { x: 0, y: 0, z: 1 };
  let cruiseWander = random() * 100;

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
        return;
      }
      const threats = environmentThreats(environment);
      const surfacing = schedule.update(delta);
      cruiseWander += delta;
      // Cruise at 10–16 m; at the surface the back breaks the water.
      const cruiseHeight = -13 + Math.sin(cruiseWander * 0.02) * 3;
      const height = cruiseHeight + (-1.0 - cruiseHeight) * surfacing;
      const speed = 1.6 - 0.5 * surfacing;
      const swimmer = motherSwim.update(delta, seabedHeight, threats, speed, height, schedule.atSurface || surfacing > 0.05 ? 0.4 : 6);
      // Glide a little at the surface; stroke harder when diving.
      const glide = 1 - 0.5 * surfacing + Math.max(-swimmer.pitch, 0) * 0.8;
      animateWhale(mother, swimmer.speed, delta, Math.min(glide, 1.2));
      poseFromSwimmer(mother.mesh, swimmer);
      mother.mesh.visible = mother.mesh.position.distanceTo(diver.position) < DRAW_DISTANCE;

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
        animateWhale(calf, calfSwimmer.speed, delta, 1);
        poseFromSwimmer(calf.mesh, calfSwimmer);
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
      geometry.dispose();
    },
  };
  system.update({ delta: 0, time: 0 } as Parameters<GameSystem["update"]>[0]);
  return system;
};
