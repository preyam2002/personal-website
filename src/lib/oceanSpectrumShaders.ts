import { CAPILLARY_WAVE_NUMBER, OCEAN_CASCADE_COUNT, OCEAN_CASCADE_LENGTHS, OCEAN_REPEAT_SECONDS } from "./oceanSpectrum";
import { GRAVITY } from "./oceanWaves";

const cascadeLengths = `const float lengths[${OCEAN_CASCADE_COUNT}] = float[${OCEAN_CASCADE_COUNT}](${OCEAN_CASCADE_LENGTHS.map((value) => value.toFixed(2)).join(", ")});`;

export const evolveSpectrumShader = `#version 300 es
precision highp float;
uniform sampler2D u_initial;
uniform int u_size;
uniform float u_time;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
${cascadeLengths}
vec2 timesI(vec2 h, float value) { return vec2(-h.y, h.x) * value; }
vec2 pack(vec2 a, vec2 b) { return a + vec2(-b.y, b.x); }
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int cascade = pixel.x / u_size;
  ivec2 mode = ivec2(pixel.x % u_size, pixel.y);
  if (mode.x >= u_size / 2) mode.x -= u_size;
  if (mode.y >= u_size / 2) mode.y -= u_size;
  vec2 k = vec2(mode) * 6.283185307 / lengths[cascade];
  float magnitude = length(k);
  if (magnitude == 0.0) { outA = vec4(0.0); outB = vec4(0.0); return; }
  float step = 6.283185307 / ${OCEAN_REPEAT_SECONDS.toFixed(1)};
  float capillary = magnitude / ${CAPILLARY_WAVE_NUMBER.toFixed(1)};
  float frequency = sqrt(${GRAVITY.toFixed(2)} * magnitude * (1.0 + capillary * capillary));
  float phase = floor(frequency / step + 0.5) * step * u_time;
  vec2 rotation = vec2(cos(phase), sin(phase));
  vec4 h0 = texelFetch(u_initial, pixel, 0);
  vec2 h = vec2(
    dot(h0.xy, rotation) + h0.z * rotation.x - h0.w * rotation.y,
    h0.y * rotation.x - h0.x * rotation.y + dot(h0.wz, rotation)
  );
  vec2 unit = k / magnitude;
  outA = vec4(pack(timesI(h, unit.x), h), pack(timesI(h, unit.y), timesI(h, k.x)));
  outB = vec4(pack(timesI(h, k.y), -h * k.x * unit.x), pack(-h * k.y * unit.y, -h * k.x * unit.y));
}
`;

const transformArithmetic = `
vec4 multiply(vec4 value, vec2 rotation) {
  return value * rotation.x + vec4(-value.y, value.x, -value.w, value.z) * rotation.y;
}
`;

export const transformSpectrumShader = `#version 300 es
precision highp float;
uniform sampler2D u_inputA;
uniform sampler2D u_inputB;
uniform int u_size;
uniform int u_stage;
uniform int u_axis;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
${transformArithmetic}
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int cascade = pixel.x / u_size;
  int index = u_axis == 0 ? pixel.x % u_size : pixel.y;
  int halfStage = u_stage / 2;
  int even = (index / u_stage) * halfStage + index % halfStage;
  ivec2 a = u_axis == 0 ? ivec2(cascade * u_size + even, pixel.y) : ivec2(pixel.x, even);
  ivec2 b = a + (u_axis == 0 ? ivec2(u_size / 2, 0) : ivec2(0, u_size / 2));
  float angle = 6.283185307 * float(index % u_stage) / float(u_stage);
  vec2 rotation = vec2(cos(angle), sin(angle));
  outA = texelFetch(u_inputA, a, 0) + multiply(texelFetch(u_inputA, b, 0), rotation);
  outB = texelFetch(u_inputB, a, 0) + multiply(texelFetch(u_inputB, b, 0), rotation);
}
`;

export const unpackSpectrumShader = `#version 300 es
precision highp float;
uniform sampler2D u_inputA;
uniform sampler2D u_inputB;
uniform int u_size;
uniform int u_cascade;
layout(location = 0) out vec4 outDisplacement;
layout(location = 1) out vec4 outGradient;
${transformArithmetic}
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy) + ivec2(u_cascade * u_size, 0);
  ivec2 even = ivec2(pixel.x, pixel.y % (u_size / 2));
  ivec2 odd = even + ivec2(0, u_size / 2);
  float angle = 6.283185307 * float(pixel.y) / float(u_size);
  vec2 rotation = vec2(cos(angle), sin(angle));
  vec4 a = texelFetch(u_inputA, even, 0) + multiply(texelFetch(u_inputA, odd, 0), rotation);
  vec4 b = texelFetch(u_inputB, even, 0) + multiply(texelFetch(u_inputB, odd, 0), rotation);
  outDisplacement = vec4(a.xyz, b.w);
  outGradient = vec4(a.w, b.xyz);
}
`;

export const filterSpectrumShader = `#version 300 es
precision highp float;
uniform highp sampler2DArray u_displacement;
uniform highp sampler2DArray u_gradient;
uniform int u_level;
uniform int u_cascade;
layout(location = 0) out vec4 outDisplacement;
layout(location = 1) out vec4 outGradient;
vec4 filtered(highp sampler2DArray field) {
  vec2 size = vec2(textureSize(field, u_level).xy);
  vec2 center = gl_FragCoord.xy * 2.0 / size;
  vec2 offset = 0.75 / size;
  float layer = float(u_cascade);
  float lod = float(u_level);
  return 0.25 * (
    textureLod(field, vec3(center + vec2(-offset.x, -offset.y), layer), lod)
    + textureLod(field, vec3(center + vec2(offset.x, -offset.y), layer), lod)
    + textureLod(field, vec3(center + vec2(-offset.x, offset.y), layer), lod)
    + textureLod(field, vec3(center + vec2(offset.x, offset.y), layer), lod)
  );
}
void main() {
  outDisplacement = filtered(u_displacement);
  outGradient = filtered(u_gradient);
}
`;
