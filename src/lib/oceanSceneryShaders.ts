export const KELP_SLOTS = 32;
export const JELLY_SLOTS = 10;
export const VENT_SLOTS = 5;
export const BURST_SLOTS = 4;
export const BUBBLES_PER_VENT = 14;
export const BUBBLES_PER_BURST = 18;
export const BURST_LIFETIME_SECONDS = 4;

/**
 * Underwater scenery for the display shader: kelp, jellyfish, a manta ray,
 * and bubbles.
 *
 * Each element moves on a path from the life clock and a fixed hash, so the
 * CPU sends only the element counts and the bubble bursts from clicks.
 * The display shader includes this code after the fish code, because the
 * shading reuses the underwater light of the fish.
 */
export const sceneryShader = `
uniform vec4 u_scenery;
uniform vec4 u_bursts[${BURST_SLOTS}];
uniform highp int u_burstCount;

struct SceneryHit {
  float distance;
  vec3 radiance;
  float alpha;
};

// The bounds of a vertical cylinder along a ray, clipped to a height range.
bool cylinderSpan(vec3 origin, vec3 direction, vec2 center, float radius, float low, float high,
  out float entry, out float exit) {
  vec2 offset = origin.xz - center;
  float a = dot(direction.xz, direction.xz);
  float b = dot(offset, direction.xz);
  float c = dot(offset, offset) - radius * radius;
  entry = 0.0;
  exit = 1e5;
  if (a > 0.000001) {
    float discriminant = b * b - a * c;
    if (discriminant < 0.0) return false;
    discriminant = sqrt(discriminant);
    entry = (-b - discriminant) / a;
    exit = (-b + discriminant) / a;
  } else if (c > 0.0) {
    return false;
  }
  if (abs(direction.y) > 0.000001) {
    float first = (low - origin.y) / direction.y;
    float second = (high - origin.y) / direction.y;
    entry = max(entry, min(first, second));
    exit = min(exit, max(first, second));
  } else if (origin.y < low || origin.y > high) {
    return false;
  }
  entry = max(entry, 0.0);
  return entry < exit;
}

bool sphereSpan(vec3 origin, vec3 direction, vec3 center, float radius, out float entry, out float exit) {
  vec3 offset = origin - center;
  float halfChord = dot(offset, direction);
  float discriminant = halfChord * halfChord - dot(offset, offset) + radius * radius;
  if (discriminant < 0.0) return false;
  discriminant = sqrt(discriminant);
  entry = max(-halfChord - discriminant, 0.0);
  exit = -halfChord + discriminant;
  return exit > 0.0;
}

vec3 underwaterSkylight(float depth) {
  return v_diffuseSkyRadiance * 0.92 * exp(-waterExtinctionCoefficient() * depth);
}

// ---- Kelp ----

vec4 kelpStalk(int index) {
  vec3 random = hash33(vec3(float(index) * 3.17, 7.7, 1.3));
  vec2 base = vec2(mix(-8.0, 8.0, random.x), mix(6.0, 26.0, random.y));
  return vec4(base, mix(6.0, 13.0, random.z), random.x * 6.2831853 + random.y * 3.0);
}

vec2 kelpCenter(vec4 stalk, float height) {
  float sway = 0.7 * pow(clamp(height / stalk.z, 0.0, 1.0), 1.5);
  return stalk.xy + sway * vec2(
    sin(u_lifeTime * 0.5 + stalk.w + height * 0.25),
    cos(u_lifeTime * 0.37 + stalk.w * 1.7 + height * 0.2)
  );
}

const float KELP_SPACING = 0.55;

/**
 * A kelp frond: a thin stem with flat blades. Each blade leaves the stem on a
 * golden-angle spiral and points up and out, as the current lifts it.
 * The blade output is 1 on a blade and 0 on the stem.
 */
float kelpDistance(vec3 point, vec4 stalk, out float blade) {
  float height = point.y + u_floorDepth;
  float clamped = clamp(height, 0.0, stalk.z);
  vec2 relative = point.xz - kelpCenter(stalk, clamped);
  float stem = max(length(relative) - 0.035, max(-height, height - stalk.z));
  float blades = 1e5;
  float first = floor(height / KELP_SPACING);
  for (int offset = -1; offset <= 0; offset += 1) {
    float index = first + float(offset);
    if (index < 1.0 || index * KELP_SPACING > stalk.z - 0.3) continue;
    float angle = index * 2.39996 + stalk.w + 0.35 * sin(u_lifeTime * 0.6 + index);
    vec2 outward = vec2(cos(angle), sin(angle));
    vec3 local = vec3(dot(relative, outward), height - index * KELP_SPACING, dot(relative, vec2(-outward.y, outward.x)));
    // Tilt the blade 0.3 rad away from the stem, then center it on its midpoint.
    local.xy = mat2(0.955, 0.296, -0.296, 0.955) * local.xy - vec2(0.12, 0.42);
    vec3 radii = vec3(0.11, 0.46, 0.012);
    float k0 = length(local / radii);
    float k1 = length(local / (radii * radii));
    blades = min(blades, k0 * (k0 - 1.0) / max(k1, 0.00001));
  }
  // A holdfast anchors the stem in the sand.
  float holdfast = length((point - vec3(stalk.x, -u_floorDepth, stalk.y)) / vec3(1.0, 0.6, 1.0)) * 0.6 - 0.11;
  stem = min(stem, holdfast);
  blade = step(blades, stem);
  return min(stem, blades);
}

float kelpDistance(vec3 point, vec4 stalk) {
  float blade;
  return kelpDistance(point, stalk, blade);
}

// ---- Jellyfish ----

void jellyPlace(int index, out vec3 center, out float size, out float pulse, out float phase) {
  vec3 random = hash33(vec3(float(index) * 5.3, 2.1, 9.7));
  phase = random.x * 6.2831853 + random.z * 3.0;
  float time = u_lifeTime;
  center = vec3(mix(-7.0, 7.0, random.x), mix(-4.0, -17.0, random.y), mix(3.0, 24.0, random.z))
    + vec3(sin(time * 0.05 + phase) * 1.6, sin(time * 0.09 + phase * 1.3) * 0.8, cos(time * 0.04 + phase) * 1.6);
  size = mix(0.4, 0.75, fract(random.y * 7.0));
  pulse = 0.5 + 0.5 * sin(time * 1.4 + phase);
}

// Return the distance in jelly units. Bell is 1 on the bell and 0 on an arm.
float jellyDistance(vec3 local, float pulse, float phase, out float bell) {
  float squash = 0.72 - 0.16 * pulse;
  vec3 dome = local / vec3(1.0 + 0.08 * pulse, squash, 1.0 + 0.08 * pulse);
  float cap = max((length(dome) - 1.0) * squash, -local.y - 0.1);
  float arms = 1e5;
  for (int arm = 0; arm < 4; arm += 1) {
    float angle = float(arm) * 1.5707963 + phase;
    float depth = clamp(-local.y, 0.0, 2.6);
    vec2 center = vec2(cos(angle), sin(angle)) * 0.22 * (1.0 - depth * 0.15)
      + vec2(sin(depth * 2.2 + u_lifeTime * 1.3 + angle), cos(depth * 1.9 + u_lifeTime * 1.1 + angle)) * 0.12 * depth;
    float distance = length(local.xz - center) - 0.07 * (1.0 - depth / 2.8);
    arms = min(arms, max(distance, max(local.y + 0.05, -local.y - 2.6)));
  }
  bell = step(cap, arms);
  return min(cap, arms);
}

// ---- Manta ray ----

void mantaFrame(out vec3 center, out vec3 right, out vec3 up, out vec3 forward) {
  float time = u_lifeTime * 0.07;
  center = vec3(sin(time) * 6.0, -8.0 + sin(time * 1.7) * 2.5, 13.0 + cos(time) * 6.0);
  vec3 ahead = vec3(sin(time + 0.02) * 6.0, -8.0 + sin((time + 0.02) * 1.7) * 2.5, 13.0 + cos(time + 0.02) * 6.0);
  forward = normalize(ahead - center);
  right = normalize(vec3(forward.z, 0.0, -forward.x));
  up = cross(forward, right);
}

// The manta spans about five meters. Its shape uses units of 1.6 m.
float mantaDistance(vec3 point) {
  vec3 local = point / 1.6;
  float across = abs(local.x);
  local.y -= sin(u_lifeTime * 0.9 - across * 0.9) * 0.32 * pow(across / 1.6, 2.0);
  float wing = (across / 1.6 + abs(local.z - 0.1 + across * 0.25) / 0.85 - 1.0) * 0.5;
  float thickness = 0.14 * (1.0 - smoothstep(0.0, 1.6, across)) + 0.02;
  float body = max(wing, abs(local.y) - thickness);
  float lobe = (length(vec3(across - 0.28, local.y, local.z - 0.85) / vec3(0.07, 0.04, 0.22)) - 1.0) * 0.04;
  float tail = length(vec3(local.x, local.y, local.z + clamp(-local.z, 0.7, 2.4))) - 0.015;
  return min(body, min(lobe, tail)) * 1.6;
}

// ---- Bubbles ----

vec2 ventBase(int index) {
  vec3 random = hash33(vec3(float(index) * 9.1, 4.4, 6.6));
  return vec2(mix(-6.0, 6.0, random.x), mix(6.0, 22.0, random.y));
}

bool traceBubble(vec3 origin, vec3 direction, vec3 center, float radius, inout SceneryHit hit) {
  vec3 offset = origin - center;
  float halfChord = dot(offset, direction);
  float discriminant = halfChord * halfChord - dot(offset, offset) + radius * radius;
  if (discriminant < 0.0) return false;
  float travel = -halfChord - sqrt(discriminant);
  if (travel <= 0.0 || travel >= hit.distance) return false;
  vec3 normal = normalize(offset + direction * travel);
  float rim = 1.0 - abs(dot(normal, direction));
  float depth = max(-(origin.y + direction.y * travel), 0.0);
  vec3 mirror = reflect(direction, normal);
  vec3 light = primaryLightRadiance() * exp(-waterExtinctionCoefficient() * depth / max(-refractedSunDirection().y, 0.0001));
  hit.distance = travel;
  hit.radiance = underwaterSkylight(depth) * (1.2 + 3.0 * rim * rim)
    + light * pow(max(dot(mirror, -refractedSunDirection()), 0.0), 30.0) * 2.0;
  hit.alpha = 0.4 + 0.6 * rim * rim;
  return true;
}

// ---- Scene ----

bool traceScenery(vec3 origin, vec3 direction, float limit, out SceneryHit hit) {
  hit = SceneryHit(limit, vec3(0.0), 0.0);
  if (u_scenery == vec4(0.0)) return false;
  vec3 extinction = waterExtinctionCoefficient();
  vec3 light = refractedSunDirection();
  float floorY = -u_floorDepth;

  for (int index = 0; index < ${KELP_SLOTS}; index += 1) {
    if (float(index) >= u_scenery.x) break;
    vec4 stalk = kelpStalk(index);
    // Leave room for the camera, which descends between the stalks.
    if (length(stalk.xy - origin.xz) < 1.4) continue;
    float entry, exit;
    if (!cylinderSpan(origin, direction, stalk.xy, 1.1, floorY, floorY + stalk.z, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    float travel = entry;
    for (int step = 0; step < 64; step += 1) {
      vec3 point = origin + direction * travel;
      float blade;
      float distance = kelpDistance(point, stalk, blade);
      if (distance < 0.004) {
        const vec2 e = vec2(0.01, -0.01);
        vec3 normal = normalize(e.xyy * kelpDistance(point + e.xyy, stalk)
          + e.yyx * kelpDistance(point + e.yyx, stalk)
          + e.yxy * kelpDistance(point + e.yxy, stalk)
          + e.xxx * kelpDistance(point + e.xxx, stalk));
        vec3 albedo = mix(vec3(0.24, 0.20, 0.07), vec3(0.50, 0.45, 0.14), blade);
        float depth = max(-point.y, 0.0);
        vec3 sun = primaryLightRadiance() * exp(-extinction * depth / max(-light.y, 0.0001));
        // Thin blades pass light: the side away from the sun glows yellow-green.
        float through = pow(max(dot(direction, light), 0.0), 3.0) * blade;
        hit.distance = travel;
        hit.radiance = fishRadianceInWater(point, normal, direction, albedo, 0.05)
          + albedo * (sun * through * 1.4 + underwaterSkylight(depth) * 0.6);
        hit.alpha = 1.0;
        break;
      }
      travel += max(distance * 0.75, 0.006);
      if (travel > exit || travel >= hit.distance) break;
    }
  }

  for (int index = 0; index < ${JELLY_SLOTS}; index += 1) {
    if (float(index) >= u_scenery.y) break;
    vec3 center;
    float size, pulse, phase;
    jellyPlace(index, center, size, pulse, phase);
    float entry, exit;
    if (!sphereSpan(origin, direction, center - vec3(0.0, size, 0.0), size * 2.1, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    float travel = entry;
    for (int step = 0; step < 32; step += 1) {
      vec3 point = origin + direction * travel;
      float bell;
      float distance = jellyDistance((point - center) / size, pulse, phase, bell) * size;
      if (distance < 0.003) {
        const vec2 e = vec2(0.01, -0.01);
        float ignored;
        vec3 local = (point - center) / size;
        vec3 normal = normalize(e.xyy * jellyDistance(local + e.xyy, pulse, phase, ignored)
          + e.yyx * jellyDistance(local + e.yyx, pulse, phase, ignored)
          + e.yxy * jellyDistance(local + e.yxy, pulse, phase, ignored)
          + e.xxx * jellyDistance(local + e.xxx, pulse, phase, ignored));
        float rim = 1.0 - abs(dot(normal, direction));
        float depth = max(-point.y, 0.0);
        vec3 tint = mix(vec3(0.78, 0.52, 0.80), vec3(0.95, 0.60, 0.55), bell * 0.5 + 0.25 * sin(phase));
        vec3 body = tint * (underwaterSkylight(depth) * (1.6 + 2.6 * rim) + waterAmbientRadiance() * 4.0);
        // Comb rows and the bell rim flash at night.
        vec3 glow = glowRadiance(u_glowStrength) * (0.03 + 0.09 * rim) * (0.6 + 0.4 * pulse);
        hit.distance = travel;
        hit.radiance = body + glow;
        hit.alpha = bell > 0.5 ? 0.4 + 0.55 * pow(rim, 1.5) : 0.65;
        break;
      }
      travel += max(distance * 0.7, 0.004);
      if (travel > exit || travel >= hit.distance) break;
    }
  }

  if (u_scenery.z > 0.5) {
    vec3 center, right, up, forward;
    mantaFrame(center, right, up, forward);
    float entry, exit;
    if (sphereSpan(origin, direction, center - forward * 1.0, 4.2, entry, exit) && entry < hit.distance) {
      vec3 relative = origin - center;
      vec3 localOrigin = vec3(dot(relative, right), dot(relative, up), dot(relative, forward));
      vec3 localDirection = vec3(dot(direction, right), dot(direction, up), dot(direction, forward));
      float travel = entry;
      for (int step = 0; step < 40; step += 1) {
        vec3 local = localOrigin + localDirection * travel;
        float distance = mantaDistance(local);
        if (distance < 0.004) {
          const vec2 e = vec2(0.008, -0.008);
          vec3 gradient = e.xyy * mantaDistance(local + e.xyy) + e.yyx * mantaDistance(local + e.yyx)
            + e.yxy * mantaDistance(local + e.yxy) + e.xxx * mantaDistance(local + e.xxx);
          vec3 normal = normalize(right * gradient.x + up * gradient.y + forward * gradient.z);
          // Dark back, pale belly: the counter-shading of a real manta.
          float belly = smoothstep(0.2, -0.2, dot(normal, up));
          vec3 albedo = mix(vec3(0.05, 0.06, 0.07), vec3(0.70, 0.72, 0.72), belly);
          hit.distance = travel;
          hit.radiance = fishRadianceInWater(origin + direction * travel, normal, direction, albedo, 0.1);
          hit.alpha = 1.0;
          break;
        }
        travel += max(distance * 0.7, 0.004);
        if (travel > exit || travel >= hit.distance) break;
      }
    }
  }

  for (int vent = 0; vent < ${VENT_SLOTS}; vent += 1) {
    if (float(vent) >= u_scenery.w) break;
    vec2 base = ventBase(vent);
    float entry, exit;
    if (!cylinderSpan(origin, direction, base, 0.6, floorY, floorY + 14.0, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    for (int bubble = 0; bubble < ${BUBBLES_PER_VENT}; bubble += 1) {
      float rise = fract(u_lifeTime * 0.025 + float(bubble) / ${BUBBLES_PER_VENT.toFixed(1)} + float(vent) * 0.37);
      float height = rise * 14.0;
      vec3 center = vec3(base.x, floorY, base.y) + vec3(
        sin(height * 2.3 + float(bubble)) * 0.08 * sqrt(height),
        height,
        cos(height * 1.9 + float(bubble) * 2.0) * 0.08 * sqrt(height));
      traceBubble(origin, direction, center, 0.015 + 0.02 * rise, hit);
    }
  }

  for (int burst = 0; burst < ${BURST_SLOTS}; burst += 1) {
    if (burst >= u_burstCount) break;
    vec4 place = u_bursts[burst];
    float age = place.w;
    float entry, exit;
    if (!sphereSpan(origin, direction, place.xyz + vec3(0.0, age * 0.45, 0.0), 1.0 + age * 0.15, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    for (int bubble = 0; bubble < ${BUBBLES_PER_BURST}; bubble += 1) {
      vec3 random = hash33(vec3(float(bubble) * 1.3, place.x * 7.0, place.z * 3.0));
      vec2 spread = (random.xy - 0.5) * 0.7 * (1.0 - exp(-age * 2.0));
      vec3 center = place.xyz + vec3(spread.x, age * mix(0.35, 0.6, random.z), spread.y)
        + vec3(sin(age * 6.0 + random.x * 9.0), 0.0, cos(age * 5.0 + random.y * 9.0)) * 0.03;
      float radius = mix(0.025, 0.06, random.z) * (1.0 - smoothstep(${(BURST_LIFETIME_SECONDS - 1).toFixed(1)}, ${BURST_LIFETIME_SECONDS.toFixed(1)}, age));
      traceBubble(origin, direction, center, radius, hit);
    }
  }
  return hit.alpha > 0.0;
}
`;
