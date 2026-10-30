export type Vector3 = [number, number, number];

export type OceanCamera = {
  origin: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  focalLength: number;
};

export const CAMERA_FOCAL_LENGTH = 2.7;
export const CAMERA_ORIGIN_TOP = [0, 1.2, -6.2] as const;
export const CAMERA_ORIGIN_BOTTOM = [0, -21.2, 11.8] as const;
export const CAMERA_TARGET_TOP = [0, 0.35, 0.7] as const;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalize([x, y, z]: Vector3): Vector3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function mix(a: Vector3, b: Vector3, t: number): Vector3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function getOceanSeedPhase(seed: number) {
  return ((seed % 100_000) / 100_000) * Math.PI * 2;
}

/** Mirror the shader camera path so the CPU can map the pointer into the scene. */
export function getOceanCamera(scroll: number, seedPhase: number): OceanCamera {
  const entry = smoothstep(0, 0.205, scroll);
  const deepDescent = smoothstep(0.19, 0.96, scroll);
  const floorView = smoothstep(0.58, 0.96, scroll);
  const entryOrigin = mix([...CAMERA_ORIGIN_TOP], [0, -0.16, -2.75], entry);
  const origin = mix(entryOrigin, [...CAMERA_ORIGIN_BOTTOM], deepDescent);
  origin[0] += Math.sin(scroll * 5.1 + seedPhase) * 2.4 * deepDescent;
  origin[2] += Math.sin(scroll * 2.7 + seedPhase * 1.7) * 1.2 * deepDescent;

  const startForward = normalize([
    CAMERA_TARGET_TOP[0] - CAMERA_ORIGIN_TOP[0],
    CAMERA_TARGET_TOP[1] - CAMERA_ORIGIN_TOP[1],
    CAMERA_TARGET_TOP[2] - CAMERA_ORIGIN_TOP[2],
  ]);
  const surfaceForward = normalize([0, -0.018, 1]);
  const floorForward = normalize([0.12, -0.72, 1]);
  let forward = normalize(mix(startForward, surfaceForward, entry));
  forward = normalize(mix(forward, floorForward, floorView));
  const right = normalize(cross([0, 1, 0], forward));
  const up = cross(forward, right);
  let focalLength = CAMERA_FOCAL_LENGTH + (1.3 - CAMERA_FOCAL_LENGTH) * entry;
  focalLength += (1.55 - focalLength) * smoothstep(0.18, 0.3, scroll);
  focalLength += (1.68 - focalLength) * floorView;
  return { origin, forward, right, up, focalLength };
}

/**
 * Return the view ray for one canvas point.
 *
 * The coordinates use the display shader convention: `x` spans the aspect
 * ratio and `y` spans -1 at the bottom edge to 1 at the top edge.
 */
export function getCameraRay(camera: OceanCamera, x: number, y: number): Vector3 {
  const { forward, right, up, focalLength } = camera;
  return normalize([
    forward[0] * focalLength + right[0] * x + up[0] * y,
    forward[1] * focalLength + right[1] * x + up[1] * y,
    forward[2] * focalLength + right[2] * x + up[2] * y,
  ]);
}

/** Intersect a ray with a horizontal plane. Return null if the ray misses within the limit. */
export function intersectHorizontalPlane(
  origin: Vector3,
  direction: Vector3,
  height: number,
  maximumDistance: number,
): Vector3 | null {
  if (Math.abs(direction[1]) < 1e-6) return null;
  const distance = (height - origin[1]) / direction[1];
  if (distance <= 0 || distance > maximumDistance) return null;
  return [origin[0] + direction[0] * distance, height, origin[2] + direction[2] * distance];
}
