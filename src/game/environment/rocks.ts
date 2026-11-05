/**
 * Rocks and boulders across the map: displaced icosahedra in three sizes,
 * textured with the staged CC0 rock020 maps, plus a few rock gardens from
 * the staged rocks_small.glb (CC BY 4.0). All instanced and chunked by area.
 */
import * as THREE from "three";
import type { GameSystemFactory } from "../types";
import { createRockGeometry } from "./geometry";
import { Resources, createChunkedInstances, groundQuaternion, prepareMaterial, type InstanceSpec } from "./materials";
import { loadBakedModel, loadTexture } from "./models";
import { ROCK_SEED, placeRocks, seabedNormal, type RockClass } from "./placement";
import { createRandom, range } from "./random";

const ROCK_COLORS = [
  new THREE.Color(0.62, 0.58, 0.52),
  new THREE.Color(0.5, 0.48, 0.44),
  new THREE.Color(0.58, 0.52, 0.42),
  new THREE.Color(0.45, 0.47, 0.42),
  new THREE.Color(0.55, 0.5, 0.5),
];

const createRocks: GameSystemFactory = async environment => {
  const resources = new Resources();
  const random = createRandom(ROCK_SEED + 1);
  const layout = placeRocks(createRandom(ROCK_SEED), environment.quality);
  const lowQuality = environment.quality === "low";
  const [color, normal, roughness, garden] = await Promise.all([
    loadTexture("rock020_color.jpg", true, 2),
    lowQuality ? Promise.resolve(null) : loadTexture("rock020_normal.jpg", false, 2),
    lowQuality ? Promise.resolve(null) : loadTexture("rock020_roughness.jpg", false, 2),
    loadBakedModel(environment, "rocks_small.glb"),
  ]);
  const material = prepareMaterial(environment, new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    roughnessMap: roughness,
    roughness: 1,
    metalness: 0,
  }));
  for (const texture of [color, normal, roughness]) if (texture) resources.track(texture);
  const detail: Record<Exclude<RockClass, "garden">, number> = lowQuality
    ? { small: 1, medium: 1, boulder: 2 }
    : { small: 1, medium: 2, boulder: 3 };
  const group = new THREE.Group();
  group.name = "rocks";
  const specs: Record<RockClass, InstanceSpec[]> = { small: [], medium: [], boulder: [], garden: [] };
  for (const rock of layout) {
    if (rock.kind === "garden" && !garden) continue;
    const quaternion = groundQuaternion(seabedNormal(rock.x, rock.z, Math.max(rock.scale, 0.5)), rock.yaw, rock.kind === "garden" ? 1 : 0.7, { x: rock.tiltX, z: rock.tiltZ });
    const scale = new THREE.Vector3(rock.scale * rock.stretch, rock.scale * range(random, 0.75, 1.1), rock.scale / rock.stretch);
    if (rock.kind === "garden") scale.setScalar(rock.scale);
    const tint = ROCK_COLORS[Math.floor(random() * ROCK_COLORS.length)].clone().multiplyScalar(range(random, 0.85, 1.1));
    specs[rock.kind].push({
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(rock.x, rock.y, rock.z), quaternion, scale),
      color: rock.kind === "garden" ? undefined : tint,
    });
  }
  const castShadow = environment.quality === "high";
  for (const kind of ["small", "medium", "boulder"] as const) {
    if (!specs[kind].length) continue;
    const geometry = createRockGeometry(random, detail[kind], kind === "boulder" ? 0.3 : 0.38);
    for (const mesh of createChunkedInstances(geometry, material, specs[kind], 300)) {
      mesh.castShadow = castShadow && kind !== "small";
      mesh.receiveShadow = !lowQuality;
      group.add(mesh);
    }
  }
  if (garden && specs.garden.length) {
    prepareMaterial(environment, garden.material);
    // The model's base is the lowest rock; sink it a little so it sits in the sand.
    garden.geometry.translate(0, -0.25, 0);
    for (const mesh of createChunkedInstances(garden.geometry, garden.material, specs.garden, 300)) {
      mesh.castShadow = castShadow;
      mesh.receiveShadow = !lowQuality;
      group.add(mesh);
    }
  } else if (garden) {
    garden.geometry.dispose();
    garden.material.dispose();
  }
  resources.add(environment.scene, group);
  return {
    update() {},
    dispose() {
      resources.dispose();
    },
  };
};

export default createRocks;
