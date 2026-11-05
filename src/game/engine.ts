import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { TexturePass } from "three/examples/jsm/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { creatureSystems } from "./creatures";
import { environmentSystems } from "./environment";
import { evaluatePhoto, createJournal, journalProgress, recordDiscovery, type JournalEntry } from "./gameState";
import { opticsShader } from "./optics";
import {
  createDiver,
  isUnderwater,
  stepDiver,
  turnDiver,
  viewDirection,
  type DiverInput,
} from "./player";
import type { Discoverable, DiverView, GameEnvironment, GameQuality, GameSystem } from "./types";
import { SPAWN, WORLD_SIZE, seabedHeight, zoneAt } from "./world";

export type GameHud = {
  depth: number;
  oxygen: number;
  heading: number;
  zone: string | null;
  underwater: boolean;
  journal: JournalEntry[];
  message: string | null;
  flash: number;
  loading: number;
};

export type OceanGameOptions = {
  quality: GameQuality;
  reducedMotion: boolean;
  onHud: (hud: GameHud) => void;
};

const SUN_DIRECTION = new THREE.Vector3(-0.35, 0.72, 0.6).normalize();
const SUN_COLOR = new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(3.2);
const NEAR = 0.1;
const FAR = 3000;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const fullscreenVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Light along the view ray through the water.
 *
 * The pass rebuilds the world position of each pixel from the depth buffer and
 * finds the part of the view ray below the surface. That part absorbs light
 * per channel and adds blue-green light scattered from the sun and the sky.
 * A short march along the ray adds sun shafts: a slow, coarse pattern at the
 * surface that the sun direction projects down through the water.
 */
const waterVolumeFragment = `
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform vec3 uCameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float time;
uniform int shaftSamples;
varying vec2 vUv;
${opticsShader}

float shaftNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(cell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float shaftPattern(vec3 point) {
  vec2 surface = point.xz + sunDirection.xz / max(sunDirection.y, 0.2) * point.y;
  float pattern = shaftNoise(surface * 0.35 + vec2(time * 0.05, time * 0.03)) * 0.6
    + shaftNoise(surface * 0.9 - vec2(time * 0.08, -time * 0.04)) * 0.4;
  return smoothstep(0.45, 0.9, pattern);
}

void main() {
  vec4 base = texture2D(tScene, vUv);
  float depth = texture2D(tDepth, vUv).x;
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = projectionInverse * clip;
  view /= view.w;
  vec3 world = (cameraWorld * vec4(view.xyz, 1.0)).xyz;
  vec3 direction = normalize(world - uCameraPosition);
  float far = depth >= 0.9999 ? 1.0e4 : length(world - uCameraPosition);
  float enter = 0.0;
  float exit = far;
  if (uCameraPosition.y < 0.0) {
    if (direction.y > 0.0) exit = min(far, -uCameraPosition.y / direction.y);
  } else {
    if (direction.y >= 0.0) {
      gl_FragColor = base;
      return;
    }
    enter = uCameraPosition.y / -direction.y;
  }
  if (exit <= enter) {
    gl_FragColor = base;
    return;
  }
  float travel = min(exit - enter, 400.0);
  vec3 transmittance = exp(-WATER_EXTINCTION * travel);
  // Light scattered toward the camera. Far from any object the water shows its own
  // color, which darkens with depth by the downwelling attenuation Kd. Most of the
  // scattered light comes from the first few meters of the ray, so sample the depth there.
  vec3 start = uCameraPosition + direction * enter;
  float sampleDepth = -min(start.y + direction.y * min(travel * 0.5, 6.0), 0.0);
  vec3 refractedSun = -refract(-sunDirection, vec3(0.0, 1.0, 0.0), 0.75);
  float cosine = dot(direction, refractedSun);
  // Henyey-Greenstein with g = 0.85, plus 15% isotropic scattering, normalized to 1 at 90 degrees.
  float g = 0.85;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosine, 1.5);
  float hgSide = (1.0 - g * g) / pow(1.0 + g * g, 1.5);
  float phase = 0.85 + 0.15 * min(hg / hgSide, 40.0) * 0.12;
  vec3 waterColor = WATER_COLOR * exp(-WATER_KD * sampleDepth) * (sunColor.g / 3.0);
  vec3 inScatter = waterColor * phase * (1.0 - transmittance);
  // Sun shafts along the first 60 m of the segment.
  vec3 shafts = vec3(0.0);
  float shaftLength = min(travel, 60.0);
  float stepLength = shaftLength / float(shaftSamples);
  for (int index = 0; index < 24; index++) {
    if (index >= shaftSamples) break;
    float along = (float(index) + 0.5) * stepLength;
    vec3 point = start + direction * along;
    if (point.y > 0.0) continue;
    vec3 reach = exp(-WATER_EXTINCTION * along) * sunlightAtDepth(-point.y, sunDirection);
    shafts += reach * shaftPattern(point) * stepLength;
  }
  shafts *= WATER_SCATTERING * sunColor * 0.9 * phase;
  gl_FragColor = vec4(base.rgb * transmittance + inScatter + shafts, 1.0);
}
`;

const surfaceVertex = `
uniform float time;
uniform vec3 cameraOffset;
uniform float detailFade;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;
varying vec4 vClip;

// Gerstner waves: each point moves on a circle, so crests sharpen.
const int WAVES = 5;
const vec4 WAVE[WAVES] = vec4[WAVES](
  // direction x, direction z, wavelength, amplitude
  vec4(0.80, 0.60, 42.0, 0.32),
  vec4(0.95, -0.31, 23.0, 0.20),
  vec4(0.31, 0.95, 12.0, 0.11),
  vec4(-0.6, 0.8, 6.5, 0.06),
  vec4(0.99, 0.14, 3.3, 0.03)
);

void main() {
  vec3 point = position.xzy;
  point.xz += cameraOffset.xz;
  vec3 displaced = point;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float distance = length(point.xz - cameraOffset.xz);
  float fade = 1.0 - smoothstep(250.0, 1200.0, distance);
  float jacobian = 1.0;
  for (int index = 0; index < WAVES; index++) {
    vec2 direction = normalize(WAVE[index].xy);
    float waveNumber = 6.2831853 / WAVE[index].z;
    float speed = sqrt(9.81 / waveNumber);
    float amplitude = WAVE[index].w * fade;
    float steepness = 0.55 / (waveNumber * amplitude * float(WAVES) + 0.0001);
    steepness = min(steepness, 1.0);
    float phase = waveNumber * (dot(direction, point.xz) - speed * time);
    float s = sin(phase);
    float c = cos(phase);
    float qa = steepness * amplitude;
    displaced.x += qa * direction.x * c;
    displaced.z += qa * direction.y * c;
    displaced.y += amplitude * s;
    tangent += vec3(-qa * direction.x * direction.x * waveNumber * s, amplitude * direction.x * waveNumber * c,
      -qa * direction.x * direction.y * waveNumber * s);
    binormal += vec3(-qa * direction.x * direction.y * waveNumber * s, amplitude * direction.y * waveNumber * c,
      -qa * direction.y * direction.y * waveNumber * s);
    jacobian -= qa * waveNumber * s;
  }
  vWorld = displaced;
  vNormal = normalize(cross(binormal, tangent));
  vFoam = smoothstep(0.45, 0.1, jacobian);
  vClip = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  gl_Position = vClip;
}
`;

/**
 * The sea surface, drawn after the water volume pass.
 *
 * From above it mixes the refracted, already fogged scene below with the
 * reflected sky by Fresnel, adds sun glitter and crest foam. From below it
 * shows Snell's window: the sky inside a 97 degree cone, and total internal
 * reflection of the dark water outside it.
 */
const surfaceFragment = `
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform samplerCube skyCube;
// Three.js declares cameraPosition for a ShaderMaterial; the surface draws with the scene camera.
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec2 resolution;
uniform float time;
uniform float cameraNear;
uniform float cameraFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;
varying vec4 vClip;
${opticsShader}

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x), local.y);
}

// Small ripples that the mesh cannot carry, as a normal offset.
vec2 ripple(vec2 point) {
  float e = 0.08;
  vec2 a = point * 1.3 + vec2(time * 0.35, time * 0.2);
  vec2 b = point * 3.1 - vec2(time * 0.5, -time * 0.4);
  float h0 = noise(a) * 0.6 + noise(b) * 0.4;
  float hx = noise(a + vec2(e, 0.0)) * 0.6 + noise(b + vec2(e, 0.0)) * 0.4;
  float hz = noise(a + vec2(0.0, e)) * 0.6 + noise(b + vec2(0.0, e)) * 0.4;
  return vec2(hx - h0, hz - h0) / e;
}

void main() {
  vec2 screen = gl_FragCoord.xy / resolution;
  float sceneDepth = texture2D(tDepth, screen).x;
  float sceneView = perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
  float surfaceView = -vClip.w;
  if (sceneDepth < 0.9999 && sceneView > surfaceView) discard;
  float distance = length(vWorld - cameraPosition);
  float detail = 1.0 - smoothstep(30.0, 220.0, distance);
  vec3 normal = normalize(vNormal + vec3(-ripple(vWorld.xz).x, 0.0, -ripple(vWorld.xz).y) * 0.06 * detail);
  vec3 view = normalize(vWorld - cameraPosition);
  bool below = cameraPosition.y < vWorld.y;
  vec3 color;
  if (!below) {
    float facing = max(dot(-view, normal), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflected = textureCube(skyCube, reflect(view, normal)).rgb;
    // Refraction offsets the view of the water below by the surface slope.
    vec2 offset = normal.xz * 0.06 * (1.0 - smoothstep(0.0, 80.0, distance));
    vec3 refracted = texture2D(tScene, clamp(screen + offset, 0.001, 0.999)).rgb;
    float glitter = pow(max(dot(reflect(view, normal), sunDirection), 0.0), 900.0) * 60.0;
    color = mix(refracted, reflected, fresnel) + sunColor * glitter * (1.0 - vFoam);
    float foam = vFoam * smoothstep(0.35, 0.75, noise(vWorld.xz * 0.6 + time * 0.2));
    color = mix(color, vec3(0.85, 0.9, 0.92) * (sunColor * 0.2 + 0.25), foam * 0.7);
    // Distant haze toward the horizon.
    color = mix(color, textureCube(skyCube, normalize(vec3(view.x, 0.02, view.z))).rgb, smoothstep(300.0, 2500.0, distance));
  } else {
    vec3 up = -normal;
    vec3 transmitted = refract(view, up, 1.333);
    // The fog color matches the water volume pass, so the surface meets the fog without an edge.
    float sampleDepth = max(-(cameraPosition.y + view.y * min(distance * 0.5, 6.0)), 0.0);
    vec3 fog = WATER_COLOR * exp(-WATER_KD * sampleDepth) * (sunColor.g / 3.0);
    // Outside Snell's window the surface mirrors the darker water below it.
    vec3 water = WATER_COLOR * exp(-WATER_KD * 12.0) * (sunColor.g / 3.0);
    if (dot(transmitted, transmitted) > 0.0) {
      float facing = max(dot(view, -up), 0.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
      // The window passes the sky through the surface; the eye has adapted to the darker water.
      vec3 sky = textureCube(skyCube, transmitted).rgb * 0.45;
      sky += sunColor * pow(max(dot(transmitted, sunDirection), 0.0), 300.0) * 25.0;
      color = mix(sky, water, fresnel);
    } else {
      color = water;
    }
    vec3 travel = exp(-WATER_EXTINCTION * distance);
    color = color * travel + fog * (1.0 - travel);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

const finishFragment = `
uniform sampler2D tDiffuse;
uniform float time;
uniform float underwater;
uniform float flash;
varying vec2 vUv;
float hash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233)) + time * 61.0) * 43758.5453);
}
void main() {
  vec2 center = vUv - 0.5;
  // A lens under water shifts colors slightly at the frame edge.
  vec2 shift = center * 0.0035 * underwater;
  vec3 color = vec3(
    texture2D(tDiffuse, vUv + shift).r,
    texture2D(tDiffuse, vUv).g,
    texture2D(tDiffuse, vUv - shift).b
  );
  float vignette = 1.0 - (0.22 + 0.18 * underwater) * smoothstep(0.3, 0.85, length(center) * 1.3);
  color *= vignette;
  color += (hash(vUv * 1000.0) - 0.5) * 0.012;
  color = mix(color, vec3(1.0), flash);
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Patch a lit material so that sunlight and caustics follow the water above it. */
function createMaterialPatcher(uniforms: { uTime: THREE.IUniform<number>; uSunDirection: THREE.IUniform<THREE.Vector3> }) {
  return (material: THREE.Material) => {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uSunDirection = uniforms.uSunDirection;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vOceanWorld;")
        .replace("#include <project_vertex>", `#include <project_vertex>
vec4 oceanPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
oceanPosition = instanceMatrix * oceanPosition;
#endif
vOceanWorld = (modelMatrix * oceanPosition).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec3 vOceanWorld;
uniform float uTime;
uniform vec3 uSunDirection;
${opticsShader}`)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
if (vOceanWorld.y < 0.0) {
  vec3 oceanLight = sunlightAtDepth(-vOceanWorld.y, uSunDirection);
  float oceanCaustic = caustics(vOceanWorld, uSunDirection, uTime);
  reflectedLight.directDiffuse *= oceanLight * (0.5 + oceanCaustic * 2.8);
  reflectedLight.directSpecular *= oceanLight;
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), oceanLight, 0.7) * vec3(0.75, 0.95, 1.1);
  reflectedLight.indirectSpecular *= oceanLight;
}`);
    };
    // Keep any key the material already has, so other shader edits get their own program.
    const previousKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `ocean-optics:${previousKey()}`;
    material.needsUpdate = true;
  };
}

/** Load a seabed texture that repeats every few meters. */
function loadSeabedTexture(loader: THREE.TextureLoader, file: string, color: boolean, anisotropy: number) {
  const texture = loader.load(`/game/textures/${file}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // One tile is about 4.5 m of rippled sand.
  texture.repeat.set((WORLD_SIZE + 200) / 4.5, (WORLD_SIZE + 200) / 4.5);
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSeabed(quality: GameQuality, random: () => number, anisotropy: number) {
  const segments = quality === "high" ? 320 : quality === "medium" ? 220 : 140;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE + 200, WORLD_SIZE + 200, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  // Vertex colors tint the sand texture: large patches of lighter and darker sand, and rock on slopes.
  const sand = new THREE.Color(1.0, 0.97, 0.92);
  const darkSand = new THREE.Color(0.74, 0.7, 0.62);
  const rock = new THREE.Color(0.42, 0.4, 0.36);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = seabedHeight(x, z);
    positions.setY(index, height);
    const slope = Math.hypot(seabedHeight(x + 1, z) - height, seabedHeight(x, z + 1) - height);
    color.copy(sand).lerp(darkSand, Math.min(Math.max((random() - 0.5) * 0.4 + Math.sin(x * 0.05) * 0.2 + 0.3, 0), 1));
    color.lerp(rock, Math.min(Math.max((slope - 0.35) * 2.5, 0), 0.9));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const loader = new THREE.TextureLoader();
  const orm = loadSeabedTexture(loader, "seabed_ripples_orm.jpg", false, anisotropy);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: loadSeabedTexture(loader, "seabed_ripples_basecolor.jpg", true, anisotropy),
    normalMap: loadSeabedTexture(loader, "seabed_ripples_normal.jpg", false, anisotropy),
    normalScale: new THREE.Vector2(1, 1),
    aoMap: orm,
    roughnessMap: orm,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = quality !== "low";
  return mesh;
}

function createMarineSnow(quality: GameQuality, random: () => number) {
  const count = quality === "high" ? 6000 : quality === "medium" ? 3500 : 1500;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions.set([(random() - 0.5) * 40, (random() - 0.5) * 40, (random() - 0.5) * 40], index * 3);
    sizes[index] = 0.5 + random() * random() * 2.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      center: { value: new THREE.Vector3() },
      time: { value: 0 },
      sunDirection: { value: SUN_DIRECTION },
      pixelRatio: { value: 1 },
    },
    vertexShader: `
uniform vec3 center;
uniform float time;
uniform float pixelRatio;
attribute float size;
varying float vFade;
varying float vDepth;
void main() {
  vec3 drift = position + vec3(sin(time * 0.1 + position.y) * 0.4, -time * 0.05, cos(time * 0.08 + position.x) * 0.4);
  vec3 world = mod(drift - center + 20.0, 40.0) - 20.0 + center;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vFade = (1.0 - smoothstep(10.0, 20.0, length(world - center))) * smoothstep(0.3, 1.5, -world.y);
  vDepth = -world.y;
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * pixelRatio * 22.0 / max(-view.z, 0.5);
}`,
    fragmentShader: `
uniform vec3 sunDirection;
varying float vFade;
varying float vDepth;
${opticsShader}
void main() {
  float shape = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
  if (shape * vFade < 0.01) discard;
  vec3 light = sunlightAtDepth(vDepth, sunDirection) * 0.9 + vec3(0.02, 0.05, 0.07);
  gl_FragColor = vec4(light, shape * vFade * 0.55);
}`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

type Bubble = { position: THREE.Vector3; speed: number; age: number; wobble: number };

function createBubbles() {
  const count = 80;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(count), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
uniform float pixelRatio;
attribute float size;
void main() {
  vec4 view = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * pixelRatio * 60.0 / max(-view.z, 0.3);
}`,
    fragmentShader: `
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  // A bubble is clear inside, with a bright rim and a highlight.
  float rim = smoothstep(0.55, 0.95, radius) * (1.0 - smoothstep(0.95, 1.0, radius));
  float highlight = 1.0 - smoothstep(0.0, 0.25, length(gl_PointCoord - vec2(0.35, 0.3)));
  gl_FragColor = vec4(vec3(0.8, 0.95, 1.0) * (rim + highlight), (rim + highlight) * 0.8);
}`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const bubbles: Bubble[] = [];
  return { points, bubbles, count };
}

export async function createOceanGame(canvas: HTMLCanvasElement, options: OceanGameOptions) {
  const { quality } = options;
  const random = seededRandom(20261105);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.5 : quality === "medium" ? 1 : 0.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, NEAR, FAR);
  const sharedUniforms = { uTime: { value: 0 }, uSunDirection: { value: SUN_DIRECTION.clone() } };
  const patchMaterial = createMaterialPatcher(sharedUniforms);

  // Sky, and a cube capture of it for reflections and for the view through the surface.
  const sky = new Sky();
  // Scale the sky to the range of the sun light in the scene. The sun disc is far
  // brighter than a half-float target holds, so clamp it, and replace NaN, so the cube capture and its filtered copy stay finite.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    "gl_FragColor = vec4( texColor, 1.0 );",
    "texColor = min(texColor * 0.3, vec3(400.0));\n      if (any(isnan(texColor))) texColor = vec3(0.0);\n      gl_FragColor = vec4( texColor, 1.0 );",
  );
  sky.scale.setScalar(2500);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 4;
  skyUniforms.rayleigh.value = 1.4;
  skyUniforms.mieCoefficient.value = 0.004;
  skyUniforms.mieDirectionalG.value = 0.82;
  skyUniforms.sunPosition.value.copy(SUN_DIRECTION);
  const skyScene = new THREE.Scene();
  skyScene.add(sky);
  const skyCubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(1, 5000, skyCubeTarget);
  cubeCamera.update(renderer, skyScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Filter the captured cube. PMREM.fromScene clips the large sky box at its far plane.
  const environmentTarget = pmrem.fromCubemap(skyCubeTarget.texture);
  scene.environment = environmentTarget.texture;
  scene.background = skyCubeTarget.texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(SUN_COLOR, 1);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(120);
  sun.castShadow = quality === "high";
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const seabed = createSeabed(quality, random, Math.min(renderer.capabilities.getMaxAnisotropy(), quality === "low" ? 2 : 8));
  patchMaterial(seabed.material as THREE.Material);
  scene.add(seabed);
  const snow = createMarineSnow(quality, random);
  scene.add(snow);
  const breath = createBubbles();
  scene.add(breath.points);

  // The sea surface: a dense grid that follows the camera and a coarse ring to the horizon.
  const surfaceUniforms = {
    tScene: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    skyCube: { value: skyCubeTarget.texture },
    cameraOffset: { value: new THREE.Vector3() },
    sunDirection: { value: SUN_DIRECTION },
    sunColor: { value: SUN_COLOR },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    cameraNear: { value: NEAR },
    cameraFar: { value: FAR },
    detailFade: { value: 1 },
  };
  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: surfaceUniforms,
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    side: THREE.DoubleSide,
  });
  const surfaceScene = new THREE.Scene();
  const gridSegments = quality === "high" ? 300 : quality === "medium" ? 200 : 120;
  const nearSurface = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, gridSegments, gridSegments), surfaceMaterial);
  const farSurface = new THREE.Mesh(new THREE.RingGeometry(150, 4000, 64, 24), surfaceMaterial);
  for (const mesh of [nearSurface, farSurface]) {
    mesh.frustumCulled = false;
    surfaceScene.add(mesh);
  }

  // Render targets: the scene with depth, the water volume, and the surface on top.
  const makeTarget = (withDepth: boolean) => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    if (withDepth) {
      target.depthTexture = new THREE.DepthTexture(1, 1);
      target.depthTexture.type = THREE.UnsignedIntType;
    }
    return target;
  };
  const sceneTarget = makeTarget(true);
  const volumeTarget = makeTarget(false);
  const surfaceTarget = makeTarget(false);
  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneTarget.texture },
      tDepth: { value: sceneTarget.depthTexture },
      projectionInverse: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      uCameraPosition: { value: new THREE.Vector3() },
      sunDirection: { value: SUN_DIRECTION },
      sunColor: { value: SUN_COLOR },
      time: { value: 0 },
      shaftSamples: { value: quality === "high" ? 20 : quality === "medium" ? 12 : 6 },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: waterVolumeFragment,
    depthTest: false,
    depthWrite: false,
  });
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: volumeTarget.texture } },
    vertexShader: fullscreenVertex,
    fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }",
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volumeMaterial);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  surfaceUniforms.tScene.value = volumeTarget.texture;
  surfaceUniforms.tDepth.value = sceneTarget.depthTexture;

  const composer = new EffectComposer(renderer);
  composer.addPass(new TexturePass(surfaceTarget.texture));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.6, 0.9);
  bloom.enabled = quality !== "low";
  composer.addPass(bloom);
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, underwater: { value: 0 }, flash: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: finishFragment,
  });
  composer.addPass(new OutputPass());
  composer.addPass(finish);
  if (quality !== "low") composer.addPass(new SMAAPass());

  // Systems from the creature and scenery modules.
  const discoverables: Discoverable[] = [];
  const diver = createDiver(SPAWN.x, SPAWN.z, 0);
  const diverView: DiverView = {
    position: new THREE.Vector3(...diver.position),
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    underwater: false,
    depth: 0,
  };
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const environment: GameEnvironment = {
    scene,
    renderer,
    gltf,
    quality,
    patchMaterial,
    seabedHeight,
    sunDirection: SUN_DIRECTION.clone(),
    random,
    addDiscoverable: discoverable => discoverables.push(discoverable),
    threats: () => [{ position: diverView.position, radius: 6 }],
  };
  const hud: GameHud = {
    depth: 0,
    oxygen: 1,
    heading: 0,
    zone: null,
    underwater: false,
    journal: [],
    message: null,
    flash: 0,
    loading: 0,
  };
  const factories = [...environmentSystems, ...creatureSystems];
  const systems: GameSystem[] = [];
  let loaded = 0;
  await Promise.all(factories.map(async factory => {
    try {
      systems.push(await factory(environment));
    } catch (error) {
      console.warn("A game system did not load", error);
    } finally {
      loaded += 1;
      hud.loading = loaded / Math.max(factories.length, 1);
      options.onHud({ ...hud });
    }
  }));
  hud.journal = createJournal(discoverables.map(({ id, name, subtitle, description }) => ({ id, name, subtitle, description })));

  const input: DiverInput = { forward: 0, strafe: 0, rise: 0, sprint: false };
  let running = false;
  let animationFrame = 0;
  let lastTime = 0;
  let gameTime = 0;
  let breathTimer = 2;
  let messageTimer = 0;
  let flash = 0;
  let width = 1;
  let height = 1;

  const showMessage = (message: string, seconds = 3.5) => {
    hud.message = message;
    messageTimer = seconds;
  };

  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    for (const target of [sceneTarget, volumeTarget, surfaceTarget]) target.setSize(pixelWidth, pixelHeight);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    surfaceUniforms.resolution.value.set(pixelWidth, pixelHeight);
    (snow.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = pixelRatio;
    (breath.points.material as THREE.ShaderMaterial).uniforms.pixelRatio.value = pixelRatio;
  };

  const updateBreath = (delta: number) => {
    breathTimer -= delta;
    if (diverView.underwater && breathTimer <= 0) {
      breathTimer = 4 + random() * 1.5;
      for (let index = 0; index < 14 && breath.bubbles.length < breath.count; index += 1) {
        const spread = new THREE.Vector3((random() - 0.5) * 0.3, -0.25 + random() * 0.1, (random() - 0.5) * 0.3);
        breath.bubbles.push({
          position: diverView.position.clone().add(spread).addScaledVector(diverView.forward, 0.35),
          speed: 0.5 + random() * 0.6,
          age: 0,
          wobble: random() * 10,
        });
      }
    }
    const positions = breath.points.geometry.attributes.position as THREE.BufferAttribute;
    const sizes = breath.points.geometry.attributes.size as THREE.BufferAttribute;
    for (let index = breath.bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = breath.bubbles[index];
      bubble.age += delta;
      bubble.position.y += bubble.speed * delta;
      bubble.position.x += Math.sin(bubble.age * 7 + bubble.wobble) * 0.15 * delta;
      if (bubble.position.y > -0.1 || bubble.age > 20) breath.bubbles.splice(index, 1);
    }
    for (let index = 0; index < breath.count; index += 1) {
      const bubble = breath.bubbles[index];
      positions.setXYZ(index, bubble?.position.x ?? 0, bubble?.position.y ?? 1e4, bubble?.position.z ?? 0);
      sizes.setX(index, bubble ? 0.04 + 0.02 * Math.min(bubble.age, 2) : 0);
    }
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
  };

  const frame = (now: number) => {
    animationFrame = requestAnimationFrame(frame);
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    if (running) {
      gameTime += delta;
      const events = stepDiver(diver, input, delta, seabedHeight);
      for (const event of events) {
        if (event === "dived") showMessage("Under water. Watch your air.", 2.5);
        if (event === "surfaced") showMessage("Surfaced. Breathing.", 2);
        if (event === "blackout") {
          showMessage("You blacked out. A boat pulled you back to the surface.", 5);
          diver.position = [diver.position[0], 0.15, diver.position[2]];
          diver.velocity = [0, 0, 0];
          diver.oxygen = 0.35;
        }
      }
    }
    const view = viewDirection(diver.yaw, diver.pitch);
    // A gentle bob at the surface, none under reduced motion.
    const bob = !isUnderwater(diver) && !options.reducedMotion ? Math.sin(gameTime * 1.3) * 0.12 : 0;
    camera.position.set(diver.position[0], diver.position[1] + bob, diver.position[2]);
    camera.lookAt(camera.position.x + view[0], camera.position.y + view[1], camera.position.z + view[2]);
    camera.updateMatrixWorld();
    diverView.position.copy(camera.position);
    diverView.velocity.set(...diver.velocity);
    diverView.forward.set(...view);
    diverView.underwater = camera.position.y < 0;
    diverView.depth = Math.max(-camera.position.y, 0);

    sharedUniforms.uTime.value = gameTime;
    for (const system of systems) system.update({ time: gameTime, delta: running ? delta : 0, camera, diver: diverView });
    updateBreath(running ? delta : 0);

    // Keep the shadow box and the surface grid around the diver.
    sun.target.position.set(camera.position.x, Math.min(camera.position.y, -2), camera.position.z);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIRECTION, 120);
    const snap = 320 / gridSegments;
    surfaceUniforms.cameraOffset.value.set(Math.round(camera.position.x / snap) * snap, 0, Math.round(camera.position.z / snap) * snap);
    surfaceUniforms.time.value = gameTime;
    const snowUniforms = (snow.material as THREE.ShaderMaterial).uniforms;
    snowUniforms.center.value.copy(camera.position);
    snowUniforms.time.value = gameTime;

    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    volumeMaterial.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    volumeMaterial.uniforms.cameraWorld.value.copy(camera.matrixWorld);
    volumeMaterial.uniforms.uCameraPosition.value.copy(camera.position);
    volumeMaterial.uniforms.time.value = gameTime;
    quad.material = volumeMaterial;
    renderer.setRenderTarget(volumeTarget);
    renderer.render(quadScene, quadCamera);
    quad.material = copyMaterial;
    renderer.setRenderTarget(surfaceTarget);
    renderer.render(quadScene, quadCamera);
    renderer.autoClear = false;
    renderer.render(surfaceScene, camera);
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
    // The eye adapts to the dim light at depth: about one stop per 15 m, at most +1.6 stops,
    // with a time constant of 1.5 s.
    // Above the water the bright sky needs a lower exposure.
    const targetExposure = diverView.underwater ? 0.9 * Math.pow(2, Math.min(diverView.depth / 15, 1.6)) : 0.55;
    const adapt = options.reducedMotion ? 1 : 1 - Math.exp(-delta / 1.5);
    renderer.toneMappingExposure += (targetExposure - renderer.toneMappingExposure) * adapt;
    flash = Math.max(flash - delta * 2.5, 0);
    finish.uniforms.time.value = gameTime;
    finish.uniforms.underwater.value = diverView.underwater ? 1 : 0;
    finish.uniforms.flash.value = flash;
    composer.render(delta);

    if (messageTimer > 0) {
      messageTimer -= delta;
      if (messageTimer <= 0) hud.message = null;
    }
    hud.depth = diverView.depth;
    hud.oxygen = diver.oxygen;
    // Positive yaw turns west, so the compass heading is the negative yaw.
    hud.heading = ((-diver.yaw * 180 / Math.PI) % 360 + 360) % 360;
    hud.zone = zoneAt(camera.position.x, camera.position.z)?.name ?? null;
    hud.underwater = diverView.underwater;
    hud.flash = flash;
    options.onHud({ ...hud, journal: hud.journal });
  };

  resize();
  animationFrame = requestAnimationFrame(frame);
  if (process.env.NODE_ENV !== "production") {
    // Browser tests read the render targets and move the diver through these handles.
    const debug = window as unknown as Record<string, unknown>;
    debug.__ocean = { renderer, sceneTarget, volumeTarget, surfaceTarget, camera, scene };
    debug.__oceanTeleport = (view: { pos: [number, number, number]; yaw: number; pitch: number }) => {
      diver.position = [...view.pos];
      diver.velocity = [0, 0, 0];
      diver.yaw = view.yaw;
      diver.pitch = view.pitch;
      diver.oxygen = 1;
    };
  }

  const subjectPosition = new THREE.Vector3();
  return {
    start() {
      running = true;
      showMessage("Look down and swim forward to dive. Photograph what you find for your journal.", 5);
    },
    pause() {
      running = false;
    },
    resume() {
      running = true;
    },
    get running() {
      return running;
    },
    setInput(next: Partial<DiverInput>) {
      Object.assign(input, next);
    },
    look(deltaX: number, deltaY: number) {
      turnDiver(diver, -deltaX, -deltaY);
    },
    /** Take a photo. Return the name of a new discovery, or null. */
    takePhoto() {
      flash = 0.85;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const result = evaluatePhoto(
        camera.position.toArray() as [number, number, number],
        forward.toArray() as [number, number, number],
        up.toArray() as [number, number, number],
        THREE.MathUtils.degToRad(camera.fov),
        camera.aspect,
        discoverables.map(subject => ({
          id: subject.id,
          position: subject.position(subjectPosition).toArray() as [number, number, number],
          radius: subject.radius,
        })),
      );
      if (!result) {
        showMessage("Nothing new in frame. Get closer to an animal or the wreck.", 2.5);
        return null;
      }
      const entry = hud.journal.find(item => item.id === result.id);
      if (!entry) return null;
      if (recordDiscovery(hud.journal, result.id, gameTime)) {
        const progress = journalProgress(hud.journal);
        showMessage(progress.complete
          ? `${entry.name} photographed. The journal is complete!`
          : `New entry: ${entry.name} (${progress.found} of ${progress.total})`, 4);
        hud.journal = [...hud.journal];
        return entry.name;
      }
      showMessage(`${entry.name} is already in your journal.`, 2);
      return null;
    },
    resize,
    dispose() {
      cancelAnimationFrame(animationFrame);
      for (const system of systems) system.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        materials.forEach(material => material.dispose());
      });
      for (const target of [sceneTarget, volumeTarget, surfaceTarget, skyCubeTarget, environmentTarget]) target.dispose();
      surfaceMaterial.dispose();
      volumeMaterial.dispose();
      copyMaterial.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

export type OceanGame = Awaited<ReturnType<typeof createOceanGame>>;
