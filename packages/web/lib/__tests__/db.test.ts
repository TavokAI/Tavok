import { describe, it, expect, vi } from "vitest";

// Mock PrismaClient as a class
vi.mock("@prisma/client", () => {
  return {
    PrismaClient: class MockPrismaClient {
      log: unknown;
      constructor(opts?: { log?: unknown }) {
        this.log = opts?.log;
      }
      $connect = vi.fn();
      $disconnect = vi.fn();
    },
  };
});

describe("db", () => {
  it("exports a prisma client instance", async () => {
    const { prisma } = await import("../db");
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe("object");
  });

  it("reuses existing globalThis.prisma when available", async () => {
    const sentinel = { sentinel: true };
    (globalThis as Record<string, unknown>).prisma = sentinel;

    vi.resetModules();
    const { prisma } = await import("../db");
    expect(prisma).toBe(sentinel);

    // Cleanup
    delete (globalThis as Record<string, unknown>).prisma;
  });
});
