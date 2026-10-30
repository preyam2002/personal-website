import { ACTOR_TEXTURE_WIDTH, FISH_BOUND_RADIUS } from "./oceanLife";

/**
 * Ray-marched fish for the display shader.
 *
 * The display shader includes this code after its water helpers. Each fish is
 * a signed distance field in a local frame where the length is one and the
 * nose points along +z. The tail bends with a traveling wave. A box test on
 * the whole school rejects most pixels before the per-fish sphere tests.
 */
export const lifeShader = `
uniform highp sampler2D u_actors;
uniform highp int u_fishCount;
uniform vec3 u_lifeLow;
uniform vec3 u_lifeHigh;
uniform vec3 u_airLow;
uniform vec3 u_airHigh;

bool rayBox(vec3 origin, vec3 direction, vec3 low, vec3 high, float limit) {
  if (any(greaterThan(low, high))) return false;
  vec3 safe = mix(direction, vec3(0.000001), lessThan(abs(direction), vec3(0.000001)));
  vec3 inverse = 1.0 / safe;
  vec3 first = (low - origin) * inverse;
  vec3 second = (high - origin) * inverse;
  vec3 near = min(first, second);
  vec3 far = max(first, second);
  float entry = max(max(near.x, near.y), max(near.z, 0.0));
  float exit = min(min(far.x, far.y), far.z);
  return entry <= exit && entry < limit;
}

float fishTaper(float z) {
  return mix(1.0, 0.22, smoothstep(0.18, -0.48, z));
}

float fishDistance(vec3 p, float phase, float swim) {
  float behind = clamp(0.32 - p.z, 0.0, 1.0);
  p.x -= sin(phase - p.z * 6.5) * swim * behind * behind;
  float taper = fishTaper(p.z);
  vec3 radii = vec3(0.07 * taper, 0.115 * taper, 0.5);
  float k0 = length(p / radii);
  float k1 = length(p / (radii * radii));
  float body = k0 * (k0 - 1.0) / max(k1, 0.00001);
  float root = -0.43 - p.z;
  float span = 0.02 + max(root, 0.0) * 1.05;
  float notch = (root - 0.08) * 1.4;
  float tail = max(max(abs(p.x) - 0.005, max(-root, root - 0.17)),
    max(abs(p.y) - span, notch - abs(p.y)));
  float ridge = p.y - 0.085;
  float along = abs(p.z + 0.03);
  float dorsal = max(max(abs(p.x) - 0.004, -ridge), max(ridge - (0.06 - along * 0.6), along - 0.1));
  return min(body, min(tail, dorsal));
}

void fishFrame(int index, out vec3 position, out float size, out vec3 right, out vec3 up,
  out vec3 forward, out float phase, out vec4 style) {
  vec4 placement = texelFetch(u_actors, ivec2(index, 0), 0);
  vec4 heading = texelFetch(u_actors, ivec2(index, 1), 0);
  style = texelFetch(u_actors, ivec2(index, 2), 0);
  position = placement.xyz;
  size = placement.w;
  forward = heading.xyz;
  phase = heading.w;
  vec2 level = forward.xz;
  right = length(level) > 0.0001 ? normalize(vec3(level.y, 0.0, -level.x)) : vec3(1.0, 0.0, 0.0);
  up = cross(forward, right);
}

bool traceFish(vec3 origin, vec3 direction, float limit, bool airOnly,
  out float hitDistance, out vec3 hitLocal, out int hitIndex) {
  hitDistance = limit;
  hitIndex = -1;
  if (u_fishCount == 0) return false;
  if (airOnly ? !rayBox(origin, direction, u_airLow, u_airHigh, limit)
      : !rayBox(origin, direction, u_lifeLow, u_lifeHigh, limit)) return false;
  for (int index = 0; index < ${ACTOR_TEXTURE_WIDTH}; index += 1) {
    if (index >= u_fishCount) break;
    vec3 position, right, up, forward;
    float size, phase;
    vec4 style;
    fishFrame(index, position, size, right, up, forward, phase, style);
    if (airOnly && style.z < 0.5) continue;
    vec3 relative = (origin - position) / size;
    vec3 localOrigin = vec3(dot(relative, right), dot(relative, up), dot(relative, forward));
    vec3 localDirection = vec3(dot(direction, right), dot(direction, up), dot(direction, forward));
    float halfChord = dot(localOrigin, localDirection);
    float offset = dot(localOrigin, localOrigin) - ${(FISH_BOUND_RADIUS * FISH_BOUND_RADIUS).toFixed(4)};
    float discriminant = halfChord * halfChord - offset;
    if (discriminant < 0.0) continue;
    discriminant = sqrt(discriminant);
    float exit = -halfChord + discriminant;
    float travel = max(-halfChord - discriminant, 0.0);
    if (exit <= 0.0 || travel * size >= hitDistance) continue;
    for (int step = 0; step < 32; step += 1) {
      vec3 point = localOrigin + localDirection * travel;
      float distance = fishDistance(point, phase, style.x);
      if (distance < 0.0015) {
        if (travel * size < hitDistance) {
          hitDistance = travel * size;
          hitLocal = point;
          hitIndex = index;
        }
        break;
      }
      travel += max(distance * 0.85, 0.002);
      if (travel > exit || travel * size >= hitDistance) break;
    }
  }
  return hitIndex >= 0;
}

vec3 fishNormal(vec3 local, float phase, float swim, vec3 right, vec3 up, vec3 forward) {
  const vec2 offset = vec2(0.0025, -0.0025);
  vec3 gradient = offset.xyy * fishDistance(local + offset.xyy, phase, swim)
    + offset.yyx * fishDistance(local + offset.yyx, phase, swim)
    + offset.yxy * fishDistance(local + offset.yxy, phase, swim)
    + offset.xxx * fishDistance(local + offset.xxx, phase, swim);
  return normalize(right * gradient.x + up * gradient.y + forward * gradient.z);
}

vec3 fishAlbedo(vec3 local, float variant, out float silver) {
  float body = 0.115 * fishTaper(local.z);
  float height = local.y / body;
  vec3 back = mix(vec3(0.20, 0.17, 0.07), vec3(0.15, 0.17, 0.09), variant);
  float bars = smoothstep(0.35, 0.9,
    0.5 + 0.5 * sin(local.z * 48.0 + sin(local.z * 17.0 + variant * 6.0) * 1.2));
  vec3 flank = vec3(0.66, 0.58, 0.36);
  vec3 color = mix(flank, mix(back, back * 0.55, bars), smoothstep(0.1, 0.7, height));
  color = mix(color, vec3(0.80, 0.78, 0.70), smoothstep(-0.2, -0.75, height));
  silver = 0.6 * (1.0 - smoothstep(0.2, 0.8, height));
  bool fin = local.z < -0.43 || abs(height) > 1.02;
  if (fin) {
    color = vec3(0.42, 0.34, 0.14);
    silver = 0.05;
  }
  float eye = length(vec3(abs(local.x) - 0.045, local.y - 0.022, local.z - 0.36));
  if (eye < 0.03) {
    color = eye < 0.019 ? vec3(0.008) : vec3(0.62, 0.52, 0.30);
    silver = 0.2;
  }
  return color * mix(0.88, 1.12, variant);
}

vec3 fishRadianceInWater(vec3 position, vec3 normal, vec3 direction, vec3 albedo, float silver) {
  vec3 extinction = waterExtinctionCoefficient();
  vec3 light = refractedSunDirection();
  float depth = max(-position.y, 0.0);
  vec3 sun = primaryLightRadiance() * exp(-extinction * depth / max(-light.y, 0.0001));
  vec3 skylight = v_diffuseSkyRadiance * 0.92 * exp(-extinction * depth);
  vec3 ambient = mix(waterAmbientRadiance() * 1.4, skylight, normal.y * 0.5 + 0.5);
  vec3 diffuse = albedo * (sun * max(dot(normal, -light), 0.0) * 0.85 + ambient);
  vec3 mirror = reflect(direction, normal);
  vec3 environment = mix(waterAmbientRadiance() * 1.4, skylight * 1.3, smoothstep(-0.3, 0.6, mirror.y))
    + sun * pow(max(dot(mirror, -light), 0.0), 48.0) * 2.5;
  float facing = 1.0 - abs(dot(normal, direction));
  return mix(diffuse, environment, silver * (0.35 + 0.65 * facing * facing * facing));
}

vec3 fishRadianceInAir(vec3 normal, vec3 direction, vec3 albedo, float silver) {
  vec3 sun = primaryLightRadiance();
  vec3 light = u_primaryLightDirection;
  vec3 diffuse = albedo * (sun * max(dot(normal, light), 0.0) + v_diffuseSkyRadiance * (0.55 + 0.45 * normal.y));
  vec3 mirror = reflect(direction, normal);
  vec3 environment = mirror.y > 0.0
    ? reflectionSkyRadiance(mirror, 2.0)
    : v_diffuseSkyRadiance * 0.2;
  environment += sun * pow(max(dot(mirror, light), 0.0), 220.0) * 18.0;
  float facing = 1.0 - abs(dot(normal, direction));
  return mix(diffuse, environment, clamp(0.12 + 0.6 * pow(facing, 4.0) + silver * 0.3, 0.0, 1.0));
}

bool shadeFish(vec3 origin, vec3 direction, float limit, bool inWater,
  out float hitDistance, out vec3 radiance) {
  vec3 local;
  int index;
  radiance = vec3(0.0);
  if (!traceFish(origin, direction, limit, !inWater, hitDistance, local, index)) return false;
  vec3 position, right, up, forward;
  float size, phase;
  vec4 style;
  fishFrame(index, position, size, right, up, forward, phase, style);
  vec3 normal = fishNormal(local, phase, style.x, right, up, forward);
  float silver;
  vec3 albedo = fishAlbedo(local, style.y, silver);
  vec3 point = origin + direction * hitDistance;
  radiance = inWater
    ? fishRadianceInWater(point, normal, direction, albedo, silver)
    : fishRadianceInAir(normal, direction, albedo, silver);
  return true;
}

/**
 * Sample the water below a surface point, with fish.
 *
 * The fish ray uses a surface normal filtered over 0.3 m. Capillary ripples
 * would otherwise break each fish into speckles at grazing view angles. The
 * water volume keeps the full optical normal.
 */
vec3 sampleRefractedScene(vec3 surfacePosition, vec3 incident, vec3 direction, int sampleCount) {
  vec3 origin = surfacePosition + direction * 0.025;
  if (u_fishCount > 0
    && rayBox(origin, direction, u_lifeLow - 0.6, u_lifeHigh + 0.6, 52.0)) {
    vec3 calmNormal = surfaceNormal(g_surfaceParameter, 0.3);
    vec3 lifeDirection = refract(incident, calmNormal, 1.0 / WATER_IOR);
    float distance;
    vec3 radiance;
    if (dot(lifeDirection, lifeDirection) > 0.000001
      && shadeFish(origin, lifeDirection, 52.0, true, distance, radiance)) {
      return radiance * exp(-waterExtinctionCoefficient() * distance)
        + underwaterVolume(origin, direction, distance, sampleCount);
    }
  }
  return sampleUnderwaterRay(origin, direction, sampleCount);
}
`;
