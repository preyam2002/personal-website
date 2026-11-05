/**
 * A CPU fish school: boids with topological neighbours found through a hashed
 * spatial grid. All lengths in the parameters are in body lengths (BL), as in
 * field studies, and scaled by the fish length here.
 *
 * Rules (per fish, over its nearest 6-7 neighbours within the cohesion radius):
 * - separation within 0.7 BL,
 * - alignment within 2.5 BL,
 * - cohesion within 5 BL,
 * plus a pull toward the school's home point, a floor and a ceiling, and a
 * flight response to threats that splits the school around them (the fountain
 * effect) and bursts outward when a threat is very close (flash expansion).
 */

import { clamp, strouhalFrequency, TAU } from "./motion";

export type SchoolThreat = { x: number; y: number; z: number; radius: number };

export type SchoolParams = {
  count: number;
  /** Fish length in meters. */
  length: number;
  /** Cruise speed in body lengths per second. */
  cruise: number;
  /** Burst speed in body lengths per second. */
  burst: number;
  separation: number;
  alignment: number;
  cohesion: number;
  neighbours: number;
  weights: { separation: number; alignment: number; cohesion: number; home: number; flee: number };
  /** Distance from home (m) within which fish roam freely. */
  homeRadius: number;
  /** Maximum turn rate in radians per second. */
  turnRate: number;
  /** Extra distance (m) beyond a threat's radius at which fish react. */
  detect: number;
  /** Tail half-amplitude as a fraction of the length. */
  tailAmplitude: number;
  /** Optional swirl around the home's vertical axis, as for a jack tornado (rad/s). */
  swirl?: number;
};

export const DEFAULT_SCHOOL: Omit<SchoolParams, "count" | "length"> = {
  cruise: 1.5,
  burst: 10,
  separation: 0.7,
  alignment: 2.5,
  cohesion: 5,
  neighbours: 7,
  weights: { separation: 1.5, alignment: 1, cohesion: 0.6, home: 0.5, flee: 4 },
  homeRadius: 6,
  turnRate: Math.PI,
  detect: 6,
  tailAmplitude: 0.09,
};

/** Bounds a fish must keep: above the floor, below the ceiling. */
export type SchoolBounds = (x: number, z: number) => { floor: number; ceiling: number };

const BUCKETS = 4096;

export class School {
  readonly params: SchoolParams;
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  /** Tail-beat phase in cycles, per fish. */
  readonly phases: Float32Array;
  /** Bank angle per fish, from its turn rate. */
  readonly rolls: Float32Array;
  /** Tail amplitude factor per fish (rises when they sprint). */
  readonly amplitudes: Float32Array;
  /** Per-fish size factor around 1. */
  readonly sizes: Float32Array;
  /** 0 when calm, 1 when fleeing. */
  readonly alarm: Float32Array;
  private readonly heads = new Int32Array(BUCKETS);
  private readonly next: Int32Array;
  private readonly nearIndex: Int32Array;
  private readonly nearDistance: Float32Array;
  private readonly centroid = { x: 0, y: 0, z: 0 };

  constructor(params: SchoolParams, home: { x: number; y: number; z: number }, random: () => number) {
    this.params = params;
    this.count = params.count;
    const n = params.count;
    this.positions = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.phases = new Float32Array(n);
    this.rolls = new Float32Array(n);
    this.amplitudes = new Float32Array(n).fill(1);
    this.sizes = new Float32Array(n);
    this.alarm = new Float32Array(n);
    this.next = new Int32Array(n);
    this.nearIndex = new Int32Array(params.neighbours);
    this.nearDistance = new Float32Array(params.neighbours);
    // Start in a loose ball, all heading roughly the same way.
    const spread = Math.max(params.homeRadius * 0.6, Math.cbrt(n) * params.length * 1.2);
    const heading = random() * TAU;
    for (let index = 0; index < n; index += 1) {
      const u = random() * 2 - 1;
      const angle = random() * TAU;
      const radius = Math.cbrt(random()) * spread;
      const ring = Math.sqrt(1 - u * u);
      this.positions[index * 3] = home.x + Math.cos(angle) * ring * radius;
      this.positions[index * 3 + 1] = home.y + u * radius * 0.5;
      this.positions[index * 3 + 2] = home.z + Math.sin(angle) * ring * radius;
      const speed = params.cruise * params.length;
      const jitter = (random() - 0.5) * 0.6;
      this.velocities[index * 3] = Math.sin(heading + jitter) * speed;
      this.velocities[index * 3 + 2] = Math.cos(heading + jitter) * speed;
      this.phases[index] = random();
      this.sizes[index] = 0.85 + random() * 0.3;
    }
  }

  private bucket(x: number, y: number, z: number) {
    // Large primes spread neighbouring cells across the table.
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & (BUCKETS - 1);
  }

  /** The centre of the school, as of the last step. */
  center() {
    return this.centroid;
  }

  step(delta: number, home: { x: number; y: number; z: number }, threats: readonly SchoolThreat[], bounds: SchoolBounds) {
    if (delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    const p = this.params;
    const n = this.count;
    const L = p.length;
    // Cells of 1.6 BL: the 6-7 nearest neighbours of a schooling fish lie within about one body length,
    // so a 3 x 3 x 3 block of cells holds them without scanning the whole cohesion radius.
    const cell = Math.min(p.cohesion, 1.6) * L;
    const sepRadius = p.separation * L;
    const aliRadius = p.alignment * L;
    const cohRadius = p.cohesion * L;
    const cohRadius2 = cohRadius * cohRadius;
    const K = p.neighbours;
    const positions = this.positions;
    const velocities = this.velocities;

    // Fill the grid.
    this.heads.fill(-1);
    for (let index = 0; index < n; index += 1) {
      const cx = Math.floor(positions[index * 3] / cell);
      const cy = Math.floor(positions[index * 3 + 1] / cell);
      const cz = Math.floor(positions[index * 3 + 2] / cell);
      const key = this.bucket(cx, cy, cz);
      this.next[index] = this.heads[key];
      this.heads[key] = index;
    }

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (let i = 0; i < n; i += 1) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      const vx = velocities[i * 3];
      const vy = velocities[i * 3 + 1];
      const vz = velocities[i * 3 + 2];
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-4;
      const hx = vx / speed;
      const hy = vy / speed;
      const hz = vz / speed;

      // Find the K nearest neighbours in the 27 cells around the fish.
      let found = 0;
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      const cz = Math.floor(pz / cell);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let oz = -1; oz <= 1; oz += 1) {
            const key = this.bucket(cx + ox, cy + oy, cz + oz);
            for (let j = this.heads[key]; j !== -1; j = this.next[j]) {
              if (j === i) continue;
              const dx = positions[j * 3] - px;
              const dy = positions[j * 3 + 1] - py;
              const dz = positions[j * 3 + 2] - pz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 > cohRadius2) continue;
              if (found < K) {
                let slot = found;
                while (slot > 0 && this.nearDistance[slot - 1] > d2) {
                  this.nearDistance[slot] = this.nearDistance[slot - 1];
                  this.nearIndex[slot] = this.nearIndex[slot - 1];
                  slot -= 1;
                }
                this.nearDistance[slot] = d2;
                this.nearIndex[slot] = j;
                found += 1;
              } else if (d2 < this.nearDistance[K - 1]) {
                let slot = K - 1;
                while (slot > 0 && this.nearDistance[slot - 1] > d2) {
                  this.nearDistance[slot] = this.nearDistance[slot - 1];
                  this.nearIndex[slot] = this.nearIndex[slot - 1];
                  slot -= 1;
                }
                this.nearDistance[slot] = d2;
                this.nearIndex[slot] = j;
              }
            }
          }
        }
      }

      // Threats: how alarmed is this fish, and which way does it flee?
      let fleeX = 0;
      let fleeY = 0;
      let fleeZ = 0;
      let alarm = 0;
      let flash = 0;
      for (const threat of threats) {
        const ax = px - threat.x;
        const ay = py - threat.y;
        const az = pz - threat.z;
        const distance = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-3;
        const reach = threat.radius + p.detect;
        if (distance > reach) continue;
        const strength = Math.sqrt(1 - distance / reach);
        let ux = ax / distance;
        let uy = ay / distance;
        let uz = az / distance;
        // Fountain effect: a fish heading toward the threat veers sideways around
        // it instead of reversing, so the school splits and closes again behind it.
        const along = ux * hx + uy * hy + uz * hz;
        if (along < 0) {
          let px2 = ux - along * hx;
          let py2 = uy - along * hy;
          let pz2 = uz - along * hz;
          let side = Math.sqrt(px2 * px2 + py2 * py2 + pz2 * pz2);
          if (side < 0.05) {
            // Dead ahead: pick a side by the fish's index.
            px2 = (i & 1 ? 1 : -1) * hz;
            py2 = 0;
            pz2 = (i & 1 ? -1 : 1) * hx;
            side = Math.sqrt(px2 * px2 + pz2 * pz2) || 1;
          }
          ux = px2 / side + ux * 0.3;
          uy = py2 / side + uy * 0.3;
          uz = pz2 / side + uz * 0.3;
        }
        fleeX += ux * strength;
        fleeY += uy * strength * 0.6;
        fleeZ += uz * strength;
        alarm = Math.max(alarm, strength);
        if (distance < threat.radius * 0.8) flash = 1;
      }
      // Alarm spreads through the school: take some of the neighbours' alarm.
      let neighbourAlarm = 0;
      for (let k = 0; k < found; k += 1) neighbourAlarm = Math.max(neighbourAlarm, this.alarm[this.nearIndex[k]]);
      const level = Math.max(alarm, neighbourAlarm * 0.85);
      this.alarm[i] = Math.max(level, this.alarm[i] - dt * 0.8);

      // The three rules over the neighbours. Compaction under threat shrinks spacing by 30 %.
      const sepR = sepRadius * (1 - 0.3 * this.alarm[i]);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let ax = 0;
      let ay = 0;
      let az = 0;
      let alignCount = 0;
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let k = 0; k < found; k += 1) {
        const j = this.nearIndex[k];
        const distance = Math.sqrt(this.nearDistance[k]) || 1e-4;
        const dx = positions[j * 3] - px;
        const dy = positions[j * 3 + 1] - py;
        const dz = positions[j * 3 + 2] - pz;
        if (distance < sepR) {
          const push = (1 - distance / sepR) / distance;
          sx -= dx * push;
          sy -= dy * push;
          sz -= dz * push;
        }
        if (distance < aliRadius) {
          ax += velocities[j * 3];
          ay += velocities[j * 3 + 1];
          az += velocities[j * 3 + 2];
          alignCount += 1;
        }
        mx += dx;
        my += dy;
        mz += dz;
      }
      let dirX = hx;
      let dirY = hy;
      let dirZ = hz;
      // Alignment and cohesion weaken under alarm and vanish in a flash expansion.
      const calm = flash ? 0 : 1 - 0.5 * this.alarm[i];
      dirX += sx * p.weights.separation;
      dirY += sy * p.weights.separation;
      dirZ += sz * p.weights.separation;
      if (alignCount > 0) {
        const am = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        dirX += (ax / am) * p.weights.alignment * calm;
        dirY += (ay / am) * p.weights.alignment * calm;
        dirZ += (az / am) * p.weights.alignment * calm;
      }
      if (found > 0) {
        const cm = Math.sqrt(mx * mx + my * my + mz * mz) / found;
        const pull = clamp(cm / cohRadius, 0, 1) * p.weights.cohesion * (1 + this.alarm[i]) * calm;
        const norm = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        dirX += (mx / norm) * pull;
        dirY += (my / norm) * pull;
        dirZ += (mz / norm) * pull;
      }
      // Home: a soft pull that grows outside the home radius.
      const tx = home.x - px;
      const ty = home.y - py;
      const tz = home.z - pz;
      const homeDistance = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      const homePull = p.weights.home * (0.15 + Math.max(homeDistance - p.homeRadius, 0) / p.homeRadius);
      dirX += (tx / homeDistance) * homePull;
      dirY += (ty / homeDistance) * homePull * 0.7;
      dirZ += (tz / homeDistance) * homePull;
      if (p.swirl) {
        // Circle the home's vertical axis: a tangent push, as in a jack tornado.
        const rx = px - home.x;
        const rz = pz - home.z;
        const r = Math.sqrt(rx * rx + rz * rz) || 1;
        dirX += (-rz / r) * Math.abs(p.swirl) * Math.sign(p.swirl);
        dirZ += (rx / r) * Math.abs(p.swirl) * Math.sign(p.swirl);
      }
      dirX += fleeX * p.weights.flee * (1 + flash * 2);
      dirY += fleeY * p.weights.flee * (1 + flash * 2);
      dirZ += fleeZ * p.weights.flee * (1 + flash * 2);
      // Floor and ceiling, and fish swim mostly level.
      const { floor, ceiling } = bounds(px, pz);
      const margin = Math.max(L * 4, 0.6);
      if (py < floor + margin) dirY += ((floor + margin - py) / margin) * 2.5;
      if (py > ceiling - margin) dirY -= ((py - ceiling + margin) / margin) * 2.5;
      dirY *= 0.75;

      // Turn toward the desired direction with a limited rate.
      const dm = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
      dirX /= dm;
      dirY /= dm;
      dirZ /= dm;
      const cosAngle = clamp(hx * dirX + hy * dirY + hz * dirZ, -1, 1);
      const angle = Math.acos(cosAngle);
      const maxTurn = p.turnRate * (1 + this.alarm[i]) * dt;
      let nx = dirX;
      let ny = dirY;
      let nz = dirZ;
      if (angle > maxTurn) {
        const t = maxTurn / angle;
        nx = hx + (dirX - hx) * t;
        ny = hy + (dirY - hy) * t;
        nz = hz + (dirZ - hz) * t;
        const nm = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nm;
        ny /= nm;
        nz /= nm;
      }
      // Bank into the turn: the sign of the turn about the vertical axis.
      const turn = (hz * nx - hx * nz) / dt;
      this.rolls[i] += (clamp(-turn * 0.3, -0.7, 0.7) - this.rolls[i]) * Math.min(dt * 6, 1);

      const wanted = (p.cruise + (p.burst - p.cruise) * Math.max(this.alarm[i] * 0.45, flash)) * L;
      const variation = 1 + 0.1 * Math.sin(this.phases[i] * 0.37 + i);
      const newSpeed = speed + clamp(wanted * variation - speed, -L * 6 * dt, L * 40 * dt);
      velocities[i * 3] = nx * newSpeed;
      velocities[i * 3 + 1] = ny * newSpeed;
      velocities[i * 3 + 2] = nz * newSpeed;
      this.amplitudes[i] = 0.8 + 0.4 * clamp((newSpeed / L - p.cruise) / (p.burst - p.cruise), 0, 1) + (angle > maxTurn ? 0.2 : 0);
      this.phases[i] += Math.min(strouhalFrequency(newSpeed, L, p.tailAmplitude), 14) * dt;
      if (this.phases[i] > 1000) this.phases[i] -= 1000;
    }

    for (let i = 0; i < n; i += 1) {
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      const { floor, ceiling } = bounds(positions[i * 3], positions[i * 3 + 2]);
      positions[i * 3 + 1] = clamp(positions[i * 3 + 1], floor, ceiling);
      sumX += positions[i * 3];
      sumY += positions[i * 3 + 1];
      sumZ += positions[i * 3 + 2];
    }
    this.centroid.x = sumX / n;
    this.centroid.y = sumY / n;
    this.centroid.z = sumZ / n;
  }
}
