/**
 * Shared numbers and shader code for light in sea water.
 *
 * The coefficients describe clear tropical water. The total extinction is
 * c = (0.36, 0.125, 0.118) per meter: red light fades within a few meters, and
 * green and blue reach about 40 m. Scattering adds the blue-green haze that
 * hides distant things; visibility is about 4.8 / c, or 38 m.
 */

// Per meter, linear RGB. Absorption follows pure water; scattering adds particles.
export const WATER_ABSORPTION = [0.342, 0.091, 0.076] as const;
export const WATER_SCATTERING = [0.018, 0.034, 0.042] as const;
export const WATER_EXTINCTION = WATER_ABSORPTION.map((value, index) => value + WATER_SCATTERING[index]);

/** Downwelling attenuation Kd per meter: how fast daylight fades with depth. */
export const WATER_KD = [0.33, 0.07, 0.04] as const;
/** The color of open water just below the surface, in linear RGB, for a sun of unit brightness. */
export const WATER_COLOR = [0.1, 0.38, 0.51] as const;

/** Light left after a path through water, per channel. */
export function waterTransmittance(meters: number): [number, number, number] {
  return WATER_EXTINCTION.map(value => Math.exp(-value * Math.max(meters, 0))) as [number, number, number];
}

/** The length of a straight segment from a to b that lies below the surface y = 0. */
export function underwaterLength(a: readonly number[], b: readonly number[]) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (a[1] >= 0 && b[1] >= 0) return 0;
  if (a[1] < 0 && b[1] < 0) return length;
  const below = a[1] < 0 ? a[1] : b[1];
  return length * (-below) / Math.abs(b[1] - a[1]);
}

export const opticsShader = `
const vec3 WATER_EXTINCTION = vec3(${WATER_EXTINCTION.map(value => value.toFixed(4)).join(", ")});
const vec3 WATER_SCATTERING = vec3(${WATER_SCATTERING.map(value => value.toFixed(4)).join(", ")});
const vec3 WATER_KD = vec3(${WATER_KD.map(value => value.toFixed(4)).join(", ")});
const vec3 WATER_COLOR = vec3(${WATER_COLOR.map(value => value.toFixed(4)).join(", ")});

float underwaterLength(vec3 a, vec3 b) {
  float total = length(b - a);
  if (a.y >= 0.0 && b.y >= 0.0) return 0.0;
  if (a.y < 0.0 && b.y < 0.0) return total;
  float below = a.y < 0.0 ? a.y : b.y;
  return total * (-below) / max(abs(b.y - a.y), 0.0001);
}

// Sunlight that reaches a point under water, relative to the light above the surface.
vec3 sunlightAtDepth(float depth, vec3 sunDirection) {
  float path = max(depth, 0.0) / max(sunDirection.y * 0.75 + 0.25, 0.05);
  return exp(-WATER_EXTINCTION * path);
}

// A web of bright lines, like light focused by surface waves onto the seabed.
// Two layers of moving Voronoi cells give the crossing lines of real caustics.
float causticLayer(vec2 point, float time) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  float nearest = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 seed = cell + offset;
      vec2 random = fract(sin(vec2(dot(seed, vec2(127.1, 311.7)), dot(seed, vec2(269.5, 183.3)))) * 43758.5453);
      vec2 site = offset + 0.5 + 0.38 * sin(time * (0.6 + random) + 6.2831 * random);
      float distance = length(site - local);
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return 1.0 - smoothstep(0.0, 0.16, second - nearest);
}

float caustics(vec3 worldPosition, vec3 sunDirection, float time) {
  if (worldPosition.y > -0.2) return 0.0;
  // Follow the sun ray up to the surface, where the waves focus the light.
  vec2 surfacePoint = worldPosition.xz + sunDirection.xz / max(sunDirection.y, 0.2) * worldPosition.y;
  float depth = -worldPosition.y;
  // The pattern grows and blurs with depth.
  float scale = 0.55 / (1.0 + depth * 0.05);
  float sharpness = 1.0 / (1.0 + depth * 0.06);
  float a = causticLayer(surfacePoint * scale, time * 0.9);
  float b = causticLayer(surfacePoint * scale * 1.37 + 7.3, time * 1.1);
  return pow(min(a, b) * 0.6 + a * b * 0.8, 1.6) * sharpness * smoothstep(0.2, 2.0, depth);
}
`;
