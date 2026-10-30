export const waterFragmentShader = `precision highp float;
uniform vec2 resolution, pointer;
uniform float time, energy, mode, impulse;
const vec3 sun = normalize(vec3(-0.36, 0.24, 0.90));
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
}
float field(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return v;
}
vec3 sky(vec3 ray, float cold) {
  float elevation = max(ray.y, 0.0);
  vec3 horizon = mix(vec3(0.82, 0.76, 0.64), vec3(0.65, 0.74, 0.8), cold);
  vec3 zenith = mix(vec3(0.16, 0.31, 0.46), vec3(0.24, 0.39, 0.53), cold);
  vec3 color = mix(horizon, zenith, pow(elevation, 0.45));
  float alignment = max(dot(ray, sun), 0.0);
  color += vec3(1.0, 0.72, 0.39) * pow(alignment, 16.0) * 0.24 * (1.0 - cold);
  if (ray.y > 0.015) {
    vec2 cloudUv = ray.xz / (ray.y + 0.16) * 1.5 + vec2(time * 0.008, 0.0);
    float cloud = smoothstep(0.46, 0.75, field(cloudUv * vec2(0.65, 1.4)));
    color = mix(color, vec3(0.91, 0.87, 0.78), cloud * 0.55);
  }
  color += vec3(5.0, 3.8, 2.5) * smoothstep(0.99955, 0.99985, alignment) * (1.0 - cold * 0.7);
  return color;
}
// The vector contains the height and its two spatial derivatives.
vec3 waves(vec2 p, vec2 dx, vec2 dy) {
  vec3 result = vec3(0.0);
  float frequency = 0.72, amplitude = 0.16;
  vec2 direction = normalize(vec2(1.0, 0.6));
  for (int i = 0; i < 8; i++) {
    float phase = dot(p, direction) * frequency + time * sqrt(9.81 * frequency) * 0.48 + float(i) * 2.37;
    vec2 projected = vec2(dot(direction, dx), dot(direction, dy));
    float filtered = exp(-frequency * frequency * dot(projected, projected) * 0.5);
    float a = amplitude * filtered * energy;
    result += vec3(sin(phase) * a, cos(phase) * a * frequency * direction);
    direction = mat2(0.8, -0.6, 0.6, 0.8) * direction;
    frequency *= 1.87;
    amplitude *= 0.47;
  }
  return result;
}
vec3 ripple(vec2 p, vec2 center) {
  vec2 offset = p - center;
  float r = max(length(offset), 0.001);
  float envelope = exp(-r * 0.65) * impulse * 0.027;
  float phase = r * 14.0 - time * 3.6;
  float slope = envelope * (14.0 * cos(phase) - 0.65 * sin(phase));
  return vec3(envelope * sin(phase), slope * offset / r);
}
float caustics(vec2 p) {
  vec2 drift = vec2(time * 0.09, -time * 0.07);
  vec2 warp = vec2(field(p + drift), field(p + 7.3 - drift));
  float a = abs(sin(p.x * 2.7 + warp.x * 6.0) + sin(p.y * 2.4 + warp.y * 6.0));
  float b = abs(sin(p.x * 3.1 - warp.y * 5.0) + sin(p.y * 2.9 + warp.x * 5.0));
  return exp(-a * 13.0) * 0.6 + exp(-b * 17.0) * 0.4;
}
vec3 water(vec3 normal, vec3 view, vec3 body, float cold, float roughness) {
  float facing = clamp(dot(normal, view), 0.0, 1.0);
  float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
  vec3 reflected = sky(reflect(-view, normal), cold);
  vec3 halfway = normalize(sun + view);
  float nh = max(dot(normal, halfway), 0.0);
  float a2 = roughness * roughness;
  float denominator = nh * nh * (a2 - 1.0) + 1.0;
  float specular = a2 / max(3.14159 * denominator * denominator, 0.00001);
  vec3 color = mix(body, reflected, fresnel);
  color += vec3(1.0, 0.81, 0.56) * specular * 0.014 * max(dot(normal, sun), 0.0);
  return color;
}
vec3 ocean(vec2 p, float cold) {
  vec3 ray = normalize(vec3(p.x, p.y - 0.12, 0.95));
  if (ray.y >= -0.001) return sky(ray, cold);
  vec3 origin = vec3(0.0, 2.4, 0.0);
  float vertical = max(0.12 - p.y, 0.001);
  vec2 dx = vec2(origin.y / vertical, 0.0) / resolution.y;
  vec2 dy = vec2(p.x, 0.95) * origin.y / (vertical * vertical * resolution.y);
  float extent = 0.31 * energy;
  float nearDistance = (extent - origin.y) / ray.y;
  float farDistance = (-extent - origin.y) / ray.y;
  float start = nearDistance;
  float stride = (farDistance - nearDistance) / 16.0;
  for (int i = 1; i <= 16; i++) {
    float probe = start + float(i) * stride;
    vec3 candidate = origin + ray * probe;
    if (candidate.y <= waves(candidate.xz, dx, dy).x) {
      farDistance = probe;
      break;
    }
    nearDistance = probe;
  }
  float distance = 0.0;
  for (int i = 0; i < 6; i++) {
    distance = (nearDistance + farDistance) * 0.5;
    vec3 candidate = origin + ray * distance;
    float height = waves(candidate.xz, dx, dy).x;
    if (candidate.y > height) nearDistance = distance;
    else farDistance = distance;
  }
  vec3 point = origin + ray * distance;
  vec3 surface = waves(point.xz, dx, dy);
  vec3 pointerRay = normalize(vec3(pointer.x, pointer.y - 0.12, 0.95));
  if (pointerRay.y < -0.02) {
    vec2 center = (origin + pointerRay * (-origin.y / pointerRay.y)).xz;
    surface += ripple(point.xz, center) * exp(-98.0 * max(dot(dx, dx), dot(dy, dy)));
  }
  vec3 normal = normalize(vec3(-surface.y, 1.0, -surface.z));
  vec3 body = mix(vec3(0.012, 0.055, 0.068), vec3(0.045, 0.13, 0.16), cold);
  body += vec3(0.012, 0.04, 0.036) * smoothstep(-0.1, 0.25, surface.x);
  vec3 color = water(normal, -ray, body, cold, 0.075 + min(length(dy) * 0.1, 0.1));
  float haze = 1.0 - exp(-distance * 0.004);
  return mix(color, sky(normalize(vec3(ray.x, 0.0, ray.z)), cold), haze * 0.85);
}
vec3 overhead(vec2 p) {
  vec2 q = p * 11.0;
  bool rain = mode > 2.5 && mode < 3.5;
  bool glow = mode > 3.5 && mode < 4.5;
  bool current = mode > 5.5;
  vec2 samplePoint = q;
  mat2 rotation = mat2(1.0);
  vec2 angleGradient = vec2(0.0);
  if (current) {
    float r = length(q);
    float angle = 3.5 * exp(-r * 0.16) - time * 0.12 + sin(time * 0.13 - r * 0.2) * 0.35;
    rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    float radialDerivative = -0.56 * exp(-r * 0.16) - cos(time * 0.13 - r * 0.2) * 0.07;
    angleGradient = radialDerivative * q / max(r, 0.001);
    samplePoint = rotation * q;
  }
  vec2 pixel = vec2(11.0 / resolution.y, 0.0);
  vec3 surface = waves(samplePoint, pixel, pixel.yx) * (rain ? 0.12 : current ? 0.34 : 0.16);
  if (current) {
    vec2 gradient = surface.yz;
    surface.yz = vec2(dot(rotation[0], gradient), dot(rotation[1], gradient))
      + angleGradient * dot(gradient, vec2(samplePoint.y, -samplePoint.x));
  }
  surface += ripple(q, pointer * 11.0);
  if (rain) {
    for (int i = 0; i < 18; i++) {
      float k = float(i);
      float cycle = floor(time * 0.48 + k * 0.71);
      float age = fract(time * 0.48 + k * 0.71) * 3.2;
      vec2 center = (vec2(hash(vec2(k, cycle)), hash(vec2(cycle, k + 20.0))) - 0.5) * vec2(25.0, 14.0);
      vec2 offset = q - center;
      float r = max(length(offset), 0.001);
      float front = r - age * 1.5;
      float envelope = exp(-front * front * 7.0) * smoothstep(0.0, 0.2, age) * exp(-age * 1.1) * energy;
      float slope = (cos(front * 18.0) * 18.0 - sin(front * 18.0) * front * 14.0) * envelope * 0.014;
      surface.yz += slope * offset / r;
    }
  }
  vec3 normal = normalize(vec3(-surface.y, 1.0, -surface.z));
  vec3 view = normalize(vec3(p.x * 0.25, 1.0, -0.35 + p.y * 0.2));
  vec2 bed = q + normal.xz * 0.7;
  float stone = field(bed * 1.2);
  vec3 floorColor = mix(vec3(0.045, 0.063, 0.047), vec3(0.15, 0.16, 0.105), stone);
  floorColor += vec3(0.16, 0.19, 0.11) * caustics(bed * 0.75) * 0.35;
  vec3 body = mix(floorColor, vec3(0.014, 0.058, 0.055), 0.4);
  if (rain) body = vec3(0.018, 0.026, 0.032);
  if (current) body = vec3(0.014, 0.046, 0.052);
  vec3 color = water(normal, view, body, rain ? 1.0 : 0.4, rain ? 0.16 : 0.09);
  vec3 reflectedRay = reflect(-view, normal);
  float canopy = smoothstep(0.3, 0.72, field(reflectedRay.xz * 4.0 + 2.0));
  if (!current) color *= 1.0 - canopy * (rain ? 0.22 : 0.32);
  if (current) {
    float radius = length(q);
    float angle = atan(q.y, q.x);
    float spiral = radius * 2.3 - angle * 3.0 + time * 0.24;
    float streak = pow(0.5 + 0.5 * sin(spiral), 24.0);
    float flecks = smoothstep(0.55, 0.77, field(samplePoint * 3.0));
    color = mix(color, vec3(0.42, 0.52, 0.48), streak * flecks * 0.45);
    color *= 0.6 + 0.4 * smoothstep(0.0, 2.8, radius);
  }
  if (glow) {
    color *= 0.13;
    float disturbance = exp(-length(q - pointer * 11.0) * 0.65) * impulse;
    float crest = smoothstep(0.035, 0.12, length(surface.yz));
    float plankton = pow(hash(floor(q * 85.0)), 42.0);
    color += vec3(0.015, 0.52, 0.64) * (crest * 0.12 + disturbance) * (0.08 + plankton * 3.0);
  }
  return color;
}
vec3 seabed(vec2 p) {
  vec2 q = p * 8.0;
  float depth = 2.0 + (0.5 - p.y) * 3.0;
  float sandRipples = sin(q.y * 10.0 + field(q * 0.7) * 7.0);
  vec3 sand = vec3(0.43, 0.4, 0.28) * (0.82 + sandRipples * 0.09 + noise(q * 60.0) * 0.08);
  sand *= 0.5 + caustics(q * 0.8) * 2.0 * energy;
  vec3 transmission = exp(-vec3(0.37, 0.085, 0.055) * depth);
  vec3 color = sand * transmission + vec3(0.012, 0.15, 0.18) * (1.0 - transmission);
  float shaft = pow(max(0.0, sin((p.x + p.y * 0.35) * 18.0 + time * 0.12)), 16.0);
  color += vec3(0.055, 0.11, 0.10) * shaft * smoothstep(-0.5, 0.5, p.y) * 0.35;
  return color;
}
vec3 shore(vec2 p) {
  vec2 q = p * 9.0;
  float coastline = p.y + 0.08 + sin(p.x * 2.7) * 0.07;
  float surge = sin(time * 0.42) * 0.055 * energy;
  float depth = coastline + surge + noise(vec2(q.x * 1.7, time * 0.06)) * 0.018;
  float grain = noise(q * 95.0);
  vec3 sand = vec3(0.48, 0.37, 0.245) * (0.9 + grain * 0.16);
  sand *= mix(1.0, 0.62, smoothstep(-0.13, -0.035, depth));
  vec2 pixel = vec2(9.0 / resolution.y, 0.0);
  vec3 surface = waves(q, pixel, pixel.yx) * 0.3;
  vec3 normal = normalize(vec3(-surface.y, 1.0, -surface.z));
  vec3 transmission = exp(-vec3(5.2, 1.3, 0.85) * max(depth, 0.0) * 4.0);
  vec3 body = sand * transmission + vec3(0.014, 0.11, 0.12) * (1.0 - transmission);
  body += caustics(q) * vec3(0.1, 0.17, 0.13) * exp(-max(depth, 0.0) * 8.0);
  vec3 sea = water(normal, normalize(vec3(0.0, 1.0, -0.4)), body, 0.15, 0.12);
  float broken = field(q * 8.0 + vec2(0.0, time * 0.15));
  float edge = exp(-abs(depth - broken * 0.018) * 160.0);
  float lace = exp(-abs(depth - 0.055 - broken * 0.025) * 90.0) * smoothstep(0.4, 0.65, broken);
  vec3 color = mix(sand, sea, smoothstep(-0.004, 0.012, depth));
  return mix(color, vec3(0.75, 0.78, 0.72), clamp((edge + lace * 0.6) * (0.45 + grain * 0.45), 0.0, 0.85));
}
vec3 glacier(vec2 p) {
  vec2 q = p * 6.0;
  vec3 surface = waves(q, vec2(6.0 / resolution.y, 0.0), vec2(0.0, 6.0 / resolution.y)) * 0.16;
  surface += ripple(q, pointer * 6.0);
  vec2 refracted = q + surface.yz * 0.3
    + vec2(field(q * 1.3), field(q * 1.3 + 19.0)) * 0.55;
  vec2 cell = floor(refracted), local = fract(refracted);
  float nearest = 8.0, second = 8.0;
  vec2 nearestCell = vec2(0.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 seed = vec2(hash(cell + offset), hash(cell + offset + 31.7));
      float distance = length(offset + 0.18 + seed * 0.64 - local);
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
        nearestCell = cell + offset;
      } else second = min(second, distance);
    }
  }
  float edge = second - nearest;
  float thickness = smoothstep(0.002, 0.033, edge);
  float frost = field(q * 4.0);
  vec3 deep = vec3(0.045, 0.21, 0.28);
  vec3 ice = mix(vec3(0.12, 0.34, 0.43), vec3(0.64, 0.78, 0.8), smoothstep(0.25, 0.7, frost));
  ice *= 0.8 + hash(nearestCell) * 0.3;
  vec3 body = mix(deep, ice, thickness * 0.85);
  body += vec3(0.17, 0.24, 0.25) * exp(-abs(edge - 0.025) * 150.0) * frost;
  body += vec3(0.035, 0.05, 0.055) * noise(q * 120.0) * thickness;
  float veins = pow(1.0 - abs(sin(q.x * 12.0 + field(q * 3.0) * 6.0)), 35.0);
  body += veins * vec3(0.07, 0.11, 0.12) * thickness;
  vec3 normal = normalize(vec3(-surface.y, 1.0, -surface.z));
  return water(normal, normalize(vec3(0.0, 1.0, -0.25)), body, 1.0, 0.18);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  vec2 p = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  vec3 color;
  if (mode < 0.5) color = ocean(p, 0.0);
  else if (mode > 6.5) color = glacier(p);
  else if (mode > 1.5 && mode < 2.5) color = seabed(p);
  else if (mode > 4.5 && mode < 5.5) color = shore(p);
  else color = overhead(p);
  color *= 1.0 - 0.13 * smoothstep(0.25, 0.85, length(uv - 0.5));
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}
`;
