/**
 * Sea floor detail on the sand: seagrass meadows that sway, starfish, and
 * shells. The staged seagrass.glb (CC BY 4.0) adds a few dense meadow cards
 * on the shallow sand near the start.
 */
import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { MeshBuilder, composeMatrix, smoothNormals } from "./geometry";
import { Resources, addSway, createChunkedInstances, createInstancedMesh, createSwayUniforms, groundQuaternion, prepareMaterial, type InstanceSpec } from "./materials";
import { loadBakedModel } from "./models";
import { KEEP_CLEAR, ROCK_SEED, groundY, insideClearArea, insideWreckArea, placeRocks, placeSeaFloor, rockClearAreas, scatter, seabedNormal, seagrassDensity, type Placement } from "./placement";
import { createRandom, pick, range, type Random } from "./random";

const CURRENT = 0.7;

/** A clump of seagrass blades: thin curved ribbons, weighted to sway at the tips. */
export function createGrassClump(random: Random, blades = 10) {
  const builder = new MeshBuilder();
  for (let blade = 0; blade < blades; blade += 1) {
    const height = range(random, 0.3, 0.65);
    const width = range(random, 0.018, 0.03);
    const angle = random() * Math.PI * 2;
    const offset = random() * 0.2;
    const lean = range(random, 0.05, 0.25);
    const baseX = Math.cos(angle) * offset;
    const baseZ = Math.sin(angle) * offset;
    const facing = random() * Math.PI;
    const segments = 3;
    const positions: number[] = [];
    const point = (t: number, side: number) => {
      const curl = lean * t * t;
      return [
        baseX + Math.cos(angle) * curl + Math.cos(facing) * side * width * (1 - t * 0.7),
        t * height,
        baseZ + Math.sin(angle) * curl + Math.sin(facing) * side * width * (1 - t * 0.7),
      ];
    };
    for (let segment = 0; segment < segments; segment += 1) {
      const t0 = segment / segments;
      const t1 = (segment + 1) / segments;
      positions.push(...point(t0, -1), ...point(t0, 1), ...point(t1, 1), ...point(t0, -1), ...point(t1, 1), ...point(t1, -1));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    // Grass normals point up-ish so the meadow is lit like a surface.
    const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
    for (let index = 0; index < normal.count; index += 1) {
      const n = new THREE.Vector3(normal.getX(index), normal.getY(index), normal.getZ(index)).lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize();
      normal.setXYZ(index, n.x, n.y, n.z);
    }
    builder.add(geometry, undefined, local => new THREE.Color(0.24, 0.32, 0.14).lerp(new THREE.Color(0.42, 0.48, 0.22), local.y / height), (_point, local) => local.y / 0.65);
    geometry.dispose();
  }
  return builder.build({ weights: true });
}

/** A five-armed sea star, flat underneath with a raised center. */
export function createStarfish() {
  const positions: number[] = [];
  const arms = 5;
  const rim = (index: number) => {
    const angle = (index / (arms * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? 1 : 0.3;
    return [Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius];
  };
  const middle = (index: number) => {
    const angle = (index / (arms * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? 0.5 : 0.18;
    return [Math.cos(angle) * radius, index % 2 === 0 ? 0.1 : 0.12, Math.sin(angle) * radius];
  };
  const center = [0, 0.16, 0];
  for (let index = 0; index < arms * 2; index += 1) {
    const next = (index + 1) % (arms * 2);
    positions.push(...center, ...middle(next), ...middle(index));
    positions.push(...middle(index), ...middle(next), ...rim(next));
    positions.push(...middle(index), ...rim(next), ...rim(index));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return smoothNormals(geometry);
}

/** A conch-like spiral shell. */
export function createConch() {
  const profile: THREE.Vector2[] = [];
  for (let index = 0; index <= 8; index += 1) {
    const t = index / 8;
    profile.push(new THREE.Vector2(Math.sin(t * Math.PI) * (0.5 - t * 0.3) + 0.02, t * 1.2 - 0.1));
  }
  const geometry = new THREE.LatheGeometry(profile, 9);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    const ridge = 1 + Math.sin(y * 18) * 0.06;
    position.setX(index, position.getX(index) * ridge);
    position.setZ(index, position.getZ(index) * ridge);
  }
  geometry.rotateZ(Math.PI / 2 - 0.1);
  geometry.translate(0, 0.32, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** A ribbed cockle or scallop half-shell lying cup-down. */
export function createCockle() {
  const geometry = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const rib = 1 + Math.cos(angle * 12) * 0.04;
    position.setXYZ(index, x * rib, position.getY(index) * 0.4, z * rib * 0.9);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const STAR_COLORS = [new THREE.Color(0.65, 0.2, 0.12), new THREE.Color(0.72, 0.42, 0.15), new THREE.Color(0.25, 0.35, 0.6), new THREE.Color(0.5, 0.2, 0.35), new THREE.Color(0.75, 0.6, 0.4)];
const SHELL_COLORS = [new THREE.Color(0.85, 0.78, 0.66), new THREE.Color(0.75, 0.55, 0.42), new THREE.Color(0.6, 0.55, 0.5), new THREE.Color(0.9, 0.85, 0.8)];

function toSpecs(random: Random, placements: Placement[], colors: THREE.Color[] | null, follow: number, sizes: THREE.Vector3) {
  return placements.map(placement => ({
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(placement.x, placement.y, placement.z),
      groundQuaternion(seabedNormal(placement.x, placement.z), placement.yaw, follow),
      sizes.clone().multiplyScalar(placement.scale),
    ),
    color: colors ? pick(random, colors).clone().multiplyScalar(range(random, 0.85, 1.1)) : undefined,
  }));
}

const createSeaFloor: GameSystemFactory = async environment => {
  const resources = new Resources();
  const random = createRandom(31337);
  const rocks = placeRocks(createRandom(ROCK_SEED), environment.quality);
  const layout = placeSeaFloor(createRandom(31338), environment.quality, rockClearAreas(rocks));
  const sway = createSwayUniforms();
  const group = new THREE.Group();
  group.name = "seafloor";
  const receive = environment.quality !== "low";

  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  addSway(grassMaterial, sway, { key: "grass", amplitude: 0.07, lean: 0.06, period: 4.5, wave: 1, currentAngle: CURRENT, stiffness: 1.8 });
  prepareMaterial(environment, grassMaterial, "sway-grass");
  const grassSpecs: InstanceSpec[] = layout.grass.map(placement => ({
    matrix: composeMatrix(placement.x, placement.y, placement.z, new THREE.Euler(0, placement.yaw, 0), placement.scale),
    color: new THREE.Color(1, 1, 1).multiplyScalar(range(random, 0.8, 1.15)),
  }));
  const grassGeometry = createGrassClump(random, environment.quality === "low" ? 6 : 8);
  for (const mesh of createChunkedInstances(grassGeometry, grassMaterial, grassSpecs, 60)) {
    mesh.name = "seafloor-grass";
    mesh.receiveShadow = receive;
    group.add(mesh);
  }

  const solid = prepareMaterial(environment, new THREE.MeshStandardMaterial({ roughness: 0.75 }));
  const starfish = createInstancedMesh(createStarfish(), solid, toSpecs(random, layout.starfish, STAR_COLORS, 1, new THREE.Vector3(0.11, 0.1, 0.11)));
  const conch = createInstancedMesh(createConch(), solid, toSpecs(random, layout.conch, SHELL_COLORS, 1, new THREE.Vector3(0.12, 0.12, 0.12)));
  const cockle = createInstancedMesh(createCockle(), solid, toSpecs(random, layout.cockle, SHELL_COLORS, 1, new THREE.Vector3(0.05, 0.05, 0.05)));
  starfish.name = "seafloor-starfish";
  conch.name = "seafloor-conch";
  group.add(starfish, conch, cockle);

  // Dense meadow cards from the staged model, on the shallow sand near the start.
  const meadowCount = environment.quality === "high" ? 1 : 0;
  if (meadowCount > 0) {
    const meadow = await loadBakedModel(environment, "seagrass.glb", { scale: 0.6 });
    if (meadow) {
      const position = meadow.geometry.getAttribute("position");
      const weights = new Float32Array(position.count);
      for (let index = 0; index < position.count; index += 1) weights[index] = Math.min(Math.max(position.getY(index) / Math.max(meadow.size.y, 0.01), 0), 1);
      meadow.geometry.setAttribute("swayWeight", new THREE.BufferAttribute(weights, 1));
      addSway(meadow.material, sway, { key: "meadow", amplitude: 0.08, lean: 0.06, period: 4.5, wave: 1, currentAngle: CURRENT, stiffness: 1.5 });
      prepareMaterial(environment, meadow.material, "sway-meadow");
      const sites = scatter({
        random: createRandom(31339),
        count: meadowCount,
        center: { x: 15, z: -105 },
        radius: 45,
        spacing: 16,
        maxAttempts: 2000,
        accept: (x, z) => seagrassDensity(x, z) > 0.4 && !insideWreckArea(x, z, 8) && !insideClearArea(x, z, 8, KEEP_CLEAR),
      });
      const specs = sites.map(site => ({
        matrix: composeMatrix(site.x, groundY(site.x, site.z, 4) - 0.05, site.z, new THREE.Euler(0, random() * Math.PI * 2, 0), range(random, 0.85, 1.15)),
      }));
      if (specs.length) {
        const mesh = createInstancedMesh(meadow.geometry, meadow.material, specs);
        mesh.receiveShadow = receive;
        group.add(mesh);
      } else {
        meadow.geometry.dispose();
        meadow.material.dispose();
      }
    }
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

export default createSeaFloor;
