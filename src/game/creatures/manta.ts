/**
 * A reef manta ray (Mobula alfredi), 3.5 m across. The disc is one loft from
 * wingtip to wingtip through airfoil sections, with the falcate wingtips and
 * concave trailing edge of a real manta. The wings flap in the vertex shader
 * with the tip lagging the root and a chordwise wave running from front to
 * back; strokes average about 0.31 Hz (a 3.2 s beat) with a quicker downstroke,
 * between glides with the wings held level.
 *
 * The skin is a baked texture atlas: the dorsal half carries the black back
 * with the grey-white shoulder chevrons that start at the spiracles and curve
 * in toward the midline (the reef-manta pattern), the ventral half the white
 * belly with the dark trailing-edge margin, five pairs of gill slits, the
 * mouth, and the dark spots between the gill slits that identify each animal.
 *
 * The cephalic fins are rolled into horns while cruising and unroll into
 * paddles that funnel water into the mouth while the manta feeds in backward
 * somersaults. The two shapes are blended in the vertex shader.
 */

import * as THREE from "three";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { bakeSkin, fbm, fillColor, skinSize, smooth, srgb, valueNoise, worley, type Cell, type Texel } from "./creatureTextures";
import { cross, eye, finStations, loftFin, loftRings, loftTube, mergeParts, rgb, setUV, unit, type FinStation, type RGB } from "./geometry";
import { damp, LoopPath, PathSwimmer, smoothstep, TAU } from "./motion";
import { MANTA_ROUTE } from "./routes";
import { environmentThreats, poseFromSwimmer } from "./shared";
import { applyDeform, createDeformDepthMaterial, createSwimUniforms, swimDeform, type VertexDeform } from "./swimMaterial";

const HALF_SPAN = 1.75;
const BODY_HALF = 0.3;
/** The atlas leaves a column at u < NEUTRAL_U of plain white skin for the untextured parts. */
const NEUTRAL_U = 0.03;

/** The leading edge (z of the front of the disc) at a span fraction xn = |x| / HALF_SPAN. */
export function mantaLead(xn: number) {
  return 0.56 - 0.95 * Math.pow(xn, 1.35) - 0.21 * smoothstep(0.7, 1, xn);
}

/** The trailing edge: concave behind the wings, swept back to pointed tips. */
export function mantaTrail(xn: number) {
  return -0.78 + 0.45 * smoothstep(0.1, 0.7, xn) - 0.3 * smoothstep(0.6, 1, xn);
}

function chordAt(xn: number) {
  return Math.max(mantaLead(xn) - mantaTrail(xn), 0.03);
}

/** Atlas coordinates: u across the span, v folded at the trailing edge (dorsal 0–0.5, ventral 0.5–1). */
function discUV(x: number, chordFraction: number, upper: boolean): [number, number] {
  const u = NEUTRAL_U + (1 - NEUTRAL_U) * (x / (2 * HALF_SPAN) + 0.5);
  return [u, upper ? 0.5 * chordFraction : 1 - 0.5 * chordFraction];
}

/** Add the cephalic-fin morph attributes (zero for every part but the fins). */
function withMorph(geometry: THREE.BufferGeometry, offsets?: Float32Array, normals?: Float32Array) {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("aCephalic", new THREE.BufferAttribute(offsets ?? new Float32Array(count * 3), 3));
  geometry.setAttribute("aCephalicNormal", new THREE.BufferAttribute(normals ?? new Float32Array(count * 3), 3));
  return geometry;
}

/**
 * A cephalic fin as a thin strip lofted along its length, built twice: rolled
 * into a spiral horn, and unrolled into a flat paddle hanging forward and down
 * beside the mouth. Returns the rolled shape with the morph to the paddle.
 */
function cephalicFin(side: 1 | -1, across: number) {
  const rows = 10;
  const outer = rgb(0x17191b);
  const inner = rgb(0x8c9294);
  const build = (unrolled: boolean, flip: number) => {
    const rings: Parameters<typeof loftRings>[0] = [];
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const radius = 0.05 * (1 - 0.45 * t);
      const center: [number, number, number] = [side * (0.29 - 0.02 * t), -0.03 - 0.06 * t, 0.5 + 0.4 * t];
      const hinge: [number, number, number] = [center[0], center[1] + radius, center[2]];
      const thickness = 0.006 * (1 - 0.5 * t) * flip;
      const ring: Parameters<typeof loftRings>[0][number] = [];
      const point = (w: number, top: boolean) => {
        let p: [number, number, number];
        let n: [number, number, number];
        if (unrolled) {
          const width = 0.2 * (1 - 0.3 * t) * (1 - 0.6 * t * t);
          const down = unit(side * 0.32, -1, 0.3 + 0.2 * t);
          const along = unit(-side * 0.05, -0.08, 1);
          n = unit(...cross(down, along));
          // A slight cup that turns the paddles toward the mouth.
          const cup = 0.03 * Math.sin(w * Math.PI);
          p = [hinge[0] + down[0] * w * width - side * cup, hinge[1] + down[1] * w * width, hinge[2] + down[2] * w * width];
        } else {
          const angle = Math.PI / 2 + w * 1.7 * Math.PI;
          const r = radius * (1 - 0.62 * w);
          n = [side * Math.cos(angle), Math.sin(angle), 0];
          p = [center[0] + n[0] * r, center[1] + n[1] * r, center[2]];
        }
        const sign = top ? 1 : -1;
        ring.push({
          x: p[0] + n[0] * thickness * sign,
          y: p[1] + n[1] * thickness * sign,
          z: p[2] + n[2] * thickness * sign,
          color: top ? outer : inner,
          u: t,
          v: 0,
        });
      };
      for (let k = 0; k <= across; k += 1) point(k / across, true);
      for (let k = across; k >= 0; k -= 1) point(k / across, false);
      rings.push(ring);
    }
    return loftRings(rings);
  };
  const rolled = build(false, 1);
  let open = build(true, 1);
  // Both shapes must wind the same way, or the paddle would face inward.
  if (open.getIndex()?.getX(1) !== rolled.getIndex()?.getX(1)) {
    open.dispose();
    open = build(true, -1);
  }
  const from = rolled.getAttribute("position");
  const to = open.getAttribute("position");
  const offsets = new Float32Array(from.count * 3);
  for (let index = 0; index < from.count; index += 1) {
    offsets[index * 3] = to.getX(index) - from.getX(index);
    offsets[index * 3 + 1] = to.getY(index) - from.getY(index);
    offsets[index * 3 + 2] = to.getZ(index) - from.getZ(index);
  }
  const normals = new Float32Array((open.getAttribute("normal") as THREE.BufferAttribute).array);
  open.dispose();
  return withMorph(setUV(rolled, NEUTRAL_U * 0.4, 0.25), offsets, normals);
}

export function buildMantaGeometry(quality: GameEnvironment["quality"]) {
  const half = quality === "high" ? 22 : quality === "medium" ? 16 : 10;
  const segments = quality === "low" ? 12 : 18;
  const stations: FinStation[] = [];
  for (let index = -half; index <= half; index += 1) {
    const u = Math.abs(index) / half;
    const x = Math.sign(index) * HALF_SPAN * Math.pow(u, 1.15);
    const xn = Math.abs(x) / HALF_SPAN;
    const thickness = 0.045 + 0.19 * (1 - smoothstep(0, 0.36, xn));
    // The back is domed over the body; the wings droop slightly at rest.
    const y = 0.05 * (1 - smoothstep(0, 0.4, xn)) - 0.06 * xn * xn;
    stations.push({ lead: [x, y, mantaLead(xn)], chord: chordAt(xn), thickness });
  }
  const white: RGB = [1, 1, 1];
  const xAt = (span: number) => stations[Math.round(span * (stations.length - 1))].lead[0];
  const disc = loftFin({
    stations,
    chordDirection: [0, 0, -1],
    normalDirection: [0, 1, 0],
    segments,
    color: () => white,
    uv: (span, chord, upper) => discUV(xAt(span), chord, upper),
  });
  // Flap weights: the body stays rigid, the wings bend beyond the body.
  const position = disc.getAttribute("position") as THREE.BufferAttribute;
  const flap = disc.getAttribute("aFlap") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const beyond = Math.max(Math.abs(x) - BODY_HALF, 0);
    const z = position.getZ(index);
    const xn = Math.min(Math.abs(x) / HALF_SPAN, 1);
    flap.setXYZ(index, Math.sign(x) * beyond, Math.min(beyond / (HALF_SPAN - BODY_HALF), 1), Math.min(Math.max((mantaLead(xn) - z) / chordAt(xn), 0), 1));
  }

  const black = rgb(0x15181b);
  const tailPoints: [number, number, number][] = [];
  for (let index = 0; index <= 10; index += 1) {
    const t = index / 10;
    tailPoints.push([0, 0.02 - 0.03 * t, -0.72 - 1.2 * t]);
  }
  const tail = setUV(loftTube(tailPoints, t => 0.035 * (1 - t) + 0.004, 6, () => black), NEUTRAL_U * 0.4, 0.75);
  // The small dorsal fin at the base of the tail.
  const dorsal = setUV(
    loftFin({
      stations: finStations([0, 0.03, -0.6], [0, 0.075, -0.09], [0, 0, -1], 4, t => 0.15 * (1 - 0.8 * t), () => 0.12),
      chordDirection: [0, 0, -1],
      normalDirection: [1, 0, 0],
      segments: 8,
      color: () => black,
    }),
    NEUTRAL_U * 0.4,
    0.75,
  );
  const eyes = [eye([0.37, 0.0, 0.4], 0.035, 1), eye([-0.37, 0.0, 0.4], 0.035, -1)].map(part => setUV(part, NEUTRAL_U * 0.4, 0.25));
  const fins = quality === "low" ? 3 : 4;
  const parts = [withMorph(fillColor(disc, white)), cephalicFin(1, fins), cephalicFin(-1, fins), withMorph(tail), withMorph(dorsal), ...eyes.map(part => withMorph(part))];
  return mergeParts(parts);
}

/** The manta's skin, painted in disc coordinates (x across, z along, upper or lower surface). */
export function mantaPattern(seed: number) {
  const charcoal = srgb(0x16191c);
  const slate = srgb(0x2b3236);
  const chevron = srgb(0xdfe3e1);
  const chevronGrey = srgb(0x7f878a);
  const belly = srgb(0xf0f1ec);
  const margin = srgb(0x40474b);
  const spot = srgb(0x23272a);
  const cell: Cell = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  // The gill slits: five transverse arcs on each side, shorter toward the back.
  const gill = (ax: number, z: number) => {
    let best = 99;
    for (let k = 0; k < 5; k += 1) {
      const z0 = 0.27 - k * 0.068;
      const length = 0.2 - k * 0.022;
      const t = Math.min(Math.max((ax - 0.12) / length, 0), 1);
      const cx = 0.12 + t * length;
      const cz = z0 - 0.05 * t * t + 0.02 * t;
      best = Math.min(best, Math.sqrt((ax - cx) ** 2 + (z - cz) ** 2) / (0.006 + 0.002 * Math.sin(t * Math.PI)));
    }
    return best;
  };
  // Tables of the planform across the span (the pattern reads them per texel).
  const steps = 4096;
  const leads = new Float32Array(steps + 1);
  const chords = new Float32Array(steps + 1);
  const trails = new Float32Array(steps + 1);
  for (let index = 0; index <= steps; index += 1) {
    leads[index] = mantaLead(index / steps);
    trails[index] = mantaTrail(index / steps);
    chords[index] = chordAt(index / steps);
  }
  return (u: number, v: number, out: Texel) => {
    if (u < NEUTRAL_U) {
      out.roughness = 0.42;
      return;
    }
    const x = ((u - NEUTRAL_U) / (1 - NEUTRAL_U) - 0.5) * 2 * HALF_SPAN;
    const ax = Math.abs(x);
    const xn = Math.min(ax / HALF_SPAN, 1);
    const upper = v < 0.5;
    const chordFraction = upper ? 2 * v : 2 * (1 - v);
    const slot = Math.round(xn * steps);
    const lead = leads[slot];
    const z = lead - chordFraction * chords[slot];
    const grain = fbm(x * 9 + seed, z * 9, 3, 4);
    // Fine dermal denticles and a little wrinkling.
    const fine = valueNoise(x * 420, z * 420, 11) * 0.5 + valueNoise(x * 160, z * 160, 12) * 0.5;
    out.height = fine * 0.35 + grain * 0.6;
    if (upper) {
      const shade = smooth(0.25, 0.8, grain);
      out.r = charcoal[0] + (slate[0] - charcoal[0]) * shade * 0.5;
      out.g = charcoal[1] + (slate[1] - charcoal[1]) * shade * 0.5;
      out.b = charcoal[2] + (slate[2] - charcoal[2]) * shade * 0.5;
      // Shoulder chevrons: a sharp front edge behind the spiracle, sweeping
      // out along the wing and curving back toward the midline, fading to grey.
      const warp = (fbm(x * 6, z * 6 + seed, 5, 3) - 0.5) * 0.08;
      const front = 0.3 - 0.36 * Math.max(ax - 0.3, 0) + warp;
      const depth = front - z;
      const inner = 0.31 - 0.24 * smooth(0.08, 0.55, depth) + warp * 0.5;
      const outer = 1.08 - 0.95 * smooth(0, 0.55, depth) + warp;
      const across = smooth(inner - 0.02, inner + 0.03, ax) * (1 - smooth(outer - 0.18, outer, ax));
      const along = smooth(-0.012, 0.012, depth) * (1 - smooth(0.16, 0.62, depth));
      const patch = across * along;
      if (patch > 0.001) {
        const fade = smooth(0.02, 0.4, depth + (grain - 0.5) * 0.15);
        const pale = [chevron[0] + (chevronGrey[0] - chevron[0]) * fade, chevron[1] + (chevronGrey[1] - chevron[1]) * fade, chevron[2] + (chevronGrey[2] - chevron[2]) * fade];
        const k = patch * (0.75 + 0.25 * grain);
        out.r += (pale[0] - out.r) * k;
        out.g += (pale[1] - out.g) * k;
        out.b += (pale[2] - out.b) * k;
      }
      // The spiracles, small slits just behind the eyes.
      const spiracle = Math.sqrt(((ax - 0.33) / 0.035) ** 2 + ((z - 0.29) / 0.012) ** 2);
      if (spiracle < 1.5) {
        const k = 1 - smooth(0.6, 1.5, spiracle);
        out.r *= 1 - 0.6 * k;
        out.g *= 1 - 0.6 * k;
        out.b *= 1 - 0.6 * k;
        out.height -= 1.5 * k;
        out.occlusion = 1 - 0.6 * k;
      }
      // A few pale scars from cookie-cutter bites and coral scrapes.
      worley(x * 3 + seed, z * 3, 21, 0.9, 0, 0, cell);
      if (cell.id > 0.93 && cell.f1 < 0.07) {
        const k = (1 - smooth(0.03, 0.07, cell.f1)) * 0.5;
        out.r += (0.55 - out.r) * k;
        out.g += (0.58 - out.g) * k;
        out.b += (0.6 - out.b) * k;
      }
      out.roughness = 0.34 + 0.12 * grain;
      return;
    }
    // Ventral side.
    out.r = belly[0];
    out.g = belly[1];
    out.b = belly[2];
    // Grey toward the wingtips and a dark band along the trailing edge.
    const fromTrail = z - trails[slot];
    const band = (1 - smooth(0.03 + 0.05 * xn, 0.1 + 0.12 * xn, fromTrail + (grain - 0.5) * 0.06)) * smooth(0.12, 0.35, xn);
    const tip = smooth(0.7, 1.0, xn + (grain - 0.5) * 0.12) * 0.75;
    const leadEdge = (1 - smooth(0.0, 0.03, lead - z)) * smooth(0.55, 0.9, xn) * 0.6;
    const dark = Math.min(Math.max(band, tip, leadEdge), 1);
    out.r += (margin[0] - out.r) * dark;
    out.g += (margin[1] - out.g) * dark;
    out.b += (margin[2] - out.b) * dark;
    // Soft grey shading over the belly.
    const tint = 1 - 0.08 * grain;
    out.r *= tint;
    out.g *= tint;
    out.b *= tint;
    // The mouth: a wide dark slot across the front of the head.
    if (ax < 0.19 && lead - z < 0.06) {
      const mouth = (1 - smooth(0.15, 0.19, ax)) * (1 - smooth(0.02, 0.04, lead - z));
      out.r += (0.07 - out.r) * mouth;
      out.g += (0.075 - out.g) * mouth;
      out.b += (0.08 - out.b) * mouth;
      out.height -= 2.5 * mouth;
      out.occlusion = 1 - 0.7 * mouth;
    }
    // Gill slits.
    if (ax > 0.1 && ax < 0.34 && z < 0.32 && z > -0.1) {
      const d = gill(ax, z);
      const slit = 1 - smooth(0.5, 1.6, d);
      out.r *= 1 - 0.55 * slit;
      out.g *= 1 - 0.55 * slit;
      out.b *= 1 - 0.55 * slit;
      out.height -= 2 * slit;
      out.occlusion = Math.min(out.occlusion, 1 - 0.5 * slit);
    }
    // The identifying spots: dense between the gill slits, scattered over the belly and wing roots.
    const region = Math.max((1 - smooth(0.1, 0.16, ax)) * smooth(-0.1, 0.0, z) * (1 - smooth(0.28, 0.34, z)), 0.45 * (1 - smooth(0.25, 0.5, ax)) * (1 - smooth(-0.05, 0.05, z)) * smooth(-0.75, -0.6, z), 0.07 * (1 - smooth(0.3, 0.8, xn)));
    if (region > 0.01) {
      worley(x * 22 + seed * 3, z * 22, 31, 0.9, 0, 0, cell);
      const radius = 0.16 + 0.22 * hashFraction(cell.id);
      const blob = radius + (valueNoise(x * 140, z * 140, 33) - 0.5) * 0.12;
      if (cell.id < region * 0.55 && cell.f1 < blob + 0.05) {
        const k = 1 - smooth(blob - 0.04, blob + 0.04, cell.f1);
        out.r += (spot[0] - out.r) * k;
        out.g += (spot[1] - out.g) * k;
        out.b += (spot[2] - out.b) * k;
      }
    }
    out.height *= 0.6;
    out.roughness = 0.4 + 0.1 * grain;
  };
}

function hashFraction(value: number) {
  return (value * 7.31) % 1;
}

/** Add the cephalic-fin blend to the swim deformation. */
function mantaDeform(base: VertexDeform, cephalic: THREE.IUniform<number>): VertexDeform {
  return {
    ...base,
    key: `${base.key}:alfredi-cephalic`,
    uniforms: { ...base.uniforms, uCephalic: cephalic },
    declarations: `${base.declarations}
attribute vec3 aCephalic;
attribute vec3 aCephalicNormal;
uniform float uCephalic;`,
    body: `
  if (dot(aCephalicNormal, aCephalicNormal) > 0.0) {
    p += aCephalic * uCephalic;
    n = normalize(mix(n, aCephalicNormal, uCephalic));
  }
${base.body}`,
  };
}

export const createManta: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const geometry = buildMantaGeometry(quality);
  const size = skinSize(quality);
  const skin = await bakeSkin({ width: size, height: size, normalStrength: size / 512 }, mantaPattern(random() * 40));
  const uniforms = createSwimUniforms({ uSwimAmp: 0, uSwimLength: 1.6, uSwimHeadZ: 0.7, uFlapAmp: 0.875, uFlapLag: Math.PI / 2, uFlapChord: 0.9 });
  const cephalic = { value: 0 };
  const deform = mantaDeform(swimDeform("manta", uniforms, { mode: "vertical", envelope: "fish" }), cephalic);
  const material = applyDeform(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: skin.map,
      normalMap: skin.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: skin.orm,
      aoMap: skin.orm,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
    }),
    deform,
    environment.patchMaterial,
  );
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
  // Fish et al. measured an average stroke of 0.31 Hz; vary it a little per bout.
  let flapPeriod = 3.2;
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
        flapPeriod = 2.8 + random() * 1;
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
      if (beating || !nearRest) flapPhase += (delta / (feeding ? 2.6 : flapPeriod)) * (beating ? 1 : 1.5);
      amplitude = damp(amplitude, beating ? (feeding ? 0.7 : 0.875) : 0.15, 1.5, delta);
      // The downstroke (phase 0.25 to 0.75) is quicker than the upstroke.
      const warped = flapPhase - (0.22 * Math.sin(flapPhase * TAU)) / TAU;
      uniforms.uFlapPhase.value = warped % 1000;
      uniforms.uFlapAmp.value = amplitude;
      // Cephalic fins unroll to funnel plankton while feeding, and roll up again to cruise.
      cephalic.value = damp(cephalic.value, feeding ? 1 : 0, feeding ? 0.9 : 0.5, delta);
      poseFromSwimmer(root, swimmer);
      // The body heaves against the wings.
      mesh.position.y = -loopRadius - 0.08 * Math.sin(warped * TAU) * (amplitude / 0.875);
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
      skin.map.dispose();
      skin.normalMap.dispose();
      skin.orm.dispose();
      mesh.customDepthMaterial?.dispose();
    },
  };
};
