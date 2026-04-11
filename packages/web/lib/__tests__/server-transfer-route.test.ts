// @ts-nocheck -- route tests use partial Prisma mocks
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAuth } = vi.hoisted(() => {
  return {
    mockPrisma: {
      server: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      member: {
        findUnique: vi.fn(),
      },
    },
    mockAuth: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import { POST } from "@/app/api/servers/[serverId]/transfer/route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/servers/server-1/transfer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as any;
}

function makeRouteParams() {
  return { params: Promise.resolve({ serverId: "server-1" }) };
}

describe("POST /api/servers/[serverId]/transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "owner-1" } });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerId: "owner-1" });
    mockPrisma.member.findUnique.mockResolvedValue({ id: "member-2" });
    mockPrisma.server.update.mockResolvedValue({
      id: "server-1",
      ownerId: "member-2",
    });
  });

  it("transfers ownership to another server member", async () => {
    const response = await POST(
      makeRequest({ newOwnerId: "member-2" }),
      makeRouteParams(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      newOwnerId: "member-2",
    });
    expect(mockPrisma.member.findUnique).toHaveBeenCalledWith({
      where: {
        userId_serverId: {
          userId: "member-2",
          serverId: "server-1",
        },
      },
    });
    expect(mockPrisma.server.update).toHaveBeenCalledWith({
      where: { id: "server-1" },
      data: { ownerId: "member-2" },
    });
  });

  it("forbids users who do not own the server", async () => {
    mockAuth.mockResolvedValue({ user: { id: "outsider-1" } });

    const response = await POST(
      makeRequest({ newOwnerId: "member-2" }),
      makeRouteParams(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the server owner can transfer ownership",
    });
    expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.server.update).not.toHaveBeenCalled();
  });

  it("rejects transfers to users who are not server members", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ newOwnerId: "member-404" }),
      makeRouteParams(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Target user is not a member of this server",
    });
    expect(mockPrisma.server.update).not.toHaveBeenCalled();
  });
});
