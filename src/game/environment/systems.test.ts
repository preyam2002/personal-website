/**
 * Builds every environment system against a fake engine (no GPU) and checks
 * the triangle and draw-call budget, the journal entries, and cleanup.
 * The staged glTF models are mocked as missing, so this covers the procedural
 * fallbacks; the models add about 60k triangles on high.
 */
import * as THREE from "three";
import type { Discoverable, GameEnvironment, GameQuality } from "../types";
import { seabedHeight } from "../world";
import { environmentSystems } from "./index";
import { countDrawCalls, countTriangles } from "./materials";

jest.mock("./models", () => ({
  loadBakedModel: jest.fn(async () => null),
  loadTexture: jest.fn(async () => null),
}));

function fakeEnvironment(quality: GameQuality) {
  const scene = new THREE.Scene();
  const discoverables: Discoverable[] = [];
  const patched: THREE.Material[] = [];
  const environment = {
    scene,
    renderer: {} as THREE.WebGLRenderer,
    gltf: {} as GameEnvironment["gltf"],
    quality,
    patchMaterial: (material: THREE.Material) => {
      patched.push(material);
      material.customProgramCacheKey = () => `ocean-optics:${material.type}`;
    },
    seabedHeight,
    sunDirection: new THREE.Vector3(0, 1, 0),
    random: Math.random,
    addDiscoverable: (discoverable: Discoverable) => discoverables.push(discoverable),
    threats: () => [],
  } satisfies GameEnvironment;
  return { environment, scene, discoverables, patched };
}

const context = (time: number) => ({
  time,
  delta: 0.016,
  camera: new THREE.PerspectiveCamera(),
  diver: { position: new THREE.Vector3(32, -8, -168), velocity: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), underwater: true, depth: 8 },
});

describe.each(["high", "medium", "low"] as GameQuality[])("environment on %s", quality => {
  let built: Awaited<ReturnType<typeof build>>;
  async function build() {
    const fake = fakeEnvironment(quality);
    const systems = await Promise.all(environmentSystems.map(factory => factory(fake.environment)));
    return { ...fake, systems };
  }
  beforeAll(async () => {
    built = await build();
  });

  it("stays inside the triangle and draw-call budget", () => {
    const perSystem = built.scene.children.map(child => `${child.name || child.type}: ${Math.round(countTriangles(child) / 1000)}k tris, ${countDrawCalls(child)} draws`);
    const triangles = countTriangles(built.scene);
    const draws = countDrawCalls(built.scene);
    console.log(`${quality}: ${Math.round(triangles / 1000)}k triangles, ${draws} draw calls\n  ${perSystem.join("\n  ")}`);
    // The staged models add about 70k triangles on high, 20k on medium and low.
    const budget = { high: 530_000, medium: 320_000, low: 200_000 }[quality];
    expect(triangles).toBeLessThan(budget);
    expect(draws).toBeLessThan(120);
  });

  it("registers the journal subjects with positions under water", () => {
    const ids = built.discoverables.map(item => item.id).sort();
    expect(ids).toEqual(["amphora-field", "giant-clam", "giant-kelp", "lost-anchor", "strongbox", "wreck"]);
    for (const item of built.discoverables) {
      const position = item.position(new THREE.Vector3());
      expect(position.y).toBeLessThan(0);
      expect(position.y).toBeGreaterThan(seabedHeight(position.x, position.z) - 0.5);
      expect(item.description.length).toBeGreaterThan(80);
    }
  });

  it("gives every lit material the underwater light", () => {
    built.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) expect(built.patched).toContain(material);
    });
  });

  it("updates and then removes everything on dispose", () => {
    for (const system of built.systems) system.update(context(1.5));
    for (const system of built.systems) system.dispose();
    expect(built.scene.children.length).toBe(0);
  });
});
