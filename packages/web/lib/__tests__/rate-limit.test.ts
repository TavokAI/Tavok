import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter, getClientIp } from "../rate-limit";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the max limit", () => {
    const limiter = new RateLimiter({ max: 3, windowSec: 60 });

    const r1 = limiter.check("ip-1");
    const r2 = limiter.check("ip-1");
    const r3 = limiter.check("ip-1");

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("rejects requests after max is reached", () => {
    const limiter = new RateLimiter({ max: 2, windowSec: 60 });

    limiter.check("ip-1");
    limiter.check("ip-1");
    const r3 = limiter.check("ip-1");

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("decrements remaining count on each request", () => {
    const limiter = new RateLimiter({ max: 5, windowSec: 60 });

    expect(limiter.check("ip-1").remaining).toBe(4);
    expect(limiter.check("ip-1").remaining).toBe(3);
    expect(limiter.check("ip-1").remaining).toBe(2);
    expect(limiter.check("ip-1").remaining).toBe(1);
    expect(limiter.check("ip-1").remaining).toBe(0);
  });

  it("resets the window after windowSec elapses", () => {
    const limiter = new RateLimiter({ max: 1, windowSec: 10 });

    const r1 = limiter.check("ip-1");
    expect(r1.allowed).toBe(true);

    const r2 = limiter.check("ip-1");
    expect(r2.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(10_000);

    const r3 = limiter.check("ip-1");
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("returns a resetAt timestamp in the future", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const limiter = new RateLimiter({ max: 5, windowSec: 30 });

    const result = limiter.check("ip-1");
    expect(result.resetAt).toBe(Date.now() + 30_000);
  });

  it("tracks multiple keys independently", () => {
    const limiter = new RateLimiter({ max: 1, windowSec: 60 });

    const rA = limiter.check("ip-a");
    const rB = limiter.check("ip-b");

    expect(rA.allowed).toBe(true);
    expect(rB.allowed).toBe(true);

    // Both are now exhausted
    expect(limiter.check("ip-a").allowed).toBe(false);
    expect(limiter.check("ip-b").allowed).toBe(false);
  });

  it("keeps returning allowed:false for rejected key until window resets", () => {
    const limiter = new RateLimiter({ max: 1, windowSec: 10 });

    limiter.check("ip-1");
    expect(limiter.check("ip-1").allowed).toBe(false);
    expect(limiter.check("ip-1").allowed).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(limiter.check("ip-1").allowed).toBe(true);
  });

  it("preserves resetAt across rejected requests", () => {
    const limiter = new RateLimiter({ max: 1, windowSec: 60 });

    const r1 = limiter.check("ip-1");
    const r2 = limiter.check("ip-1");

    expect(r2.resetAt).toBe(r1.resetAt);
  });
});

describe("getClientIp", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost", { headers });
  }

  it("returns the first value from x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace from x-forwarded-for value", () => {
    const req = makeRequest({ "x-forwarded-for": "  9.8.7.6 , 1.1.1.1" });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });

  it("returns x-forwarded-for single value", () => {
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1" });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "192.168.1.1" });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it('returns "unknown" when no IP headers are present', () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });
});
