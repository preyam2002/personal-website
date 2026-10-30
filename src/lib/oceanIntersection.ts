import {
  OCEAN_WAVE_COMPONENT_COUNT,
  type Direction3,
  type OceanWaveField,
} from "./oceanWaves";

const INTERSECTION_STEPS = 2048;
const INTERSECTION_DEPTH = 28;
const INTERSECTION_TOLERANCE = 0.005;

export type OceanIntersectionBounds = {
  height: number;
  detail: readonly [number, number, number];
};

/** `detail` packs extra waves as (kx, kz, ω, amplitude) rows. */
export function getOceanIntersectionBounds(
  field: OceanWaveField,
  detail?: { data: Float32Array },
): OceanIntersectionBounds {
  let height = 0;
  const coarse: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    height += Math.abs(field.data[index * 4 + 3]);
  }
  if (detail) {
    for (let index = 0; index < detail.data.length / 4; index += 1) {
      const offset = index * 4;
      const amplitude = Math.abs(detail.data[offset + 3]);
      coarse[0] += amplitude;
      coarse[1] += amplitude * Math.abs(detail.data[offset]);
      coarse[2] += amplitude * Math.abs(detail.data[offset + 1]);
    }
  }
  return { height: height + coarse[0] + 0.0001, detail: coarse };
}

function fade(start: number, end: number, distance: number) {
  const value = Math.max(0, Math.min(1, (distance - start) / (end - start)));
  return 1 - value * value * (3 - 2 * value);
}

function fadeDerivativeBound(start: number, end: number, near: number, far: number) {
  if (far <= start || near >= end) return 0;
  const midpoint = Math.max(near, Math.min(far, (start + end) * 0.5));
  const value = Math.max(0, Math.min(1, (midpoint - start) / (end - start)));
  return 6 * value * (1 - value) / (end - start);
}

export function oceanRayHeightDerivativeBound(
  field: OceanWaveField,
  detail: OceanIntersectionBounds["detail"],
  direction: Direction3,
  near: number,
  far: number,
): number {
  let direct = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let warpX = 0;
  let warpZ = 0;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    const offset = index * 4;
    const kx = field.data[offset];
    const kz = field.data[offset + 1];
    const waveNumber = Math.hypot(kx, kz);
    const wavelength = 2 * Math.PI / waveNumber;
    const amplitude = Math.abs(field.data[offset + 3]);
    const resolved = amplitude * fade(wavelength * 9, wavelength * 26, near);
    const transition = amplitude * fadeDerivativeBound(wavelength * 9, wavelength * 26, near, far);
    const along = resolved * Math.abs(kx * direction[0] + kz * direction[2]) + transition;
    direct += along;
    slopeX += resolved * Math.abs(kx);
    slopeZ += resolved * Math.abs(kz);
    warpX += Math.abs(kx) / waveNumber * along;
    warpZ += Math.abs(kz) / waveNumber * along;
  }
  warpX *= Math.abs(field.choppiness);
  warpZ *= Math.abs(field.choppiness);
  return direct + slopeX * warpX + slopeZ * warpZ
    + fade(45, 190, near) * (
      detail[1] * (Math.abs(direction[0]) + warpX)
      + detail[2] * (Math.abs(direction[2]) + warpZ)
    )
    + detail[0] * fadeDerivativeBound(45, 190, near, far);
}

export type OceanIntersection = {
  distance: number | null;
  evaluations: number;
  exhausted: boolean;
};

/**
 * Reference solver for first-hit tests, not a per-pixel GPU loop.
 * The caller must supply valid global height and interval derivative bounds.
 * The solver returns a bracketed hit within 5 mm, or marks unresolved work.
 * It does not classify an unresolved tangent or exhausted budget as a clear miss.
 */
export function intersectOceanHeightfield(
  origin: Direction3,
  direction: Direction3,
  height: (x: number, z: number, distance: number) => number,
  heightBound: number,
  derivativeBound: (near: number, far: number) => number,
  maxDistance = 100_000,
): OceanIntersection {
  let near = 0;
  let far = maxDistance;
  let evaluations = 0;
  const result = (distance: number | null, exhausted = false) => ({ distance, evaluations, exhausted });
  if (Math.abs(direction[1]) > 1e-8) {
    const upper = (heightBound - origin[1]) / direction[1];
    const lower = (-heightBound - origin[1]) / direction[1];
    near = Math.max(0, Math.min(upper, lower));
    far = Math.min(maxDistance, Math.max(upper, lower));
  } else if (Math.abs(origin[1]) > heightBound) {
    return result(null);
  }
  if (far <= near) return result(null);
  const sample = (distance: number) => {
    evaluations += 1;
    return origin[1] + direction[1] * distance - height(
      origin[0] + direction[0] * distance,
      origin[2] + direction[2] * distance,
      distance,
    );
  };
  type Interval = readonly [number, number, number, number, number];
  const stack: Interval[] = [[near, far, sample(near), sample(far), 0]];
  let unresolvedStart = Infinity;
  for (let step = 0; step < INTERSECTION_STEPS && stack.length > 0; step += 1) {
    const [low, high, lowSign, highSign, depth] = stack.pop()!;
    if (low - unresolvedStart > INTERSECTION_TOLERANCE) return result(null, true);
    if (lowSign === 0) return result(low);
    const width = high - low;
    const limit = (Math.abs(direction[1]) + derivativeBound(low, high)) * 1.0001 + 1e-7;
    const crosses = lowSign * highSign <= 0;
    // Endpoint cones certify that this whole interval cannot reach zero.
    if (!crosses && Math.abs(lowSign) + Math.abs(highSign) > limit * width) continue;
    if (width <= INTERSECTION_TOLERANCE && crosses) {
      if (high - unresolvedStart > INTERSECTION_TOLERANCE) return result(null, true);
      return result(low + width * Math.abs(lowSign) / (Math.abs(lowSign) + Math.abs(highSign)));
    }
    if (width <= INTERSECTION_TOLERANCE / 128) {
      unresolvedStart = Math.min(unresolvedStart, low);
      continue;
    }
    if (depth >= INTERSECTION_DEPTH) return result(null, true);
    const middle = (low + high) * 0.5;
    const middleSign = sample(middle);
    stack.push([middle, high, middleSign, highSign, depth + 1]);
    stack.push([low, middle, lowSign, middleSign, depth + 1]);
  }
  return result(null, stack.length > 0 || Number.isFinite(unresolvedStart));
}
