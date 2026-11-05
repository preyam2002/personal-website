import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Material, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";

export type GameQuality = "high" | "medium" | "low";

/** The state of the diver that systems can read each frame. */
export type DiverView = {
  position: Vector3;
  velocity: Vector3;
  forward: Vector3;
  underwater: boolean;
  depth: number;
};

export type FrameContext = {
  /** Seconds since the dive started. Frozen while the game is paused. */
  time: number;
  /** Seconds since the last frame, at most 0.1. */
  delta: number;
  camera: PerspectiveCamera;
  diver: DiverView;
};

/**
 * A thing the player can photograph for the field journal.
 *
 * The position function returns the current world position. The radius is the
 * size of the subject; a photo counts when the subject fills enough of the frame.
 */
export type Discoverable = {
  id: string;
  name: string;
  /** Latin name or a short subtitle, shown in the journal. */
  subtitle: string;
  /** Two or three sentences of real facts for the journal. */
  description: string;
  radius: number;
  position: (target: Vector3) => Vector3;
  /** Optional: the object to outline or frame. */
  object?: Object3D;
};

/** What a system receives when the engine builds the world. */
export type GameEnvironment = {
  scene: Scene;
  renderer: WebGLRenderer;
  gltf: GLTFLoader;
  quality: GameQuality;
  /** Add underwater light: caustics from above and the sun light path through the water. */
  patchMaterial: (material: Material) => void;
  seabedHeight: (x: number, z: number) => number;
  sunDirection: Vector3;
  random: () => number;
  addDiscoverable: (discoverable: Discoverable) => void;
  /** Positions that creatures should flee from, for example the diver. */
  threats: () => readonly { position: Vector3; radius: number }[];
};

export type GameSystem = {
  update: (context: FrameContext) => void;
  dispose: () => void;
};

export type GameSystemFactory = (environment: GameEnvironment) => Promise<GameSystem>;
