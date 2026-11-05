/**
 * Moon jellies (Aurelia aurita): instanced saucer-shaped bells about 30 cm
 * across with eight shallow marginal lobes, a fringe of hundreds of fine
 * marginal tentacles, and four frilled oral arms. Bells pulse at about
 * 0.24 Hz, the natural rate measured for free-swimming adults (a quick
 * contraction over 35 % of the cycle, then a slow relaxation), each jelly at
 * its own rate; the margin and tentacles lag the bell.
 *
 * Translucency without blending: the engine fogs the scene by its depth
 * buffer, so a blended, depth-less jelly would be fogged as if it were the far
 * background and vanish. Instead each jelly writes depth and mixes its lit
 * colour toward the open-water colour seen along the same ray. The fog pass
 * then treats that colour like the background, so the bell reads as clear
 * where it is thin and milky at the rim and where structure lies inside it.
 *
 * The inner anatomy is drawn in the shader on a plane inside the bell, found
 * by following the view ray through the jelly (so it shifts with parallax
 * under the clear outer surface): the four horseshoe gonads, the sixteen
 * radial canals (eight branching, eight not), the ring canal, and the eight
 * rhopalia in the marginal notches. Sunlight scatters forward through the
 * bell, so jellies glow when seen against the light, and the margin and
 * gonads catch the light like frosted glass. The tentacle fringe is a thin
 * skirt whose fragments outside the tentacles are discarded; tentacles
 * thinner than a pixel fade toward the water colour instead of flickering.
 */

import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { WATER_COLOR, WATER_EXTINCTION, WATER_KD } from "../optics";
import { loftRings, mergeParts, type RGB } from "./geometry";
import { clamp, pulseContraction, TAU } from "./motion";
import { JELLY_SWARMS } from "./routes";
import { applyDeform, type VertexDeform } from "./swimMaterial";

const BELL_RADIUS = 0.15;
const BELL_HEIGHT = 0.065;
const PULSE_HZ = 0.24;
const DRAW_DISTANCE = 140;
const FRINGE_LENGTH = 0.07;

const glsl = (values: readonly number[]) => `vec3(${values.map(value => value.toFixed(4)).join(", ")})`;

type Vertex = Parameters<typeof loftRings>[0][number][number];

/** How far the margin is notched at an angle: 1 at the eight rhopalia, 0 between them. */
function notch(angle: number) {
  const step = TAU / 8;
  const offset = ((angle % step) + step) % step;
  const distance = Math.min(offset, step - offset);
  return Math.exp(-((distance / 0.07) ** 2));
}

/** One jelly: bell, tentacle fringe and oral arms. aFlap holds (radial fraction, part, distance along). */
export function buildJellyGeometry(quality: "high" | "medium" | "low") {
  const segments = quality === "high" ? 48 : quality === "medium" ? 36 : 24;
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
      // Eight shallow lobes: the margin dips in at each rhopalium.
      const lobe = 1 - 0.05 * notch(angle) * Math.pow(Math.min(r / BELL_RADIUS, 1), 6);
      const radius = Math.max(r * lobe, 1e-4);
      ring.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, color: white, u: 0, v: c / segments, flap: [r / BELL_RADIUS, 0, 0] });
    }
    return ring;
  });
  const parts: THREE.BufferGeometry[] = [loftRings(rings, { capStart: false, capEnd: false })];

  // The tentacle fringe: a short skirt hanging from the margin; the shader cuts it into tentacles.
  const fringeColumns = quality === "high" ? 64 : quality === "medium" ? 48 : 32;
  const fringeRows = quality === "low" ? 2 : 3;
  const fringe: Vertex[][] = [];
  for (let row = 0; row <= fringeRows; row += 1) {
    const t = row / fringeRows;
    const ring: Vertex[] = [];
    for (let c = 0; c < fringeColumns; c += 1) {
      const angle = (c / fringeColumns) * TAU;
      const radius = BELL_RADIUS * (0.975 + 0.06 * t);
      ring.push({ x: Math.cos(angle) * radius, y: -0.009 - FRINGE_LENGTH * t, z: Math.sin(angle) * radius, color: white, u: t, v: c / fringeColumns, flap: [1, 3, t] });
    }
    fringe.push(ring);
  }
  parts.push(loftRings(fringe, { capStart: false, capEnd: false }));

  // Four oral arms: folded ribbons with ruffled edges, hanging from the centre.
  const armRows = quality === "high" ? 12 : quality === "medium" ? 10 : 8;
  const across = 2;
  for (let index = 0; index < 4; index += 1) {
    const heading = (index / 4) * TAU + Math.PI / 4;
    const radial: [number, number] = [Math.cos(heading), Math.sin(heading)];
    const tangent: [number, number] = [-radial[1], radial[0]];
    const arm: Vertex[][] = [];
    for (let row = 0; row <= armRows; row += 1) {
      const t = row / armRows;
      const width = 0.016 * (1 - 0.45 * t) + 0.003;
      const reach = 0.01 + 0.035 * t;
      const y = 0.02 - 0.13 * t;
      const ring: Vertex[] = [];
      const point = (s: number, side: number) => {
        // A U-shaped channel open toward the outside, its edges ruffled.
        const edge = Math.pow(Math.abs(s), 3);
        const ruffle = 0.006 * edge * Math.sin(t * 34 + s * 2 + index) * (0.4 + t);
        const fold = -0.6 * width * (1 - s * s);
        const thickness = 0.0016 * side;
        const out = reach + fold + ruffle + thickness;
        const lateral = s * width;
        ring.push({
          x: radial[0] * out + tangent[0] * lateral + Math.sin(t * 7 + index) * 0.004,
          y: y + ruffle * 0.6,
          z: radial[1] * out + tangent[1] * lateral + Math.cos(t * 7 + index) * 0.004,
          color: white,
          u: t,
          v: 0,
          flap: [0, 2, t],
        });
      };
      for (let k = -across; k <= across; k += 1) point(k / across, 1);
      for (let k = across; k >= -across; k -= 1) point(k / across, -1);
      arm.push(ring);
    }
    parts.push(loftRings(arm));
  }
  return mergeParts(parts);
}

/** The jelly deformation and the translucent finish. */
function jellyDeform(uniforms: { uJellyTime: THREE.IUniform<number>; uJellySun: THREE.IUniform<THREE.Vector3>; uJellyTentacles: THREE.IUniform<number> }): VertexDeform {
  const R = BELL_RADIUS.toFixed(4);
  return {
    key: "moon-jelly-aurelia",
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    declarations: `
uniform float uJellyTime;
attribute vec3 aFlap;
attribute vec2 aJelly;
varying vec3 vJellyLocal;
varying vec3 vJellyPos;
varying vec3 vJellyCamera;
varying vec3 vJellyWorld;
varying float vJellyKind;
varying float vJellyAlong;
varying float vJellyPulse;
float jellyContraction(float cycle) {
  float p = fract(cycle);
  return p < 0.35 ? sin(1.5707963 * p / 0.35) : 1.0 - smoothstep(0.35, 1.0, p);
}`,
    body: `
  vJellyLocal = p;
  vJellyKind = aFlap.y;
  vJellyAlong = aFlap.z;
  float rn = aFlap.x;
  float bellK = jellyContraction(aJelly.x);
  vJellyPulse = bellK;
  if (aFlap.y < 0.5) {
    // The bell narrows by a quarter at the rim and deepens as it contracts; the margin lags a little.
    float k = jellyContraction(aJelly.x - 0.05 * rn * rn);
    float squeeze = 1.0 - 0.25 * k * pow(rn, 1.3);
    p.xz *= squeeze;
    p.y += 0.012 * k * (1.0 - rn) - 0.02 * k * rn * rn;
    n = normalize(vec3(n.x / squeeze, n.y, n.z / squeeze));
  } else if (aFlap.y > 2.5) {
    // The tentacle fringe follows the margin, then trails in behind it on each stroke.
    float t = aFlap.z;
    float rim = jellyContraction(aJelly.x - 0.05);
    float lag = jellyContraction(aJelly.x - 0.1 - 0.25 * t);
    vec2 radial = normalize(p.xz + 1e-6);
    p.xz *= 1.0 - 0.25 * rim;
    p.y -= 0.02 * rim;
    p.xz -= radial * (0.03 * lag - 0.012 * (1.0 - lag)) * t;
    p.y += 0.012 * lag * t;
    float seed = aJelly.x * 6.2831853 + atan(p.z, p.x) * 5.0;
    p.xz += vec2(sin(uJellyTime * 0.9 + seed + t * 3.0), cos(uJellyTime * 0.7 + seed * 1.3)) * 0.005 * t;
  } else {
    // Oral arms hang from the centre, lag the pulse and sway in the water.
    float t = aFlap.z;
    float k = jellyContraction(aJelly.x - t * 0.3);
    float seed = aJelly.x * 6.2831853 + atan(p.z, p.x) * 3.0;
    p.x += sin(uJellyTime * 0.8 + seed + t * 3.0) * 0.012 * t;
    p.z += cos(uJellyTime * 0.6 + seed * 1.3 + t * 2.5) * 0.012 * t;
    p.y -= 0.015 * k * t;
  }`,
    vertexAfterProject: `
{
  mat4 jellyModel = modelMatrix;
#ifdef USE_INSTANCING
  jellyModel = modelMatrix * instanceMatrix;
#endif
  vJellyWorld = (jellyModel * vec4(transformed, 1.0)).xyz;
  vJellyPos = transformed;
  vJellyCamera = (inverse(jellyModel) * vec4(cameraPosition, 1.0)).xyz;
}`,
    fragmentDeclarations: `
uniform vec3 uJellySun;
uniform float uJellyTentacles;
varying vec3 vJellyLocal;
varying vec3 vJellyPos;
varying vec3 vJellyCamera;
varying vec3 vJellyWorld;
varying float vJellyKind;
varying float vJellyAlong;
varying float vJellyPulse;
const vec3 JELLY_EXTINCTION = ${glsl(WATER_EXTINCTION)};
const vec3 JELLY_WATER_COLOR = ${glsl(WATER_COLOR)};
const vec3 JELLY_KD = ${glsl(WATER_KD)};
const float JELLY_R = ${R};
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
float jellyHash(float x) {
  return fract(sin(x * 91.3458) * 47453.5453);
}
// An antialiased line of half width w at distance d, given the distance's screen derivative.
float jellyLine(float d, float w, float aa) {
  float e = max(w, 0.5 * aa);
  return (1.0 - smoothstep(e - 0.5 * aa, e + 0.5 * aa, d)) * (w / e);
}
// Four horseshoe gonads, each open toward the centre, with ruffled folds.
float jellyGonads(vec2 q) {
  float mask = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = 0.7853982 + float(i) * 1.5707963;
    vec2 axis = vec2(cos(a), sin(a));
    vec2 offset = q - axis * (JELLY_R * 0.37);
    float radius = length(offset);
    float band = abs(radius - JELLY_R * 0.16) - JELLY_R * 0.035 * (0.8 + 0.2 * sin(atan(offset.y, offset.x) * 9.0));
    float ring = 1.0 - smoothstep(-0.002, 0.003, band);
    float open = smoothstep(-0.55, -0.15, dot(offset / max(radius, 1e-4), axis));
    float folds = 0.75 + 0.25 * sin(atan(offset.y, offset.x) * 22.0 + radius * 600.0);
    mask = max(mask, ring * open * folds);
  }
  return mask;
}
// Radial canals: sixteen from the stomach to the ring canal; the perradial and interradial ones branch.
float jellyCanals(vec2 q, float aa) {
  float r = length(q);
  float theta = atan(q.y, q.x);
  float sector = 3.14159265 / 8.0;
  float index = floor(theta / sector + 0.5);
  float d = (theta - index * sector) * r;
  float branched = mod(index, 2.0) < 0.5 ? 1.0 : 0.0;
  float dist = abs(d);
  if (branched > 0.5) {
    float b1 = 0.45 * max(r - JELLY_R * 0.55, 0.0);
    dist = min(dist, abs(abs(d) - b1));
    float b2 = 0.4 * max(r - JELLY_R * 0.75, 0.0);
    dist = min(dist, abs(abs(abs(d) - b1) - b2));
  }
  float start = smoothstep(JELLY_R * 0.38, JELLY_R * 0.48, r) * (1.0 - smoothstep(JELLY_R * 0.92, JELLY_R * 0.95, r));
  float canal = jellyLine(dist, 0.0007 + 0.0004 * branched, aa) * start;
  float ringCanal = jellyLine(abs(r - JELLY_R * 0.93), 0.0011, aa);
  return max(canal, ringCanal);
}`,
    fragmentColor: `
vec3 jellyView = normalize(vJellyPos - vJellyCamera);
float jellyPlane = 0.016 + 0.012 * vJellyPulse;
float jellyStep = abs(jellyView.y) > 1e-3 ? (jellyPlane - vJellyPos.y) / jellyView.y : 0.0;
vec2 jellyHit = vJellyPos.xz + jellyView.xz * clamp(jellyStep, 0.0, 0.25);
// Undo the bell's squeeze so the anatomy stays with the tissue.
float jellyHitR = length(jellyHit) / JELLY_R;
vec2 jellyQ = jellyHit / max(1.0 - 0.25 * vJellyPulse * pow(min(jellyHitR, 1.2), 1.3), 0.5);
float jellyGonad = 0.0;
float jellyCanal = 0.0;
float jellyRhopalium = 0.0;
float jellyStomach = 0.0;
float jellyFringe = 0.0;
if (vJellyKind < 0.5) {
  jellyGonad = jellyGonads(jellyQ);
  jellyCanal = jellyCanals(jellyQ, fwidth(length(jellyQ)) * 1.5);
  float qa = atan(jellyQ.y, jellyQ.x);
  float rhop = mod(qa + 0.19635, 0.785398) - 0.19635;
  jellyRhopalium = 1.0 - smoothstep(0.0025, 0.0045, length(vec2(rhop * length(jellyQ), length(jellyQ) - JELLY_R * 0.955)));
  // The stomach: a faint four-lobed cross at the centre.
  float qr = length(jellyQ);
  jellyStomach = (1.0 - smoothstep(JELLY_R * 0.12, JELLY_R * 0.24, qr * (0.8 + 0.2 * cos(4.0 * qa))));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.62, 0.78), jellyGonad);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.82), jellyRhopalium);
} else if (vJellyKind > 2.5) {
  // Cut the fringe into tentacles: hundreds around the margin, none at the rhopalia.
  float around = atan(vJellyLocal.z, vJellyLocal.x) / 6.2831853 + 0.5;
  float x = around * uJellyTentacles + 0.35 * sin(vJellyAlong * 9.0 + around * 40.0) * vJellyAlong;
  float id = floor(x);
  float f = abs(fract(x) - 0.5);
  float len = 0.35 + 0.65 * jellyHash(id);
  float halfWidth = 0.09 * (1.0 - 0.6 * vJellyAlong);
  float gap = abs(fract(around * 8.0 + 0.5) - 0.5);
  jellyFringe = jellyLine(f, halfWidth, fwidth(x) * 1.2) * (1.0 - smoothstep(len - 0.1, len, vJellyAlong)) * smoothstep(0.015, 0.03, gap);
  if (jellyFringe < 0.02) discard;
}`,
    fragmentFinish: `
{
  vec3 jellyNormal = normalize(normal);
  vec3 jellyViewDir = normalize(vViewPosition);
  float facing = abs(dot(jellyNormal, jellyViewDir));
  float rim = pow(1.0 - facing, 2.5);
  float radial = length(vJellyLocal.xz) / JELLY_R;
  // Fine white specks of nematocyst warts on the outer surface.
  vec2 speckCell = floor(vJellyLocal.xz * 900.0);
  float speck = step(0.985, fract(sin(dot(speckCell, vec2(12.9898, 78.233))) * 43758.5453)) * 0.12;
  float opacity;
  if (vJellyKind < 0.5) {
    // Path length through the clear mesoglea grows at grazing angles; the margin and anatomy are milky.
    float milky = 0.08 + 0.55 * rim + 0.2 * smoothstep(0.85, 1.0, radial) + speck;
    opacity = milky + jellyGonad * 0.55 + jellyCanal * 0.3 + jellyRhopalium * 0.6 + jellyStomach * 0.06;
  } else if (vJellyKind > 2.5) {
    opacity = 0.38 * jellyFringe;
  } else {
    // The oral arms: clear ribbons whose frilled, folded edges are milky.
    opacity = 0.14 + 0.32 * rim;
  }
  vec3 jellyWorldView = normalize(vJellyWorld - cameraPosition);
  vec3 water = jellyWaterColor(jellyWorldView);
  // Sunlight under water: travelling down along the refracted sun ray, fading with depth.
  vec3 sunTravel = refract(-normalize(uJellySun), vec3(0.0, 1.0, 0.0), 0.75);
  vec3 sunHere = exp(-JELLY_KD * max(-vJellyWorld.y, 0.0)) * vec3(1.0, 0.97, 0.9);
  // Forward scattering through the bell toward the viewer (Henyey-Greenstein, g = 0.7):
  // a glow when the jelly is seen against the light, strongest in the milky parts.
  float cosine = dot(jellyWorldView, sunTravel);
  float hg = (1.0 - 0.49) / pow(1.49 - 1.4 * cosine, 1.5) / 12.566;
  float scatter = clamp(opacity, 0.0, 1.0) * 0.5 + 0.15;
  // Light passing through from the sunlit side (wrapped, for the thin tissue).
  float through = clamp(0.5 - 0.5 * dot(jellyNormal, -normalize((viewMatrix * vec4(sunTravel, 0.0)).xyz)), 0.0, 1.0);
  vec3 glow = sunHere * (hg * 0.9 + through * 0.05) * scatter;
  // The milky rim scatters the blue ambient light around it.
  glow += water * rim * 0.35;
  gl_FragColor.rgb = mix(water, gl_FragColor.rgb, clamp(opacity, 0.0, 0.95)) + glow * (vJellyKind > 2.5 ? jellyFringe : 1.0);
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
  const uniforms = {
    uJellyTime: { value: 0 },
    uJellySun: { value: environment.sunDirection.clone().normalize() },
    uJellyTentacles: { value: quality === "high" ? 220 : quality === "medium" ? 160 : 110 },
  };
  const material = applyDeform(
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.9, 0.95), emissive: new THREE.Color(0.35, 0.45, 0.6), emissiveIntensity: 0.1, roughness: 0.18, metalness: 0, side: THREE.DoubleSide }),
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
      // Measured adults pulse at 0.24 ± 0.11 Hz.
      rate: PULSE_HZ * (0.75 + random() * 0.5),
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
