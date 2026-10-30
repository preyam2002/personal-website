import { WATER_IOR } from "./iwave";
import type { Direction3 } from "./oceanWaves";

const NORMAL_NODES = [-2.8569700139, -1.35562618, 0, 1.35562618, 2.8569700139];
const NORMAL_WEIGHTS = [0.0112574113, 0.222075922, 0.5333333333, 0.222075922, 0.0112574113];
const INTERVAL_NODES = [(1 - Math.sqrt(3 / 5)) / 2, 0.5, (1 + Math.sqrt(3 / 5)) / 2];
const INTERVAL_WEIGHTS = [5 / 18, 4 / 9, 5 / 18];
const INVERSE_CENTER = [
  2.81022636e-8, 3.43273939e-7, -3.5233877e-6, -4.39150654e-6,
  0.00021858087, -0.00125372503, -0.00417768164, 0.246640727, 1.50140941,
];
const INVERSE_TAIL = [
  -0.000200214257, 0.000100950558, 0.00134934322, -0.00367342844,
  0.00573950773, -0.0076224613, 0.00943887047, 1.00167406, 2.83297682,
];
const CDF_COEFFICIENTS = [1.330274429, -1.821255978, 1.781477937, -0.356563782, 0.319381530];
const TAIL_LIMIT = 6;
type Interval = readonly [number, number];

const dot = (a: Direction3, b: Direction3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v: Direction3, factor: number): Direction3 => [v[0] * factor, v[1] * factor, v[2] * factor];
const add = (a: Direction3, b: Direction3): Direction3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const polynomial = (coefficients: number[], x: number) => coefficients.reduce((p, c) => p * x + c, 0);

export function normalDensity(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = normalDensity(x) * t * polynomial(CDF_COEFFICIENTS, t);
  return x < 0 ? tail : 1 - tail;
}

/** Giles, GPU Computing Gems (2010), Table 5. */
export function inverseNormalCdf(probability: number) {
  const x = 2 * Math.min(Math.max(probability, 1e-7), 1 - 1e-7) - 1;
  const w = -Math.log((1 - x) * (1 + x));
  return Math.SQRT2 * x * (w < 5
    ? polynomial(INVERSE_CENTER, w - 2.5)
    : polynomial(INVERSE_TAIL, Math.sqrt(w) - 3));
}

export function visibleSlopeMass(a: number, b: number, [lo, hi]: Interval) {
  if (hi <= lo) return 0;
  return Math.max(a * (normalCdf(hi) - normalCdf(lo))
    - b * (normalDensity(lo) - normalDensity(hi)), 0);
}

/** Return the intervals where a*x*x + b*x + c is positive. */
export function positiveQuadraticIntervals(a: number, b: number, c: number, bounds: Interval): Interval[] {
  const [lo, hi] = bounds;
  const clip = (left: number, right: number): Interval[] => {
    const start = Math.max(lo, left), end = Math.min(hi, right);
    return end > start ? [[start, end]] : [];
  };
  if (Math.abs(a) < 1e-7) {
    if (Math.abs(b) < 1e-7) return c > 0 ? [bounds] : [];
    return b > 0 ? clip(-c / b, hi) : clip(lo, -c / b);
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return a > 0 ? [bounds] : [];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  const first = q / a, second = c / q;
  const left = Math.min(first, second), right = Math.max(first, second);
  return a < 0 ? clip(left, right) : [...clip(lo, left), ...clip(right, hi)];
}

export type ReflectionFrame = {
  view: Direction3;
  normal: Direction3;
  tangent: Direction3;
  bitangent: Direction3;
  variance: readonly [number, number];
};

/** CPU reference for the shader's horizon-clipped Gaussian integral. */
export function oceanReflectionSamples({ view, normal, tangent, bitangent, variance }: ReflectionFrame) {
  const t = scale(tangent, Math.sqrt(Math.max(variance[0], 1e-8)));
  const b = scale(bitangent, Math.sqrt(Math.max(variance[1], 1e-8)));
  const facing = dot(view, normal);
  const gradient = [dot(view, t) * normal[1] + facing * t[1], dot(view, b) * normal[1] + facing * b[1]];
  const length = Math.hypot(...gradient);
  const rotation = length > 1e-7 ? gradient.map(v => v / length) : [0, 1];
  const axisX = add(scale(t, rotation[1]), scale(b, -rotation[0]));
  const axisY = add(scale(t, rotation[0]), scale(b, rotation[1]));
  const samples: { direction: Direction3; weight: number }[] = [];
  let totalMass = 0, skyMass = 0;
  for (let x = 0; x < NORMAL_NODES.length; x += 1) {
    const base = add(normal, scale(axisX, -NORMAL_NODES[x]));
    const a = dot(view, base), b = dot(view, axisY);
    const lo = b < -1e-7 ? Math.max(-TAIL_LIMIT, a / b) : -TAIL_LIMIT;
    const hi = b > 1e-7 ? Math.min(TAIL_LIMIT, a / b) : TAIL_LIMIT;
    if (hi <= lo || (Math.abs(b) <= 1e-7 && a <= 0)) continue;
    totalMass += NORMAL_WEIGHTS[x] * visibleSlopeMass(a, b, [lo, hi]);
    const intervals = positiveQuadraticIntervals(
      2 * b * axisY[1] - view[1] * dot(axisY, axisY),
      -2 * (a * axisY[1] + b * base[1]) + 2 * view[1] * dot(base, axisY),
      2 * a * base[1] - view[1] * dot(base, base),
      [lo, hi],
    );
    for (const interval of intervals) {
      const mass = NORMAL_WEIGHTS[x] * visibleSlopeMass(a, b, interval);
      const start = samples.length;
      const cdfLo = normalCdf(interval[0]), cdfHi = normalCdf(interval[1]);
      if (mass <= 1e-8 || cdfHi - cdfLo <= 1e-7) continue;
      let sampleMass = 0;
      for (let y = 0; y < INTERVAL_NODES.length; y += 1) {
        const slope = inverseNormalCdf(cdfLo + (cdfHi - cdfLo) * INTERVAL_NODES[y]);
        const facet = add(base, scale(axisY, -slope));
        const reflectionScale = 2 * dot(view, facet) / dot(facet, facet);
        const direction = add(scale(facet, reflectionScale), scale(view, -1));
        const weight = INTERVAL_WEIGHTS[y] * Math.max(a - b * slope, 0);
        samples.push({ direction, weight });
        sampleMass += weight;
      }
      for (let i = start; i < samples.length; i += 1) samples[i].weight *= mass / Math.max(sampleMass, 1e-8);
      skyMass += mass;
    }
  }
  const normalization = Math.max(totalMass, 1e-6);
  for (const sample of samples) sample.weight /= normalization;
  return { samples, belowHorizonWeight: Math.max(totalMass - skyMass, 0) / normalization };
}

function diffuseWaterReflectance() {
  let integral = 0;
  for (let i = 0; i < 4096; i += 1) {
    const cosine = (i + 0.5) / 4096;
    const transmitted = Math.sqrt(1 - (1 - cosine * cosine) / WATER_IOR ** 2);
    const parallel = (WATER_IOR * cosine - transmitted) / (WATER_IOR * cosine + transmitted);
    const perpendicular = (cosine - WATER_IOR * transmitted) / (cosine + WATER_IOR * transmitted);
    integral += (parallel * parallel + perpendicular * perpendicular) * cosine / 4096;
  }
  return integral;
}

export const DIFFUSE_WATER_REFLECTANCE = diffuseWaterReflectance();

const glslFloat = (value: number) => Number.isInteger(value) ? value.toFixed(1) : value.toString();
const glslPolynomial = (coefficients: number[], variable: string) => coefficients
  .map(glslFloat).reduce((p, c) => p ? `(${p} * ${variable} + ${c})` : c, "");

export const oceanReflectionShader = `
const float REFLECTION_NORMAL_NODES[5] = float[5](${NORMAL_NODES.map(glslFloat).join(", ")});
const float REFLECTION_NORMAL_WEIGHTS[5] = float[5](${NORMAL_WEIGHTS.map(glslFloat).join(", ")});
const float REFLECTION_INTERVAL_NODES[${INTERVAL_NODES.length}] = float[${INTERVAL_NODES.length}](${INTERVAL_NODES.map(glslFloat).join(", ")});
const float REFLECTION_INTERVAL_WEIGHTS[${INTERVAL_WEIGHTS.length}] = float[${INTERVAL_WEIGHTS.length}](${INTERVAL_WEIGHTS.map(glslFloat).join(", ")});

float reflectionNormalDensity(float x) {
  return exp(-0.5 * x * x) * 0.3989422804;
}

float reflectionNormalCdf(float x) {
  float t = 1.0 / (1.0 + 0.2316419 * abs(x));
  float tail = reflectionNormalDensity(x) * t * ${glslPolynomial(CDF_COEFFICIENTS, "t")};
  return x < 0.0 ? tail : 1.0 - tail;
}

float reflectionInverseCdf(float probability) {
  float x = 2.0 * clamp(probability, 0.0000001, 0.9999999) - 1.0;
  float w = -log((1.0 - x) * (1.0 + x));
  float p;
  if (w < 5.0) {
    w -= 2.5;
    p = ${glslPolynomial(INVERSE_CENTER, "w")};
  } else {
    w = sqrt(w) - 3.0;
    p = ${glslPolynomial(INVERSE_TAIL, "w")};
  }
  return 1.4142135624 * x * p;
}

float reflectionSlopeMass(float a, float b, vec2 bounds) {
  if (bounds.y <= bounds.x) return 0.0;
  return max(a * (reflectionNormalCdf(bounds.y) - reflectionNormalCdf(bounds.x))
    - b * (reflectionNormalDensity(bounds.x) - reflectionNormalDensity(bounds.y)), 0.0);
}

vec2 reflectionClipInterval(vec2 interval, vec2 bounds) {
  return vec2(max(interval.x, bounds.x), min(interval.y, bounds.y));
}

vec4 reflectionSkyIntervals(float a, float b, float c, vec2 bounds) {
  vec4 empty = vec4(bounds.x);
  if (abs(a) < 0.0000001) {
    if (abs(b) < 0.0000001) return c > 0.0 ? vec4(bounds, bounds.xx) : empty;
    vec2 interval = b > 0.0 ? vec2(-c / b, bounds.y) : vec2(bounds.x, -c / b);
    return vec4(reflectionClipInterval(interval, bounds), bounds.xx);
  }
  float discriminant = b * b - 4.0 * a * c;
  if (discriminant <= 0.0) return a > 0.0 ? vec4(bounds, bounds.xx) : empty;
  float q = -0.5 * (b + (b >= 0.0 ? 1.0 : -1.0) * sqrt(discriminant));
  vec2 roots = vec2(q / a, c / q);
  roots = vec2(min(roots.x, roots.y), max(roots.x, roots.y));
  if (a < 0.0) return vec4(reflectionClipInterval(roots, bounds), bounds.xx);
  return vec4(reflectionClipInterval(vec2(bounds.x, roots.x), bounds),
    reflectionClipInterval(vec2(roots.y, bounds.y), bounds));
}

vec3 reflectionSkyRadiance(vec3 direction, float lod);

vec4 reflectionIntervalRadiance(vec3 view, vec3 base, vec3 axis,
  float a, float b, vec2 bounds, float lod) {
  if (bounds.y <= bounds.x) return vec4(0.0);
  float low = reflectionNormalCdf(bounds.x);
  float high = reflectionNormalCdf(bounds.y);
  float mass = max(a * (high - low)
    - b * (reflectionNormalDensity(bounds.x) - reflectionNormalDensity(bounds.y)), 0.0);
  if (mass <= 0.00000001 || high - low <= 0.0000001) return vec4(0.0);
  vec3 radiance = vec3(0.0);
  float sampleMass = 0.0;
  for (int index = 0; index < ${INTERVAL_NODES.length}; index += 1) {
    float slope = reflectionInverseCdf(mix(low, high, REFLECTION_INTERVAL_NODES[index]));
    vec3 facet = normalize(base - axis * slope);
    vec3 direction = reflect(-view, facet);
    float weight = REFLECTION_INTERVAL_WEIGHTS[index] * max(a - b * slope, 0.0);
    radiance += reflectionSkyRadiance(direction, lod) * weight;
    sampleMass += weight;
  }
  return vec4(radiance * mass / max(sampleMass, 0.00000001), mass);
}

vec3 integrateOceanReflection(vec3 view, vec3 normal, vec3 tangent, vec3 bitangent,
  vec2 variance, float lod, vec3 belowHorizonRadiance) {
  vec2 sigma = sqrt(max(variance, vec2(0.00000001)));
  vec3 t = tangent * sigma.x, b = bitangent * sigma.y;
  float facing = dot(view, normal);
  vec2 gradient = vec2(dot(view, t) * normal.y + facing * t.y,
    dot(view, b) * normal.y + facing * b.y);
  float gradientLength = length(gradient);
  vec2 rotation = gradientLength > 0.0000001 ? gradient / gradientLength : vec2(0.0, 1.0);
  vec3 axisX = t * rotation.y - b * rotation.x;
  vec3 axisY = t * rotation.x + b * rotation.y;
  vec3 radiance = vec3(0.0);
  float totalMass = 0.0, skyMass = 0.0;
  for (int index = 0; index < 5; index += 1) {
    vec3 base = normal - axisX * REFLECTION_NORMAL_NODES[index];
    float a = dot(view, base), b = dot(view, axisY);
    vec2 bounds = vec2(-6.0, 6.0);
    if (b < -0.0000001) bounds.x = max(bounds.x, a / b);
    if (b > 0.0000001) bounds.y = min(bounds.y, a / b);
    if (bounds.y <= bounds.x || (abs(b) <= 0.0000001 && a <= 0.0)) continue;
    float weight = REFLECTION_NORMAL_WEIGHTS[index];
    totalMass += weight * reflectionSlopeMass(a, b, bounds);
    vec4 intervals = reflectionSkyIntervals(
      2.0 * b * axisY.y - view.y * dot(axisY, axisY),
      -2.0 * (a * axisY.y + b * base.y) + 2.0 * view.y * dot(base, axisY),
      2.0 * a * base.y - view.y * dot(base, base), bounds);
    for (int side = 0; side < 2; side += 1) {
      vec2 interval = side == 0 ? intervals.xy : intervals.zw;
      vec4 reflected = reflectionIntervalRadiance(view, base, axisY, a, b, interval, lod);
      skyMass += weight * reflected.a;
      radiance += weight * reflected.rgb;
    }
  }
  return (radiance + max(totalMass - skyMass, 0.0) * belowHorizonRadiance) / max(totalMass, 0.000001);
}
`;
