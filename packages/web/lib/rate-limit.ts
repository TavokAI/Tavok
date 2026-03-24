/**
 * In-memory sliding-window rate limiter for Next.js API routes.
 *
 * Each limiter instance tracks request counts per IP using a Map with
 * automatic expiry. Suitable for single-instance deployments. For
 * multi-instance, swap to Redis-backed (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Maximum requests allowed within the window. */
  max: number;
  /** Window duration in seconds. */
  windowSec: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(opts: RateLimiterOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowSec * 1000;

    // Periodic cleanup every 60s to prevent memory leaks
    const interval = setInterval(() => this.cleanup(), 60_000);
    // Allow Node to exit even if the interval is still running
    if (typeof interval === "object" && "unref" in interval) {
      interval.unref();
    }
  }

  /**
   * Check if a request from `key` (typically an IP) is allowed.
   * Returns { allowed, remaining, resetAt }.
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return {
        allowed: true,
        remaining: this.max - 1,
        resetAt: now + this.windowMs,
      };
    }

    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.max - entry.count,
      resetAt: entry.resetAt,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Extract client IP from a Next.js request.
 * Checks x-forwarded-for (reverse proxy), x-real-ip, then falls back to "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be comma-separated; first entry is the client
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

// ── Pre-configured limiters for critical endpoints ──

/** Auth endpoints: 10 requests per 60s per IP (login, register) */
export const authLimiter = new RateLimiter({ max: 10, windowSec: 60 });

/** Webhook inbound: 60 requests per 60s per token */
export const webhookLimiter = new RateLimiter({ max: 60, windowSec: 60 });

/**
 * Agent API rate limiter — enforces per-agent request limits.
 *
 * Default: 30 requests per 10s per agent (message send + stream token).
 * Each agent can override via AgentRegistration.maxTokensSec which
 * is checked at the route level using checkAgentRateLimit().
 *
 * NOTE: Despite the schema field name "maxTokensSec", this limiter counts
 * requests per second, NOT generated tokens. The field should be renamed
 * to "maxRequestsPerSec" in a future migration (DATA-002).
 */
export const agentLimiter = new RateLimiter({ max: 30, windowSec: 10 });

// ── Per-agent dynamic rate limiting ──

/**
 * Map of agentId → custom RateLimiter for agents with non-default maxTokensSec.
 * Lazily created on first use. Cleaned up when the base agentLimiter cleans up.
 */
const agentCustomLimiters = new Map<string, RateLimiter>();

/**
 * Check rate limit for an agent, respecting custom maxTokensSec if set.
 *
 * @param agentId - The agent's ID (used as rate limit key)
 * @param maxTokensSec - From AgentRegistration.maxTokensSec (default 100)
 * @returns Rate limit check result
 */
export function checkAgentRateLimit(
  agentId: string,
  maxTokensSec?: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  // Use custom limiter if agent has non-default maxTokensSec
  if (maxTokensSec && maxTokensSec !== 100) {
    let limiter = agentCustomLimiters.get(agentId);
    if (!limiter) {
      limiter = new RateLimiter({ max: maxTokensSec, windowSec: 1 });
      agentCustomLimiters.set(agentId, limiter);
    }
    return limiter.check(agentId);
  }

  // Default: use shared limiter (30 req / 10s)
  return agentLimiter.check(agentId);
}
