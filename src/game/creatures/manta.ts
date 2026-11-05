/**
 * A reef manta ray, 3.5 m across. The disc is one loft from wingtip to wingtip
 * through airfoil sections; the wings flap in the vertex shader with the tip
 * lagging the root by a quarter cycle and a wave running from front to back.
 * Wingbeats take 3–6 s, with glides between bouts. Now and then the manta
 * feeds in backward somersaults about one disc width across.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { eye, loftFin, loftTube, mergeParts, mixRGB, noise3, rgb, type FinStation, type RGB } from "./geometry";
import { damp, LoopPath, PathSwimmer, smoothstep, TAU } from "./motion";
import { MANTA_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform } from "./swimMaterial";

const HALF_SPAN = 1.75;
const smooth = smoothstep;
const BODY_HALF = 0.3;

export function buildMantaGeometry(quality: GameEnvironment["quality"]) {
  const half = quality === "high" ? 22 : quality === "medium" ? 16 : 10;
  const segments = quality === "low" ? 12 : 18;
  const stations: FinStation[] = [];
  for (let index = -half; index <= half; index += 1) {
    const u = Math.abs(index) / half;
    const x = Math.sign(index) * HALF_SPAN * Math.pow(u, 1.15);
    const xn = Math.abs(x) / HALF_SPAN;
    const lead = 0.6 - 0.72 * Math.pow(xn, 1.3) - 0.22 * smoothstep(0.7, 1, xn);
    const chord = 1.37 * Math.pow(Math.max(1 - Math.pow(xn, 1.8), 0), 0.7) + 0.03;
    const thickness = 0.045 + 0.19 * (1 - smoothstep(0, 0.36, xn));
    // The back is domed over the body; the wings droop slightly at rest.
    const y = 0.05 * (1 - smoothstep(0, 0.4, xn)) - 0.06 * xn * xn;
    stations.push({ lead: [x, y, lead], chord, thickness });
  }
  const black = rgb(0x15181b);
  const shoulder = rgb(0xc9ccc8);
  const belly = rgb(0xe4e6e2);
  const xAt = (span: number) => stations[Math.round(span * (stations.length - 1))].lead[0];
  const disc = loftFin({
    stations,
    chordDirection: [0, 0, -1],
    normalDirection: [0, 1, 0],
    segments,
    color: (span, chord, upper): RGB => {
      const x = Math.abs(xAt(span));
      const xn = x / HALF_SPAN;
      if (upper) {
        // White shoulder patches behind the head, the mark of a reef manta.
        const patch = smooth(0.05, -0.05, x - 0.28 - (0.5 - chord) * 1.4) * smooth(0.02, 0.1, chord) * smooth(0.55, 0.45, chord) * smooth(0.2, 0.3, x);
        const n = noise3(x * 4, chord * 6, 1);
        return mixRGB(black, mixRGB(shoulder, rgb(0x6c7072), n * 0.5), patch * 0.9);
      }
      let color = belly;
      // Dark wing margins and trailing edge.
      color = mixRGB(color, rgb(0x3a3d40), smooth(0.8, 0.98, xn) * 0.9 + smooth(0.85, 1, chord) * 0.5);
      // The mouth and five gill slits on each side.
      if (x < 0.22 && chord < 0.06) color = rgb(0x1a1b1d);
      const slit = chord > 0.2 && chord < 0.4 && x > 0.18 && x < 0.34 && Math.abs(((chord - 0.2) / 0.04) % 1 - 0.5) < 0.12;
      if (slit) color = scale(color, 0.35);
      // The belly spots that identify each manta.
      const spot = noise3(x * 9 + 3, chord * 12, 7);
      if (spot > 0.78 && xn < 0.6 && chord > 0.35) color = rgb(0x2a2c2e);
      return color;
    },
  });
  // Flap weights: the body stays rigid, the wings bend beyond the body.
  const position = disc.getAttribute("position") as THREE.BufferAttribute;
  const flap = disc.getAttribute("aFlap") as THREE.BufferAttribute;
  const uv = disc.getAttribute("uv") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const beyond = Math.max(Math.abs(x) - BODY_HALF, 0);
    const z = position.getZ(index);
    const xn = Math.abs(x) / HALF_SPAN;
    const lead = 0.6 - 0.72 * Math.pow(xn, 1.3) - 0.22 * smoothstep(0.7, 1, xn);
    const chord = 1.37 * Math.pow(Math.max(1 - Math.pow(xn, 1.8), 0), 0.7) + 0.03;
    flap.setXYZ(index, Math.sign(x) * beyond, Math.min(beyond / (HALF_SPAN - BODY_HALF), 1), Math.min(Math.max((lead - z) / chord, 0), 1));
    uv.setXY(index, 0.5, 0.5);
  }

  // Cephalic fins, rolled up for travelling.
  const cephalic = (side: 1 | -1) => {
    const points: [number, number, number][] = [];
    for (let index = 0; index <= 8; index += 1) {
      const t = index / 8;
      points.push([side * (0.3 - 0.06 * t + 0.03 * Math.sin(t * Math.PI)), -0.02 - 0.06 * t, 0.5 + 0.38 * t]);
    }
    return loftTube(points, t => 0.055 * (1 - t * 0.45), 10, (_t, angle) => (Math.sin(angle) * side > 0.2 ? rgb(0x2a2c2e) : black), 0.55);
  };
  const tailPoints: [number, number, number][] = [];
  for (let index = 0; index <= 10; index += 1) {
    const t = index / 10;
    tailPoints.push([0, 0.02 - 0.03 * t, -0.72 - 1.2 * t]);
  }
  const tail = loftTube(tailPoints, t => 0.035 * (1 - t) + 0.004, 6, () => black);
  const parts = [disc, cephalic(1), cephalic(-1), tail, eye([0.36, 0.0, 0.42], 0.035, 1), eye([-0.36, 0.0, 0.42], 0.035, -1)];
  return mergeParts(parts);
}

function scale(color: RGB, k: number): RGB {
  return [color[0] * k, color[1] * k, color[2] * k];
}

export const createManta: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildMantaGeometry(quality);
  const uniforms = createSwimUniforms({ uSwimAmp: 0, uSwimLength: 1.6, uSwimHeadZ: 0.7, uFlapAmp: 0.875, uFlapLag: Math.PI / 2, uFlapChord: 0.9 });
  const deform = swimDeform("manta", uniforms, { mode: "vertical", envelope: "fish" });
  const material = applyDeform(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.FrontSide }), deform, environment.patchMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = quality === "high";
  mesh.customDepthMaterial = createDeformDepthMaterial(deform);
  mesh.frustumCulled = false;
  // Pose hierarchy: root follows the swimmer, pivot turns the somersaults about a point above the back.
  const root = new THREE.Group();
  root.name = "manta-ray";
  const pivot = new THREE.Group();
  const loopRadius = HALF_SPAN;
  pivot.position.y = loopRadius;
  mesh.position.y = -loopRadius;
  pivot.add(mesh);
  root.add(pivot);
  scene.add(root);

  const path = new LoopPath(MANTA_ROUTE);
  const swim = new PathSwimmer(path, { start: random() * path.length, lead: 8, clearance: 4, minDepth: 3, avoidMargin: 5, limits: { turnRate: 0.35, maxPitch: 0.3, acceleration: 0.3, bank: 1.2, pitchRate: 1 } }, 0.9);
  let flapPhase = 0;
  let flapPeriod = 4;
  let bout = 3 + random() * 4;
  let gliding = false;
  let amplitude = 0.875;
  let feedTimer = 40 + random() * 40;
  let loopsLeft = 0;
  let loopAngle = 0;

  environment.addDiscoverable({
    id: "reef-manta",
    name: "Reef manta ray",
    subtitle: "Mobula alfredi",
    description:
      "Reef mantas grow to about 3.5–5 m across and filter zooplankton from the water, sometimes in repeated backward somersaults. They visit cleaning stations where small fish pick parasites from their skin, and the spots on each manta's belly are unique. Mantas have one of the largest brains for their body size of any fish.",
    radius: 1.8,
    position: target => mesh.getWorldPosition(target),
    object: root,
  });

  poseFromSwimmer(root, swim.swimmer);
  return {
    update: ({ delta, diver }) => {
      root.visible = root.position.distanceTo(diver.position) < 150;
      if (delta <= 0) return;
      // Bouts of flapping, then a glide with the wings held level.
      bout -= delta;
      if (bout <= 0) {
        gliding = !gliding;
        bout = gliding ? 2 + random() * 4 : 8 + random() * 12;
        flapPeriod = 3 + random() * 3;
      }
      feedTimer -= delta;
      if (feedTimer <= 0 && loopsLeft === 0) {
        loopsLeft = 3 + Math.floor(random() * 4);
        feedTimer = 70 + random() * 60;
      }
      const feeding = loopsLeft > 0;
      const speed = feeding ? 0.35 : gliding ? 0.7 : 1.0;
      const swimmer = swim.update(delta, seabedHeight, environmentThreats(environment), speed);
      const beating = feeding || !gliding;
      // Finish the current stroke before holding the wings for a glide.
      const nearRest = Math.abs(Math.sin(flapPhase * TAU)) < 0.1;
      if (beating || !nearRest) flapPhase += (delta / (feeding ? 3 : flapPeriod)) * (beating ? 1 : 1.5);
      amplitude = damp(amplitude, beating ? 0.875 : 0.15, 1.5, delta);
      uniforms.uFlapPhase.value = flapPhase % 1000;
      uniforms.uFlapAmp.value = amplitude;
      poseFromSwimmer(root, swimmer);
      // The body heaves against the wings.
      mesh.position.y = -loopRadius - 0.08 * Math.sin(flapPhase * TAU) * (amplitude / 0.875);
      if (feeding) {
        // Backward somersaults, each about 4 s.
        loopAngle += (TAU / 4) * delta;
        if (loopAngle >= TAU) {
          loopAngle -= TAU;
          loopsLeft -= 1;
          if (loopsLeft === 0) loopAngle = 0;
        }
      }
      pivot.rotation.x = -loopAngle;
    },
    dispose: () => {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.customDepthMaterial?.dispose();
    },
  };
};
