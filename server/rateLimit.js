// Simple in-memory per-IP token bucket. Fine for a single-instance portfolio server; swap for a
// shared store (Redis, etc.) only if this ever runs across multiple instances.
const BUCKET_CAPACITY = 12;
const REFILL_PER_MS = 12 / (10 * 60 * 1000); // 12 requests refilling over 10 minutes

const buckets = new Map();

export function checkRateLimit(ip){
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket){
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: now };
    buckets.set(ip, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Periodic cleanup so the map doesn't grow unbounded on a long-running process.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, bucket] of buckets){
    if (bucket.lastRefill < cutoff) buckets.delete(ip);
  }
}, 30 * 60 * 1000).unref();
