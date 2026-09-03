import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows `limit` calls per window, then refuses with a retry delay, then recovers as calls age out", () => {
    const l = new SlidingWindowLimiter(3, 1000);
    expect(l.tryAcquire(0)).toEqual({ ok: true });
    expect(l.tryAcquire(100)).toEqual({ ok: true });
    expect(l.tryAcquire(200)).toEqual({ ok: true });
    expect(l.tryAcquire(300)).toEqual({ ok: false, retryAfterMs: 700 }); // the call at t=0 leaves at t=1000
    expect(l.size).toBe(3);
    expect(l.tryAcquire(1000)).toEqual({ ok: true }); // t=0 aged out (window is half-open)
    expect(l.tryAcquire(1050)).toEqual({ ok: false, retryAfterMs: 50 });
    expect(l.tryAcquire(1100)).toEqual({ ok: true });
  });

  it("rejects nonsense construction", () => {
    expect(() => new SlidingWindowLimiter(0, 1000)).toThrow(RangeError);
    expect(() => new SlidingWindowLimiter(1, 0)).toThrow(RangeError);
  });
});
