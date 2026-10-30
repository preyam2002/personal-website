import { GRAVITY } from "./oceanWaves";

export const RIPPLE_SLOTS = 12;
export const RIPPLE_WAVELENGTH = 0.45;
export const RIPPLE_WAVE_NUMBER = (2 * Math.PI) / RIPPLE_WAVELENGTH;
export const RIPPLE_ANGULAR_FREQUENCY = Math.sqrt(GRAVITY * RIPPLE_WAVE_NUMBER);
// Deep-water group speed: the ring envelope travels at half the crest speed.
export const RIPPLE_GROUP_SPEED = RIPPLE_ANGULAR_FREQUENCY / (2 * RIPPLE_WAVE_NUMBER);
export const RIPPLE_DECAY_SECONDS = 2.6;
export const RIPPLE_LIFETIME_SECONDS = 8;
const RIPPLE_WIDTH = 0.18;
const RIPPLE_WIDTH_GROWTH = 0.12;
const RIPPLE_SPREAD_RADIUS = 0.5;

export type Ripple = {
  x: number;
  z: number;
  start: number;
  amplitude: number;
};

/**
 * Evaluate one ring packet at a radius and age.
 *
 * The packet uses one carrier wave and a Gaussian envelope. Crests move at the
 * phase speed and the envelope moves at the group speed, as in deep water.
 * The returned slope is the radial derivative of the height.
 */
export function rippleProfile(radius: number, age: number, amplitude: number) {
  const center = RIPPLE_GROUP_SPEED * age;
  const width = RIPPLE_WIDTH + RIPPLE_WIDTH_GROWTH * age;
  const offset = (radius - center) / width;
  const spread = Math.sqrt(RIPPLE_SPREAD_RADIUS / (RIPPLE_SPREAD_RADIUS + radius));
  const envelope = amplitude * Math.exp(-age / RIPPLE_DECAY_SECONDS - 0.5 * offset * offset) * spread;
  const phase = RIPPLE_WAVE_NUMBER * radius - RIPPLE_ANGULAR_FREQUENCY * age;
  const height = envelope * Math.cos(phase);
  const slope = envelope * (
    (-offset / width - 0.5 / (RIPPLE_SPREAD_RADIUS + radius)) * Math.cos(phase)
    - RIPPLE_WAVE_NUMBER * Math.sin(phase)
  );
  return { height, slope };
}

export function createRipplePool(capacity: number) {
  const ripples: Ripple[] = [];
  return {
    get capacity() { return capacity; },
    get ripples() { return ripples as readonly Ripple[]; },
    /** Add a ripple. A full pool replaces its oldest ripple. */
    add(x: number, z: number, amplitude: number, now: number) {
      if (capacity <= 0) return;
      const ripple = { x, z, start: now, amplitude };
      if (ripples.length < capacity) {
        ripples.push(ripple);
        return;
      }
      let oldest = 0;
      for (let index = 1; index < ripples.length; index += 1) {
        if (ripples[index].start < ripples[oldest].start) oldest = index;
      }
      ripples[oldest] = ripple;
    },
    /** Write the live ripples as (x, z, age, amplitude) and return their count. */
    pack(now: number, output: Float32Array) {
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (now - ripples[index].start > RIPPLE_LIFETIME_SECONDS) ripples.splice(index, 1);
      }
      const count = Math.min(ripples.length, Math.floor(output.length / 4));
      for (let index = 0; index < count; index += 1) {
        const ripple = ripples[index];
        output[index * 4] = ripple.x;
        output[index * 4 + 1] = ripple.z;
        output[index * 4 + 2] = Math.max(now - ripple.start, 0);
        output[index * 4 + 3] = ripple.amplitude;
      }
      output.fill(0, count * 4);
      return count;
    },
    clear() {
      ripples.length = 0;
    },
  };
}

/**
 * Shader version of `rippleProfile`, summed over the live ripples.
 *
 * It returns (height, slope x, slope z). The footprint filter removes the
 * carrier where one sample covers more than a fraction of its wavelength.
 */
export const rippleShader = `
uniform vec4 u_ripples[${RIPPLE_SLOTS}];
uniform highp int u_rippleCount;

vec3 rippleField(vec2 position, float footprint) {
  vec3 field = vec3(0.0);
  if (u_rippleCount == 0) return field;
  const float waveNumber = ${RIPPLE_WAVE_NUMBER.toFixed(6)};
  float detail = exp(-0.5 * waveNumber * waveNumber * footprint * footprint);
  if (detail < 0.002) return field;
  for (int index = 0; index < ${RIPPLE_SLOTS}; index += 1) {
    if (index >= u_rippleCount) break;
    vec4 ripple = u_ripples[index];
    vec2 offset = position - ripple.xy;
    float radius = length(offset);
    float age = ripple.z;
    float width = ${RIPPLE_WIDTH.toFixed(3)} + ${RIPPLE_WIDTH_GROWTH.toFixed(3)} * age;
    float packet = (radius - ${RIPPLE_GROUP_SPEED.toFixed(6)} * age) / width;
    if (abs(packet) > 3.0) continue;
    float spread = inversesqrt(1.0 + radius / ${RIPPLE_SPREAD_RADIUS.toFixed(3)});
    float envelope = ripple.w * detail * spread
      * exp(-age / ${RIPPLE_DECAY_SECONDS.toFixed(3)} - 0.5 * packet * packet);
    float phase = waveNumber * radius - ${RIPPLE_ANGULAR_FREQUENCY.toFixed(6)} * age;
    float carrier = cos(phase);
    float radialSlope = envelope * (
      (-packet / width - 0.5 / (${RIPPLE_SPREAD_RADIUS.toFixed(3)} + radius)) * carrier
        - waveNumber * sin(phase)
    );
    field += vec3(envelope * carrier, offset / max(radius, 0.0001) * radialSlope);
  }
  return field;
}
`;
