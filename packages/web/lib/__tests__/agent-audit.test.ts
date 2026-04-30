import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockCheckMemberPermission, mockGenerateId, mockPrisma } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockCheckMemberPermission: vi.fn(),
    mockGenerateId: vi.fn(() => "audit-1"),
    mockPrisma: {
      agent: {
        findMany: vi.fn(),
      },
      agentAuditLog: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  }));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/check-member-permission", () => ({
  checkMemberPermission: mockCheckMemberPermission,
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/permissions", () => ({
  Permissions: { MANAGE_AGENTS: 1n },
}));
vi.mock("@/lib/ulid", () => ({ generateId: mockGenerateId }));

describe("agent audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.agentAuditLog.create.mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists agent actions while still writing structured stdout logs", async () => {
    const { logAgentAction } = await import("../agent-audit");

    await logAgentAction({
      agentId: "agent-1",
      serverId: "server-1",
      action: "message_send",
      channelId: "channel-1",
      messageId: "message-1",
      metadata: { bytes: 12 },
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"level":"audit"'),
    );
    expect(mockPrisma.agentAuditLog.create).toHaveBeenCalledWith({
      data: {
        id: "audit-1",
        agentId: "agent-1",
        serverId: "server-1",
        action: "message_send",
        channelId: "channel-1",
        messageId: "message-1",
        metadata: { bytes: 12 },
      },
    });
  });

  it("does not try to persist entries without a real server id", async () => {
    const { logAgentAction } = await import("../agent-audit");

    await logAgentAction({
      agentId: "agent-1",
      serverId: "unknown",
      action: "agent_update",
    });

    expect(mockPrisma.agentAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/servers/[serverId]/agent-audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockCheckMemberPermission.mockResolvedValue({ allowed: true });
    mockPrisma.agentAuditLog.findMany.mockResolvedValue([
      {
        id: "audit-1",
        agentId: "agent-1",
        action: "channel_history_read",
        channelId: "channel-1",
        messageId: null,
        metadata: { count: 5 },
        createdAt: new Date("2026-04-29T12:00:00.000Z"),
      },
    ]);
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "agent-1", name: "Release Bot" },
    ]);
  });

  it("returns recent audit entries for users who can manage agents", async () => {
    const { GET } =
      await import("@/app/api/servers/[serverId]/agent-audit/route");

    const res = await GET(
      new Request(
        "http://localhost/api/servers/server-1/agent-audit?limit=10",
      ) as any,
      { params: Promise.resolve({ serverId: "server-1" }) },
    );

    expect(res.status).toBe(200);
    expect(mockCheckMemberPermission).toHaveBeenCalledWith(
      "user-1",
      "server-1",
      1n,
    );
    expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith({
      where: { serverId: "server-1" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["agent-1"] }, serverId: "server-1" },
      select: { id: true, name: true },
    });
    await expect(res.json()).resolves.toEqual({
      events: [
        {
          id: "audit-1",
          agentId: "agent-1",
          agentName: "Release Bot",
          action: "channel_history_read",
          channelId: "channel-1",
          messageId: null,
          metadata: { count: 5 },
          createdAt: "2026-04-29T12:00:00.000Z",
        },
      ],
    });
  });
});
