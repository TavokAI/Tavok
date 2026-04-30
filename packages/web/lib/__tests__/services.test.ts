// @ts-nocheck - service tests use focused Prisma delegate fakes.
import { describe, expect, it, vi } from "vitest";
import {
  createServerWithDefaultChannel,
  normalizeDefaultChannelName,
} from "../services/ServerService";
import { getRegisteredAgent } from "../services/AgentService";
import {
  createServerChannel,
  updateServerChannel,
} from "../services/ChannelService";
import { listAgentChannelMessages } from "../services/MessageService";

describe("ServerService", () => {
  it("normalizes default channel names into stable slugs", () => {
    expect(normalizeDefaultChannelName("  Product Launch!!  ")).toBe(
      "product-launch",
    );
    expect(normalizeDefaultChannelName("")).toBe("general");
    expect(normalizeDefaultChannelName(null)).toBe("general");
    expect(normalizeDefaultChannelName("A".repeat(150))).toHaveLength(100);
  });

  it("creates a server with a default channel, membership, and everyone role", async () => {
    const memberUpdate = vi.fn().mockResolvedValue({});
    const prismaClient = {
      server: {
        create: vi.fn(({ data }) => ({ ...data })),
      },
      channel: {
        create: vi.fn(({ data }) => ({ ...data })),
      },
      member: {
        create: vi.fn(({ data }) => ({ ...data })),
        update: memberUpdate,
      },
      role: {
        create: vi.fn(({ data }) => ({ ...data })),
      },
      $transaction: vi.fn(async (operations) => operations),
    };

    const result = await createServerWithDefaultChannel(prismaClient, {
      userId: "user-1",
      name: "Launch Team",
      iconUrl: null,
      defaultChannelName: "general",
      defaultChannelTopic: "Ship it",
    });

    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaClient.server.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        name: "Launch Team",
        ownerId: "user-1",
      }),
    });
    expect(prismaClient.channel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        serverId: result.id,
        name: "general",
        topic: "Ship it",
        position: 0,
      }),
    });

    const roleId = prismaClient.role.create.mock.calls[0][0].data.id;
    expect(memberUpdate).toHaveBeenCalledWith({
      where: { id: prismaClient.member.create.mock.calls[0][0].data.id },
      data: { roles: { connect: { id: roleId } } },
    });
    expect(result).toEqual({
      id: expect.any(String),
      name: "Launch Team",
      iconUrl: null,
      ownerId: "user-1",
      defaultChannelId: expect.any(String),
    });
  });
});

describe("AgentService", () => {
  it("maps registered agent records into public registration details", async () => {
    const createdAt = new Date("2026-04-01T12:00:00.000Z");
    const prismaClient = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          name: "Release Bot",
          avatarUrl: null,
          serverId: "server-1",
          llmModel: "gpt-5.5",
          isActive: true,
          triggerMode: "MENTION",
          createdAt,
          agentRegistration: {
            capabilities: ["chat", "tools"],
            healthUrl: "https://agent.example.com/health",
            webhookUrl: "https://agent.example.com/webhook",
            maxTokensSec: 50,
            lastHealthCheck: null,
            lastHealthOk: true,
            connectionMethod: "WEBHOOK",
            isGuest: true,
            expiresAt: new Date("2026-05-01T00:00:00.000Z"),
            revokedAt: null,
          },
        }),
      },
    };

    await expect(getRegisteredAgent(prismaClient, "agent-1")).resolves.toEqual({
      agentId: "agent-1",
      displayName: "Release Bot",
      avatarUrl: null,
      serverId: "server-1",
      model: "gpt-5.5",
      isActive: true,
      triggerMode: "MENTION",
      capabilities: ["chat", "tools"],
      healthUrl: "https://agent.example.com/health",
      webhookUrl: "https://agent.example.com/webhook",
      maxTokensSec: 50,
      lastHealthCheck: null,
      lastHealthOk: true,
      connectionMethod: "WEBHOOK",
      isGuest: true,
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      revokedAt: null,
      createdAt,
    });
  });

  it("returns null when the agent has no registration", async () => {
    const prismaClient = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          agentRegistration: null,
        }),
      },
    };

    await expect(
      getRegisteredAgent(prismaClient, "agent-1"),
    ).resolves.toBeNull();
  });
});

describe("ChannelService", () => {
  it("appends new channels after the last position and attaches active agents", async () => {
    const tx = {
      channel: {
        findFirst: vi.fn().mockResolvedValue({ position: 4 }),
        create: vi.fn(async ({ data }) => ({
          ...data,
          topic: data.topic,
        })),
      },
    };
    const prismaClient = {
      $transaction: vi.fn((callback) => callback(tx)),
      agent: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "agent-1" }, { id: "agent-2" }]),
      },
      channelAgent: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const channel = await createServerChannel(prismaClient, {
      serverId: "server-1",
      name: "ops",
      topic: null,
      type: "TEXT",
    });

    expect(tx.channel.findFirst).toHaveBeenCalledWith({
      where: { serverId: "server-1" },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    expect(tx.channel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        serverId: "server-1",
        name: "ops",
        position: 5,
      }),
    });
    expect(prismaClient.channelAgent.createMany).toHaveBeenCalledWith({
      data: [
        {
          id: expect.any(String),
          channelId: channel.id,
          agentId: "agent-1",
        },
        {
          id: expect.any(String),
          channelId: channel.id,
          agentId: "agent-2",
        },
      ],
    });
  });

  it("rejects a default agent from another server before updating the channel", async () => {
    const prismaClient = {
      agent: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "agent-1", serverId: "s2" }),
      },
      channel: {
        update: vi.fn(),
      },
      channelAgent: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    await expect(
      updateServerChannel(prismaClient, {
        serverId: "s1",
        channelId: "channel-1",
        defaultAgentId: "agent-1",
      }),
    ).rejects.toThrow("Agent not found in this server");

    expect(prismaClient.channel.update).not.toHaveBeenCalled();
    expect(prismaClient.$transaction).not.toHaveBeenCalled();
  });

  it("replaces channel agents and returns parsed charter ordering", async () => {
    const channelUpdate = vi
      .fn()
      .mockReturnValueOnce({ operation: "set-default-agent" })
      .mockResolvedValueOnce({
        id: "channel-1",
        serverId: "server-1",
        name: "ops",
        topic: null,
        type: "TEXT",
        position: 0,
        defaultAgentId: "agent-2",
        lastSequence: 12n,
        charterAgentOrder: '["agent-2","agent-1"]',
        channelAgents: [{ agentId: "agent-2" }, { agentId: "agent-1" }],
      });
    const prismaClient = {
      agent: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "agent-1" }, { id: "agent-2" }]),
      },
      channel: {
        update: channelUpdate,
      },
      channelAgent: {
        deleteMany: vi.fn().mockReturnValue({ operation: "delete-agents" }),
        create: vi.fn(({ data }) => ({ operation: "create-agent", data })),
      },
      $transaction: vi.fn(async (operations) => operations),
    };

    const channel = await updateServerChannel(prismaClient, {
      serverId: "server-1",
      channelId: "channel-1",
      agentIds: ["agent-2", "agent-1"],
      charterAgentOrder: ["agent-2", "agent-1"],
    });

    expect(prismaClient.$transaction).toHaveBeenCalledWith([
      { operation: "delete-agents" },
      {
        operation: "create-agent",
        data: expect.objectContaining({
          channelId: "channel-1",
          agentId: "agent-2",
        }),
      },
      {
        operation: "create-agent",
        data: expect.objectContaining({
          channelId: "channel-1",
          agentId: "agent-1",
        }),
      },
      { operation: "set-default-agent" },
    ]);
    expect(channel.sequence).toBeUndefined();
    expect(channel.lastSequence).toBe("12");
    expect(channel.agentIds).toEqual(["agent-2", "agent-1"]);
    expect(channel.charterAgentOrder).toEqual(["agent-2", "agent-1"]);
  });
});

describe("MessageService", () => {
  it("rejects negative agent message cursors before querying", async () => {
    const prismaClient = {
      message: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      agent: { findMany: vi.fn() },
    };

    await expect(
      listAgentChannelMessages(prismaClient, {
        channelId: "channel-1",
        limit: 25,
        before: null,
        afterSequence: "-1",
      }),
    ).rejects.toThrow("after_sequence must be a non-negative integer");

    expect(prismaClient.message.findMany).not.toHaveBeenCalled();
  });

  it("maps agent channel messages with authors, reactions, and pagination", async () => {
    const newer = {
      id: "msg-2",
      channelId: "channel-1",
      authorId: "user-1",
      authorType: "USER",
      content: "newer",
      type: "TEXT",
      streamingStatus: null,
      sequence: 2n,
      createdAt: new Date("2026-04-01T12:01:00.000Z"),
      editedAt: null,
      metadata: null,
      reactions: [{ emoji: "+1", userId: "user-2" }],
    };
    const older = {
      id: "msg-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "older",
      type: "TEXT",
      streamingStatus: null,
      sequence: 1n,
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
      editedAt: new Date("2026-04-01T12:02:00.000Z"),
      metadata: { source: "test" },
      reactions: [
        { emoji: "ship", userId: "user-1" },
        { emoji: "ship", userId: "user-2" },
      ],
    };
    const prismaClient = {
      message: {
        findMany: vi.fn().mockResolvedValue([newer, older]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            displayName: "Avery",
            avatarUrl: "https://example.com/avery.png",
          },
        ]),
      },
      agent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "agent-1",
            name: "Release Bot",
            avatarUrl: null,
          },
        ]),
      },
    };

    const result = await listAgentChannelMessages(prismaClient, {
      channelId: "channel-1",
      limit: 1,
      before: null,
      afterSequence: null,
    });

    expect(prismaClient.message.findMany).toHaveBeenCalledWith({
      where: { channelId: "channel-1", isDeleted: false },
      include: { reactions: { select: { emoji: true, userId: true } } },
      orderBy: { id: "desc" },
      take: 2,
    });
    expect(result.hasMore).toBe(true);
    expect(result.messages).toEqual([
      {
        id: "msg-2",
        channelId: "channel-1",
        authorId: "user-1",
        authorType: "USER",
        authorName: "Avery",
        authorAvatarUrl: "https://example.com/avery.png",
        content: "newer",
        type: "TEXT",
        streamingStatus: null,
        sequence: "2",
        createdAt: "2026-04-01T12:01:00.000Z",
        editedAt: null,
        metadata: undefined,
        reactions: [{ emoji: "+1", count: 1, userIds: ["user-2"] }],
      },
    ]);
  });
});
