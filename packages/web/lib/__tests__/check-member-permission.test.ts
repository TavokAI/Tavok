import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// Mock permissions module
const mockComputeMemberPermissions = vi.fn();
const mockHasPermission = vi.fn();
vi.mock("@/lib/permissions", () => ({
  computeMemberPermissions: (...args: unknown[]) =>
    mockComputeMemberPermissions(...args),
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

import {
  checkMemberPermission,
  checkMembership,
} from "../check-member-permission";

describe("checkMemberPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed:false when member not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await checkMemberPermission("user-1", "server-1", 1n);

    expect(result).toEqual({ allowed: false });
    expect(mockComputeMemberPermissions).not.toHaveBeenCalled();
  });

  it("returns allowed:false when permission not granted", async () => {
    mockFindUnique.mockResolvedValue({
      id: "member-1",
      roles: [{ permissions: 0n }],
      server: { ownerId: "other-user" },
    });
    mockComputeMemberPermissions.mockReturnValue(0n);
    mockHasPermission.mockReturnValue(false);

    const result = await checkMemberPermission("user-1", "server-1", 8n);

    expect(result).toEqual({ allowed: false });
    expect(mockComputeMemberPermissions).toHaveBeenCalledWith(
      "user-1",
      "other-user",
      [{ permissions: 0n }],
    );
    expect(mockHasPermission).toHaveBeenCalledWith(0n, 8n);
  });

  it("returns allowed:true with memberId and effectivePermissions when granted", async () => {
    const permissions = 15n;
    mockFindUnique.mockResolvedValue({
      id: "member-1",
      roles: [{ permissions: 15n }],
      server: { ownerId: "user-1" },
    });
    mockComputeMemberPermissions.mockReturnValue(permissions);
    mockHasPermission.mockReturnValue(true);

    const result = await checkMemberPermission("user-1", "server-1", 8n);

    expect(result).toEqual({
      allowed: true,
      memberId: "member-1",
      effectivePermissions: permissions,
    });
  });

  it("queries with correct composite key", async () => {
    mockFindUnique.mockResolvedValue(null);

    await checkMemberPermission("user-42", "server-99", 1n);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        userId_serverId: { userId: "user-42", serverId: "server-99" },
      },
      include: {
        roles: { select: { permissions: true } },
        server: { select: { ownerId: true } },
      },
    });
  });
});

describe("checkMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isMember:false when not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await checkMembership("user-1", "server-1");

    expect(result).toEqual({ isMember: false, memberId: undefined });
  });

  it("returns isMember:true with memberId when found", async () => {
    mockFindUnique.mockResolvedValue({ id: "member-1" });

    const result = await checkMembership("user-1", "server-1");

    expect(result).toEqual({ isMember: true, memberId: "member-1" });
  });

  it("queries with select: { id: true } only", async () => {
    mockFindUnique.mockResolvedValue(null);

    await checkMembership("user-1", "server-1");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        userId_serverId: { userId: "user-1", serverId: "server-1" },
      },
      select: { id: true },
    });
  });
});
