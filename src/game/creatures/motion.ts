/**
 * Pure motion math for the creatures: body waves, swim frequency, paths, and a
 * steering agent. Nothing here touches the GPU, so it is tested in Jest.
 *
 * Conventions: meters and seconds; y = 0 is the sea surface and y is negative
 * below it. An animal's head points along +z in its own space, so a heading
 * (yaw) of 0 swims toward +z and yaw = atan2(dx, dz).
 */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle: number) {
  let result = angle % TAU;
  if (result <= -Math.PI) result += TAU;
  if (result > Math.PI) result -= TAU;
  return result;
}

/** Move a value toward a target with a time constant, independent of frame rate. */
export function damp(current: number, target: number, rate: number, delta: number) {
  return target + (current - target) * Math.exp(-rate * delta);
}

/**
 * Carangiform amplitude envelope (Videler's saithe), as a fraction of the tail
 * amplitude: 0.2 at the snout, smallest near a quarter of the body, and 1 at the tail.
 */
export function fishEnvelope(x: number) {
  return (0.02 - 0.08 * x + 0.16 * x * x) / 0.1;
}

/** Whale envelope: the stroke is concentrated behind 55 % of the body. */
export function whaleEnvelope(x: number) {
  return Math.pow(smoothstep(0.55, 1, x), 1.5) + 0.01 / 0.09;
}

/**
 * Tail-beat frequency locked to swim speed by the Strouhal number:
 * f = St * U / (2 * A * L), with A the tail half-amplitude as a fraction of L.
 */
export function strouhalFrequency(speed: number, length: number, tailAmplitude: number, strouhal = 0.3) {
  return (strouhal * Math.max(speed, 0)) / (2 * tailAmplitude * length);
}

/**
 * Lateral (or vertical) offset of the body at x in [0, 1] from snout to tail.
 * Phase is in cycles, so the wave travels toward the tail as phase grows.
 * The same formula runs in the vertex shader (see swimMaterial.ts).
 */
export function bodyWaveOffset(x: number, phase: number, length: number, tailAmplitude: number, wavelength: number, envelope: (x: number) => number = fishEnvelope) {
  return tailAmplitude * envelope(x) * length * Math.sin(TAU * (x / wavelength - phase));
}

/**
 * Moon jelly bell contraction in [0, 1] over one pulse cycle: a quick
 * contraction over the first 35 % of the cycle and a slow relaxation after.
 */
export function pulseContraction(cycle: number) {
  const p = cycle - Math.floor(cycle);
  if (p < 0.35) return Math.sin((Math.PI / 2) * (p / 0.35));
  return 1 - smoothstep(0.35, 1, p);
}

export type Point3 = { x: number; y: number; z: number };

/**
 * A closed Catmull-Rom loop through waypoints, sampled by arc length.
 * Each waypoint has an absolute height; animals clamp it against the seabed.
 */
export class LoopPath {
  readonly points: readonly Point3[];
  readonly length: number;
  private readonly table: Float64Array;
  private readonly samples: number;

  constructor(points: readonly Point3[], samplesPerSegment = 32) {
    if (points.length < 3) throw new Error("A loop needs at least three points");
    this.points = points;
    this.samples = points.length * samplesPerSegment;
    this.table = new Float64Array(this.samples + 1);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    this.evaluate(0, a);
    for (let index = 1; index <= this.samples; index += 1) {
      this.evaluate(index / this.samples, b);
      this.table[index] = this.table[index - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      a.x = b.x;
      a.y = b.y;
      a.z = b.z;
    }
    this.length = this.table[this.samples];
  }

  /** The point at parameter u in [0, 1), uniform per segment, not per meter. */
  evaluate(u: number, target: Point3) {
    const count = this.points.length;
    const scaled = (u - Math.floor(u)) * count;
    const segment = Math.floor(scaled) % count;
    const t = scaled - Math.floor(scaled);
    const p0 = this.points[(segment - 1 + count) % count];
    const p1 = this.points[segment];
    const p2 = this.points[(segment + 1) % count];
    const p3 = this.points[(segment + 2) % count];
    const t2 = t * t;
    const t3 = t2 * t;
    const blend = (v0: number, v1: number, v2: number, v3: number) =>
      0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
    target.x = blend(p0.x, p1.x, p2.x, p3.x);
    target.y = blend(p0.y, p1.y, p2.y, p3.y);
    target.z = blend(p0.z, p1.z, p2.z, p3.z);
    return target;
  }

  /** The point at a distance in meters along the loop (wraps around). */
  pointAt(distance: number, target: Point3) {
    const wrapped = ((distance % this.length) + this.length) % this.length;
    let low = 0;
    let high = this.samples;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.table[middle] <= wrapped) low = middle;
      else high = middle;
    }
    const span = this.table[high] - this.table[low];
    const t = span > 0 ? (wrapped - this.table[low]) / span : 0;
    return this.evaluate((low + t) / this.samples, target);
  }
}

/** A loop of points on an ellipse with a gentle wobble, for animals that circle an area. */
export function ellipseLoop(centerX: number, centerZ: number, radiusX: number, radiusZ: number, y: number, count = 8, rotation = 0, wobble = 0, seed = 0): Point3[] {
  const points: Point3[] = [];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    const jitter = 1 + wobble * Math.sin(index * 2.7 + seed * 1.3);
    const ex = Math.cos(angle) * radiusX * jitter;
    const ez = Math.sin(angle) * radiusZ * jitter;
    points.push({ x: centerX + ex * cos - ez * sin, y, z: centerZ + ex * sin + ez * cos });
  }
  return points;
}

/**
 * A target that moves along a loop ahead of an animal. It waits when the
 * animal falls behind (for example while it swerves around the diver).
 */
export class PathCarrot {
  distance: number;
  readonly point: Point3 = { x: 0, y: 0, z: 0 };

  constructor(readonly path: LoopPath, start = 0, readonly lead = 10) {
    this.distance = start;
    path.pointAt(start, this.point);
  }

  update(follower: Point3, speed: number, delta: number) {
    const gap = Math.hypot(this.point.x - follower.x, this.point.y - follower.y, this.point.z - follower.z);
    // Run ahead to the lead distance, then keep pace; stop if the follower is far behind.
    const pace = gap < this.lead ? speed * 1.5 + 0.5 : gap < this.lead * 2.5 ? speed : 0;
    this.distance += pace * delta;
    this.path.pointAt(this.distance, this.point);
    return this.point;
  }
}

export type SwimLimits = {
  /** Maximum yaw rate in radians per second. */
  turnRate: number;
  /** Maximum pitch in radians. */
  maxPitch: number;
  /** Speed change per second, in m/s². */
  acceleration: number;
  /** Roll per unit of yaw rate: bank into turns. */
  bank: number;
  /** How quickly pitch follows the desired climb angle, per second. */
  pitchRate: number;
};

/**
 * A steering agent for a large animal: it turns with a limited rate, banks
 * into turns, and pitches to climb or dive.
 */
export class Swimmer {
  position: Point3;
  yaw: number;
  pitch = 0;
  roll = 0;
  speed: number;
  yawRate = 0;

  constructor(position: Point3, yaw: number, speed: number, readonly limits: SwimLimits) {
    this.position = { ...position };
    this.yaw = yaw;
    this.speed = speed;
  }

  /** Steer toward a direction (need not be normalized) at a desired speed. */
  step(direction: Point3, desiredSpeed: number, delta: number) {
    if (delta <= 0) return;
    const { turnRate, maxPitch, acceleration, bank, pitchRate } = this.limits;
    const horizontal = Math.hypot(direction.x, direction.z);
    if (horizontal > 1e-6) {
      const error = wrapAngle(Math.atan2(direction.x, direction.z) - this.yaw);
      const wanted = clamp(error * 1.2, -turnRate, turnRate);
      this.yawRate = damp(this.yawRate, wanted, 3, delta);
      this.yaw = wrapAngle(this.yaw + this.yawRate * delta);
    }
    const climb = clamp(Math.atan2(direction.y, Math.max(horizontal, 1e-6)), -maxPitch, maxPitch);
    this.pitch = damp(this.pitch, climb, pitchRate, delta);
    this.roll = damp(this.roll, clamp(-this.yawRate * bank, -0.6, 0.6), 2, delta);
    const change = clamp(desiredSpeed - this.speed, -acceleration * delta, acceleration * delta);
    this.speed = Math.max(this.speed + change, 0);
    const cosPitch = Math.cos(this.pitch);
    this.position.x += Math.sin(this.yaw) * cosPitch * this.speed * delta;
    this.position.y += Math.sin(this.pitch) * this.speed * delta;
    this.position.z += Math.cos(this.yaw) * cosPitch * this.speed * delta;
  }
}

export type Threat = { position: Point3; radius: number };

/**
 * The direction to swim: toward a target, away from threats within a margin,
 * and up when the seabed ahead is too close. Returns a unit vector.
 */
export function steerDirection(
  from: Point3,
  target: Point3,
  threats: readonly Threat[],
  margin: number,
  out: Point3 = { x: 0, y: 0, z: 0 },
) {
  let dx = target.x - from.x;
  let dy = target.y - from.y;
  let dz = target.z - from.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  dx /= length;
  dy /= length;
  dz /= length;
  for (const threat of threats) {
    const ax = from.x - threat.position.x;
    const ay = from.y - threat.position.y;
    const az = from.z - threat.position.z;
    const distance = Math.hypot(ax, ay, az) || 1e-3;
    const reach = threat.radius + margin;
    if (distance >= reach) continue;
    // Push away harder the closer the threat, mostly sideways so the animal swerves.
    const strength = 3 * Math.pow(1 - distance / reach, 1.5) / distance;
    dx += ax * strength;
    dy += ay * strength * 0.5;
    dz += az * strength;
  }
  const total = Math.hypot(dx, dy, dz) || 1;
  out.x = dx / total;
  out.y = dy / total;
  out.z = dz / total;
  return out;
}

/**
 * Keep a height between the seabed (plus clearance) and the surface (minus a
 * minimum depth). When the water is too shallow for both, the seabed wins.
 */
export function clampHeight(y: number, seabed: number, clearance: number, minDepth: number) {
  return Math.max(Math.min(y, -minDepth), seabed + clearance);
}

/**
 * Alternating swimming and gliding, as sharks, whale sharks, and turtles do.
 * Returns a factor in [0, 1] for the tail-beat amplitude.
 */
export class BeatGlide {
  private timer: number;
  gliding = false;
  factor = 1;

  constructor(readonly beatSeconds: [number, number], readonly glideSeconds: [number, number], private readonly random: () => number) {
    this.timer = beatSeconds[0] + random() * (beatSeconds[1] - beatSeconds[0]);
  }

  update(delta: number) {
    this.timer -= delta;
    if (this.timer <= 0) {
      this.gliding = !this.gliding;
      const [min, max] = this.gliding ? this.glideSeconds : this.beatSeconds;
      this.timer = min + this.random() * (max - min);
    }
    // Blend over about half a second, down to 20 % while gliding.
    this.factor = damp(this.factor, this.gliding ? 0.2 : 1, 2, delta);
    return this.factor;
  }
}

/**
 * A breathing schedule: the animal stays down for a while, then holds at the
 * surface, then dives again. `depth` blends between the cruise and surface heights.
 */
export class SurfacingSchedule {
  private timer: number;
  atSurface = false;
  /** 0 while cruising, 1 at the surface. */
  blend = 0;

  constructor(readonly downSeconds: [number, number], readonly upSeconds: [number, number], private readonly random: () => number, startDown = true) {
    this.atSurface = !startDown;
    this.timer = this.pick();
  }

  private pick() {
    const [min, max] = this.atSurface ? this.upSeconds : this.downSeconds;
    return min + this.random() * (max - min);
  }

  update(delta: number) {
    this.timer -= delta;
    if (this.timer <= 0) {
      this.atSurface = !this.atSurface;
      this.timer = this.pick();
    }
    this.blend = damp(this.blend, this.atSurface ? 1 : 0, 0.25, delta);
    return this.blend;
  }
}

export type PathSwimmerOptions = {
  /** Distance along the loop to start at (m). */
  start?: number;
  /** How far ahead of the animal its target runs (m). */
  lead: number;
  /** Least height above the seabed (m). */
  clearance: number;
  /** Least depth below the surface (m), unless the caller overrides it. */
  minDepth: number;
  /** Extra distance kept from threats, beyond their radius (m). */
  avoidMargin: number;
  limits: SwimLimits;
};

/**
 * An animal that follows a loop: a carrot runs ahead along the path and the
 * swimmer steers to it, away from threats, and above the seabed.
 */
export class PathSwimmer {
  readonly swimmer: Swimmer;
  readonly carrot: PathCarrot;
  private readonly direction: Point3 = { x: 0, y: 0, z: 1 };
  private readonly target: Point3 = { x: 0, y: 0, z: 0 };

  constructor(readonly path: LoopPath, readonly options: PathSwimmerOptions, speed: number) {
    const start = options.start ?? 0;
    const a = path.pointAt(start, { x: 0, y: 0, z: 0 });
    const b = path.pointAt(start + 1, { x: 0, y: 0, z: 0 });
    this.swimmer = new Swimmer(a, Math.atan2(b.x - a.x, b.z - a.z), speed, options.limits);
    this.carrot = new PathCarrot(path, start + options.lead * 0.5, options.lead);
  }

  /**
   * Advance one frame. `height` replaces the path height (for surfacing or
   * diving), and `minDepth` the least depth.
   */
  update(delta: number, seabed: (x: number, z: number) => number, threats: readonly Threat[], speed: number, height: number | null = null, minDepth = this.options.minDepth) {
    const { clearance, avoidMargin } = this.options;
    const s = this.swimmer;
    const carrot = this.carrot.update(s.position, speed, delta);
    this.target.x = carrot.x;
    this.target.z = carrot.z;
    // Look ahead for rising ground as well as under the target.
    const aheadX = s.position.x + Math.sin(s.yaw) * this.options.lead;
    const aheadZ = s.position.z + Math.cos(s.yaw) * this.options.lead;
    const floor = Math.max(seabed(carrot.x, carrot.z), seabed(aheadX, aheadZ));
    this.target.y = clampHeight(height ?? carrot.y, floor, clearance, minDepth);
    steerDirection(s.position, this.target, threats, avoidMargin, this.direction);
    s.step(this.direction, speed, delta);
    const here = seabed(s.position.x, s.position.z);
    s.position.y = clampHeight(s.position.y, here, clearance * 0.5, Math.min(minDepth, this.options.minDepth) * 0.5);
    return s;
  }
}
