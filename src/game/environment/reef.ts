/**
 * The coral reef: branching, brain, and table corals, sea fans that sway,
 * barrel and tube sponges, and anemones. Each kind is one instanced mesh with
 * per-instance color. Colors are muted, as living coral looks at 8-12 m.
 */
import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import {
  createAnemone,
  createBarrelSponge,
  createBranchingCoral,
  createBrainCoral,
  createSeaFan,
  createTableCoral,
  createTubeSponges,
} from "./corals";
import { Resources, addSway, createChunkedInstances, createInstancedMesh, createSwayUniforms, groundQuaternion, prepareMaterial, type InstanceSpec } from "./materials";
import { ROCK_SEED, placeReef, placeRocks, rockClearAreas, seabedNormal, type ReefKind } from "./placement";
import { createRandom, noise3, pick, range } from "./random";
import { createBrainCoralNormalMap, createSeaFanTexture } from "./textures";

/** The current runs toward the north-east here; fans grow across it. */
export const CURRENT_ANGLE = 0.7;

// Living coral under 10 m of water: muted, but not dark. The water removes the reds.
const hsl = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, Math.min(l * 1.15, 0.85), THREE.SRGBColorSpace);

const PALETTES: Record<ReefKind, THREE.Color[]> = {
  staghorn: [hsl(0.08, 0.35, 0.55), hsl(0.11, 0.4, 0.6), hsl(0.58, 0.25, 0.6), hsl(0.95, 0.3, 0.62)],
  bush: [hsl(0.97, 0.35, 0.62), hsl(0.08, 0.4, 0.55), hsl(0.3, 0.2, 0.5), hsl(0.78, 0.2, 0.55)],
  finger: [hsl(0.12, 0.35, 0.58), hsl(0.06, 0.4, 0.5), hsl(0.85, 0.22, 0.55)],
  brain: [hsl(0.17, 0.3, 0.5), hsl(0.1, 0.35, 0.5), hsl(0.25, 0.25, 0.45), hsl(0.07, 0.3, 0.42)],
  table: [hsl(0.1, 0.3, 0.55), hsl(0.15, 0.3, 0.5), hsl(0.55, 0.18, 0.55)],
  fan: [hsl(0.83, 0.4, 0.45), hsl(0.98, 0.45, 0.45), hsl(0.09, 0.55, 0.5), hsl(0.14, 0.5, 0.55)],
  barrel: [hsl(0.05, 0.4, 0.4), hsl(0.03, 0.3, 0.33), hsl(0.8, 0.15, 0.38)],
  tube: [hsl(0.78, 0.35, 0.45), hsl(0.1, 0.55, 0.5), hsl(0.55, 0.3, 0.5), hsl(0.95, 0.4, 0.45)],
  anemone: [hsl(0.9, 0.45, 0.6), hsl(0.3, 0.35, 0.6), hsl(0.1, 0.4, 0.75), hsl(0.07, 0.55, 0.55)],
};

const HEAD_COLORS = [hsl(0.08, 0.18, 0.5), hsl(0.05, 0.2, 0.46), hsl(0.11, 0.15, 0.52), hsl(0.95, 0.15, 0.5)];

/**
 * A reef head: a unit dome (radius 1, height 1) pushed inward by noise only
 * (at most 20%), so colonies placed at 80% of its smooth height are always on or in it.
 */
export function createReefHeadGeometry() {
  const geometry = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const dent = 1 - noise3(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.13 - noise3(x * 6, y * 6 + 3, z * 6) * 0.07;
    position.setXYZ(index, x * dent, y * dent - 0.03, z * dent);
    const patch = noise3(x * 4, y * 4, z * 4 + 2);
    color.setRGB(0.85, 0.82, 0.76).lerp(new THREE.Color(0.95, 0.62, 0.66), patch > 0.62 ? 0.5 : 0).multiplyScalar(0.75 + y * 0.3);
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const createReef: GameSystemFactory = async environment => {
  const resources = new Resources();
  const random = createRandom(9001);
  const rocks = placeRocks(createRandom(ROCK_SEED), environment.quality);
  const { heads, placements } = placeReef(createRandom(9002), environment.quality, rockClearAreas(rocks));
  const sway = createSwayUniforms();
  const group = new THREE.Group();
  group.name = "reef";
  const castShadow = environment.quality === "high";

  const brainNormal = createBrainCoralNormalMap(random);
  const fanTexture = createSeaFanTexture(random);
  const doubleSided = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const brainMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, normalMap: brainNormal, normalScale: new THREE.Vector2(1.4, 1.4) }));
  const fanMaterial = new THREE.MeshStandardMaterial({ map: fanTexture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  addSway(fanMaterial, sway, { key: "fan", amplitude: 0.06, lean: 0.02, period: 5.5, wave: 0.6, currentAngle: CURRENT_ANGLE, stiffness: 1.6 });
  prepareMaterial(environment, fanMaterial, "sway-fan");
  const tubeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  addSway(tubeMaterial, sway, { key: "tube", amplitude: 0.025, lean: 0, period: 4, currentAngle: CURRENT_ANGLE, stiffness: 2 });
  prepareMaterial(environment, tubeMaterial, "sway-tube");
  const anemoneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  addSway(anemoneMaterial, sway, { key: "anemone", amplitude: 0.05, lean: 0.02, period: 3.2, wave: 2.5, currentAngle: CURRENT_ANGLE, stiffness: 1.2 });
  prepareMaterial(environment, anemoneMaterial, "sway-anemone");

  const kinds: Record<ReefKind, { geometry: THREE.BufferGeometry; material: THREE.Material; follow: number; shadow: boolean }> = {
    staghorn: { geometry: createBranchingCoral(random, "staghorn"), material: doubleSided, follow: 0.25, shadow: true },
    bush: { geometry: createBranchingCoral(random, "bush"), material: doubleSided, follow: 0.3, shadow: true },
    finger: { geometry: createBranchingCoral(random, "finger"), material: doubleSided, follow: 0.2, shadow: true },
    brain: { geometry: createBrainCoral(), material: brainMaterial, follow: 0.9, shadow: true },
    table: { geometry: createTableCoral(random), material: doubleSided, follow: 0.15, shadow: true },
    fan: { geometry: createSeaFan(), material: fanMaterial, follow: 0.1, shadow: false },
    barrel: { geometry: createBarrelSponge(random), material: doubleSided, follow: 0.4, shadow: true },
    tube: { geometry: createTubeSponges(random, 5), material: tubeMaterial, follow: 0.3, shadow: false },
    anemone: { geometry: createAnemone(random), material: anemoneMaterial, follow: 0.6, shadow: false },
  };
  const specs = new Map<ReefKind, InstanceSpec[]>();
  for (const placement of placements) {
    let yaw = placement.yaw;
    // Sea fans grow across the current to sieve plankton from it.
    if (placement.kind === "fan") yaw = CURRENT_ANGLE + Math.PI / 2 + (random() - 0.5) * 0.5;
    const quaternion = groundQuaternion(placement.normal ?? seabedNormal(placement.x, placement.z), yaw, kinds[placement.kind].follow, { x: placement.tiltX, z: placement.tiltZ });
    const scale = new THREE.Vector3(1, 1, 1).multiplyScalar(placement.scale);
    if (placement.kind === "fan") scale.set(placement.scale * range(random, 0.9, 1.3), placement.scale, placement.scale);
    if (placement.kind === "brain") scale.y *= range(random, 0.75, 1.1);
    const color = pick(random, PALETTES[placement.kind]).clone().multiplyScalar(range(random, 0.85, 1.1));
    const list = specs.get(placement.kind) ?? [];
    list.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(placement.x, placement.y, placement.z), quaternion, scale), color });
    specs.set(placement.kind, list);
  }
  for (const [kind, settings] of Object.entries(kinds) as [ReefKind, (typeof kinds)[ReefKind]][]) {
    const list = specs.get(kind);
    if (!list?.length) {
      settings.geometry.dispose();
      continue;
    }
    for (const mesh of createChunkedInstances(settings.geometry, settings.material, list, 400)) {
      mesh.castShadow = castShadow && settings.shadow;
      mesh.receiveShadow = environment.quality !== "low";
      mesh.name = `reef-${kind}`;
      group.add(mesh);
    }
  }
  // The reef heads: domes of old coral rock, crusted with coralline algae.
  if (heads.length) {
    const domeMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: brainNormal, normalScale: new THREE.Vector2(0.5, 0.5) }));
    const domes = createInstancedMesh(createReefHeadGeometry(), domeMaterial, heads.map(head => ({
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(head.x, head.y, head.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
        new THREE.Vector3(head.radius, head.height, head.radius),
      ),
      color: pick(random, HEAD_COLORS).clone().multiplyScalar(range(random, 0.85, 1.1)),
    })));
    domes.name = "reef-heads";
    domes.castShadow = castShadow;
    domes.receiveShadow = environment.quality !== "low";
    group.add(domes);
  }
  resources.add(environment.scene, group);
  return {
    update(context) {
      sway.uSwayTime.value = context.time;
    },
    dispose() {
      resources.dispose();
    },
  };
};

export default createReef;
