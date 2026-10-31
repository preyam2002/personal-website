import { ACTOR_TEXTURE_WIDTH, SPLASH_SLOTS } from "./oceanLife";
import { rippleShader } from "./oceanRipples";

export const GLOW_DOMAIN_METERS = 24;
export const GLOW_ORIGIN = [-12, -5] as const;
export const GLOW_HALF_LIFE_SECONDS = 1.4;
export const GLOW_SOURCE_RATE = 2.5;
// Plankton light is blue-green, near 490 nm.
export const GLOW_COLOR = [0.05, 0.55, 0.78] as const;

/** Return 1 at night and 0 in daylight, with the same edges as the night sky in the shader. */
export function nightGlowStrength(sunElevation: number) {
  const t = Math.min(Math.max((sunElevation + 0.16) / 0.135, 0), 1);
  return 1 - t * t * (3 - 2 * t);
}

/** Exact glow update for a constant source: dG/dt = source * rate * (1 - G) - decay * G. */
export function advanceGlow(glow: number, source: number, seconds: number) {
  const birth = source * GLOW_SOURCE_RATE;
  const rate = birth + Math.LN2 / GLOW_HALF_LIFE_SECONDS;
  const retention = Math.exp(-rate * seconds);
  return glow * retention + birth / rate * (1 - retention);
}

/**
 * Update the bioluminescence map over the near water.
 *
 * Plankton light up where the water moves: around swimming fish, on ripple
 * rings, and at splashes. Fish light fades with depth. Ripple light follows
 * the slope of the same ripple sum as the wave field.
 */
export const glowFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_previous;
uniform highp sampler2D u_actors;
uniform highp int u_fishCount;
uniform float u_seconds;
uniform vec4 u_splashes[${SPLASH_SLOTS * 2}];
uniform highp int u_splashCount;
in vec2 v_uv;
out vec4 outColor;
${rippleShader}
void main() {
  vec2 point = vec2(${GLOW_ORIGIN.map(value => value.toFixed(1)).join(", ")}) + v_uv * ${GLOW_DOMAIN_METERS.toFixed(1)};
  float source = 0.0;
  float texel = ${GLOW_DOMAIN_METERS.toFixed(1)} / float(textureSize(u_previous, 0).x);
  for (int index = 0; index < ${ACTOR_TEXTURE_WIDTH}; index += 1) {
    if (index >= u_fishCount) break;
    vec4 fish = texelFetch(u_actors, ivec2(index, 0), 0);
    vec2 offset = point - fish.xz;
    // Light spreads with depth. A spot never falls below two texels, so the map shows no blocks.
    float spread = max(0.18 + 0.05 * max(-fish.y, 0.0), 2.0 * texel);
    float swim = texelFetch(u_actors, ivec2(index, 2), 0).x;
    source += exp(-0.5 * dot(offset, offset) / (spread * spread) - max(-fish.y, 0.0) * 1.4)
      * (0.3 + 12.0 * max(swim - 0.05, 0.0));
  }
  source += length(rippleField(point, texel).yz) * 3.0;
  for (int splash = 0; splash < ${SPLASH_SLOTS}; splash += 1) {
    if (splash >= u_splashCount) break;
    vec4 place = u_splashes[splash * 2];
    vec2 offset = point - place.xz;
    source += u_splashes[splash * 2 + 1].x * exp(-dot(offset, offset) / 0.12) * (1.0 - smoothstep(0.2, 0.8, place.w));
  }
  float glow = texture(u_previous, v_uv).r;
  float birth = source * ${GLOW_SOURCE_RATE.toFixed(4)};
  float rate = birth + ${(Math.LN2 / GLOW_HALF_LIFE_SECONDS).toFixed(12)};
  float retention = exp(-rate * u_seconds);
  outColor = vec4(glow * retention + birth / rate * (1.0 - retention), 0.0, 0.0, 1.0);
}
`;

/** Sample the glow map at a surface point. Points outside the map have no glow. */
export const glowSampleShader = `
uniform sampler2D u_glow;
uniform float u_glowStrength;
uniform float u_lifeTime;

/** Cubic B-spline filter from four bilinear taps. Bilinear taps alone show the texel grid. */
float sampleGlowMap(vec2 uv) {
  vec2 size = vec2(textureSize(u_glow, 0));
  vec2 pixel = uv * size - 0.5;
  vec2 base = floor(pixel);
  vec2 t = pixel - base;
  vec2 t2 = t * t;
  vec2 t3 = t2 * t;
  vec2 w0 = (1.0 - 3.0 * t + 3.0 * t2 - t3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * t2 + 3.0 * t3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * t + 3.0 * t2 - 3.0 * t3) / 6.0;
  vec2 w3 = t3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 lower = (base - 0.5 + w1 / g0) / size;
  vec2 upper = (base + 1.5 + w3 / g1) / size;
  return (texture(u_glow, lower).r * g0.x + texture(u_glow, vec2(upper.x, lower.y)).r * g1.x) * g0.y
    + (texture(u_glow, vec2(lower.x, upper.y)).r * g0.x + texture(u_glow, upper).r * g1.x) * g1.y;
}

float sampleGlow(vec2 position) {
  if (u_glowStrength <= 0.0) return 0.0;
  vec2 uv = (position - vec2(${GLOW_ORIGIN.map(value => value.toFixed(1)).join(", ")})) / ${GLOW_DOMAIN_METERS.toFixed(1)};
  float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
  if (edge <= 0.0) return 0.0;
  return sampleGlowMap(uv) * smoothstep(0.0, 0.05, edge) * u_glowStrength;
}

vec3 glowRadiance(float glow) {
  return vec3(${GLOW_COLOR.map(value => value.toFixed(3)).join(", ")}) * glow;
}

/**
 * Return the light of single plankton cells over the glow map.
 *
 * Real bioluminescence is a field of short, sharp flashes, not a haze. The
 * sparks sit on a grid of world cells that never shrinks below about two and a
 * half pixels, so a spark always covers at least one pixel and does not
 * shimmer. Each cell flashes on its own clock. The glow sets the chance that a
 * cell holds a spark. A faint diffuse part remains for the light that the
 * water scatters.
 */
float glowSparkle(vec2 position, float footprint, float glow) {
  float cell = max(footprint * 2.5, 0.035);
  vec2 grid = position / cell;
  vec2 index = floor(grid);
  vec3 random = hash33(vec3(index, floor(log2(cell) * 2.0) + 17.0));
  float flash = fract(u_lifeTime * (0.5 + random.z) + random.x * 7.0);
  float pulse = exp(-flash * 9.0);
  vec2 spot = index + 0.2 + 0.6 * random.xy;
  float radius = cell * 0.28;
  float spark = 1.0 - smoothstep(radius * 0.3, radius, length(grid - spot) * cell);
  float present = step(random.y, clamp(glow * 3.0, 0.0, 0.9));
  return 0.25 + spark * pulse * present * 24.0;
}
`;
