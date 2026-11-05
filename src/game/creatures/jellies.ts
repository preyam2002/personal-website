/**
 * Moon jellies (Aurelia): instanced bells about 30 cm across that pulse at
 * 0.24 Hz (a quick contraction over 35 % of the cycle, then a slow
 * relaxation), with a fringe of fine tentacles and four frilled oral arms that
 * trail the pulse.
 *
 * Translucency without blending: the engine fogs the scene by its depth
 * buffer, so a blended, depth-less jelly would be fogged as if it were the far
 * background and vanish. Instead each jelly writes depth and mixes its lit
 * colour toward the open-water colour seen along the same ray. The fog pass
 * then treats that colour like the background, so the bell reads as clear
 * where it is thin and milky at the rim and the pink gonads. Nothing is
 * additive, so overlapping jellies never blow out.
 */

import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { WATER_COLOR, WATER_EXTINCTION, WATER_KD } from "../optics";
import { loftRings, loftTube, mergeParts, type RGB } from "./geometry";
import { clamp, pulseContraction, TAU } from "./motion";
import { JELLY_SWARMS } from "./routes";
import { applyDeform, type VertexDeform } from "./swimMaterial";

const BELL_RADIUS = 0.15;
const BELL_HEIGHT = 0.065;
const PULSE_HZ = 0.24;
const DRAW_DISTANCE = 140;

const glsl = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(", ")})`;

type Vertex = Parameters<typeof loftRings>[0][number][number];

/** One jelly: bell, fringe tentacles, and oral arms. aFlap holds (radial fraction, part, distance along). */
export function buildJellyGeometry(quality: "high" | "medium" | "low") {
  const segments = quality === "high" ? 36 : quality === "medium" ? 28 : 20;
  const white: RGB = [1, 1, 1];
  // The bell: outer surface from the apex to the rim, then the inner surface back to the centre.
  const profile: [number, number][] = [];
  const outer = 12;
  for (let index = 0; index <= outer; index += 1) {
    const t = index / outer;
    const r = BELL_RADIUS * Math.sin((t * Math.PI) / 2);
    profile.push([r, BELL_HEIGHT * Math.cos((t * Math.PI) / 2) - 0.006 * t * t]);
  }
  profile.push([BELL_RADIUS * 0.98, -0.01]);
  profile.push([BELL_RADIUS * 0.9, -0.006]);
  for (let index = 1; index <= 6; index += 1) {
    const t = index / 6;
    profile.push([BELL_RADIUS * 0.9 * (1 - t), -0.006 + BELL_HEIGHT * 0.5 * Math.sin((t * Math.PI) / 2)]);
  }
  const rings: Vertex[][] = profile.map(([r, y]) => {
    const ring: Vertex[] = [];
    for (let c = 0; c < segments; c += 1) {
      const angle = (c / segments) * TAU;
      ring.push({ x: Math.cos(angle) * Math.max(r, 1e-4), y, z: Math.sin(angle) * Math.max(r, 1e-4), color: white, u: 0, v: c / segments, flap: [r / BELL_RADIUS, 0, 0] });
    }
    return ring;
  });
  const bell = loftRings(rings, { capStart: false, capEnd: false });

  const parts: THREE.BufferGeometry[] = [bell];
  const setPart = (geometry: THREE.BufferGeometry, radial: number, kind: number) => {
    const flap = geometry.getAttribute("aFlap");
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < flap.count; index += 1) flap.setXYZ(index, radial, kind, uv.getX(index));
    return geometry;
  };
  // Fringe tentacles around the rim.
  const tentacles = quality === "high" ? 36 : quality === "medium" ? 24 : 12;
  for (let index = 0; index < tentacles; index += 1) {
    const angle = (index / tentacles) * TAU;
    const length = 0.07 + ((index * 37) % 11) * 0.004;
    const points: [number, number, number][] = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      const r = BELL_RADIUS * (0.98 + 0.08 * t);
      points.push([Math.cos(angle) * r, -0.01 - length * t, Math.sin(angle) * r]);
    }
    parts.push(setPart(loftTube(points, t => 0.0022 * (1 - t * 0.6), 3, () => white), 1, 1));
  }
  // Four oral arms, frilled ribbons hanging from the centre.
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * TAU + Math.PI / 4;
    const points: [number, number, number][] = [];
    for (let k = 0; k <= 10; k += 1) {
      const t = k / 10;
      const r = 0.012 + 0.03 * t;
      points.push([Math.cos(angle) * r + Math.sin(t * 9) * 0.004, 0.0 - 0.13 * t, Math.sin(angle) * r + Math.cos(t * 9) * 0.004]);
    }
    parts.push(setPart(loftTube(points, t => 0.011 * (1 - t * 0.5), 6, () => white, 0.35), 0, 2));
  }
  return mergeParts(parts);
}

/** The jelly deformation and the translucent finish. */
function jellyDeform(uniforms: { uJellyTime: THREE.IUniform<number>; uJellySun: THREE.IUniform<THREE.Vector3> }): VertexDeform {
  return {
    key: "moon-jelly",
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    declarations: `
uniform float uJellyTime;
attribute vec3 aFlap;
attribute vec2 aJelly;
varying vec3 vJellyLocal;
varying float vJellyKind;
varying vec3 vJellyWorld;
float jellyContraction(float cycle) {
  float p = fract(cycle);
  return p < 0.35 ? sin(1.5707963 * p / 0.35) : 1.0 - smoothstep(0.35, 1.0, p);
}`,
    body: `
  vJellyLocal = p;
  vJellyKind = aFlap.y;
  float rn = aFlap.x;
  if (aFlap.y < 0.5) {
    // The bell narrows by a quarter at the rim and deepens as it contracts.
    float k = jellyContraction(aJelly.x);
    float squeeze = 1.0 - 0.25 * k * pow(rn, 1.3);
    p.xz *= squeeze;
    p.y += 0.012 * k * (1.0 - rn) - 0.02 * k * rn * rn;
    n = normalize(vec3(n.x / squeeze, n.y, n.z / squeeze));
  } else {
    // Tentacles and arms follow the rim with a lag down their length and sway in the water.
    float t = aFlap.z;
    float k = jellyContraction(aJelly.x - t * 0.3);
    if (aFlap.y < 1.5) {
      p.xz *= 1.0 - 0.25 * k;
      p.y -= 0.02 * k;
    }
    float seed = aJelly.x * 6.2831853 + atan(p.z, p.x) * 3.0;
    p.x += sin(uJellyTime * 0.8 + seed + t * 3.0) * 0.012 * t;
    p.z += cos(uJellyTime * 0.6 + seed * 1.3 + t * 2.5) * 0.012 * t;
    // Drag pulls them in behind the bell on each stroke.
    p.y -= 0.015 * k * t;
  }`,
    vertexAfterProject: `
{
  vec4 jellyWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  jellyWorld = instanceMatrix * jellyWorld;
#endif
  vJellyWorld = (modelMatrix * jellyWorld).xyz;
}`,
    fragmentDeclarations: `
uniform vec3 uJellySun;
varying vec3 vJellyLocal;
varying float vJellyKind;
varying vec3 vJellyWorld;
const vec3 JELLY_EXTINCTION = ${glsl(WATER_EXTINCTION)};
const vec3 JELLY_WATER_COLOR = ${glsl(WATER_COLOR)};
const vec3 JELLY_KD = ${glsl(WATER_KD)};
// The open-water color along a view ray, as the engine's water volume pass computes it.
vec3 jellyWaterColor(vec3 direction) {
  float cameraDepth = max(-cameraPosition.y, 0.0);
  float travel = min(direction.y > 0.0 ? cameraDepth / max(direction.y, 0.001) : 1.0e4, 400.0);
  float sampleDepth = max(cameraDepth - direction.y * min(travel * 0.5, 6.0), 0.0);
  vec3 transmittance = exp(-JELLY_EXTINCTION * travel);
  float cosine = dot(direction, -refract(-uJellySun, vec3(0.0, 1.0, 0.0), 0.75));
  float hg = 0.2775 / pow(1.7225 - 1.7 * cosine, 1.5);
  float phase = 0.85 + 0.15 * min(hg / 0.1227, 40.0) * 0.12;
  // The engine scales the water color by the green part of the sun color: 0.95 * 3.2 / 3.
  return JELLY_WATER_COLOR * exp(-JELLY_KD * sampleDepth) * 1.0133 * phase * (1.0 - transmittance);
}
// Four horseshoe-shaped gonads seen through the bell.
float jellyGonads(vec3 local) {
  float mask = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = 0.7853982 + float(i) * 1.5707963;
    vec2 axis = vec2(cos(a), sin(a));
    vec2 offset = local.xz - axis * ${(BELL_RADIUS * 0.36).toFixed(4)};
    float ring = 1.0 - smoothstep(0.004, 0.011, abs(length(offset) - ${(BELL_RADIUS * 0.17).toFixed(4)}));
    float open = smoothstep(0.75, 0.35, dot(normalize(offset + 1e-5), axis));
    mask = max(mask, ring * open);
  }
  return mask;
}`,
    fragmentColor: `
float jellyGonad = vJellyKind < 0.5 ? jellyGonads(vJellyLocal) : 0.0;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.55, 0.62), jellyGonad);`,
    fragmentFinish: `
{
  float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
  float rim = pow(1.0 - facing, 2.0);
  float radial = length(vJellyLocal.xz) / ${BELL_RADIUS.toFixed(4)};
  // Faint radial canals and the milky margin.
  float canals = smoothstep(0.85, 1.0, abs(cos(atan(vJellyLocal.z, vJellyLocal.x) * 8.0))) * smoothstep(0.3, 0.9, radial) * 0.12;
  float opacity = vJellyKind < 0.5 ? 0.12 + rim * 0.6 + jellyGonad * 0.6 + canals + smoothstep(0.9, 1.0, radial) * 0.25 : vJellyKind < 1.5 ? 0.35 : 0.42;
  vec3 water = jellyWaterColor(normalize(vJellyWorld - cameraPosition));
  gl_FragColor.rgb = mix(water, gl_FragColor.rgb, clamp(opacity, 0.0, 0.95));
}`,
  };
}

type Jelly = { x: number; y: number; z: number; ax: number; ay: number; az: number; phase: number; rate: number; size: number; swarm: number; heading: number };

export const createMoonJellies: GameSystemFactory = async environment => {
  const { scene, quality, random } = environment;
  const count = quality === "high" ? 32 : quality === "medium" ? 20 : 10;
  const geometry = buildJellyGeometry(quality);
  const jellyAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  jellyAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aJelly", jellyAttribute);
  const uniforms = { uJellyTime: { value: 0 }, uJellySun: { value: environment.sunDirection.clone().normalize() } };
  const material = applyDeform(
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.9, 0.95), emissive: new THREE.Color(0.35, 0.45, 0.6), emissiveIntensity: 0.12, roughness: 0.25, metalness: 0, side: THREE.DoubleSide }),
    jellyDeform(uniforms),
    environment.patchMaterial,
  );
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "moon-jellies";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const jellies: Jelly[] = [];
  let swarmIndex = 0;
  for (let index = 0; index < count; index += 1) {
    // Fill the swarms by their shares.
    while (swarmIndex < JELLY_SWARMS.length - 1 && index >= Math.round(count * JELLY_SWARMS.slice(0, swarmIndex + 1).reduce((sum, swarm) => sum + swarm.share, 0))) swarmIndex += 1;
    const swarm = JELLY_SWARMS[swarmIndex];
    const angle = random() * TAU;
    const radius = Math.sqrt(random()) * swarm.radius;
    jellies.push({
      x: swarm.x + Math.cos(angle) * radius,
      y: swarm.bottom + random() * (swarm.top - swarm.bottom),
      z: swarm.z + Math.sin(angle) * radius,
      ax: (random() - 0.5) * 0.4,
      ay: 1,
      az: (random() - 0.5) * 0.4,
      phase: random(),
      rate: PULSE_HZ * (0.9 + random() * 0.2),
      size: 0.75 + random() * 0.55,
      swarm: swarmIndex,
      heading: random() * TAU,
    });
  }

  const diverPosition = new THREE.Vector3();
  let nearest = 0;
  environment.addDiscoverable({
    id: "moon-jelly",
    name: "Moon jelly",
    subtitle: "Aurelia aurita",
    description:
      "Moon jellies drift in coastal seas around the world, pulsing their bell about every four seconds. The four pink horseshoes seen through the bell are the reproductive organs. They catch plankton in mucus on the bell and on their short tentacles, and their sting is too weak to hurt most people.",
    radius: 0.25,
    position: target => target.set(jellies[nearest].x, jellies[nearest].y, jellies[nearest].z),
  });

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  const write = () => {
    let best = Infinity;
    jellies.forEach((jelly, index) => {
      axis.set(jelly.ax, jelly.ay, jelly.az).normalize();
      quaternion.setFromUnitVectors(up, axis);
      position.set(jelly.x, jelly.y, jelly.z);
      scale.setScalar(jelly.size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      jellyAttribute.setXY(index, jelly.phase % 1000, jelly.size);
      const distance = position.distanceToSquared(diverPosition);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    jellyAttribute.needsUpdate = true;
    // Past the haze there is nothing to draw.
    mesh.visible = best < DRAW_DISTANCE * DRAW_DISTANCE;
  };
  write();

  return {
    update: ({ delta, time, diver }) => {
      diverPosition.copy(diver.position);
      uniforms.uJellyTime.value = time;
      if (delta <= 0) return;
      for (const jelly of jellies) {
        const swarm = JELLY_SWARMS[jelly.swarm];
        jelly.phase += jelly.rate * delta;
        const thrust = pulseContraction(jelly.phase);
        // Swim along the bell axis on each contraction, sink slowly, and drift with the current.
        const length = Math.hypot(jelly.ax, jelly.ay, jelly.az) || 1;
        const speed = 0.045 * thrust * thrust * jelly.size;
        jelly.x += ((jelly.ax / length) * speed + 0.012) * delta;
        jelly.y += ((jelly.ay / length) * speed - 0.01) * delta;
        jelly.z += ((jelly.az / length) * speed + 0.006) * delta;
        // Turn the bell slowly: wander, and head back into the swarm's volume.
        jelly.heading += (random() - 0.5) * 0.3 * delta;
        let wantX = Math.cos(jelly.heading) * 0.25;
        let wantZ = Math.sin(jelly.heading) * 0.25;
        let wantY = 1;
        const dx = swarm.x - jelly.x;
        const dz = swarm.z - jelly.z;
        const away = Math.hypot(dx, dz);
        if (away > swarm.radius) {
          wantX += (dx / away) * 0.8;
          wantZ += (dz / away) * 0.8;
        }
        if (jelly.y > swarm.top) wantY = -0.2;
        else if (jelly.y < swarm.bottom) wantY = 1.4;
        const turn = clamp(delta * 0.15, 0, 1);
        jelly.ax += (wantX - jelly.ax) * turn;
        jelly.ay += (wantY - jelly.ay) * turn;
        jelly.az += (wantZ - jelly.az) * turn;
        jelly.y = Math.min(jelly.y, -0.6);
        jelly.y = Math.max(jelly.y, environment.seabedHeight(jelly.x, jelly.z) + 1);
      }
      write();
    },
    dispose: () => {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
};
