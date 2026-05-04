// Vote storage with Upstash Redis in production, in-memory fallback for dev.
// In dev, run `npm i @upstash/redis` is enough — no env needed; votes will live
// in process memory and reset on server restart. In prod, set
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (one-click via the Vercel
// Marketplace → Upstash for Redis integration).

// Pinned to globalThis so that Next.js dev (which can isolate module instances
// between RSC pages and route handlers) shares the same in-memory counters.
const globalAny = globalThis as unknown as {
  __VOTE_MEMORY__?: Map<string, number>;
};
const memory: Map<string, number> = (globalAny.__VOTE_MEMORY__ ??= new Map());

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

let _redis: import("@upstash/redis").Redis | null = null;
async function getRedis() {
  if (_redis) return _redis;
  const { Redis } = await import("@upstash/redis");
  _redis = Redis.fromEnv();
  return _redis;
}

export type VoteKind = "up" | "down";
export type VoteCounts = { up: number; down: number };

const upKey = (id: string) => `vote:up:${id}`;
const downKey = (id: string) => `vote:down:${id}`;

export async function getVotes(id: string): Promise<VoteCounts> {
  if (!hasUpstash) {
    return {
      up: memory.get(upKey(id)) ?? 0,
      down: memory.get(downKey(id)) ?? 0,
    };
  }
  const redis = await getRedis();
  const [up, down] = await redis.mget<[number | null, number | null]>(
    upKey(id),
    downKey(id),
  );
  return { up: Number(up ?? 0), down: Number(down ?? 0) };
}

export async function getAllVotes(
  ids: string[],
): Promise<Record<string, VoteCounts>> {
  if (!hasUpstash) {
    const out: Record<string, VoteCounts> = {};
    for (const id of ids) {
      out[id] = {
        up: memory.get(upKey(id)) ?? 0,
        down: memory.get(downKey(id)) ?? 0,
      };
    }
    return out;
  }
  const redis = await getRedis();
  const keys = ids.flatMap((id) => [upKey(id), downKey(id)]);
  const values = (await redis.mget<(number | null)[]>(...keys)) ?? [];
  const out: Record<string, VoteCounts> = {};
  ids.forEach((id, i) => {
    out[id] = {
      up: Number(values[i * 2] ?? 0),
      down: Number(values[i * 2 + 1] ?? 0),
    };
  });
  return out;
}

async function incr(key: string, delta: number): Promise<number> {
  if (!hasUpstash) {
    const next = Math.max(0, (memory.get(key) ?? 0) + delta);
    memory.set(key, next);
    return next;
  }
  const redis = await getRedis();
  return Number(await redis.incrby(key, delta));
}

// applyVote: shift counters from `prev` to `next` (either may be null).
// Returns updated counts for the id.
export async function applyVote(
  id: string,
  prev: VoteKind | null,
  next: VoteKind | null,
): Promise<VoteCounts> {
  if (prev === next) return getVotes(id);

  // Decrement previous bucket
  if (prev === "up") await incr(upKey(id), -1);
  if (prev === "down") await incr(downKey(id), -1);

  // Increment new bucket
  if (next === "up") await incr(upKey(id), 1);
  if (next === "down") await incr(downKey(id), 1);

  return getVotes(id);
}

export const votingEnvironment = hasUpstash ? "upstash" : "memory";
