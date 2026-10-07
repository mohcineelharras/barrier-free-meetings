export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return function take(key: string, now = Date.now()): RateLimitDecision {
    const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < options.windowMs);
    if (recent.length >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((options.windowMs - (now - recent[0])) / 1000));
      hits.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 5_000) {
      for (const [entryKey, stamps] of hits) {
        if (stamps.every((timestamp) => now - timestamp >= options.windowMs)) {
          hits.delete(entryKey);
        }
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  };
}
