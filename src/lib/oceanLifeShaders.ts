import { BOAT_BOUND_RADIUS, BOAT_DRAFT, BOAT_SLOTS } from "./oceanBoats";
import {
  ACTOR_TEXTURE_WIDTH,
  FISH_BOUND_RADIUS,
  PELLET_SLOTS,
  SPLASH_LIFETIME_SECONDS,
  SPLASH_SLOTS,
  SPRAY_LIFETIME_SECONDS,
  SPRAY_REACH,
} from "./oceanLife";

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
uniform highp int u_pelletCount;
uniform highp int u_boatCount;
uniform highp sampler2D u_probeSurface;
uniform vec4 u_splashes[${SPLASH_SLOTS * 2}];
uniform highp int u_splashCount;
uniform highp int u_sprayDroplets;
uniform vec3 u_lifeLow;
uniform vec3 u_lifeHigh;
uniform vec3 u_airLow;
uniform vec3 u_airHigh;
uniform vec3 u_boatLow;
uniform vec3 u_boatHigh;

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

/** Test the bounding sphere of one fish with one texel fetch. */
bool nearFish(int index, vec3 origin, vec3 direction, float limit, float margin) {
  vec4 placement = texelFetch(u_actors, ivec2(index, 0), 0);
  vec3 center = placement.xyz - origin;
  float along = dot(center, direction);
  float radius = placement.w * ${FISH_BOUND_RADIUS.toFixed(2)} + margin;
  return along > -radius && along - radius < limit
    && dot(center, center) - along * along < radius * radius;
}

bool traceFish(vec3 origin, vec3 direction, float limit, bool airOnly,
  out float hitDistance, out vec3 hitLocal, out int hitIndex) {
  hitDistance = limit;
  hitIndex = -1;
  for (int index = 0; index < ${ACTOR_TEXTURE_WIDTH}; index += 1) {
    if (index >= u_fishCount) break;
    if (!nearFish(index, origin, direction, hitDistance, 0.0)) continue;
    if (airOnly && texelFetch(u_actors, ivec2(index, 2), 0).z < 0.5) continue;
    vec3 position, right, up, forward;
    float size, phase;
    vec4 style;
    fishFrame(index, position, size, right, up, forward, phase, style);
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

/**
 * Return the caustic gain of the sunlight at a point under water.
 *
 * The point projects along the refracted sun ray onto the seabed caustic map.
 * Near the surface the pattern is out of focus, so the gain fades to one there.
 * The map only exists while the camera can see below the surface.
 */
float causticGain(vec3 point) {
  if (u_scroll < 0.09) return 1.0;
  vec3 light = refractedSunDirection();
  float travel = (u_floorDepth + point.y) / max(-light.y, 0.0001);
  vec2 floorPoint = point.xz + light.xz * travel;
  float energy = textureLod(u_caustics, fract(floorPoint / u_domainSize + 0.5), 0.75).r;
  return mix(1.0, min(0.6 + energy * 3.0, 2.6), smoothstep(0.5, 5.0, -point.y));
}

vec3 fishRadianceInWater(vec3 position, vec3 normal, vec3 direction, vec3 albedo, float silver) {
  vec3 extinction = waterExtinctionCoefficient();
  vec3 light = refractedSunDirection();
  float depth = max(-position.y, 0.0);
  vec3 sun = primaryLightRadiance() * exp(-extinction * depth / max(-light.y, 0.0001)) * causticGain(position);
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

/** Test the pellet spheres. A negative radius marks a pellet that floats at the surface. */
bool tracePellets(vec3 origin, vec3 direction, bool airOnly, inout float hitDistance, out vec3 hitNormal) {
  bool hit = false;
  hitNormal = vec3(0.0, 1.0, 0.0);
  for (int index = 0; index < ${PELLET_SLOTS}; index += 1) {
    if (index >= u_pelletCount) break;
    vec4 pellet = texelFetch(u_actors, ivec2(index, 3), 0);
    if (airOnly && pellet.w > 0.0) continue;
    if (pellet.w < 0.0) {
      // A floating pellet sits mostly below the surface sample of this frame.
      pellet.xyz = texelFetch(u_probeSurface, ivec2(int(pellet.x), 0), 0).xyz
        + vec3(0.0, pellet.w * 0.35, 0.0);
    }
    vec3 relative = origin - pellet.xyz;
    float halfChord = dot(relative, direction);
    float discriminant = halfChord * halfChord - dot(relative, relative) + pellet.w * pellet.w;
    if (discriminant < 0.0) continue;
    float travel = -halfChord - sqrt(discriminant);
    if (travel > 0.0 && travel < hitDistance) {
      hitDistance = travel;
      hitNormal = normalize(relative + direction * travel);
      hit = true;
    }
  }
  return hit;
}

/**
 * A folded paper boat in a local frame where the length is one.
 *
 * The hull is a hollow shell with sloped sides and ends. The center sail is
 * a thin triangle. Plane distances keep the folds sharp.
 */
float boatDistance(vec3 p) {
  float sideX = (abs(p.x) - (0.07 + 0.375 * p.y)) * 0.936;
  float sideZ = (abs(p.z) - (0.30 + 1.25 * p.y)) * 0.625;
  float outer = max(max(-p.y, p.y - 0.16), max(sideX, sideZ));
  float inner = max(0.014 - p.y, max(sideX + 0.012, sideZ + 0.012));
  float sail = max(max(abs(p.x) - 0.007, 0.1 - p.y), (p.y + abs(p.z) * 1.077 - 0.42) * 0.68);
  return min(max(outer, -inner), sail);
}

void boatFrame(int index, out vec3 origin, out float size, out vec3 right, out vec3 up,
  out vec3 forward, out float tint) {
  vec4 placement = texelFetch(u_actors, ivec2(${PELLET_SLOTS} + index * 2, 3), 0);
  vec4 attitude = texelFetch(u_actors, ivec2(${PELLET_SLOTS} + index * 2 + 1, 3), 0);
  ivec2 probe = ivec2(int(placement.x), 0);
  vec3 surface = texelFetch(u_probeSurface, probe, 0).xyz;
  size = placement.w;
  up = normalize(texelFetch(u_probeSurface, probe + ivec2(0, 1), 0).xyz);
  tint = floor(attitude.w / 10.0);
  float yaw = attitude.w - tint * 10.0;
  vec3 heading = vec3(sin(yaw), 0.0, cos(yaw));
  forward = normalize(heading - up * dot(heading, up));
  right = cross(up, forward);
  origin = surface - up * (${BOAT_DRAFT.toFixed(3)} * size);
}

bool traceBoats(vec3 origin, vec3 direction, inout float hitDistance, out vec3 hitLocal, out int hitIndex) {
  hitIndex = -1;
  for (int index = 0; index < ${BOAT_SLOTS}; index += 1) {
    if (index >= u_boatCount) break;
    vec3 position, right, up, forward;
    float size, tint;
    boatFrame(index, position, size, right, up, forward, tint);
    vec3 relative = (origin - position) / size;
    vec3 localOrigin = vec3(dot(relative, right), dot(relative, up), dot(relative, forward));
    vec3 localDirection = vec3(dot(direction, right), dot(direction, up), dot(direction, forward));
    vec3 center = localOrigin - vec3(0.0, 0.2, 0.0);
    float halfChord = dot(center, localDirection);
    float discriminant = halfChord * halfChord - dot(center, center)
      + ${(BOAT_BOUND_RADIUS * BOAT_BOUND_RADIUS).toFixed(4)};
    if (discriminant < 0.0) continue;
    discriminant = sqrt(discriminant);
    float exit = -halfChord + discriminant;
    float travel = max(-halfChord - discriminant, 0.0);
    if (exit <= 0.0 || travel * size >= hitDistance) continue;
    for (int step = 0; step < 40; step += 1) {
      vec3 point = localOrigin + localDirection * travel;
      float distance = boatDistance(point);
      if (distance < 0.0012) {
        hitDistance = travel * size;
        hitLocal = point;
        hitIndex = index;
        break;
      }
      travel += max(distance * 0.9, 0.0015);
      if (travel > exit || travel * size >= hitDistance) break;
    }
  }
  return hitIndex >= 0;
}

vec3 boatRadiance(vec3 point, vec3 local, int index, vec3 direction, bool inWater) {
  vec3 position, right, up, forward;
  float size, tint;
  boatFrame(index, position, size, right, up, forward, tint);
  const vec2 offset = vec2(0.004, -0.004);
  vec3 gradient = offset.xyy * boatDistance(local + offset.xyy)
    + offset.yyx * boatDistance(local + offset.yyx)
    + offset.yxy * boatDistance(local + offset.yxy)
    + offset.xxx * boatDistance(local + offset.xxx);
  vec3 localNormal = normalize(gradient);
  vec3 normal = normalize(right * localNormal.x + up * localNormal.y + forward * localNormal.z);
  // One distance sample along the normal estimates the shade inside the hull.
  float occlusion = clamp(boatDistance(local + localNormal * 0.05) / 0.05, 0.3, 1.0);
  vec3 paper = tint < 0.5 ? vec3(0.88, 0.87, 0.82)
    : tint < 1.5 ? vec3(0.90, 0.84, 0.70) : vec3(0.74, 0.80, 0.86);
  // Paper darkens where the water soaks the hull.
  paper *= mix(0.62, 1.0, smoothstep(${BOAT_DRAFT.toFixed(3)}, ${(BOAT_DRAFT + 0.04).toFixed(3)}, local.y));
  if (inWater) return fishRadianceInWater(point, normal, direction, paper * 0.6 * occlusion, 0.0);
  vec3 light = u_primaryLightDirection;
  float facing = dot(normal, light);
  vec3 sun = primaryLightRadiance() * (max(facing, 0.0) + max(-facing, 0.0) * 0.3);
  return paper * occlusion * (sun + v_diffuseSkyRadiance * (0.6 + 0.4 * normal.y));
}

/**
 * Test the spray droplets of the live splashes.
 *
 * Each droplet follows a ballistic path from its splash. A hash of the splash
 * seed and the droplet index sets its launch velocity and size, so the CPU
 * sends only one record per splash.
 */
bool traceSpray(vec3 origin, vec3 direction, inout float hitDistance, out vec3 hitNormal) {
  bool hit = false;
  hitNormal = vec3(0.0, 1.0, 0.0);
  for (int splash = 0; splash < ${SPLASH_SLOTS}; splash += 1) {
    if (splash >= u_splashCount) break;
    vec4 place = u_splashes[splash * 2];
    vec4 motion = u_splashes[splash * 2 + 1];
    float age = place.w;
    if (age > ${SPRAY_LIFETIME_SECONDS.toFixed(2)}) continue;
    vec3 center = place.xyz + vec3(0.0, 0.4, 0.0) - origin;
    float reach = ${SPRAY_REACH.toFixed(2)} * motion.x + 0.2;
    float along = dot(center, direction);
    if (dot(center, center) - along * along > reach * reach) continue;
    for (int droplet = 0; droplet < 24; droplet += 1) {
      if (droplet >= u_sprayDroplets) break;
      vec3 random = hash33(vec3(float(droplet) * 1.7, motion.w, float(splash) * 7.3));
      float angle = random.x * 6.2831853;
      vec2 outward = vec2(cos(angle), sin(angle)) * mix(0.3, 1.3, random.y) + motion.yz * 0.7;
      vec3 velocity = vec3(outward.x, mix(1.0, 2.6, random.z), outward.y) * motion.x;
      vec3 droplet3 = place.xyz + velocity * age + vec3(0.0, -4.905 * age * age, 0.0);
      if (droplet3.y < place.y - 0.03) continue;
      float radius = mix(0.009, 0.02, fract(random.x * 37.0)) * (1.0 - 0.4 * age / ${SPRAY_LIFETIME_SECONDS.toFixed(2)});
      vec3 relative = origin - droplet3;
      float halfChord = dot(relative, direction);
      float discriminant = halfChord * halfChord - dot(relative, relative) + radius * radius;
      if (discriminant < 0.0) continue;
      float travel = -halfChord - sqrt(discriminant);
      if (travel > 0.0 && travel < hitDistance) {
        hitDistance = travel;
        hitNormal = normalize(relative + direction * travel);
        hit = true;
      }
    }
  }
  return hit;
}

/** Return the whitewater cover of the splashes at a surface point. */
float splashFoam(vec2 position) {
  float foam = 0.0;
  for (int splash = 0; splash < ${SPLASH_SLOTS}; splash += 1) {
    if (splash >= u_splashCount) break;
    vec4 place = u_splashes[splash * 2];
    vec4 motion = u_splashes[splash * 2 + 1];
    float age = place.w;
    vec2 offset = position - place.xz;
    float radius = 0.16 + 0.5 * sqrt(age) * motion.x;
    float distance = length(offset);
    if (distance > radius * 1.3) continue;
    float cover = smoothstep(radius * 1.25, radius * 0.5, distance);
    float bubbles = noise21(offset * 11.0 + motion.w * 31.0) * 0.6
      + noise21(offset * 27.0 - motion.w * 17.0) * 0.4;
    float fade = 1.0 - smoothstep(0.0, ${SPLASH_LIFETIME_SECONDS.toFixed(2)}, age);
    foam = max(foam, cover * smoothstep(0.3, 0.7, bubbles + 0.3 * fade) * motion.x * fade);
  }
  return clamp(foam, 0.0, 1.0);
}

bool shadeLife(vec3 origin, vec3 direction, float limit, bool inWater,
  out float hitDistance, out vec3 radiance) {
  vec3 local;
  int index;
  radiance = vec3(0.0);
  hitDistance = limit;
  bool inBox = inWater ? rayBox(origin, direction, u_lifeLow, u_lifeHigh, limit)
    : rayBox(origin, direction, u_airLow, u_airHigh, limit);
  bool fish = inBox && u_fishCount > 0
    && traceFish(origin, direction, limit, !inWater, hitDistance, local, index);
  vec3 boatLocal;
  int boat = -1;
  // Only the 2 cm below the waterline of a boat is under water. The water path skips boats.
  if (!inWater && u_boatCount > 0 && rayBox(origin, direction, u_boatLow, u_boatHigh, hitDistance)
    && traceBoats(origin, direction, hitDistance, boatLocal, boat)) {
    fish = false;
  }
  vec3 pelletNormal;
  if (inBox && u_pelletCount > 0 && tracePellets(origin, direction, !inWater, hitDistance, pelletNormal)) {
    vec3 food = vec3(0.32, 0.19, 0.08);
    radiance = inWater
      ? fishRadianceInWater(origin + direction * hitDistance, pelletNormal, direction, food, 0.0)
      : fishRadianceInAir(pelletNormal, direction, food, 0.0);
    return true;
  }
  vec3 sprayNormal;
  if (!inWater && inBox && u_splashCount > 0 && traceSpray(origin, direction, hitDistance, sprayNormal)) {
    vec3 mirror = reflect(direction, sprayNormal);
    radiance = v_diffuseSkyRadiance * 1.1 + primaryLightRadiance()
      * (0.35 + 3.0 * pow(max(dot(mirror, u_primaryLightDirection), 0.0), 40.0));
    return true;
  }
  if (boat >= 0) {
    radiance = boatRadiance(origin + direction * hitDistance, boatLocal, boat, direction, inWater);
    return true;
  }
  if (!fish) return false;
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
  // At night the plankton light around a fish outlines its body.
  if (inWater) {
    float rim = 1.0 - abs(dot(normal, direction));
    radiance += glowRadiance(sampleGlow(point.xz)) * 0.25 * rim * rim;
  }
  return true;
}

/**
 * Sample the water below a surface point, with fish and pellets.
 *
 * The fish ray uses a surface normal filtered over 0.3 m. Capillary ripples
 * would otherwise break each fish into speckles at grazing view angles. The
 * water volume keeps the full optical normal.
 */
vec3 sampleRefractedScene(vec3 surfacePosition, vec3 incident, vec3 direction, int sampleCount) {
  vec3 origin = surfacePosition + direction * 0.025;
  bool near = false;
  if (rayBox(origin, direction, u_lifeLow - 0.6, u_lifeHigh + 0.6, 52.0)) {
    // The filtered normal costs many texture reads. Compute it only near a fish or a pellet.
    for (int index = 0; index < ${ACTOR_TEXTURE_WIDTH}; index += 1) {
      if (index >= u_fishCount || near) break;
      near = nearFish(index, origin, direction, 52.0, 0.6);
    }
    for (int index = 0; index < ${PELLET_SLOTS}; index += 1) {
      if (index >= u_pelletCount || near) break;
      vec4 pellet = texelFetch(u_actors, ivec2(index, 3), 0);
      if (pellet.w < 0.0) pellet.xyz = texelFetch(u_probeSurface, ivec2(int(pellet.x), 0), 0).xyz;
      vec3 center = pellet.xyz - origin;
      float along = dot(center, direction);
      near = along > -0.7 && dot(center, center) - along * along < 0.49;
    }
  }
  if (near) {
    vec3 calmNormal = surfaceNormal(g_surfaceParameter, 0.3);
    vec3 lifeDirection = refract(incident, calmNormal, 1.0 / WATER_IOR);
    float distance;
    vec3 radiance;
    if (dot(lifeDirection, lifeDirection) > 0.000001
      && shadeLife(origin, lifeDirection, 52.0, true, distance, radiance)) {
      return radiance * exp(-waterExtinctionCoefficient() * distance)
        + underwaterVolume(origin, direction, distance, sampleCount);
    }
  }
  return sampleUnderwaterRay(origin, direction, sampleCount);
}
`;

export const lifeReflectionShader = `
/** Replace the reflected sky where a reflected ray meets a boat, a pellet, or a jumping fish. */
vec3 reflectLife(vec3 surfacePosition, vec3 direction, vec3 sky) {
  if (direction.y <= 0.0) return sky;
  float distance;
  vec3 radiance;
  if (shadeLife(surfacePosition + direction * 0.01, direction, 40.0, false, distance, radiance)) return radiance;
  return sky;
}
`;
