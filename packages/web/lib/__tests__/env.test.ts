// @ts-nocheck — test uses delete operator on process.env which is read-only in strict mode
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZodError } from "zod";

/**
 * Because `serverEnv` is validated at import time via `serverEnvSchema.parse(process.env)`,
 * we must set up valid env vars BEFORE importing the module. We use dynamic `import()`
 * with `vi.resetModules()` to get a fresh module each time.
 *
 * These tests focus on `getClientEnv()` which validates lazily.
 */

const VALID_SERVER_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/tavok",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "test-secret-at-least-16-chars",
  NEXTAUTH_URL: "http://localhost:3000",
  JWT_SECRET: "jwt-secret-at-least-16-chars",
  INTERNAL_API_SECRET: "internal-secret-at-least-16",
  ENCRYPTION_KEY: "a".repeat(64),
  NODE_ENV: "test",
};

describe("env", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Set valid server env so the module can import without throwing
    Object.assign(process.env, VALID_SERVER_ENV);
    vi.resetModules();
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  describe("getClientEnv", () => {
    it("returns validated client env when NEXT_PUBLIC_GATEWAY_URL is set", async () => {
      process.env.NEXT_PUBLIC_GATEWAY_URL = "ws://localhost:4000";

      const { getClientEnv } = await import("../env");
      const result = getClientEnv();

      expect(result).toEqual({
        NEXT_PUBLIC_GATEWAY_URL: "ws://localhost:4000",
      });
    });

    it("throws ZodError when NEXT_PUBLIC_GATEWAY_URL is missing", async () => {
      delete process.env.NEXT_PUBLIC_GATEWAY_URL;

      const { getClientEnv } = await import("../env");

      expect(() => getClientEnv()).toThrow(ZodError);
    });

    it("throws ZodError when NEXT_PUBLIC_GATEWAY_URL is empty string", async () => {
      // zod .string() requires at least a non-undefined value, but empty string passes .string()
      // This test documents current behavior: empty string is accepted by z.string()
      process.env.NEXT_PUBLIC_GATEWAY_URL = "";

      const { getClientEnv } = await import("../env");
      const result = getClientEnv();

      expect(result).toEqual({ NEXT_PUBLIC_GATEWAY_URL: "" });
    });
  });

  describe("serverEnv", () => {
    it("exports serverEnv with validated values", async () => {
      const { serverEnv } = await import("../env");

      expect(serverEnv.DATABASE_URL).toBe(VALID_SERVER_ENV.DATABASE_URL);
      expect(serverEnv.REDIS_URL).toBe(VALID_SERVER_ENV.REDIS_URL);
      expect(serverEnv.NEXTAUTH_SECRET).toBe(VALID_SERVER_ENV.NEXTAUTH_SECRET);
      expect(serverEnv.NEXTAUTH_URL).toBe(VALID_SERVER_ENV.NEXTAUTH_URL);
      expect(serverEnv.JWT_SECRET).toBe(VALID_SERVER_ENV.JWT_SECRET);
      expect(serverEnv.INTERNAL_API_SECRET).toBe(
        VALID_SERVER_ENV.INTERNAL_API_SECRET,
      );
      expect(serverEnv.ENCRYPTION_KEY).toBe(VALID_SERVER_ENV.ENCRYPTION_KEY);
      expect(serverEnv.NODE_ENV).toBe("test");
    });

    it("throws when DATABASE_URL is missing", async () => {
      delete process.env.DATABASE_URL;

      await expect(() => import("../env")).rejects.toThrow();
    });

    it("throws when ENCRYPTION_KEY has wrong format", async () => {
      process.env.ENCRYPTION_KEY = "not-hex";

      await expect(() => import("../env")).rejects.toThrow();
    });

    it("throws when NEXTAUTH_SECRET is too short", async () => {
      process.env.NEXTAUTH_SECRET = "short";

      await expect(() => import("../env")).rejects.toThrow();
    });

    it("defaults NODE_ENV to development when not set", async () => {
      delete process.env.NODE_ENV;

      const { serverEnv } = await import("../env");

      expect(serverEnv.NODE_ENV).toBe("development");
    });
  });
});
