import type { Vector3 } from "./oceanCamera";
import { OCEAN_WAVE_COMPONENT_COUNT, type OceanWaveField } from "./oceanWaves";

export const PROBE_SLOTS = 16;
export const PROBE_ROWS = 2;

/**
 * One surface query for the probe pass.
 *
 * A floating probe follows a surface particle: the shader displaces its rest
 * point, so the object moves on the wave orbit. A fixed probe asks for the
 * surface height above one world point.
 */
export type ProbeRequest = {
  key: string;
  x: number;
  z: number;
  mode: "floating" | "fixed";
  footprint: number;
};

export type ProbeSample = {
  position: Vector3;
  normal: Vector3;
};

/** Write the requests as (x, z, mode, footprint) and return the key of each slot. */
export function packProbes(requests: readonly ProbeRequest[], data: Float32Array) {
  const keys = requests.slice(0, PROBE_SLOTS).map(request => request.key);
  data.fill(0);
  keys.forEach((_, slot) => {
    const { x, z, mode, footprint } = requests[slot];
    data.set([x, z, mode === "fixed" ? 1 : 0, footprint], slot * 4);
  });
  return keys;
}

/**
 * Read the probe pass output into samples.
 *
 * Row 0 holds the surface position and row 1 holds the surface normal.
 * Keys connect each sample to the object that made the request, so a slot
 * that changed owner since the request cannot move the wrong object.
 */
export function unpackProbes(keys: readonly string[], data: Float32Array, samples: Map<string, ProbeSample>) {
  samples.clear();
  keys.forEach((key, slot) => {
    const position = data.subarray(slot * 4, slot * 4 + 3);
    const normal = data.subarray((PROBE_SLOTS + slot) * 4, (PROBE_SLOTS + slot) * 4 + 3);
    if (![...position, ...normal].every(Number.isFinite)) return;
    samples.set(key, { position: [position[0], position[1], position[2]], normal: [normal[0], normal[1], normal[2]] });
  });
  return samples;
}

/**
 * Sample the analytic swell at a surface particle.
 *
 * This mirrors the swell terms of the shader wave field: the same phases,
 * the horizontal choppy displacement, and the normal from the displaced
 * tangents. It omits the FFT wind sea, so it is the fallback before the
 * first probe readback, not a replacement for the probe pass.
 */
export function sampleSwellSurface(field: OceanWaveField, x: number, z: number, time: number): ProbeSample {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let xx = 1;
  let xz = 0;
  let zz = 1;
  for (let index = 0; index < OCEAN_WAVE_COMPONENT_COUNT; index += 1) {
    const offset = index * 4;
    const kx = field.data[offset];
    const kz = field.data[offset + 1];
    const amplitude = field.data[offset + 3];
    const waveNumber = Math.hypot(kx, kz);
    const theta = x * kx + z * kz - field.data[offset + 2] * time + field.phases[index];
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    dx += kx / waveNumber * cosine * amplitude * field.choppiness;
    dy += sine * amplitude;
    dz += kz / waveNumber * cosine * amplitude * field.choppiness;
    slopeX += kx * amplitude * cosine;
    slopeZ += kz * amplitude * cosine;
    const strain = amplitude / waveNumber * sine * field.choppiness;
    xx -= kx * kx * strain;
    xz -= kx * kz * strain;
    zz -= kz * kz * strain;
  }
  const tangentX: Vector3 = [xx, slopeX, xz];
  const tangentZ: Vector3 = [xz, slopeZ, zz];
  const normal: Vector3 = [
    tangentZ[1] * tangentX[2] - tangentZ[2] * tangentX[1],
    tangentZ[2] * tangentX[0] - tangentZ[0] * tangentX[2],
    tangentZ[0] * tangentX[1] - tangentZ[1] * tangentX[0],
  ];
  const length = Math.hypot(...normal);
  return {
    position: [x + dx, dy, z + dz],
    normal: [normal[0] / length, normal[1] / length, normal[2] / length],
  };
}
