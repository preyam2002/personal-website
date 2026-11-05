/**
 * Material and mesh helpers shared by the scenery systems: underwater
 * lighting, vertex-shader sway, instancing, and cleanup.
 */
import * as THREE from "three";
import type { GameEnvironment } from "../types";

export type SwayOptions = {
  /** A unique name; it keeps shader programs with different sway apart. */
  key: string;
  /** Side-to-side motion at weight 1, in meters. */
  amplitude: number;
  /** Steady lean down-current at weight 1, in meters. */
  lean: number;
  /** Seconds per sway cycle. */
  period: number;
  /** Phase change from weight 0 to 1, so a wave travels up the plant. */
  wave?: number;
  /** Direction of the current in the horizontal plane (radians, like a yaw). */
  currentAngle: number;
  /** Raise the weight to this power before use. */
  stiffness?: number;
};

export type SwayUniforms = { uSwayTime: THREE.IUniform<number> };

export function createSwayUniforms(): SwayUniforms {
  return { uSwayTime: { value: 0 } };
}

const glsl = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

/**
 * Bend vertices in world space by their `swayWeight` attribute (0 at the
 * root, 1 at the tip). The offset is turned into the instance's local space,
 * so rotated and scaled instances bend the same way in the world.
 */
export function addSway(material: THREE.Material, uniforms: SwayUniforms, options: SwayOptions) {
  const previous = material.onBeforeCompile;
  const currentX = Math.sin(options.currentAngle);
  const currentZ = Math.cos(options.currentAngle);
  const frequency = (Math.PI * 2) / options.period;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uSwayTime = uniforms.uSwayTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute float swayWeight;
uniform float uSwayTime;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  mat3 swayBasis = mat3(modelMatrix) * mat3(instanceMatrix);
  vec3 swayOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  mat3 swayBasis = mat3(modelMatrix);
  vec3 swayOrigin = modelMatrix[3].xyz;
#endif
  float swayW = pow(max(swayWeight, 0.0), ${glsl(options.stiffness ?? 1)});
  float swayPhase = dot(swayOrigin.xz, vec2(0.21, 0.17)) + swayW * ${glsl(options.wave ?? 0)};
  float swayT = uSwayTime * ${glsl(frequency)};
  vec2 current = vec2(${glsl(currentX)}, ${glsl(currentZ)});
  vec2 across = vec2(-current.y, current.x);
  float surge = sin(swayT + swayPhase) * 0.7 + sin(swayT * 2.13 + swayPhase * 1.7) * 0.3;
  float drift = sin(swayT * 0.61 + swayPhase * 0.8);
  vec2 offset = current * swayW * (${glsl(options.lean)} + surge * ${glsl(options.amplitude)})
    + across * swayW * drift * ${glsl(options.amplitude * 0.6)};
  vec3 worldOffset = vec3(offset.x, -swayW * abs(surge) * ${glsl(options.amplitude * 0.15)}, offset.y);
  transformed += inverse(swayBasis) * worldOffset;
}`);
  };
  return material;
}

/**
 * Give a lit material the engine's underwater light. Call after any custom
 * onBeforeCompile; `key` keeps programs with different custom code apart,
 * because the engine's patch shares one cache key per material type.
 */
export function prepareMaterial<T extends THREE.Material>(environment: GameEnvironment, material: T, key?: string): T {
  environment.patchMaterial(material);
  if (key) {
    const base = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${base()}:${key}`;
  }
  return material;
}

export type InstanceSpec = { matrix: THREE.Matrix4; color?: THREE.Color };

export function createInstancedMesh(geometry: THREE.BufferGeometry, material: THREE.Material, specs: readonly InstanceSpec[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(specs.length, 1));
  mesh.count = specs.length;
  const hasColor = specs.some(spec => spec.color);
  specs.forEach((spec, index) => {
    mesh.setMatrixAt(index, spec.matrix);
    if (hasColor) mesh.setColorAt(index, spec.color ?? new THREE.Color(1, 1, 1));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

/**
 * Split instances into square cells so the renderer can cull the ones out of
 * view. Each non-empty cell is one draw call.
 */
export function createChunkedInstances(geometry: THREE.BufferGeometry, material: THREE.Material, specs: readonly InstanceSpec[], cellSize: number) {
  const cells = new Map<string, InstanceSpec[]>();
  const position = new THREE.Vector3();
  for (const spec of specs) {
    position.setFromMatrixPosition(spec.matrix);
    const key = `${Math.floor(position.x / cellSize)},${Math.floor(position.z / cellSize)}`;
    const list = cells.get(key);
    if (list) list.push(spec);
    else cells.set(key, [spec]);
  }
  return [...cells.values()].map(list => createInstancedMesh(geometry, material, list));
}

export function instanceMatrix(x: number, y: number, z: number, quaternion: THREE.Quaternion, scale: number | THREE.Vector3) {
  const size = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : scale;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, size);
}

/** A rotation that tips the up axis partly toward a surface normal, then turns about it. */
export function groundQuaternion(normal: readonly number[], yaw: number, follow = 1, tilt?: { x: number; z: number }) {
  const up = new THREE.Vector3(0, 1, 0);
  const target = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  if (tilt) target.add(new THREE.Vector3(tilt.x, 0, tilt.z)).normalize();
  const direction = up.clone().lerp(target, follow).normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(up, direction);
  return align.multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw));
}

/** Keeps track of what a system adds, so dispose() frees all of it. */
export class Resources {
  private disposables = new Set<{ dispose: () => void }>();
  private objects: THREE.Object3D[] = [];

  track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.add(item);
    return item;
  }

  /** Add an object to a parent and track its geometries, materials, and textures. */
  add<T extends THREE.Object3D>(parent: THREE.Object3D, object: T): T {
    parent.add(object);
    this.objects.push(object);
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) this.track(mesh.geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        this.track(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) this.track(value);
        }
      }
      if (child instanceof THREE.InstancedMesh) this.track(child);
    });
    return object;
  }

  dispose() {
    for (const object of this.objects) object.removeFromParent();
    this.objects = [];
    for (const item of this.disposables) item.dispose();
    this.disposables.clear();
  }
}

/** Count the triangles a group draws (instances included). For logs and tests. */
export function countTriangles(root: THREE.Object3D) {
  let total = 0;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const perInstance = geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
    total += perInstance * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return total;
}

export function countDrawCalls(root: THREE.Object3D) {
  let total = 0;
  root.traverse(object => {
    if ((object as THREE.Mesh).isMesh || (object as THREE.Sprite).isSprite || (object as THREE.Line).isLine) total += 1;
  });
  return total;
}
