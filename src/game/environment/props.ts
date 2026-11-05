/**
 * Discoverable things on the sea floor: a lost admiralty anchor with its
 * chain, a field of Roman amphorae, a strongbox by the wreck that glints,
 * and a giant clam on the reef that closes when the diver comes close.
 */
import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { MeshBuilder, composeMatrix, cylinderMatrix, smoothNormals } from "./geometry";
import { Resources, createInstancedMesh, groundQuaternion, prepareMaterial, type InstanceSpec } from "./materials";
import { PROP_SITES, groundY, scatter, seabedNormal } from "./placement";
import { createRandom, noise3, range, type Random } from "./random";
import { createGlintTexture } from "./textures";

const CONCRETION = new THREE.Color(0.32, 0.26, 0.2);

function concretion(position: THREE.Vector3) {
  const n = noise3(position.x * 3, position.y * 3, position.z * 3);
  return CONCRETION.clone().lerp(new THREE.Color(0.42, 0.4, 0.32), n * 0.8);
}

/** An admiralty-pattern anchor lying with one fluke dug in, plus a trailing chain. */
function createAnchor(random: Random) {
  const builder = new MeshBuilder();
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const tube = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
  // Local frame: the shank runs along +x, the arms lie in the x-y plane, the stock along z.
  const shank = 3.2;
  builder.add(tube, cylinderMatrix(new THREE.Vector3(0, 0, 0), new THREE.Vector3(shank, 0, 0), 0.09), concretion);
  // Arms curve from the crown at x = 0 up and down.
  const arm = (side: number) => {
    let previous = new THREE.Vector3(0, 0, 0);
    for (let step = 1; step <= 5; step += 1) {
      const angle = (step / 5) * 1.05;
      const point = new THREE.Vector3((1 - Math.cos(angle)) * 0.9, side * Math.sin(angle) * 1.1, 0);
      builder.add(tube, cylinderMatrix(previous, point, 0.075 - step * 0.006), concretion);
      previous = point;
    }
    // The fluke: a flat spade at the arm's tip.
    builder.add(box, composeMatrix(previous.x - 0.05, previous.y - side * 0.15, 0, new THREE.Euler(0, 0, side * 0.6), 0.55, 0.42, 0.06), concretion);
    // The bill.
    builder.add(tube, cylinderMatrix(previous, previous.clone().add(new THREE.Vector3(0.12, side * 0.18, 0)), 0.035), concretion);
  };
  arm(1);
  arm(-1);
  // The iron stock passes through the shank near the ring, at right angles to the arms.
  builder.add(tube, cylinderMatrix(new THREE.Vector3(shank - 0.25, 0, -1.5), new THREE.Vector3(shank - 0.25, 0, 1.5), 0.055), concretion);
  for (const z of [-1.5, 1.5]) builder.add(tube, composeMatrix(shank - 0.25, 0, z, null, 0.09, 0.09, 0.09), concretion);
  const ring = new THREE.TorusGeometry(0.22, 0.04, 6, 14);
  builder.add(ring, composeMatrix(shank + 0.2, 0, 0, new THREE.Euler(Math.PI / 2, 0, 0)), concretion);
  box.dispose();
  tube.dispose();
  ring.dispose();
  const anchor = builder.build();
  const chain = new MeshBuilder();
  const link = new THREE.TorusGeometry(0.12, 0.035, 4, 8);
  let position = new THREE.Vector3(shank + 0.42, 0, 0);
  let heading = 0.2;
  for (let index = 0; index < 34; index += 1) {
    heading += (random() - 0.5) * 0.35;
    const next = position.clone().add(new THREE.Vector3(Math.cos(heading) * 0.22, 0, Math.sin(heading) * 0.22));
    const rotation = new THREE.Euler(index % 2 === 0 ? 0 : Math.PI / 2, -heading, 0, "YXZ");
    chain.add(link, composeMatrix((position.x + next.x) / 2, 0, (position.z + next.z) / 2, rotation, 1, 1, 0.7), concretion);
    position = next;
  }
  link.dispose();
  return { anchor, chain: chain.build() };
}

/** A Dressel 1-style wine amphora: long neck, two handles, pointed toe. */
function createAmphora(broken: boolean) {
  const profile = [
    [0.0, 0.0],
    [0.04, 0.02],
    [0.05, 0.12],
    [0.12, 0.22],
    [0.17, 0.38],
    [0.18, 0.55],
    [0.16, 0.68],
    [0.08, 0.76],
    [0.06, 0.84],
    [0.06, 1.0],
    [0.08, 1.03],
    [0.06, 1.05],
  ].filter(([, y]) => !broken || y < 0.62).map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(profile, 12);
  const builder = new MeshBuilder();
  const color = (position: THREE.Vector3) => new THREE.Color(1, 1, 1).multiplyScalar(0.85 + noise3(position.x * 9, position.y * 9, position.z * 9) * 0.3);
  builder.add(lathe, undefined, color);
  lathe.dispose();
  if (!broken) {
    const tube = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.13, 0.72, 0);
      const top = new THREE.Vector3(side * 0.11, 0.97, 0);
      const neck = new THREE.Vector3(side * 0.06, 0.94, 0);
      builder.add(tube, cylinderMatrix(shoulder, top, 0.018), color);
      builder.add(tube, cylinderMatrix(top, neck, 0.018), color);
    }
    tube.dispose();
  }
  return builder.build();
}

/** A shard of pottery: a curved scrap. */
function createShard() {
  const geometry = new THREE.SphereGeometry(1, 4, 3, 0, 1.2, 0.8, 0.9);
  geometry.scale(0.18, 0.18, 0.18);
  return geometry;
}

/** A small iron-bound chest, lid ajar, with coins inside and spilled on the sand. */
function createChest(random: Random) {
  const wood = new MeshBuilder();
  const iron = new MeshBuilder();
  const gold = new MeshBuilder();
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const woodColor = (position: THREE.Vector3) => new THREE.Color(0.32, 0.22, 0.13).multiplyScalar(0.75 + noise3(position.x * 2, position.y * 30, position.z * 2) * 0.5);
  const width = 0.9;
  const depth = 0.55;
  const height = 0.45;
  // Body: four walls and a floor, so the inside is open under the lid.
  wood.add(box, composeMatrix(0, 0.03, 0, null, width, 0.06, depth), woodColor);
  for (const side of [-1, 1]) {
    wood.add(box, composeMatrix(0, height / 2, side * (depth / 2 - 0.03), null, width, height, 0.06), woodColor);
    wood.add(box, composeMatrix(side * (width / 2 - 0.03), height / 2, 0, null, 0.06, height, depth - 0.12), woodColor);
  }
  // Iron bands and a hasp.
  for (const x of [-0.32, 0.32]) {
    for (const side of [-1, 1]) iron.add(box, composeMatrix(x, height / 2, side * (depth / 2 + 0.005), null, 0.06, height + 0.01, 0.015), CONCRETION);
  }
  // The lid, hinged at the back and propped open.
  const lid = new THREE.CylinderGeometry(depth / 2, depth / 2, width, 10, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.rotateX(-Math.PI / 2);
  const lidMatrix = new THREE.Matrix4()
    .makeTranslation(0, height, -depth / 2)
    .multiply(new THREE.Matrix4().makeRotationX(-0.75))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, depth / 2));
  wood.add(lid, lidMatrix, woodColor);
  lid.dispose();
  // Coins: a heap inside and a spill on the sand in front.
  const coin = new THREE.CylinderGeometry(0.025, 0.025, 0.006, 8);
  for (let index = 0; index < 70; index += 1) {
    const inside = index < 40;
    const x = inside ? range(random, -0.38, 0.38) : range(random, -0.4, 0.5);
    const z = inside ? range(random, -0.2, 0.2) : depth / 2 + range(random, 0.05, 0.6) * Math.sqrt(random());
    const y = inside ? height - 0.1 + random() * 0.08 : 0.004 + random() * 0.01;
    gold.add(coin, composeMatrix(x, y, z, new THREE.Euler((random() - 0.5) * 1.2, random() * 3, (random() - 0.5) * 1.2)), new THREE.Color(1, 1, 1));
  }
  coin.dispose();
  box.dispose();
  return { wood: wood.build(), iron: iron.build(), gold: gold.build() };
}

/** One valve of a giant clam: a deep, fluted half-shell with a zigzag lip. */
function createClamValve() {
  const positions: number[] = [];
  const along = 16;
  const around = 8;
  const point = (i: number, j: number) => {
    const u = i / along;
    const v = j / around;
    const theta = u * Math.PI;
    const phi = v * (Math.PI / 2);
    const folds = 1 + 0.12 * Math.abs(Math.sin(theta * 5));
    const r = folds;
    // Lip zigzag: fold crests reach higher than the troughs.
    const lip = j === around ? 0.08 * Math.sin(theta * 5) : 0;
    return [
      Math.cos(theta) * 0.55 * r,
      Math.cos(phi) * 0.42 * r * Math.sin(theta) * 0.9 + lip,
      -Math.sin(phi) * 0.36 * r * Math.sin(theta) - 0.02,
    ];
  };
  for (let i = 0; i < along; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = point(i, j);
      const b = point(i + 1, j);
      const c = point(i + 1, j + 1);
      const d = point(i, j + 1);
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  smoothNormals(geometry);
  const builder = new MeshBuilder();
  builder.add(geometry, undefined, (position) => new THREE.Color(0.75, 0.72, 0.62).multiplyScalar(0.8 + noise3(position.x * 6, position.y * 6, position.z * 6) * 0.3));
  geometry.dispose();
  return builder.build();
}

/** The clam's mantle: a wavy, spotted lip between the valves. */
function createClamMantle() {
  const geometry = new THREE.SphereGeometry(1, 20, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(0.5, 0.06, 0.14);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, position.getY(index) + Math.sin(x * 22) * 0.012);
    const spots = noise3(x * 30, 0, z * 30) > 0.62 ? 1 : 0;
    const base = new THREE.Color(0.1, 0.42, 0.5).lerp(new THREE.Color(0.25, 0.5, 0.2), noise3(x * 6, 1, z * 6));
    base.lerp(new THREE.Color(0.55, 0.8, 0.85), spots * 0.6);
    colors.set([base.r, base.g, base.b], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const createProps: GameSystemFactory = async environment => {
  const resources = new Resources();
  const random = createRandom(2718);
  const receive = environment.quality !== "low";
  const castShadow = environment.quality === "high";
  const group = new THREE.Group();
  group.name = "props";
  const vertexLit = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));

  // The lost anchor.
  const site = PROP_SITES.anchor;
  const { anchor, chain } = createAnchor(random);
  const anchorMesh = new THREE.Mesh(anchor, vertexLit);
  const anchorYaw = 2.1;
  // It lies on its side: the arms flat on the sand, the stock standing up with its lower end buried.
  anchorMesh.rotation.set(0, anchorYaw, 0);
  anchorMesh.rotateX(Math.PI / 2);
  anchorMesh.rotateY(0.06);
  anchorMesh.position.set(site.x, groundY(site.x, site.z, 1.6) + 0.06, site.z);
  anchorMesh.castShadow = castShadow;
  anchorMesh.receiveShadow = receive;
  const chainMesh = new THREE.Mesh(chain, vertexLit);
  chainMesh.rotation.y = anchorYaw;
  chainMesh.position.set(site.x, 0, site.z);
  // Drape the chain on the sand: move each vertex to the seabed below it.
  const chainPosition = chain.getAttribute("position") as THREE.BufferAttribute;
  chainMesh.updateMatrix();
  const point = new THREE.Vector3();
  for (let index = 0; index < chainPosition.count; index += 1) {
    point.fromBufferAttribute(chainPosition, index).applyMatrix4(chainMesh.matrix);
    const local = chainPosition.getY(index);
    chainPosition.setY(index, environment.seabedHeight(point.x, point.z) + 0.04 + local);
  }
  chainPosition.needsUpdate = true;
  chain.computeBoundingSphere();
  group.add(anchorMesh, chainMesh);
  environment.addDiscoverable({
    id: "lost-anchor",
    name: "Lost anchor",
    subtitle: "Admiralty pattern anchor",
    description:
      "The admiralty pattern anchor, with its stock at right angles to the arms, was the standard ship's anchor for centuries: when dragged, the stock turns the anchor so that one fluke digs into the seabed. Stockless anchors replaced it on steamships from the late 1800s because they stow flat in the hawse pipe. Anchors are often lost when a chain parts in a storm.",
    radius: 2.2,
    position: target => target.set(site.x, anchorMesh.position.y, site.z),
    object: anchorMesh,
  });

  // The amphora field: the cargo of an ancient ship whose hull has long gone.
  const field = PROP_SITES.amphorae;
  const terracotta = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  const jarColors = [new THREE.Color(0.62, 0.38, 0.25), new THREE.Color(0.55, 0.4, 0.3), new THREE.Color(0.5, 0.42, 0.36), new THREE.Color(0.58, 0.48, 0.4)];
  const jars: InstanceSpec[] = [];
  const brokenJars: InstanceSpec[] = [];
  const shards: InstanceSpec[] = [];
  const jarPoints = scatter({ random, count: 34, center: field, radius: field.radius - 2, spacing: 0.7, falloff: 1.3 });
  jarPoints.forEach((jar, index) => {
    const broken = index % 4 === 3;
    // Most lie on their sides, half sunk; a few stand toe-down in the sand.
    const standing = index % 7 === 0;
    const yaw = 0.4 + (random() - 0.5) * 0.9;
    const rotation = standing
      ? new THREE.Euler((random() - 0.5) * 0.4, yaw, (random() - 0.5) * 0.4)
      : new THREE.Euler(0, yaw, Math.PI / 2 + (random() - 0.5) * 0.3, "YXZ");
    const scale = range(random, 0.9, 1.1);
    const sink = standing ? -0.35 : -range(random, 0.05, 0.12);
    const y = groundY(jar.x, jar.z, 0.5) + sink + (standing ? 0 : 0.17 * scale * 0.4);
    const spec = { matrix: composeMatrix(jar.x, y, jar.z, rotation, scale), color: jarColors[Math.floor(random() * jarColors.length)].clone() };
    (broken ? brokenJars : jars).push(spec);
  });
  for (let index = 0; index < 40; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * field.radius;
    const x = field.x + Math.cos(angle) * distance;
    const z = field.z + Math.sin(angle) * distance;
    shards.push({ matrix: composeMatrix(x, groundY(x, z, 0.1) + 0.005, z, new THREE.Euler(Math.PI + (random() - 0.5), random() * 6, 0), range(random, 0.6, 1.4)), color: jarColors[Math.floor(random() * jarColors.length)].clone() });
  }
  group.add(createInstancedMesh(createAmphora(false), terracotta, jars));
  group.add(createInstancedMesh(createAmphora(true), terracotta, brokenJars));
  const shardMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide }));
  group.add(createInstancedMesh(createShard(), shardMaterial, shards));
  environment.addDiscoverable({
    id: "amphora-field",
    name: "Amphora field",
    subtitle: "Roman transport jars",
    description:
      "Amphorae were the shipping containers of the ancient Mediterranean, carrying wine, olive oil, and fish sauce. Their pointed toes let them be packed upright in sand or brushwood in a ship's hold. When a wooden hull rots away, the jars stay behind in a mound, and archaeologists date the wreck by the shape of the jars and the stamps on their handles.",
    radius: 6,
    position: target => target.set(field.x, groundY(field.x, field.z) + 0.5, field.z),
  });

  // The strongbox by the wreck, glinting.
  const chestSite = PROP_SITES.chest;
  const chestParts = createChest(random);
  const chest = new THREE.Group();
  chest.add(new THREE.Mesh(chestParts.wood, vertexLit));
  chest.add(new THREE.Mesh(chestParts.iron, prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4 }))));
  const goldMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({
    color: new THREE.Color(1.0, 0.76, 0.33),
    metalness: 1,
    roughness: 0.28,
    emissive: new THREE.Color(0.35, 0.24, 0.06),
    emissiveIntensity: 0.4,
  }));
  chest.add(new THREE.Mesh(chestParts.gold, goldMaterial));
  const chestNormal = seabedNormal(chestSite.x, chestSite.z);
  chest.quaternion.copy(groundQuaternion(chestNormal, 2.4, 1, { x: 0.12, z: -0.06 }));
  chest.position.set(chestSite.x, groundY(chestSite.x, chestSite.z, 0.5) - 0.12, chestSite.z);
  chest.traverse(child => {
    child.castShadow = castShadow;
    child.receiveShadow = receive;
  });
  group.add(chest);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlintTexture(),
    color: new THREE.Color(1, 0.9, 0.6),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }));
  glint.position.set(0, 0.42, 0.05);
  glint.scale.setScalar(0.5);
  chest.add(glint);
  environment.addDiscoverable({
    id: "strongbox",
    name: "The purser's strongbox",
    subtitle: "Iron-bound chest from the wreck",
    description:
      "Gold does not corrode in sea water, so coins come up bright after centuries while the iron and wood around them decay; silver coins, by contrast, turn into black lumps of silver sulfide. Ships carried cash for wages and port fees in a locked box kept by the purser. Under law in most countries, objects from a wreck still belong to the owner or the state, so divers leave them where they lie.",
    radius: 0.8,
    position: target => target.copy(chest.position).add(new THREE.Vector3(0, 0.3, 0)),
    object: chest,
  });

  // The giant clam on the reef.
  const clamSite = PROP_SITES.clam;
  const clam = new THREE.Group();
  const shellMaterial = prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
  const valveGeometry = createClamValve();
  const valves = [new THREE.Mesh(valveGeometry, shellMaterial), new THREE.Mesh(valveGeometry, shellMaterial)];
  valves[1].scale.z = -1;
  const mantle = new THREE.Mesh(createClamMantle(), prepareMaterial(environment, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 })));
  mantle.position.y = 0.36;
  clam.add(valves[0], valves[1], mantle);
  clam.scale.setScalar(1.15);
  clam.quaternion.copy(groundQuaternion(seabedNormal(clamSite.x, clamSite.z), 0.9, 0.7));
  clam.position.set(clamSite.x, groundY(clamSite.x, clamSite.z, 0.6) - 0.08, clamSite.z);
  clam.traverse(child => {
    child.castShadow = castShadow;
    child.receiveShadow = receive;
  });
  group.add(clam);
  environment.addDiscoverable({
    id: "giant-clam",
    name: "Giant clam",
    subtitle: "Tridacna gigas",
    description:
      "The giant clam is the largest living bivalve: it can reach 1.2 m and over 200 kg and live for more than 100 years. Algae living in its colorful mantle make food from sunlight, so it lives in shallow, clear water. It cannot snap shut on a diver, despite the legends; it closes slowly when a shadow falls over it.",
    radius: 0.8,
    position: target => target.copy(clam.position).add(new THREE.Vector3(0, 0.3, 0)),
    object: clam,
  });

  resources.add(environment.scene, group);
  let gape = 0.35;
  const clamWorld = new THREE.Vector3();
  return {
    update(context) {
      // The glint flares now and then as the light moves over the coins.
      const flare = Math.pow(Math.max(Math.sin(context.time * 1.7) * Math.sin(context.time * 0.63 + 1), 0), 6);
      glint.material.opacity = 0.15 + flare * 0.85;
      glint.scale.setScalar(0.35 + flare * 0.45);
      glint.material.rotation = context.time * 0.2;
      goldMaterial.emissiveIntensity = 0.3 + flare * 0.8;
      // The clam closes slowly when the diver hovers over it, and reopens after.
      clam.getWorldPosition(clamWorld);
      const near = context.diver.position.distanceTo(clamWorld) < 2.8;
      const target = near ? 0.05 : 0.35;
      gape += (target - gape) * Math.min(context.delta * (near ? 1.2 : 0.25), 1);
      valves[0].rotation.x = -gape;
      valves[1].rotation.x = gape;
      mantle.scale.set(1, 1, 0.4 + gape * 1.7);
    },
    dispose() {
      resources.dispose();
    },
  };
};

export default createProps;
