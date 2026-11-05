/**
 * Green sea turtles over the reef. The shell is a lens-shaped loft with
 * vertebral, costal, and marginal scutes painted as seams and rays; the front
 * flippers are long airfoil paddles that sweep down and back in a 2–3 s power
 * stroke, then hold swept back for a 1–2 s glide. Turtles rise to breathe
 * every few minutes.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { cellular, curve, eye, finStations, loftBody, loftFin, loftTube, mergeParts, mirrorX, mixRGB, noise3, rgb, scaleRGB, type RGB } from "./geometry";
import { damp, LoopPath, PathSwimmer, smoothstep, SurfacingSchedule } from "./motion";
import { TURTLE_ROUTES } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform, type SwimUniforms } from "./swimMaterial";

const SHELL_LENGTH = 1.05;
const SHELL_FRONT = 0.5;

const shellWidth = curve([[0, 0.5], [0.08, 0.82], [0.3, 1], [0.6, 0.95], [0.85, 0.68], [1, 0.2]]);
const shellTop = curve([[0, 0.3], [0.12, 0.75], [0.4, 1], [0.7, 0.85], [0.9, 0.45], [1, 0.12]]);
const shellBottom = curve([[0, 0.35], [0.12, 0.8], [0.45, 1], [0.8, 0.8], [1, 0.2]]);

/** Distance to the nearest scute seam, in shell coordinates (s along, xn across from 0 to 1). */
function scuteSeam(s: number, xn: number) {
  let distance = Math.abs(xn - 0.3) * 0.6;
  if (xn > 0.82) distance = Math.min(distance, Math.abs(xn - 0.82));
  const rows = xn < 0.3 ? [0.1, 0.28, 0.47, 0.66, 0.84] : xn < 0.82 ? [0.14, 0.37, 0.6, 0.8] : Array.from({ length: 13 }, (_, i) => 0.04 + i * 0.077);
  for (const row of rows) distance = Math.min(distance, Math.abs(s - row));
  return distance;
}

export function buildTurtleGeometry(quality: GameEnvironment["quality"]) {
  const rings = quality === "high" ? 64 : quality === "medium" ? 48 : 30;
  const segments = quality === "high" ? 72 : quality === "medium" ? 52 : 32;
  const shellBase = rgb(0x5b4a2e);
  const shellRay = rgb(0x9a8048);
  const seamColor = rgb(0x2b2216);
  const plastron = rgb(0xd2c48f);
  const skin = rgb(0x6b6a55);
  const skinDark = rgb(0x3a3a2c);
  const skinPale = rgb(0xc9bf92);

  const shell = loftBody({
    length: SHELL_LENGTH,
    headZ: SHELL_FRONT,
    rings,
    segments,
    section: s => ({ width: 0.42 * shellWidth(s), top: 0.19 * shellTop(s), bottom: 0.085 * shellBottom(s), squareness: 1.65 }),
    detail: (s, angle) => {
      // A low keel along the back and slight ridges at the seams.
      const xn = Math.abs(Math.sin(angle));
      const back = Math.cos(angle) > 0;
      return 1 + (back ? 0.02 * (1 - smoothstep(0, 0.12, xn)) - 0.012 * (1 - smoothstep(0, 0.012, scuteSeam(s, xn))) : 0);
    },
    color: (s, angle, point) => {
      const xn = Math.abs(Math.sin(angle));
      if (Math.cos(angle) < -0.15) {
        // The plastron, with faint seams.
        const seam = Math.abs(((s * 6) % 1) - 0.5) > 0.47 || xn < 0.03;
        return seam ? scaleRGB(plastron, 0.75) : plastron;
      }
      // Each scute has its own tint and pale rays running out from its centre.
      const cell = Math.floor(s * 5) + Math.floor(xn * 3) * 7;
      const tint = 0.8 + 0.4 * noise3(cell, 1, 2);
      const ray = noise3(Math.atan2(point.x, point.z + 0.1) * 14, s * 4, cell);
      let color = mixRGB(shellBase, shellRay, smoothstep(0.55, 0.85, ray) * 0.8);
      color = scaleRGB(color, tint);
      return mixRGB(color, seamColor, 1 - smoothstep(0.006, 0.016, scuteSeam(s, xn)));
    },
  });

  // Head and neck: a blunt beak, with large scales.
  const head = loftBody({
    length: 0.32,
    headZ: SHELL_FRONT + 0.27,
    rings: 20,
    segments: 18,
    section: s => ({ width: 0.075 * curve([[0, 0.35], [0.15, 0.85], [0.4, 1], [0.7, 0.9], [1, 1.1]])(s), top: 0.07 * curve([[0, 0.3], [0.2, 0.85], [0.45, 1], [1, 1]])(s), bottom: 0.06 * curve([[0, 0.35], [0.25, 0.9], [1, 1]])(s), center: -0.01 }),
    color: (s, angle, point) => {
      const { first, second } = cellular(point.z / 0.035, (angle / (Math.PI * 2)) * 14, 9);
      const edge = 1 - smoothstep(0.04, 0.14, second - first);
      const top = Math.cos(angle);
      const base = mixRGB(skinPale, skin, smoothstep(-0.4, 0.2, top));
      if (s < 0.06) return rgb(0x3a3324);
      return mixRGB(scaleRGB(base, 0.75), skinPale, edge * 0.7);
    },
  });

  // Front flippers: long curved paddles with pale scale edges.
  const flipperRoot: [number, number, number] = [0.3, -0.02, 0.27];
  const front = loftFin({
    stations: finStations(flipperRoot, [0.5, -0.06, -0.22], [0, 0, -1], quality === "low" ? 8 : 14, t => 0.2 * (1 - t * 0.55) * (1 - Math.pow(t, 4)) + 0.015, t => 0.16 - t * 0.08, t => 0.06 * t * t, t => [0, 0, -0.1 * t * t]),
    chordDirection: [0, 0, -1],
    normalDirection: [0.1, 1, 0],
    segments: 12,
    color: (span, chord, upper): RGB => {
      if (!upper) return mixRGB(skinPale, skin, 0.35);
      const { first, second } = cellular(span * 10, chord * 4, 5);
      const edge = 1 - smoothstep(0.05, 0.15, second - first);
      return mixRGB(skinDark, skinPale, edge * 0.8);
    },
    flap: { rootX: flipperRoot[0], span: 0.5 },
  });
  const rear = loftFin({
    stations: finStations([0.18, -0.04, SHELL_FRONT - SHELL_LENGTH * 0.88], [0.15, -0.02, -0.14], [0, 0, -1], 6, t => 0.11 * (1 - t * 0.5), () => 0.14),
    chordDirection: [0.6, 0, -0.8],
    normalDirection: [0, 1, 0],
    segments: 10,
    color: () => skinDark,
  });
  const tailPoints: [number, number, number][] = [0, 1, 2, 3].map(i => [0, -0.03, SHELL_FRONT - SHELL_LENGTH * 0.95 - i * 0.04]);
  const tail = loftTube(tailPoints, t => 0.03 * (1 - t) + 0.004, 8, () => skin);
  const eyeZ = SHELL_FRONT + 0.2;
  const parts = [shell, head, front, mirrorX(front), rear, mirrorX(rear), tail, eye([0.06, 0.02, eyeZ], 0.018, 1), eye([-0.06, 0.02, eyeZ], 0.018, -1)];
  front.dispose();
  rear.dispose();
  return mergeParts(parts);
}

type Turtle = {
  mesh: THREE.Mesh;
  uniforms: SwimUniforms;
  swim: PathSwimmer;
  schedule: SurfacingSchedule;
  phase: number;
  stroking: boolean;
  timer: number;
  amplitude: number;
};

export const createSeaTurtles: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildTurtleGeometry(quality);
  const count = quality === "low" ? 1 : 2;
  const turtles: Turtle[] = [];
  for (let index = 0; index < count; index += 1) {
    const uniforms = createSwimUniforms({ uSwimAmp: 0, uFlapAmp: 0.3, uFlapLag: 0.7, uFlapSweep: 0.14 });
    const deform = swimDeform("turtle", uniforms, { mode: "lateral", envelope: "fish" });
    const material = applyDeform(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }), deform, environment.patchMaterial);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "green-turtle";
    mesh.scale.setScalar(0.92 + random() * 0.16);
    mesh.castShadow = quality === "high";
    mesh.customDepthMaterial = createDeformDepthMaterial(deform);
    scene.add(mesh);
    const path = new LoopPath(TURTLE_ROUTES[index % TURTLE_ROUTES.length]);
    const swim = new PathSwimmer(path, { start: random() * path.length, lead: 4, clearance: 1.6, minDepth: 1.5, avoidMargin: 3, limits: { turnRate: 0.4, maxPitch: 0.45, acceleration: 0.25, bank: 0.8, pitchRate: 1 } }, 0.5);
    turtles.push({ mesh, uniforms, swim, schedule: new SurfacingSchedule([100, 220], [8, 14], random), phase: 0.5, stroking: true, timer: 0, amplitude: 0.3 });
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
        // A power stroke takes 2.5 s; between strokes the flippers glide swept back (phase 0.5).
        turtle.timer -= delta;
        if (turtle.stroking) {
          const before = turtle.phase;
          turtle.phase += delta / 2.5;
          if (turtle.timer <= 0 && Math.floor(before - 0.5) !== Math.floor(turtle.phase - 0.5)) {
            turtle.stroking = false;
            turtle.phase = Math.floor(turtle.phase - 0.5) + 0.5;
            turtle.timer = 1 + random();
          }
        } else if (turtle.timer <= 0) {
          turtle.stroking = true;
          turtle.timer = 2.5 * (1 + Math.floor(random() * 2));
        }
        turtle.amplitude = damp(turtle.amplitude, turtle.stroking ? 0.3 : 0.06, 3, delta);
        turtle.uniforms.uFlapPhase.value = turtle.phase % 1000;
        turtle.uniforms.uFlapAmp.value = turtle.amplitude;
        const speed = turtle.stroking ? 0.65 : 0.4;
        const height = surfacing > 0.02 ? -12 + (-0.25 + 12) * surfacing : null;
        const swimmer = turtle.swim.update(delta, seabedHeight, threats, speed, height === null ? null : Math.max(height, -0.25), turtle.schedule.atSurface ? 0.15 : 1.5);
        poseFromSwimmer(turtle.mesh, swimmer);
        turtle.mesh.visible = turtle.mesh.position.distanceTo(diverPosition) < 130;
        // A slight nose-up surge on each power stroke.
        turtle.mesh.rotation.x -= 0.05 * Math.sin(turtle.phase * Math.PI * 2) * (turtle.amplitude / 0.3);
      }
    },
    dispose: () => {
      for (const turtle of turtles) {
        turtle.mesh.removeFromParent();
        (turtle.mesh.material as THREE.Material).dispose();
        turtle.mesh.customDepthMaterial?.dispose();
      }
      geometry.dispose();
    },
  };
};
