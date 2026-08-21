import { env } from "../config/env";
import { redisClient } from "../db/redis";

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window resets (0 when allowed). */
  retryAfterMs: number;
}

/**
 * Minimal store contract so the limiter can run against Redis or an
 * in-memory fallback without coupling to the node-redis client type.
 */
export interface FixedWindowStore {
  increment(key: string, windowSeconds: number): Promise<number>;
}

export class RedisFixedWindowStore implements FixedWindowStore {
  /**
   * Structural subset of the node-redis client - keeps this module decoupled
   * from the library's generic types and trivially fakeable in tests.
   */
  constructor(
    private readonly client: {
      incr(key: string): Promise<number>;
      expire(key: string, seconds: number): Promise<number>;
    },
  ) {}

  async increment(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);

    if (count === 1) {
      // EXPIRE is best-effort: a crash between INCR and EXPIRE leaves one
      // stale bucket that the bucket-id keying renders harmless.
      await this.client.expire(key, windowSeconds);
    }

    return count;
  }
}

interface MemoryBucket {
  count: number;
  expiresAtMs: number;
}

export class MemoryFixedWindowStore implements FixedWindowStore {
  private buckets = new Map<string, MemoryBucket>();

  constructor(private readonly now: () => number = Date.now) {}

  async increment(key: string, windowSeconds: number): Promise<number> {
    const currentMs = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAtMs <= currentMs) {
      this.buckets.set(key, {
        count: 1,
        expiresAtMs: currentMs + windowSeconds * 1000,
      });
      this.prune(currentMs);
      return 1;
    }

    bucket.count += 1;
    return bucket.count;
  }

  private prune(currentMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAtMs <= currentMs) {
        this.buckets.delete(key);
      }
    }
  }
}

const REDIS_COOLDOWN_MS = 30_000;

/**
 * Fixed-window rate limiter. Prefers Redis (shared across replicas, survives
 * restarts); falls back to in-memory buckets when Redis is unavailable and
 * retries Redis after a cooldown instead of hammering it on every request.
 */
export class RateLimiter {
  private readonly memory: MemoryFixedWindowStore;
  private redisDisabledUntilMs = 0;

  constructor(
    private readonly options: {
      limitPerMinute: number;
      keyPrefix: string;
      store?: FixedWindowStore | null;
      now?: () => number;
    },
  ) {
    // The in-memory fallback must share the injected clock, otherwise tests
    // (and any shifted-time deployment) would disagree on window buckets.
    this.memory = new MemoryFixedWindowStore(this.options.now ?? Date.now);
  }

  get limit(): number {
    return this.options.limitPerMinute;
  }

  async consume(key: string): Promise<RateLimitVerdict> {
    const nowMs = (this.options.now ?? Date.now)();
    const windowSeconds = 60;
    const bucketId = Math.floor(nowMs / (windowSeconds * 1000));
    const fullKey = `${this.options.keyPrefix}:${key}:${bucketId}`;
    const windowResetMs =
      (bucketId + 1) * windowSeconds * 1000 - nowMs;

    let count: number;

    try {
      if (
        this.options.store &&
        nowMs >= this.redisDisabledUntilMs
      ) {
        count = await this.options.store.increment(fullKey, windowSeconds);
      } else {
        count = await this.memory.increment(fullKey, windowSeconds);
      }
    } catch (error) {
      console.warn(
        `Rate limiter store unavailable, falling back to in-memory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.redisDisabledUntilMs = nowMs + REDIS_COOLDOWN_MS;
      count = await this.memory.increment(fullKey, windowSeconds);
    }

    return {
      allowed: count <= this.options.limitPerMinute,
      limit: this.options.limitPerMinute,
      remaining: Math.max(this.options.limitPerMinute - count, 0),
      retryAfterMs: count > this.options.limitPerMinute ? windowResetMs : 0,
    };
  }
}

export const aiTranslateRateLimiter = new RateLimiter({
  limitPerMinute: env.aiRateLimitPerMinute,
  keyPrefix: "ratelimit:ai-translate",
  store: new RedisFixedWindowStore(redisClient),
});
