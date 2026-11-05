/**
 * The giant kelp forest: Macrocystis stipes rise from clumped holdfasts to
 * just below the surface, with blades and gas floats along them, and trail a
 * canopy down-current at the top. They sway in the vertex shader.
 */
import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { MeshBuilder, composeMatrix, createRockGeometry } from "./geometry";
import { Resources, addSway, createInstancedMesh, createSwayUniforms, groundQuaternion, prepareMaterial, type InstanceSpec } from "./materials";
import { placeKelp, scaledCount, seabedNormal } from "./placement";
import { createRandom, range, type Random } from "./random";

/** Kelp leans toward this heading (radians, like a yaw): the current flows north-east. */
export const KELP_CURRENT = 0.7;

export const KELP_VARIANT_HEIGHTS = [14, 18, 22, 26] as const;

/** Pick the geometry variant for a stalk and the vertical stretch to fit it. */
export function kelpVariant(height: number) {
  let best = 0;
  for (let index = 1; index < KELP_VARIANT_HEIGHTS.length; index += 1) {
    if (Math.abs(Math.log(height / KELP_VARIANT_HEIGHTS[index])) < Math.abs(Math.log(height / KELP_VARIANT_HEIGHTS[best]))) best = index;
  }
  return { index: best, stretch: height / KELP_VARIANT_HEIGHTS[best] };
}

const STIPE = new THREE.Color(0.32, 0.26, 0.12);
const BLADE = new THREE.Color(0.5, 0.38, 0.13);
const BLADE_TIP = new THREE.Color(0.6, 0.48, 0.2);
const FLOAT = new THREE.Color(0.56, 0.46, 0.2);

/** A blade: a narrow, drooping strip with a gas float at its base. */
function bladeGeometry(length: number, width: number, droop: number) {
  const segments = 3;
  const positions: number[] = [];
  const point = (t: number, side: number) => {
    const along = t * length;
    const halfWidth = width * Math.sin(Math.PI * Math.min(t * 1.15 + 0.08, 1)) * 0.5;
    return [side * halfWidth, -droop * t * t, along];
  };
  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    const a = point(t0, -1);
    const b = point(t0, 1);
    const c = point(t1, 1);
    const d = point(t1, -1);
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** One stalk of the given height, its base at the origin; the canopy trails toward +z. */
export function createKelpGeometry(random: Random, height: number, lowDetail: boolean) {
  const builder = new MeshBuilder();
  const canopy = 3.2;
  const rise = height - 0.6;
  const path: THREE.Vector3[] = [];
  const steps = Math.ceil(height / (lowDetail ? 2 : 1));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const y = t * rise;
    // The top bends over into the canopy that lies along the surface.
    const bend = Math.max(0, (y - (rise - canopy)) / canopy);
    path.push(new THREE.Vector3(Math.sin(t * 5.1) * 0.25 * t, y - bend * bend * 0.6, Math.sin(t * 3.3) * 0.2 * t + bend * bend * canopy * 0.9));
  }
  const curve = new THREE.CatmullRomCurve3(path);
  const stipe = new THREE.TubeGeometry(curve, steps, 0.035, 3, false);
  builder.add(stipe, undefined, STIPE, (_point, local) => Math.min(Math.max(local.y / height, 0), 1));
  stipe.dispose();
  const float = new THREE.TetrahedronGeometry(0.06, 0);
  const spacing = lowDetail ? 1.6 : 1.25;
  const blades: number[] = [];
  for (let along = 1.2; along < rise - canopy; along += spacing * range(random, 0.8, 1.2)) blades.push(along / rise);
  for (let along = rise - canopy; along < rise; along += spacing * 0.45) blades.push(along / rise);
  blades.forEach((t, index) => {
    const base = curve.getPointAt(Math.min(t, 1));
    const tangent = curve.getTangentAt(Math.min(t, 1));
    const angle = index * 2.4 + random() * 0.6;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    // Blades point up and out from the stipe, and down-current in the canopy.
    const direction = outward.multiplyScalar(0.6).add(tangent.clone().multiplyScalar(0.9)).normalize();
    const length = range(random, 0.55, 0.95);
    const geometry = bladeGeometry(length, range(random, 0.15, 0.24), range(random, 0.05, 0.2));
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), random() * Math.PI));
    const matrix = new THREE.Matrix4().compose(base, quaternion, new THREE.Vector3(1, 1, 1));
    const weight = (point: THREE.Vector3) => Math.min(Math.max(point.y / height, 0), 1);
    builder.add(geometry, matrix, point => BLADE.clone().lerp(BLADE_TIP, Math.min(point.distanceTo(base) / length, 1)), weight);
    geometry.dispose();
    builder.add(float, composeMatrix(base.x, base.y, base.z), FLOAT, weight);
  });
  float.dispose();
  return builder.build({ weights: true });
}

const createKelp: GameSystemFactory = async environment => {
  const resources = new Resources();
  const random = createRandom(5150);
  const stalkCount = scaledCount(250, environment.quality);
  const { holdfasts, stalks } = placeKelp(createRandom(5151), stalkCount, KELP_CURRENT);
  const sway = createSwayUniforms();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  addSway(material, sway, { key: "kelp", amplitude: 0.7, lean: 1.4, period: 8, wave: 2.2, currentAngle: KELP_CURRENT, stiffness: 1.5 });
  prepareMaterial(environment, material, "sway-kelp");
  const group = new THREE.Group();
  group.name = "kelp";
  const lowDetail = environment.quality === "low";
  const variants = KELP_VARIANT_HEIGHTS.map(height => createKelpGeometry(random, height, lowDetail));
  const specs: InstanceSpec[][] = variants.map(() => []);
  for (const stalk of stalks) {
    const { index, stretch } = kelpVariant(stalk.height);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), stalk.yaw);
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(range(random, 0.8, 1.1));
    tint.g *= range(random, 0.92, 1.05);
    specs[index].push({
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(stalk.x, stalk.y, stalk.z), quaternion, new THREE.Vector3(1, stretch, 1)),
      color: tint,
    });
  }
  variants.forEach((geometry, index) => {
    if (!specs[index].length) {
      geometry.dispose();
      return;
    }
    const mesh = createInstancedMesh(geometry, material, specs[index]);
    mesh.name = `kelp-${KELP_VARIANT_HEIGHTS[index]}`;
    group.add(mesh);
  });
  // Holdfasts: knotted root masses gripping the rock.
  const holdfastGeometry = createRockGeometry(random, 1, 0.5);
  const holdfastMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.24, 0.12), roughness: 0.9 }));
  group.add(createInstancedMesh(holdfastGeometry, holdfastMaterial, holdfasts.map(holdfast => ({
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(holdfast.x, holdfast.y, holdfast.z),
      groundQuaternion(seabedNormal(holdfast.x, holdfast.z), random() * Math.PI * 2, 0.8),
      new THREE.Vector3(0.45, 0.3, 0.45).multiplyScalar(holdfast.scale),
    ),
  }))));
  resources.add(environment.scene, group);

  // The journal subject: a tall stalk near the middle of the forest.
  const kelpZone = { x: -150, z: -20 };
  const subject = stalks.reduce((best, stalk) =>
    Math.hypot(stalk.x - kelpZone.x, stalk.z - kelpZone.z) < Math.hypot(best.x - kelpZone.x, best.z - kelpZone.z) ? stalk : best, stalks[0]);
  if (subject) {
    environment.addDiscoverable({
      id: "giant-kelp",
      name: "Giant kelp",
      subtitle: "Macrocystis pyrifera",
      description:
        "Giant kelp is a brown alga, not a plant, and one of the fastest-growing organisms on Earth: a frond can grow up to half a meter a day. Gas-filled floats at the base of each blade hold the fronds up toward the light, and a root-like holdfast grips the rock. Kelp forests need cool, nutrient-rich water and shelter hundreds of species.",
      radius: 4,
      position: target => target.set(subject.x, Math.max(subject.y + subject.height * 0.45, -12), subject.z),
    });
  }
  return {
    update(context) {
      sway.uSwayTime.value = context.time;
    },
    dispose() {
      resources.dispose();
    },
  };
};

export default createKelp;
