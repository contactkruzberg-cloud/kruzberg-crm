/**
 * Sliding-window rate limiter kept in memory.
 * Per function instance: Vercel Fluid Compute reuses instances, so this holds
 * well for a single user, but it is not a global limit across instances.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits: number[] = [];
  return {
    /** Records a hit. Returns 0 if allowed, otherwise the seconds to wait. */
    take(): number {
      const t = now();
      while (hits.length && hits[0] <= t - windowMs) hits.shift();
      if (hits.length >= limit) return Math.ceil((hits[0] + windowMs - t) / 1000);
      hits.push(t);
      return 0;
    },
  };
}
