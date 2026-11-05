/**
 * Fish schools: CPU boids (see boids.ts) drawn as instanced meshes that bend
 * with a body wave in the vertex shader, one draw call per school and level of detail.
 *
 * Species and where they live:
 * - Pacific sardines: a bait ball by the drop-off (procedural).
 * - Bigeye trevally (jacks): a slow tornado above the wreck (procedural).
 * - Grey snapper: around the wreck (model: grey_snapper.glb, CC BY 4.0).
 * - Barramundi: on the reef edge (model: barramundi.glb, CC0).
 * - Yellow tang and blue tang: over the reef (model: tropical_fish.glb, CC BY 4.0).
 * - Blacksmith: in the kelp forest (procedural).
 *
 * Model fish get a simplified far mesh for distant instances. If a model does
 * not load, the school falls back to a procedural body in the species' colours.
 */

import * as THREE from "three";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import type { GameEnvironment, GameQuality, GameSystemFactory } from "../types";
import { DEFAULT_SCHOOL, School, type SchoolParams, type SchoolThreat } from "./boids";
import { buildProceduralFish, type ProceduralShape } from "./fishGeometry";
import { mixRGB, noise3, rgb, scaleRGB } from "./geometry";
import { smoothstep } from "./motion";
import { BOTTOM, SCHOOL_HOMES, type SchoolHome } from "./routes";
import { createSeabedCache, loadModel, predatorList, toFloatGeometry } from "./shared";
import { applyDeform, createSwimUniforms, swimDeform } from "./swimMaterial";

type ModelSource = {
  url: string;
  /** Name of the mesh in the file; the first mesh if absent. */
  mesh?: string;
  /** How many fish sit side by side along x in the mesh (the first one is used). */
  copies?: number;
  /** Far-mesh vertex fraction kept by simplification. */
  farFraction: number;
};

type FishSpecies = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  /** Fish length (m). */
  length: number;
  counts: Record<GameQuality, number>;
  home: SchoolHome;
  params: Partial<SchoolParams>;
  shape: ProceduralShape;
  model?: ModelSource;
  material: { roughness: number; metalness: number };
  /** Photo subject radius (m): roughly the school's core. */
  radius: number;
};

const silver = rgb(0xc9d3d9);
const white = rgb(0xe8ecec);

const SPECIES: FishSpecies[] = [
  {
    id: "pacific-sardine",
    name: "Pacific sardine",
    subtitle: "Sardinops sagax",
    description:
      "Pacific sardines gather in schools of many thousands and strain plankton from the water with their gill rakers. Each fish keeps station by watching its nearest neighbours and sensing their wakes with its lateral line, so the whole school can turn in a fraction of a second. When predators attack, the school packs into a tight bait ball.",
    length: 0.18,
    counts: { high: 560, medium: 260, low: 90 },
    home: SCHOOL_HOMES.sardines,
    params: { cruise: 2, homeRadius: 3, weights: { ...DEFAULT_SCHOOL.weights, home: 0.7 } },
    shape: {
      depth: 0.19,
      width: 0.055,
      deepest: 0.35,
      fork: 0.75,
      fin: rgb(0x8d9aa2),
      pattern: (s, angle, height) => {
        let color = mixRGB(white, silver, smoothstep(-0.6, 0.1, height));
        color = mixRGB(color, rgb(0x1f3f5c), smoothstep(0.25, 0.6, height));
        // A row of dark spots along the upper flank.
        const spot = s > 0.22 && s < 0.62 && Math.abs(height - 0.18) < 0.09 && Math.abs(((s - 0.22) / 0.06) % 1 - 0.5) < 0.22;
        return spot ? scaleRGB(color, 0.25) : color;
      },
    },
    material: { roughness: 0.28, metalness: 0.65 },
    radius: 3.5,
  },
  {
    id: "bigeye-trevally",
    name: "Bigeye trevally",
    subtitle: "Caranx sexfasciatus",
    description:
      "Bigeye trevally form large, slow schools by day, often circling over reef edges and wrecks in a rotating 'tornado'. At night they spread out to hunt fish and crustaceans. They grow to about 85 cm and have a row of hard scutes along the tail.",
    length: 0.6,
    counts: { high: 260, medium: 120, low: 40 },
    home: SCHOOL_HOMES.jacks,
    params: { cruise: 0.9, homeRadius: 4, swirl: 0.9, weights: { ...DEFAULT_SCHOOL.weights, home: 0.6 } },
    shape: {
      depth: 0.3,
      width: 0.07,
      deepest: 0.32,
      fork: 0.85,
      fin: rgb(0x6f7a72),
      pattern: (s, _angle, height) => {
        let color = mixRGB(white, silver, smoothstep(-0.5, 0.2, height));
        color = mixRGB(color, rgb(0x3e4f5a), smoothstep(0.3, 0.75, height));
        // The dark scute line on the tail stock and a yellowish tail.
        if (s > 0.68 && s < 0.9 && Math.abs(height) < 0.18) color = scaleRGB(color, 0.45);
        if (s > 0.9) color = mixRGB(color, rgb(0x9a9358), 0.5);
        return color;
      },
    },
    material: { roughness: 0.3, metalness: 0.55 },
    radius: 4,
  },
  {
    id: "grey-snapper",
    name: "Grey snapper",
    subtitle: "Lutjanus griseus",
    description:
      "Grey snapper, also called mangrove snapper, gather in loose schools around wrecks, reefs and mangrove roots by day and hunt at night for fish, shrimp and crabs. Young fish grow up among mangroves and seagrass before moving out to the reefs. They can live for more than 20 years.",
    length: 0.42,
    counts: { high: 120, medium: 60, low: 22 },
    home: SCHOOL_HOMES.snapper,
    params: { cruise: 0.7, homeRadius: 6 },
    shape: {
      depth: 0.32,
      width: 0.09,
      deepest: 0.35,
      fork: 0.25,
      fin: rgb(0x8a6b5c),
      pattern: (_s, _angle, height) => mixRGB(rgb(0xbdb7ae), rgb(0x55524f), smoothstep(-0.3, 0.6, height)),
    },
    model: { url: "/game/models/grey_snapper.glb", farFraction: 0.3 },
    material: { roughness: 0.45, metalness: 0.15 },
    radius: 2.5,
  },
  {
    id: "barramundi",
    name: "Barramundi",
    subtitle: "Lates calcarifer",
    description:
      "Barramundi live in coastal waters, estuaries and rivers from the Persian Gulf to northern Australia, and gather around reefs and snags. Most are born male and become female at about five years old. They grow to more than 1.5 m.",
    length: 0.64,
    counts: { high: 80, medium: 36, low: 14 },
    home: SCHOOL_HOMES.barramundi,
    params: { cruise: 0.7, homeRadius: 5 },
    shape: {
      depth: 0.28,
      width: 0.09,
      deepest: 0.38,
      fork: 0,
      fin: rgb(0x7c7a70),
      pattern: (_s, _angle, height) => mixRGB(rgb(0xc8c8c0), rgb(0x5d625e), smoothstep(-0.2, 0.6, height)),
    },
    model: { url: "/game/models/barramundi.glb", farFraction: 0.25 },
    material: { roughness: 0.4, metalness: 0.2 },
    radius: 2.5,
  },
  {
    id: "yellow-tang",
    name: "Yellow tang",
    subtitle: "Zebrasoma flavescens",
    description:
      "Yellow tangs graze algae on Pacific reefs, often in loose groups. Like all surgeonfish they carry a sharp, scalpel-like spine at the base of the tail. At night the bright yellow fades and a pale stripe appears along the side.",
    length: 0.18,
    counts: { high: 130, medium: 60, low: 22 },
    home: SCHOOL_HOMES.yellowTang,
    params: { cruise: 1.2, homeRadius: 4 },
    shape: {
      depth: 0.62,
      width: 0.06,
      deepest: 0.4,
      fork: 0,
      fin: rgb(0xf2c618),
      pattern: () => rgb(0xf4cc1a),
    },
    model: { url: "/game/models/tropical_fish.glb", mesh: "yellow_tang", copies: 2, farFraction: 0.35 },
    material: { roughness: 0.5, metalness: 0 },
    radius: 1.5,
  },
  {
    id: "blue-tang",
    name: "Blue tang",
    subtitle: "Paracanthurus hepatus",
    description:
      "The blue tang, or palette surgeonfish, lives on Indo-Pacific reefs, where groups shelter among branching corals and feed on plankton above them. Its royal blue body carries a black 'palette' mark, and a yellow tail hides its defensive spine.",
    length: 0.22,
    counts: { high: 110, medium: 50, low: 20 },
    home: SCHOOL_HOMES.blueTang,
    params: { cruise: 1.2, homeRadius: 4 },
    shape: {
      depth: 0.5,
      width: 0.06,
      deepest: 0.4,
      fork: 0,
      fin: rgb(0x1a2a8a),
      pattern: (s, _angle, height) => (s > 0.88 ? rgb(0xf0c020) : height > 0.1 && s > 0.2 && s < 0.8 ? rgb(0x0d1030) : rgb(0x2050c8)),
    },
    model: { url: "/game/models/tropical_fish.glb", mesh: "blue_tang", copies: 2, farFraction: 0.35 },
    material: { roughness: 0.5, metalness: 0 },
    radius: 1.5,
  },
  {
    id: "blacksmith",
    name: "Blacksmith",
    subtitle: "Chromis punctipinnis",
    description:
      "Blacksmiths are damselfish of the Californian kelp forests that hover in loose groups in the current and pick zooplankton from the water. At night they shelter in crevices on the rocky bottom. Adults are dark blue-grey with black spots on the rear of the body.",
    length: 0.25,
    counts: { high: 240, medium: 114, low: 42 },
    home: SCHOOL_HOMES.blacksmith,
    params: { cruise: 1, homeRadius: 7 },
    shape: {
      depth: 0.4,
      width: 0.07,
      deepest: 0.38,
      fork: 0.5,
      fin: rgb(0x2c3442),
      pattern: (s, angle, height) => {
        const base = mixRGB(rgb(0x6f7f94), rgb(0x34404f), smoothstep(-0.4, 0.4, height));
        const spot = s > 0.5 && s < 0.85 && noise3(s * 40, height * 12, Math.sign(Math.sin(angle))) > 0.72;
        return spot ? rgb(0x0b0d12) : base;
      },
    },
    material: { roughness: 0.45, metalness: 0.05 },
    radius: 2.5,
  },
];

const modelCache = new Map<string, ReturnType<typeof loadModel>>();

/** Extract one fish from a model file as a unit-length geometry with its head along +z. */
async function loadModelFish(environment: GameEnvironment, source: ModelSource) {
  let pending = modelCache.get(source.url);
  if (!pending) {
    pending = loadModel(environment, source.url);
    modelCache.set(source.url, pending);
  }
  const gltf = await pending;
  gltf.scene.updateMatrixWorld(true);
  let found: THREE.Mesh | null = null;
  gltf.scene.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!found && mesh.isMesh && (!source.mesh || mesh.name === source.mesh)) found = mesh;
  });
  const mesh = found as THREE.Mesh | null;
  if (!mesh) throw new Error(`No fish mesh in ${source.url}`);
  let geometry = toFloatGeometry(mesh.geometry, ["position", "normal", "uv", "color", "tangent"]);
  geometry.applyMatrix4(mesh.matrixWorld);
  const copies = source.copies ?? 1;
  if (copies > 1) geometry = firstCopyAlongX(geometry, copies);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(1 / size.z, 1 / size.z, 1 / size.z);
  addZeroFlap(geometry);
  // Keep the source material's maps; the shader is replaced by our standard material.
  const sourceMaterial = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  return { geometry, sourceMaterial, gltf };
}

/** Keep the triangles of the first of several fish laid side by side along x. */
function firstCopyAlongX(geometry: THREE.BufferGeometry, copies: number) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  const limit = box.min.x + (box.max.x - box.min.x) / copies;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) throw new Error("The fish model must be indexed");
  const keep: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if ((position.getX(a) + position.getX(b) + position.getX(c)) / 3 < limit) keep.push(a, b, c);
  }
  // Compact the vertices.
  const remap = new Map<number, number>();
  const order: number[] = [];
  const indices = keep.map(vertex => {
    let mapped = remap.get(vertex);
    if (mapped === undefined) {
      mapped = order.length;
      remap.set(vertex, mapped);
      order.push(vertex);
    }
    return mapped;
  });
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize;
    const array = new Float32Array(order.length * size);
    order.forEach((vertex, i) => {
      for (let k = 0; k < size; k += 1) array[i * size + k] = attribute.array[vertex * size + k];
    });
    result.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  result.setIndex(indices);
  geometry.dispose();
  return result;
}

function addZeroFlap(geometry: THREE.BufferGeometry) {
  if (!geometry.getAttribute("aFlap")) {
    geometry.setAttribute("aFlap", new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 3), 3));
  }
}

/** A simplified copy for far fish, or null if simplification fails. */
function simplify(geometry: THREE.BufferGeometry, fraction: number) {
  try {
    const source = geometry.clone();
    source.deleteAttribute("aFlap");
    const count = source.getAttribute("position").count;
    const result = new SimplifyModifier().modify(source, Math.floor(count * (1 - fraction)));
    source.dispose();
    // Unwelded meshes can collapse to nothing; keep the full mesh for those.
    if (result.getAttribute("position").count < count * fraction * 0.3) {
      result.dispose();
      return null;
    }
    addZeroFlap(result);
    if (!result.getAttribute("normal")) result.computeVertexNormals();
    return result;
  } catch (error) {
    console.warn("A fish far mesh could not be simplified", error);
    return null;
  }
}

type Lod = { mesh: THREE.InstancedMesh; swim: THREE.InstancedBufferAttribute; geometry: THREE.BufferGeometry };

type SchoolRuntime = {
  species: FishSpecies;
  school: School;
  near: Lod;
  far: Lod | null;
  material: THREE.Material;
  home: { x: number; y: number; z: number };
  angle: number;
  accumulated: number;
  sourceAssets: { dispose: () => void } | null;
};

const FAR_DISTANCE = 16;
const SLEEP_DISTANCE = 110;

function makeLod(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string): Lod {
  const swim = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  swim.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aSwim", swim);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return { mesh, swim, geometry };
}

async function buildSchool(environment: GameEnvironment, species: FishSpecies, seabed: (x: number, z: number) => number): Promise<SchoolRuntime> {
  const count = species.counts[environment.quality];
  let geometry: THREE.BufferGeometry;
  let farGeometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial;
  let sourceAssets: SchoolRuntime["sourceAssets"] = null;
  const uniforms = createSwimUniforms({ uSwimAmp: 0.09, uSwimWavelength: 1, uSwimLength: 1, uSwimHeadZ: 0.5 });
  try {
    if (!species.model) throw new Error("procedural");
    const loaded = await loadModelFish(environment, species.model);
    geometry = loaded.geometry;
    const source = loaded.sourceMaterial;
    material = new THREE.MeshStandardMaterial({
      map: source.map ?? null,
      normalMap: source.normalMap ?? null,
      roughnessMap: source.roughnessMap ?? null,
      metalnessMap: source.metalnessMap ?? null,
      aoMap: source.aoMap ?? null,
      color: source.color ?? new THREE.Color(1, 1, 1),
      vertexColors: !!geometry.getAttribute("color"),
      roughness: species.material.roughness,
      metalness: source.metalnessMap ? 1 : species.material.metalness,
      side: THREE.DoubleSide,
    });
    if (geometry.getAttribute("color") && !source.vertexColors) geometry.deleteAttribute("color");
    material.vertexColors = !!geometry.getAttribute("color");
    const triangles = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
    if (environment.quality !== "low" && triangles > 1500) farGeometry = simplify(geometry, species.model.farFraction);
    const gltf = loaded.gltf;
    sourceAssets = {
      dispose: () =>
        gltf.scene.traverse(child => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const item of list) {
            for (const value of Object.values(item)) if (value instanceof THREE.Texture) value.dispose();
            item.dispose();
          }
        }),
    };
  } catch (error) {
    if (species.model) console.warn(`The ${species.name} model did not load; drawing procedural fish`, error);
    geometry = buildProceduralFish(species.shape, environment.quality === "low" ? "low" : "high");
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: species.material.roughness, metalness: species.material.metalness, side: THREE.DoubleSide });
  }
  applyDeform(material, swimDeform(`fish-${species.id}`, uniforms, { mode: "lateral", envelope: "fish", instanced: true }), environment.patchMaterial);
  const home = resolveHome(species.home, 0, seabed);
  const school = new School({ ...DEFAULT_SCHOOL, count, length: species.length, ...species.params }, home, environment.random);
  const near = makeLod(geometry, material, count, `${species.id}-school`);
  const far = farGeometry ? makeLod(farGeometry, material, count, `${species.id}-school-far`) : null;
  environment.scene.add(near.mesh);
  if (far) environment.scene.add(far.mesh);
  return { species, school, near, far, material, home, angle: environment.random() * Math.PI * 2, accumulated: 0, sourceAssets };
}

/** The home point of a school at its drift angle; BOTTOM homes sit 2 m above the seabed. */
function resolveHome(home: SchoolHome, angle: number, seabed: (x: number, z: number) => number, target = { x: 0, y: 0, z: 0 }) {
  target.x = home.x + Math.cos(angle) * home.radius;
  target.z = home.z + Math.sin(angle) * home.radius;
  const floor = seabed(target.x, target.z);
  target.y = home.y === BOTTOM ? floor + 2 : Math.max(home.y, floor + 2.5);
  target.y = Math.min(target.y, -1.5);
  return target;
}

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

/** Write the instance matrices and swim attributes for the fish, split by distance into near and far meshes. */
function writeInstances(runtime: SchoolRuntime, camera: THREE.Vector3) {
  const { school, near, far, species } = runtime;
  const positions = school.positions;
  const velocities = school.velocities;
  let nearCount = 0;
  let farCount = 0;
  const center = school.center();
  let radius = 0;
  const far2 = FAR_DISTANCE * FAR_DISTANCE;
  for (let i = 0; i < school.count; i += 1) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    forward.set(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();
    right.crossVectors(worldUp, forward);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(forward, right);
    // Bank into the turn.
    const roll = school.rolls[i];
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const rx = right.x * cos + up.x * sin;
    const ry = right.y * cos + up.y * sin;
    const rz = right.z * cos + up.z * sin;
    const ux = up.x * cos - right.x * sin;
    const uy = up.y * cos - right.y * sin;
    const uz = up.z * cos - right.z * sin;
    const scale = species.length * school.sizes[i];
    const dx = px - camera.x;
    const dy = py - camera.y;
    const dz = pz - camera.z;
    const useFar = far && dx * dx + dy * dy + dz * dz > far2;
    const lod = useFar && far ? far : near;
    const slot = useFar ? farCount++ : nearCount++;
    const e = lod.mesh.instanceMatrix.array as Float32Array;
    const o = slot * 16;
    e[o] = rx * scale;
    e[o + 1] = ry * scale;
    e[o + 2] = rz * scale;
    e[o + 3] = 0;
    e[o + 4] = ux * scale;
    e[o + 5] = uy * scale;
    e[o + 6] = uz * scale;
    e[o + 7] = 0;
    e[o + 8] = forward.x * scale;
    e[o + 9] = forward.y * scale;
    e[o + 10] = forward.z * scale;
    e[o + 11] = 0;
    e[o + 12] = px;
    e[o + 13] = py;
    e[o + 14] = pz;
    e[o + 15] = 1;
    const swim = lod.swim.array as Float32Array;
    swim[slot * 2] = school.phases[i];
    swim[slot * 2 + 1] = school.amplitudes[i];
    radius = Math.max(radius, Math.abs(px - center.x), Math.abs(py - center.y), Math.abs(pz - center.z));
  }
  for (const [lod, count] of [[near, nearCount], [far, farCount]] as const) {
    if (!lod) continue;
    lod.mesh.count = count;
    lod.mesh.instanceMatrix.clearUpdateRanges();
    lod.mesh.instanceMatrix.addUpdateRange(0, count * 16);
    lod.mesh.instanceMatrix.needsUpdate = true;
    lod.swim.clearUpdateRanges();
    lod.swim.addUpdateRange(0, count * 2);
    lod.swim.needsUpdate = true;
    lod.mesh.boundingSphere?.center.set(center.x, center.y, center.z);
    if (lod.mesh.boundingSphere) lod.mesh.boundingSphere.radius = radius * 1.75 + species.length * 2;
  }
}

export const createFishSchools: GameSystemFactory = async environment => {
  const seabed = createSeabedCache(environment.seabedHeight);
  const runtimes = (await Promise.all(SPECIES.map(species => buildSchool(environment, species, seabed).catch(error => {
    console.warn(`The ${species.name} school did not load`, error);
    return null;
  })))).filter((runtime): runtime is SchoolRuntime => runtime !== null);

  for (const runtime of runtimes) {
    const { species, school } = runtime;
    environment.addDiscoverable({
      id: species.id,
      name: species.name,
      subtitle: species.subtitle,
      description: species.description,
      radius: species.radius,
      position: target => {
        const center = school.center();
        return target.set(center.x, center.y, center.z);
      },
    });
  }

  const limits = { floor: 0, ceiling: -0.8 };
  const bounds = (x: number, z: number) => {
    limits.floor = seabed(x, z) + 0.8;
    return limits;
  };
  const threats: SchoolThreat[] = [];
  const cameraPosition = new THREE.Vector3();
  // Settle the schools before the first frame.
  for (const runtime of runtimes) {
    for (let step = 0; step < 30; step += 1) runtime.school.step(0.05, runtime.home, [], bounds);
    writeInstances(runtime, new THREE.Vector3(1e4, 0, 0));
  }

  return {
    update: ({ delta, camera }) => {
      cameraPosition.copy(camera.position);
      threats.length = 0;
      for (const threat of environment.threats()) {
        // Fish let a diver come within a few meters before they move off.
        threats.push({ x: threat.position.x, y: threat.position.y, z: threat.position.z, radius: threat.radius * 0.45 });
      }
      for (const predator of predatorList()) threats.push({ x: predator.position.x, y: predator.position.y, z: predator.position.z, radius: predator.radius });
      for (const runtime of runtimes) {
        const { school, species } = runtime;
        if (delta > 0) {
          runtime.angle += (species.home.drift / Math.max(species.home.radius, 1)) * delta;
          resolveHome(species.home, runtime.angle, seabed, runtime.home);
        }
        const center = school.center();
        const distance = Math.hypot(center.x - cameraPosition.x, center.y - cameraPosition.y, center.z - cameraPosition.z);
        const asleep = distance > SLEEP_DISTANCE;
        runtime.near.mesh.visible = !asleep;
        if (runtime.far) runtime.far.mesh.visible = !asleep;
        runtime.accumulated += delta;
        // Far schools step at a quarter rate; they are out of sight in the haze.
        const interval = asleep ? 0.25 : 0;
        if (runtime.accumulated > interval) {
          school.step(Math.min(runtime.accumulated, 0.1), runtime.home, threats, bounds);
          runtime.accumulated = 0;
          if (!asleep) writeInstances(runtime, cameraPosition);
        }
      }
    },
    dispose: () => {
      modelCache.clear();
      for (const runtime of runtimes) {
        for (const lod of [runtime.near, runtime.far]) {
          if (!lod) continue;
          lod.mesh.removeFromParent();
          lod.mesh.dispose();
          lod.geometry.dispose();
        }
        for (const value of Object.values(runtime.material)) if (value instanceof THREE.Texture) value.dispose();
        runtime.material.dispose();
        runtime.sourceAssets?.dispose();
      }
    },
  };
};
