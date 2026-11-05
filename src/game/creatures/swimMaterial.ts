/**
 * Materials for animals that swim by bending their bodies in the vertex shader.
 *
 * The deformation is injected with onBeforeCompile, then the engine's
 * patchMaterial wraps it (it calls our hook first, then adds its own chunk
 * edits for sunlight and caustics). Our edits only append after the
 * `beginnormal_vertex` and `begin_vertex` includes and add declarations after
 * `common`, so they compose with the engine's edits, which follow
 * `project_vertex` and `lights_fragment_end` and also append after `common`.
 *
 * patchMaterial sets a program cache key per material type. Materials that
 * inject different code must not share a program, so the key is replaced with
 * one that also names our variant.
 */

import * as THREE from "three";

export type SwimMode = "lateral" | "vertical";
export type Envelope = "fish" | "whale";

export type SwimUniforms = {
  uSwimPhase: THREE.IUniform<number>;
  uSwimAmp: THREE.IUniform<number>;
  uSwimWavelength: THREE.IUniform<number>;
  uSwimLength: THREE.IUniform<number>;
  uSwimHeadZ: THREE.IUniform<number>;
  uFlapPhase: THREE.IUniform<number>;
  uFlapAmp: THREE.IUniform<number>;
  uFlapLag: THREE.IUniform<number>;
  uFlapChord: THREE.IUniform<number>;
  uFlapSweep: THREE.IUniform<number>;
};

export function createSwimUniforms(values: Partial<Record<keyof SwimUniforms, number>> = {}): SwimUniforms {
  const uniform = (name: keyof SwimUniforms, fallback: number) => ({ value: values[name] ?? fallback });
  return {
    uSwimPhase: uniform("uSwimPhase", 0),
    uSwimAmp: uniform("uSwimAmp", 0.09),
    uSwimWavelength: uniform("uSwimWavelength", 1),
    uSwimLength: uniform("uSwimLength", 1),
    uSwimHeadZ: uniform("uSwimHeadZ", 0.5),
    uFlapPhase: uniform("uFlapPhase", 0),
    uFlapAmp: uniform("uFlapAmp", 0),
    uFlapLag: uniform("uFlapLag", 0),
    uFlapChord: uniform("uFlapChord", 0),
    uFlapSweep: uniform("uFlapSweep", 0),
  };
}

export type VertexDeform = {
  /** A unique name for the variant; part of the program cache key. */
  key: string;
  /** GLSL declarations (uniforms, attributes, functions) placed after `common`. */
  declarations: string;
  /** GLSL body of `void creatureDeform(inout vec3 p, inout vec3 n)`. */
  body: string;
  uniforms: Record<string, THREE.IUniform>;
  /** Optional vertex code run after `project_vertex` (for example to fill varyings). */
  vertexAfterProject?: string;
  /** Optional fragment declarations and code run after `opaque_fragment`. */
  fragmentDeclarations?: string;
  fragmentFinish?: string;
  /** Optional code run after `color_fragment` (to change diffuseColor). */
  fragmentColor?: string;
};

/** Inject the vertex deformation into a lit material's shader source. */
export function injectDeform(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, deform: VertexDeform, withNormals: boolean) {
  Object.assign(shader.uniforms, deform.uniforms);
  let vertex = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
${deform.declarations}
void creatureDeform(inout vec3 p, inout vec3 n) {
${deform.body}
}`,
  );
  if (withNormals) {
    vertex = vertex.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
{
  vec3 creatureNormalPoint = position;
  creatureDeform(creatureNormalPoint, objectNormal);
}`,
    );
  }
  vertex = vertex.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
{
  vec3 creatureUnusedNormal = vec3(0.0, 1.0, 0.0);
  creatureDeform(transformed, creatureUnusedNormal);
}`,
  );
  if (withNormals && deform.vertexAfterProject) vertex = vertex.replace("#include <project_vertex>", `#include <project_vertex>\n${deform.vertexAfterProject}`);
  shader.vertexShader = vertex;
  if (deform.fragmentDeclarations || deform.fragmentFinish || deform.fragmentColor) {
    let fragment = shader.fragmentShader.replace("#include <common>", `#include <common>\n${deform.fragmentDeclarations ?? ""}`);
    if (deform.fragmentColor) fragment = fragment.replace("#include <color_fragment>", `#include <color_fragment>\n${deform.fragmentColor}`);
    if (deform.fragmentFinish) fragment = fragment.replace("#include <opaque_fragment>", `#include <opaque_fragment>\n${deform.fragmentFinish}`);
    shader.fragmentShader = fragment;
  }
}

/**
 * Give a lit material the deformation, the engine's water lighting, and a
 * distinct program key. Returns the same material.
 */
export function applyDeform<T extends THREE.Material>(material: T, deform: VertexDeform, patchMaterial: (material: THREE.Material) => void): T {
  material.onBeforeCompile = shader => injectDeform(shader, deform, true);
  patchMaterial(material);
  const patchedKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${patchedKey()}|creature:${deform.key}`;
  material.needsUpdate = true;
  return material;
}

/** A depth material for shadows that bends with the animal. */
export function createDeformDepthMaterial(deform: VertexDeform) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = shader => injectDeform(shader, { ...deform, vertexAfterProject: undefined, fragmentDeclarations: undefined, fragmentFinish: undefined, fragmentColor: undefined }, false);
  material.customProgramCacheKey = () => `creature-depth:${deform.key}`;
  return material;
}

/**
 * The body-wave and fin-flap deformation. The body wave matches
 * `bodyWaveOffset` in motion.ts; s runs from 0 at the snout to 1 at the tail.
 */
export function swimDeform(key: string, uniforms: SwimUniforms, options: { mode: SwimMode; envelope: Envelope; instanced?: boolean }): VertexDeform {
  const instanced = options.instanced ?? false;
  const declarations = `
uniform float uSwimPhase;
uniform float uSwimAmp;
uniform float uSwimWavelength;
uniform float uSwimLength;
uniform float uSwimHeadZ;
uniform float uFlapPhase;
uniform float uFlapAmp;
uniform float uFlapLag;
uniform float uFlapChord;
uniform float uFlapSweep;
attribute vec3 aFlap;
${instanced ? "attribute vec2 aSwim;" : ""}
float creatureEnvelope(float s) {
${options.envelope === "whale"
    ? "  return pow(smoothstep(0.55, 1.0, s), 1.5) + 0.111;"
    : "  return (0.02 - 0.08 * s + 0.16 * s * s) / 0.10;"}
}`;
  const phase = instanced ? "aSwim.x" : "uSwimPhase";
  const amplitude = instanced ? "uSwimAmp * aSwim.y" : "uSwimAmp";
  const body = `
  // Fins and wings: bend up and down along the span, the tip lagging the root.
  float flapSpan = abs(aFlap.x);
  if (aFlap.y > 0.0 && uFlapAmp != 0.0) {
    float spanLength = flapSpan / max(aFlap.y, 0.001);
    float angle = 6.2831853 * uFlapPhase - uFlapLag * aFlap.y - uFlapChord * aFlap.z;
    float shape = pow(aFlap.y, 1.5);
    float lift = uFlapAmp * shape * sin(angle);
    float side = sign(aFlap.x);
    p.y += lift;
    // Keep the span length roughly constant as the tip rises.
    p.x -= side * lift * lift / max(2.0 * flapSpan, 0.05);
    p.z += uFlapSweep * aFlap.y * cos(angle);
    float slope = uFlapAmp * (1.5 * sqrt(aFlap.y) * sin(angle) - shape * uFlapLag * cos(angle)) / max(spanLength, 0.01);
    n = normalize(vec3(n.x - side * slope * n.y, n.y, n.z));
  }
  // The traveling body wave, growing toward the tail.
  float s = clamp((uSwimHeadZ - p.z) / uSwimLength, 0.0, 1.1);
  float waveAngle = 6.2831853 * (s / uSwimWavelength - ${phase});
  float amp = ${amplitude};
  float envelope = creatureEnvelope(s);
  float slopeEnvelope = (creatureEnvelope(min(s + 0.01, 1.0)) - creatureEnvelope(max(s - 0.01, 0.0))) / 0.02;
  float offset = amp * envelope * uSwimLength * sin(waveAngle);
  // d(offset)/dz = -(1 / L) d(offset)/ds.
  float gradient = -amp * (slopeEnvelope * sin(waveAngle) + envelope * 6.2831853 / uSwimWavelength * cos(waveAngle));
${options.mode === "lateral"
    ? `  p.x += offset;
  n = normalize(vec3(n.x, n.y, n.z - gradient * n.x));`
    : `  p.y += offset;
  n = normalize(vec3(n.x, n.y, n.z - gradient * n.y));`}
`;
  return { key: `${key}:${options.mode}:${options.envelope}:${instanced ? "i" : "s"}`, declarations, body, uniforms: uniforms as unknown as Record<string, THREE.IUniform> };
}

/** Free a material and its textures. */
export function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}
