/**
 * Sharks: grey reef sharks circling the reef near the bottom and a great white
 * patrolling the top of the drop-off wall.
 *
 * Both use the skinned shark model (Babylon.js assets, CC BY 4.0; see
 * public/game/CREDITS.md) with its "swimming" clip, played at the tail-beat
 * rate the Strouhal number gives for each shark's speed and length. Sharks
 * alternate beats and glides and swerve to keep their distance from the diver.
 * Fish schools treat them as predators.
 */

import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GameEnvironment, GameSystemFactory } from "../types";
import { BeatGlide, LoopPath, PathSwimmer, strouhalFrequency, type Threat } from "./motion";
import { GREAT_WHITE_ROUTE, REEF_SHARK_ROUTES } from "./routes";
import { environmentThreats, loadModel, poseFromSwimmer, registerPredator } from "./shared";

export const SHARK_MODEL_URL = "/game/models/shark.glb";
const TAIL_AMPLITUDE = 0.09;
const DRAW_DISTANCE = 150;

type Species = {
  id: string;
  length: number;
  cruise: [number, number];
  avoid: number;
  tint: THREE.Color;
};

const GREAT_WHITE: Species = { id: "great-white-shark", length: 4.5, cruise: [0.9, 1.3], avoid: 12, tint: new THREE.Color(1, 1, 1) };
const REEF_SHARK: Species = { id: "grey-reef-shark", length: 1.8, cruise: [0.5, 1.0], avoid: 7, tint: new THREE.Color(0.78, 0.8, 0.84) };

type Shark = {
  species: Species;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  clipSeconds: number;
  swim: PathSwimmer;
  rhythm: BeatGlide;
  threat: Threat;
  unregister: () => void;
  cruise: number;
};

/** Prepare one material per species: physical-to-standard tuning, tint, and the water light. */
function speciesMaterial(environment: GameEnvironment, source: THREE.Material, tint: THREE.Color) {
  const material = source.clone() as THREE.MeshStandardMaterial;
  material.color.multiply(tint);
  material.side = THREE.FrontSide;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    // The source declares an ior of 1000 (a converted specular-glossiness file), which reads as chrome.
    material.ior = 1.45;
    material.specularIntensity = 0.35;
  }
  material.roughness = Math.max(material.roughness, 0.45);
  material.envMapIntensity = 0.6;
  environment.patchMaterial(material);
  return material;
}

export const createSharks: GameSystemFactory = async environment => {
  const { scene, quality, seabedHeight, random } = environment;
  const gltf = await loadModel(environment, SHARK_MODEL_URL);
  const template = gltf.scene;
  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const modelLength = size.z;
  const clip = gltf.animations.find(animation => animation.name === "swimming") ?? gltf.animations[0];
  if (!clip) throw new Error("The shark model has no animation");
  // Drop any root translation so that the swimmer alone moves the shark.
  const rootBone = template.getObjectByProperty("type", "Bone");
  const swimClip = clip.clone();
  swimClip.tracks = swimClip.tracks.filter(track => !(rootBone && track.name === `${rootBone.name}.position`));

  const materials = new Map<string, Map<THREE.Material, THREE.Material>>();
  const materialFor = (species: Species, source: THREE.Material) => {
    let bySource = materials.get(species.id);
    if (!bySource) {
      bySource = new Map();
      materials.set(species.id, bySource);
    }
    let material = bySource.get(source);
    if (!material) {
      material = speciesMaterial(environment, source, species.tint);
      bySource.set(source, material);
    }
    return material;
  };

  const sharks: Shark[] = [];
  const addShark = (species: Species, route: LoopPath) => {
    const model = SkeletonUtils.clone(template);
    model.traverse(child => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => materialFor(species, m)) : materialFor(species, mesh.material);
      mesh.castShadow = quality === "high";
      mesh.frustumCulled = false;
    });
    const scale = species.length / modelLength;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    const root = new THREE.Group();
    root.name = species.id;
    root.add(model);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(swimClip);
    action.play();
    action.time = random() * swimClip.duration;
    const cruise = species.cruise[0] + random() * (species.cruise[1] - species.cruise[0]);
    const swim = new PathSwimmer(
      route,
      {
        start: random() * route.length,
        lead: species.length * 4,
        clearance: species === REEF_SHARK ? 1.6 : 4,
        minDepth: 2,
        avoidMargin: species.avoid,
        limits: { turnRate: species === REEF_SHARK ? 0.6 : 0.3, maxPitch: 0.35, acceleration: 0.4, bank: 0.3, pitchRate: 1 },
      },
      cruise,
    );
    const threat: Threat = { position: { ...swim.swimmer.position }, radius: species.length * 1.5 };
    sharks.push({ species, root, mixer, action, clipSeconds: swimClip.duration, swim, rhythm: new BeatGlide([3, 8], [2, 5], random), threat, unregister: registerPredator(threat), cruise });
  };

  const reefCount = quality === "high" ? 3 : quality === "medium" ? 2 : 1;
  for (let index = 0; index < reefCount; index += 1) addShark(REEF_SHARK, new LoopPath(REEF_SHARK_ROUTES[index % REEF_SHARK_ROUTES.length]));
  addShark(GREAT_WHITE, new LoopPath(GREAT_WHITE_ROUTE));

  const nearest = (species: Species, target: THREE.Vector3) => {
    let best: Shark | null = null;
    let bestDistance = Infinity;
    for (const shark of sharks) {
      if (shark.species !== species) continue;
      const distance = shark.root.position.distanceToSquared(diverPosition);
      if (distance < bestDistance) {
        best = shark;
        bestDistance = distance;
      }
    }
    return best ? target.copy(best.root.position) : target;
  };
  const diverPosition = new THREE.Vector3();

  environment.addDiscoverable({
    id: REEF_SHARK.id,
    name: "Grey reef shark",
    subtitle: "Carcharhinus amblyrhynchos",
    description:
      "Grey reef sharks patrol the outer slopes and channels of Indo-Pacific reefs, often in loose groups by day, and hunt more actively at night. Before it attacks, a threatened grey reef shark hunches its back, drops its pectoral fins and swims in an exaggerated zig-zag, a warning divers should respect. They grow to about 1.9 m and have a broad black edge on the tail.",
    radius: 1,
    position: target => nearest(REEF_SHARK, target),
  });
  const greatWhite = sharks.find(shark => shark.species === GREAT_WHITE);
  environment.addDiscoverable({
    id: GREAT_WHITE.id,
    name: "Great white shark",
    subtitle: "Carcharodon carcharias",
    description:
      "Great white sharks grow to 4–6 m and are partly warm-bodied: they keep their swimming muscles, eyes and brain warmer than the water, which lets them hunt in cold seas. They often ambush seals from below at high speed. Satellite tags show that some cross whole oceans; one female swam from South Africa to Australia and back in nine months.",
    radius: 2.3,
    position: target => (greatWhite ? target.copy(greatWhite.root.position) : target),
    object: greatWhite?.root,
  });

  for (const shark of sharks) poseFromSwimmer(shark.root, shark.swim.swimmer);

  return {
    update: ({ delta, time, diver }) => {
      diverPosition.copy(diver.position);
      if (delta <= 0) return;
      const threats = environmentThreats(environment);
      for (const shark of sharks) {
        const beat = shark.rhythm.update(delta);
        // While gliding the shark loses about 0.1 m/s each second.
        const wanted = shark.rhythm.gliding ? shark.cruise * 0.7 : shark.cruise * (1 + 0.1 * Math.sin(time * 0.1 + shark.cruise * 10));
        const swimmer = shark.swim.update(delta, seabedHeight, threats, wanted);
        poseFromSwimmer(shark.root, swimmer);
        // Out of sight in the haze: skip drawing and skinning.
        shark.root.visible = shark.root.position.distanceToSquared(diverPosition) < DRAW_DISTANCE * DRAW_DISTANCE;
        const frequency = strouhalFrequency(swimmer.speed, shark.species.length, TAIL_AMPLITUDE);
        // The clip holds one tail-beat cycle; glides slow it to a gentle sway.
        shark.action.timeScale = Math.max(frequency * shark.clipSeconds * (0.15 + 0.85 * beat), 0.08);
        if (shark.root.visible) shark.mixer.update(delta);
        shark.threat.position.x = swimmer.position.x;
        shark.threat.position.y = swimmer.position.y;
        shark.threat.position.z = swimmer.position.z;
      }
    },
    dispose: () => {
      for (const shark of sharks) {
        shark.unregister();
        shark.mixer.stopAllAction();
        shark.mixer.uncacheRoot(shark.root.children[0]);
        shark.root.removeFromParent();
      }
      for (const bySource of materials.values()) for (const material of bySource.values()) material.dispose();
      // The clones share the template's geometry and textures.
      template.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of list) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      for (const shark of sharks) {
        shark.root.traverse(child => {
          const skinned = child as THREE.SkinnedMesh;
          if (skinned.isSkinnedMesh) skinned.skeleton.dispose();
        });
      }
    },
  };
};
