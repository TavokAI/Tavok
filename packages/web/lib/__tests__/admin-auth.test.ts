import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authenticateAdminToken } from "../admin-auth";

const ADMIN_TOKEN = "supersecrettoken123";

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/bootstrap", { headers });
}

describe("authenticateAdminToken", () => {
  const originalEnv = process.env.TAVOK_ADMIN_TOKEN;

  beforeEach(() => {
    delete process.env.TAVOK_ADMIN_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TAVOK_ADMIN_TOKEN = originalEnv;
    } else {
      delete process.env.TAVOK_ADMIN_TOKEN;
    }
  });

  it("returns false when TAVOK_ADMIN_TOKEN env var is not set", () => {
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when TAVOK_ADMIN_TOKEN is empty string", () => {
    process.env.TAVOK_ADMIN_TOKEN = "";
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when request has Origin header (CSRF protection)", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
      origin: "https://evil.com",
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({});
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when Authorization header does not start with 'Bearer admin-'", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Bearer ${ADMIN_TOKEN}`,
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false for Basic auth scheme", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Basic admin-${ADMIN_TOKEN}`,
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when token after 'Bearer admin-' is empty", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: "Bearer admin-",
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when token lengths do not match", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: "Bearer admin-short",
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns false when token has wrong value but same length", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const wrongToken = "x".repeat(ADMIN_TOKEN.length);
    const req = createRequest({
      authorization: `Bearer admin-${wrongToken}`,
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });

  it("returns true when token matches exactly", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
    });
    expect(authenticateAdminToken(req)).toBe(true);
  });

  it("uses constant-time comparison (timingSafeEqual)", async () => {
    const crypto = await import("crypto");
    const spy = vi.spyOn(crypto.default, "timingSafeEqual");

    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
    });

    authenticateAdminToken(req);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("does not call timingSafeEqual when lengths differ", async () => {
    const crypto = await import("crypto");
    const spy = vi.spyOn(crypto.default, "timingSafeEqual");

    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: "Bearer admin-short",
    });

    authenticateAdminToken(req);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects origin header with any value", () => {
    process.env.TAVOK_ADMIN_TOKEN = ADMIN_TOKEN;
    const req = createRequest({
      authorization: `Bearer admin-${ADMIN_TOKEN}`,
      origin: "http://localhost:3000",
    });
    expect(authenticateAdminToken(req)).toBe(false);
  });
});
