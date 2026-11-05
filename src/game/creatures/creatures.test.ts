import * as THREE from "three";
import { buildJellyGeometry } from "./jellies";
import { buildMantaGeometry } from "./manta";
import { buildProceduralFish } from "./fishGeometry";
import { buildTurtleGeometry } from "./turtle";
import { buildWhaleSharkGeometry } from "./whaleShark";
import { buildHumpbackGeometry } from "./whales";
import { applyDeform, createSwimUniforms, swimDeform } from "./swimMaterial";
import { loftBody, rgb } from "./geometry";

/**
 * A copy of the engine's patchMaterial chunk edits (src/game/engine.ts,
 * createMaterialPatcher), to check that our shader edits compose with it.
 */
function enginePatch(material: THREE.Material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vOceanWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvec4 oceanPosition = vec4(transformed, 1.0);\nvOceanWorld = (modelMatrix * oceanPosition).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vOceanWorld;\nuniform float uTime;")
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n// ocean light");
  };
  material.customProgramCacheKey = () => `ocean-optics:${material.type}`;
}

function compile(material: THREE.Material) {
  const shader = {
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    uniforms: {} as Record<string, THREE.IUniform>,
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe("swim shader composition", () => {
  it("keeps the engine's edits and adds the body wave before projection", () => {
    const uniforms = createSwimUniforms();
    const material = applyDeform(new THREE.MeshStandardMaterial(), swimDeform("test", uniforms, { mode: "lateral", envelope: "fish" }), enginePatch);
    const shader = compile(material);
    const vertex = shader.vertexShader;
    expect(vertex).toContain("void creatureDeform(inout vec3 p, inout vec3 n)");
    expect(vertex).toContain("vOceanWorld = (modelMatrix * oceanPosition).xyz;");
    expect(vertex).toContain("creatureDeform(transformed, creatureUnusedNormal);");
    expect(vertex).toContain("creatureDeform(creatureNormalPoint, objectNormal);");
    // The order matters: normals bend before they are transformed, positions before projection.
    expect(vertex.indexOf("creatureDeform(creatureNormalPoint")).toBeLessThan(vertex.indexOf("#include <defaultnormal_vertex>"));
    expect(vertex.indexOf("creatureDeform(transformed")).toBeLessThan(vertex.indexOf("vOceanWorld = (modelMatrix"));
    expect(shader.fragmentShader).toContain("// ocean light");
    expect(shader.uniforms.uSwimPhase).toBe(uniforms.uSwimPhase);
    // Every #include survives (nothing was replaced away).
    for (const include of THREE.ShaderLib.physical.vertexShader.match(/#include <\w+>/g) ?? []) expect(vertex).toContain(include);
  });

  it("gives each variant its own program key", () => {
    const a = applyDeform(new THREE.MeshStandardMaterial(), swimDeform("a", createSwimUniforms(), { mode: "lateral", envelope: "fish" }), enginePatch);
    const b = applyDeform(new THREE.MeshStandardMaterial(), swimDeform("a", createSwimUniforms(), { mode: "vertical", envelope: "whale" }), enginePatch);
    const plain = new THREE.MeshStandardMaterial();
    enginePatch(plain);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(a.customProgramCacheKey()).toContain("ocean-optics");
  });

  it("declares the instanced swim attribute only for instanced fish", () => {
    const instanced = swimDeform("i", createSwimUniforms(), { mode: "lateral", envelope: "fish", instanced: true });
    const single = swimDeform("s", createSwimUniforms(), { mode: "lateral", envelope: "fish" });
    expect(instanced.declarations).toContain("attribute vec2 aSwim;");
    expect(instanced.body).toContain("aSwim.x");
    expect(single.declarations).not.toContain("aSwim");
  });
});

function checkGeometry(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  for (const name of ["position", "normal", "uv", "color", "aFlap"]) expect(geometry.getAttribute(name)).toBeDefined();
  for (let index = 0; index < position.count; index += 1) {
    expect(Number.isFinite(position.getX(index) + position.getY(index) + position.getZ(index))).toBe(true);
    expect(Number.isFinite(normal.getX(index) + normal.getY(index) + normal.getZ(index))).toBe(true);
  }
  return { vertices: position.count, triangles: (geometry.getIndex()?.count ?? 0) / 3 };
}

describe("procedural animals", () => {
  it("lofts a body with outward normals", () => {
    const body = loftBody({ length: 2, headZ: 1, rings: 20, segments: 16, section: () => ({ width: 0.3, top: 0.3, bottom: 0.3 }), color: () => rgb(0xffffff) });
    const position = body.getAttribute("position");
    const normal = body.getAttribute("normal");
    let outward = 0;
    for (let index = 0; index < position.count; index += 1) {
      outward += position.getX(index) * normal.getX(index) + position.getY(index) * normal.getY(index) > 0 ? 1 : 0;
    }
    expect(outward / position.count).toBeGreaterThan(0.85);
  });

  it.each([
    ["humpback", () => buildHumpbackGeometry("high"), 13.5, 14.8],
    ["whale shark", () => buildWhaleSharkGeometry("high"), 9.5, 11],
    ["manta", () => buildMantaGeometry("high"), 3.2, 3.8],
    ["turtle", () => buildTurtleGeometry("high"), 1.2, 1.75],
    ["moon jelly", () => buildJellyGeometry("high"), 0.25, 0.32],
    ["fish", () => buildProceduralFish({ depth: 0.2, width: 0.06, deepest: 0.35, fork: 0.7, fin: rgb(0x888888), pattern: () => rgb(0xffffff) }, "high"), 0.95, 1.05],
  ])("builds a %s of the right size", (_name, build, minimum, maximum) => {
    const geometry = build();
    const { triangles } = checkGeometry(geometry);
    const size = (geometry.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.z);
    expect(longest).toBeGreaterThan(minimum);
    expect(longest).toBeLessThan(maximum);
    expect(triangles).toBeGreaterThan(50);
    expect(triangles).toBeLessThan(40000);
  });

  it("gives the humpback pectoral fins about a third of its length", () => {
    const geometry = buildHumpbackGeometry("medium");
    const box = geometry.boundingBox as THREE.Box3;
    // Fin tips stand out well beyond the 3 m wide body.
    expect(box.max.x).toBeGreaterThan(4.5);
    expect(box.max.x).toBeLessThan(6.5);
  });

  it("keeps a procedural fish near the 300-triangle budget", () => {
    const fish = buildProceduralFish({ depth: 0.2, width: 0.06, deepest: 0.35, fork: 0.7, fin: rgb(0x888888), pattern: () => rgb(0xffffff) }, "high");
    expect((fish.getIndex()?.count ?? 0) / 3).toBeLessThan(360);
  });
});
