/**
 * In-process sliding-window limiter: a speed bump, not a rate limit.
 *
 * On serverless (Vercel) every instance has its own counter, instances are created and destroyed
 * at will, and a burst can be spread over many instances. So this can neither guarantee a global
 * ceiling nor be relied on for cost control; that job belongs to the per-call budget
 * (budget.ts) and the parameter bounds in tools.ts. What it does do: on a single warm instance a
 * tight loop hammering /mcp gets isError results instead of computations, which keeps one
 * misbehaving client from monopolising that instance.
 *
 * Sizing: a classroom of 30 students asking a few questions a minute is well under 240 calls per
 * minute; a script can do that in a second.
 */
export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {
    if (!(Number.isInteger(limit) && limit >= 1)) throw new RangeError("limit must be a positive integer.");
    if (!(Number.isFinite(windowMs) && windowMs > 0)) throw new RangeError("windowMs must be positive.");
  }

  /** Records a call at time `now` (ms) if under the limit; otherwise says how long to wait. */
  tryAcquire(now: number): { ok: true } | { ok: false; retryAfterMs: number } {
    const cutoff = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] <= cutoff) this.stamps.shift();
    if (this.stamps.length >= this.limit) return { ok: false, retryAfterMs: this.stamps[0] + this.windowMs - now };
    this.stamps.push(now);
    return { ok: true };
  }

  /** Calls currently inside the window (for tests and diagnostics). */
  get size(): number {
    return this.stamps.length;
  }
}

/** Shared by every request handled by this process. */
export const defaultLimiter = new SlidingWindowLimiter(240, 60_000);
