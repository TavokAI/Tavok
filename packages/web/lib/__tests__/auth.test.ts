// @ts-nocheck — test mocks use partial objects that don't satisfy full Prisma types
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// Mock bcryptjs
const mockCompare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

const {
  mockAuthExport,
  mockHandlers,
  mockSignInExport,
  mockSignOutExport,
  mockCredentialsProvider,
} = vi.hoisted(() => ({
  mockAuthExport: vi.fn(),
  mockHandlers: { GET: vi.fn(), POST: vi.fn() },
  mockSignInExport: vi.fn(),
  mockSignOutExport: vi.fn(),
  mockCredentialsProvider: vi.fn((options: unknown) => ({
    id: "credentials",
    name: "Credentials",
    type: "credentials",
    options,
  })),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: mockHandlers,
    auth: mockAuthExport,
    signIn: mockSignInExport,
    signOut: mockSignOutExport,
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: mockCredentialsProvider,
}));

import { auth, handlers } from "../../auth";
import { authOptions } from "../auth";

describe("auth configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses jwt session strategy", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("exports root auth helpers for v5 usage", () => {
    expect(typeof auth).toBe("function");
    expect(typeof handlers.GET).toBe("function");
    expect(typeof handlers.POST).toBe("function");
  });

  it("has 24-hour session maxAge", () => {
    expect(authOptions.session?.maxAge).toBe(24 * 60 * 60);
  });

  it("configures credentials provider", () => {
    expect(authOptions.providers).toHaveLength(1);
    expect(authOptions.providers[0].name).toBe("Credentials");
  });

  it("sets login and register page routes", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
    expect(authOptions.pages?.newUser).toBe("/register");
  });

  describe("authorize callback", () => {
    // Access the authorize function from the credentials provider
    function getAuthorize() {
      const provider = authOptions.providers[0] as {
        options: {
          authorize: (credentials: Record<string, string>) => Promise<unknown>;
        };
      };
      return provider.options.authorize;
    }

    it("returns null when credentials are missing", async () => {
      const authorize = getAuthorize();
      const result = await authorize({});
      expect(result).toBeNull();
    });

    it("returns null when user not found", async () => {
      mockFindUnique.mockResolvedValue(null);
      const authorize = getAuthorize();
      const result = await authorize({
        email: "test@example.com",
        password: "password123",
      });
      expect(result).toBeNull();
    });

    it("returns null when password is invalid", async () => {
      mockFindUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: "hashed",
        username: "test",
        displayName: "Test",
        avatarUrl: null,
        status: "online",
        theme: "dark",
      });
      mockCompare.mockResolvedValue(false);

      const authorize = getAuthorize();
      const result = await authorize({
        email: "test@example.com",
        password: "wrong",
      });
      expect(result).toBeNull();
    });

    it("returns user data on valid credentials", async () => {
      mockFindUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: "hashed",
        username: "testuser",
        displayName: "Test User",
        avatarUrl: "/avatar.png",
        status: "online",
        theme: "dark",
      });
      mockCompare.mockResolvedValue(true);

      const authorize = getAuthorize();
      const result = await authorize({
        email: "test@example.com",
        password: "correct",
      });

      expect(result).toEqual({
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        displayName: "Test User",
        avatarUrl: "/avatar.png",
        status: "online",
        theme: "dark",
      });
    });
  });

  describe("jwt callback", () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error("jwt callback not found");

    it("populates token from user on initial sign-in", async () => {
      const token = { sub: "" } as Record<string, unknown>;
      const user = {
        id: "user-1",
        username: "testuser",
        displayName: "Test",
        email: "test@example.com",
        avatarUrl: null,
        status: "online",
        theme: "dark",
      };

      const result = await jwtCallback({
        token,
        user,
        trigger: "signIn",
        account: null,
        session: undefined,
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.sub).toBe("user-1");
      expect(result.username).toBe("testuser");
      expect(result.displayName).toBe("Test");
    });

    it("updates token fields on session update trigger", async () => {
      const token = {
        sub: "user-1",
        displayName: "Old Name",
        email: "old@example.com",
      } as Record<string, unknown>;

      const result = await jwtCallback({
        token,
        user: undefined as unknown,
        trigger: "update",
        session: { displayName: "New Name" },
        account: null,
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.displayName).toBe("New Name");
    });
  });

  describe("session callback", () => {
    const sessionCallback = authOptions.callbacks?.session;
    if (!sessionCallback) throw new Error("session callback not found");

    it("maps token fields to session.user", async () => {
      const token = {
        sub: "user-1",
        username: "testuser",
        displayName: "Test",
        email: "test@example.com",
        avatarUrl: null,
        status: "online",
        theme: "dark",
      };

      const result = await sessionCallback({
        session: { user: {}, expires: "" },
        token,
      } as Parameters<typeof sessionCallback>[0]);

      expect(result.user).toEqual({
        id: "user-1",
        username: "testuser",
        displayName: "Test",
        email: "test@example.com",
        avatarUrl: null,
        status: "online",
        theme: "dark",
      });
    });
  });

  describe("logger", () => {
    it("suppresses JWT_SESSION_ERROR", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      authOptions.logger?.error("JWT_SESSION_ERROR");
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("logs other errors", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      authOptions.logger?.error("OTHER_ERROR");
      expect(errorSpy).toHaveBeenCalledWith("[auth]", "OTHER_ERROR");
      errorSpy.mockRestore();
    });
  });
});
