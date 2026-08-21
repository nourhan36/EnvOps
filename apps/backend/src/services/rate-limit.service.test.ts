import { describe, expect, it, vi } from "vitest";
import {
  MemoryFixedWindowStore,
  RateLimiter,
  RedisFixedWindowStore,
} from "./rate-limit.service";

function advanceTime(startMs: number) {
  let current = startMs;
  return {
    now: () => current,
    tick: (ms: number) => {
      current += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows requests under the limit and reports remaining budget", async () => {
    const clock = advanceTime(1_000_000);
    const limiter = new RateLimiter({
      limitPerMinute: 3,
      keyPrefix: "test",
      store: null,
      now: clock.now,
    });

    const first = await limiter.consume("user-1");
    expect(first).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfterMs: 0 });
    await limiter.consume("user-1");
    await limiter.consume("user-1");
    const fourth = await limiter.consume("user-1");

    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets the window after sixty seconds", async () => {
    const clock = advanceTime(60_000_000);
    const limiter = new RateLimiter({
      limitPerMinute: 1,
      keyPrefix: "test",
      store: null,
      now: clock.now,
    });

    expect((await limiter.consume("user-1")).allowed).toBe(true);
    expect((await limiter.consume("user-1")).allowed).toBe(false);

    clock.tick(60_001);
    expect((await limiter.consume("user-1")).allowed).toBe(true);
  });

  it("keys buckets independently per user", async () => {
    const limiter = new RateLimiter({
      limitPerMinute: 1,
      keyPrefix: "test",
      store: null,
    });

    expect((await limiter.consume("a")).allowed).toBe(true);
    expect((await limiter.consume("b")).allowed).toBe(true);
    expect((await limiter.consume("a")).allowed).toBe(false);
  });

  it("falls back to memory when the primary store throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingStore = {
      increment: vi.fn(async () => {
        throw new Error("redis down");
      }),
    };
    const limiter = new RateLimiter({
      limitPerMinute: 1,
      keyPrefix: "test",
      store: failingStore,
    });

    expect((await limiter.consume("u")).allowed).toBe(true);
    expect((await limiter.consume("u")).allowed).toBe(false);

    // Within the cooldown window Redis is not retried.
    expect(failingStore.increment).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("retries Redis after the cooldown expires", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clock = advanceTime(0);
    let healthy = false;
    const flakyStore = {
      increment: vi.fn(async () => {
        if (!healthy) throw new Error("redis down");
        return 1;
      }),
    };
    const limiter = new RateLimiter({
      limitPerMinute: 5,
      keyPrefix: "test",
      store: flakyStore,
      now: clock.now,
    });

    await limiter.consume("u");
    clock.tick(30_001);
    healthy = true;
    await limiter.consume("u");

    expect(flakyStore.increment).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("MemoryFixedWindowStore", () => {
  it("counts within a window and starts fresh afterwards", async () => {
    const clock = advanceTime(10_000);
    const store = new MemoryFixedWindowStore(clock.now);

    expect(await store.increment("k", 60)).toBe(1);
    expect(await store.increment("k", 60)).toBe(2);
    clock.tick(60_500);
    expect(await store.increment("k", 60)).toBe(1);
  });
});

describe("RedisFixedWindowStore", () => {
  it("sets a TTL only on the first increment", async () => {
    const incr = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const expire = vi.fn().mockResolvedValue(1);
    const store = new RedisFixedWindowStore({ incr, expire });

    await store.increment("k", 60);
    await store.increment("k", 60);

    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("k", 60);
  });
});
