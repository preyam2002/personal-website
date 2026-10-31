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

// ---- Soft edges ----

// The width of the pixel cone at a travel distance along the current ray.
float coneWidth(float travel) {
  return max((g_coneOffset + travel) * g_pixelAngle, 0.0005);
}

// Turn the closest approach of a ray, in cone widths, into pixel coverage.
float coneCoverage(float ratio) {
  return clamp(1.0 - ratio, 0.0, 1.0);
}

// ---- Kelp ----

vec4 kelpStalk(int index) {
  vec3 random = hash33(vec3(float(index) * 3.17, 7.7, 1.3));
  vec2 base = vec2(mix(-8.0, 8.0, random.x), mix(6.0, 26.0, random.y));
  return vec4(base, mix(7.0, 14.0, random.z), random.x * 6.2831853 + random.y * 3.0);
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
 * A giant kelp frond: a thin stipe with ruffled blades. Each blade leaves the
 * stipe on a golden-angle spiral from a small gas bladder and points up and
 * out, as the current lifts it. Part is 0 on the stipe, 1 on a blade, and 2 on
 * a bladder, and 3 on the holdfast.
 */
float kelpDistance(vec3 point, vec4 stalk, out float part) {
  float height = point.y + u_floorDepth;
  float clamped = clamp(height, 0.0, stalk.z);
  vec2 relative = point.xz - kelpCenter(stalk, clamped);
  float stem = max(length(relative) - 0.03, max(-height, height - stalk.z));
  // The holdfast is a lumpy mass of roots on the sand.
  vec3 root = point - vec3(stalk.x, -u_floorDepth, stalk.y);
  float holdfast = (length(root / vec3(1.0, 0.55, 1.0)) - 0.2) * 0.55
    + 0.025 * noise21(root.xz * 22.0 + root.y * 9.0 + stalk.w);
  float blades = 1e5;
  float bladders = 1e5;
  float first = floor(height / KELP_SPACING);
  for (int offset = -1; offset <= 0; offset += 1) {
    float index = first + float(offset);
    if (index < 1.0 || index * KELP_SPACING > stalk.z - 0.3) continue;
    float angle = index * 2.39996 + stalk.w + 0.35 * sin(u_lifeTime * 0.6 + index);
    vec2 outward = vec2(cos(angle), sin(angle));
    vec3 local = vec3(dot(relative, outward), height - index * KELP_SPACING, dot(relative, vec2(-outward.y, outward.x)));
    bladders = min(bladders, length(local - vec3(0.06, 0.02, 0.0)) - 0.035);
    // Tilt the blade 0.3 rad away from the stipe, then center it on its midpoint.
    local.xy = mat2(0.955, 0.296, -0.296, 0.955) * local.xy - vec2(0.14, 0.5);
    // The blade edge ruffles, and the blade bends a little across its width.
    local.z -= 0.04 * sin(local.y * 9.0 + index) * (local.x / 0.12);
    vec3 radii = vec3(0.12 * (1.0 + 0.08 * sin(local.y * 18.0 + index * 3.0)), 0.52, 0.008);
    float k0 = length(local / radii);
    float k1 = length(local / (radii * radii));
    blades = min(blades, k0 * (k0 - 1.0) / max(k1, 0.00001));
  }
  float distance = min(min(stem, holdfast), min(blades, bladders));
  part = distance == blades ? 1.0 : distance == bladders ? 2.0 : distance == holdfast ? 3.0 : 0.0;
  return distance;
}

float kelpDistance(vec3 point, vec4 stalk) {
  float part;
  return kelpDistance(point, stalk, part);
}

vec3 kelpRadiance(vec3 point, vec3 normal, vec3 direction, vec4 stalk, float part) {
  vec3 extinction = waterExtinctionCoefficient();
  vec3 light = refractedSunDirection();
  float depth = max(-point.y, 0.0);
  float height = point.y + u_floorDepth;
  // Giant kelp is golden brown. The blades are thin and pass light.
  vec3 albedo = part > 2.5 ? vec3(0.30, 0.25, 0.17) * (0.7 + 0.5 * noise21(point.xz * 30.0))
    : part > 1.5 ? vec3(0.55, 0.42, 0.16)
    : part > 0.5 ? vec3(0.50, 0.37, 0.12) * (0.85 + 0.3 * noise21(point.xz * 9.0 + height * 3.0))
    : vec3(0.32, 0.24, 0.09);
  float occlusion = mix(0.45, 1.0, smoothstep(0.0, 3.0, height));
  vec3 sun = primaryLightRadiance() * exp(-extinction * depth / max(-light.y, 0.0001)) * causticGain(point);
  vec3 radiance = fishRadianceInWater(point, normal, direction, albedo, part > 1.5 ? 0.2 : 0.04) * occlusion;
  if (part > 0.5 && part < 1.5) {
    // Light through the blade: strong toward the sun, softer from the bright surface above.
    float towardSun = pow(max(dot(direction, -light), 0.0), 4.0);
    float towardSurface = smoothstep(-0.2, 0.8, direction.y);
    radiance += albedo * vec3(0.9, 0.85, 0.45)
      * (sun * towardSun * 1.6 + underwaterSkylight(depth) * towardSurface * 0.9);
  }
  return radiance;
}

// ---- Jellyfish ----

void jellyPlace(int index, out vec3 center, out float size, out float pulse, out float phase) {
  vec3 random = hash33(vec3(float(index) * 5.3, 2.1, 9.7));
  phase = random.x * 6.2831853 + random.z * 3.0;
  float time = u_lifeTime;
  center = vec3(mix(-7.0, 7.0, random.x), mix(-4.0, -17.0, random.y), mix(3.0, 24.0, random.z))
    + vec3(sin(time * 0.05 + phase) * 1.6, sin(time * 0.09 + phase * 1.3) * 0.8, cos(time * 0.04 + phase) * 1.6);
  size = mix(0.35, 0.65, fract(random.y * 7.0));
  pulse = 0.5 + 0.5 * sin(time * 1.4 + phase);
}

/**
 * A moon jelly in units of its bell radius: a thin, flat bell and four frilled
 * oral arms. Part is 1 on the bell and 0 on an arm.
 */
float jellyDistance(vec3 local, float pulse, float phase, out float part) {
  float squash = 0.5 - 0.12 * pulse;
  float spread = 1.0 + 0.1 * pulse;
  vec3 dome = local / vec3(spread, squash, spread);
  float outer = (length(dome) - 1.0) * squash;
  float inner = (length(dome - vec3(0.0, -0.12, 0.0)) - 0.94) * squash;
  float cap = max(max(outer, -inner), -local.y - 0.06);
  float arms = 1e5;
  for (int arm = 0; arm < 4; arm += 1) {
    float angle = float(arm) * 1.5707963 + phase + 0.785;
    float depth = clamp(-local.y, 0.0, 1.6);
    vec2 center = vec2(cos(angle), sin(angle)) * (0.12 + depth * 0.08)
      + vec2(sin(depth * 2.6 + u_lifeTime * 1.2 + angle), cos(depth * 2.1 + u_lifeTime * 0.9 + angle)) * 0.07 * depth;
    // The arm is a ribbon with a frilled edge.
    float frill = 0.045 * (1.0 - depth / 1.8) * (1.0 + 0.4 * sin(depth * 28.0 + angle * 5.0));
    float distance = length(local.xz - center) - frill;
    arms = min(arms, max(distance, max(local.y + 0.02, -local.y - 1.6)));
  }
  part = step(cap, arms);
  return min(cap, arms);
}

float jellyDistance(vec3 local, float pulse, float phase) {
  float part;
  return jellyDistance(local, pulse, phase, part);
}

// Return the color and opacity of the jelly at a point on its surface.
vec4 jellySurface(vec3 local, vec3 point, vec3 normal, vec3 direction, float pulse, float phase, float part) {
  float rim = 1.0 - abs(dot(normal, direction));
  float depth = max(-point.y, 0.0);
  vec3 skylight = underwaterSkylight(depth);
  // The bell is almost clear. Its Fresnel rim and its margin catch the light.
  vec3 tissue = vec3(0.86, 0.92, 1.0);
  float opacity = part > 0.5 ? 0.05 + 0.75 * pow(rim, 3.0) : 0.18 + 0.5 * pow(rim, 2.0);
  vec3 color = tissue * skylight * (1.4 + 3.0 * rim) + tissue * waterAmbientRadiance() * 3.0;
  if (part > 0.5) {
    // The four horseshoe gonads show as pink-violet rings on top of the bell.
    float rings = 0.0;
    for (int ring = 0; ring < 4; ring += 1) {
      float angle = float(ring) * 1.5707963 + phase;
      vec2 center = vec2(cos(angle), sin(angle)) * 0.34;
      float band = abs(length(local.xz - center) - 0.15);
      float open = smoothstep(-0.2, 0.2, dot(normalize(local.xz - center + 0.0001), -vec2(cos(angle), sin(angle))) + 0.4);
      rings = max(rings, (1.0 - smoothstep(0.025, 0.045, band)) * open);
    }
    rings *= smoothstep(0.02, 0.15, local.y);
    color = mix(color, vec3(0.92, 0.55, 0.78) * (skylight * 2.0 + waterAmbientRadiance() * 3.0), rings);
    opacity = max(opacity, rings * 0.7);
    // The margin of the bell carries a fringe of fine tentacles.
    float margin = 1.0 - smoothstep(0.0, 0.12, abs(local.y + 0.02));
    opacity = max(opacity, margin * 0.45);
  } else {
    color *= vec3(1.0, 0.86, 0.92);
  }
  // At night the rim and the canals glow faintly.
  color += glowRadiance(u_glowStrength) * (0.01 + 0.05 * rim) * (0.6 + 0.4 * pulse);
  return vec4(color, opacity);
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
vec3 mantaLocal(vec3 point) {
  vec3 local = point / 1.6;
  float across = abs(local.x);
  local.y -= sin(u_lifeTime * 0.9 - across * 0.9) * 0.32 * pow(across / 1.6, 2.0);
  return local;
}

float mantaDistance(vec3 point) {
  vec3 local = mantaLocal(point);
  float across = abs(local.x);
  // A swept wing with a curved leading edge and a thick center body.
  float sweep = local.z - 0.12 + across * 0.3 + 0.12 * across * across;
  float wing = (across / 1.6 + abs(sweep) / 0.8 - 1.0) * 0.5;
  float thickness = 0.16 * (1.0 - smoothstep(0.0, 1.5, across)) * (1.0 - smoothstep(0.2, 0.7, abs(sweep))) + 0.015;
  float body = max(wing, abs(local.y + 0.02 * across) - thickness);
  // Rolled cephalic lobes beside the mouth.
  float lobe = (length(vec3(across - 0.24, local.y + 0.02, local.z - 0.8) / vec3(0.06, 0.05, 0.2)) - 1.0) * 0.05;
  float tail = length(vec3(local.x, local.y, local.z + clamp(-local.z, 0.6, 2.2))) - 0.012;
  return min(body, min(lobe, tail)) * 1.6;
}

vec3 mantaAlbedo(vec3 point, vec3 normal, vec3 up) {
  vec3 local = mantaLocal(point);
  float across = abs(local.x);
  float back = smoothstep(-0.2, 0.2, dot(normal, up));
  // The back is near black, with pale shoulder patches.
  float shoulder = (1.0 - smoothstep(0.05, 0.12, abs(local.z - 0.45 + across * 0.55)))
    * smoothstep(0.2, 0.35, across) * (1.0 - smoothstep(0.75, 0.95, across));
  vec3 top = mix(vec3(0.035, 0.04, 0.045), vec3(0.42, 0.44, 0.44), shoulder * 0.8);
  // The belly is white, with dark spots in a pattern unique to each animal.
  vec2 cell = floor(local.xz * 4.0);
  vec2 inCell = fract(local.xz * 4.0) - 0.5;
  vec3 random = hash33(vec3(cell, 4.2));
  float spot = (1.0 - smoothstep(0.12, 0.2, length(inCell - (random.xy - 0.5) * 0.4)))
    * step(0.72, random.z) * (1.0 - smoothstep(0.3, 0.5, abs(local.z - 0.1)));
  vec3 belly = mix(vec3(0.82, 0.83, 0.82), vec3(0.08, 0.08, 0.09), spot);
  belly = mix(belly, vec3(0.06), (1.0 - smoothstep(0.05, 0.1, abs(local.x))) * smoothstep(0.7, 0.8, local.z));
  return mix(belly, top, back);
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

/**
 * Trace the scenery along one ray up to a limit distance.
 *
 * The result holds the nearest element, its color, and its opacity. Each
 * march keeps its closest approach in units of the pixel cone, so an edge
 * covers a pixel in part instead of making a jagged step.
 */
bool traceScenery(vec3 origin, vec3 direction, float limit, out SceneryHit hit) {
  hit = SceneryHit(limit, vec3(0.0), 0.0);
  if (u_scenery == vec4(0.0)) return false;
  float floorY = -u_floorDepth;

  for (int index = 0; index < ${KELP_SLOTS}; index += 1) {
    if (float(index) >= u_scenery.x) break;
    vec4 stalk = kelpStalk(index);
    // Leave room for the camera, which descends between the stalks.
    if (length(stalk.xy - origin.xz) < 1.4) continue;
    float entry, exit;
    if (!cylinderSpan(origin, direction, stalk.xy, 1.15, floorY, floorY + stalk.z, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    float travel = entry;
    float closest = 1e5;
    float closestTravel = entry;
    for (int step = 0; step < 64; step += 1) {
      vec3 point = origin + direction * travel;
      float distance = kelpDistance(point, stalk);
      float ratio = distance / coneWidth(travel);
      if (ratio < closest) {
        closest = ratio;
        closestTravel = travel;
      }
      if (ratio < 0.2) break;
      travel += max(distance * 0.75, 0.006);
      if (travel > exit || travel >= hit.distance) break;
    }
    float coverage = coneCoverage(closest);
    if (coverage <= 0.0 || closestTravel >= hit.distance) continue;
    vec3 point = origin + direction * closestTravel;
    float part;
    kelpDistance(point, stalk, part);
    vec2 e = vec2(1.0, -1.0) * max(coneWidth(closestTravel), 0.004);
    vec3 normal = normalize(e.xyy * kelpDistance(point + e.xyy, stalk)
      + e.yyx * kelpDistance(point + e.yyx, stalk)
      + e.yxy * kelpDistance(point + e.yxy, stalk)
      + e.xxx * kelpDistance(point + e.xxx, stalk));
    hit = SceneryHit(closestTravel, kelpRadiance(point, normal, direction, stalk, part), coverage);
  }

  for (int index = 0; index < ${JELLY_SLOTS}; index += 1) {
    if (float(index) >= u_scenery.y) break;
    vec3 center;
    float size, pulse, phase;
    jellyPlace(index, center, size, pulse, phase);
    float entry, exit;
    if (!sphereSpan(origin, direction, center - vec3(0.0, size * 0.7, 0.0), size * 1.8, entry, exit)) continue;
    if (entry >= hit.distance) continue;
    float travel = entry;
    float closest = 1e5;
    float closestTravel = entry;
    for (int step = 0; step < 40; step += 1) {
      vec3 point = origin + direction * travel;
      float distance = jellyDistance((point - center) / size, pulse, phase) * size;
      float ratio = distance / coneWidth(travel);
      if (ratio < closest) {
        closest = ratio;
        closestTravel = travel;
      }
      if (ratio < 0.2) break;
      travel += max(distance * 0.7, 0.003);
      if (travel > exit || travel >= hit.distance) break;
    }
    float coverage = coneCoverage(closest);
    if (coverage <= 0.0 || closestTravel >= hit.distance) continue;
    vec3 point = origin + direction * closestTravel;
    vec3 local = (point - center) / size;
    float part;
    jellyDistance(local, pulse, phase, part);
    vec2 e = vec2(1.0, -1.0) * max(coneWidth(closestTravel) / size, 0.008);
    vec3 normal = normalize(e.xyy * jellyDistance(local + e.xyy, pulse, phase)
      + e.yyx * jellyDistance(local + e.yyx, pulse, phase)
      + e.yxy * jellyDistance(local + e.yxy, pulse, phase)
      + e.xxx * jellyDistance(local + e.xxx, pulse, phase));
    vec4 surface = jellySurface(local, point, normal, direction, pulse, phase, part);
    hit = SceneryHit(closestTravel, surface.rgb, surface.a * coverage);
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
      float closest = 1e5;
      float closestTravel = entry;
      for (int step = 0; step < 48; step += 1) {
        float distance = mantaDistance(localOrigin + localDirection * travel);
        float ratio = distance / coneWidth(travel);
        if (ratio < closest) {
          closest = ratio;
          closestTravel = travel;
        }
        if (ratio < 0.2) break;
        travel += max(distance * 0.7, 0.004);
        if (travel > exit || travel >= hit.distance) break;
      }
      float coverage = coneCoverage(closest);
      if (coverage > 0.0 && closestTravel < hit.distance) {
        vec3 local = localOrigin + localDirection * closestTravel;
        vec2 e = vec2(1.0, -1.0) * max(coneWidth(closestTravel), 0.006);
        vec3 gradient = e.xyy * mantaDistance(local + e.xyy) + e.yyx * mantaDistance(local + e.yyx)
          + e.yxy * mantaDistance(local + e.yxy) + e.xxx * mantaDistance(local + e.xxx);
        vec3 normal = normalize(right * gradient.x + up * gradient.y + forward * gradient.z);
        vec3 point = origin + direction * closestTravel;
        vec3 albedo = mantaAlbedo(local, normalize(gradient), vec3(0.0, 1.0, 0.0));
        hit = SceneryHit(closestTravel, fishRadianceInWater(point, normal, direction, albedo, 0.08), coverage);
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
