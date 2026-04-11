import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

import {
  createServerChannel,
  updateServerChannel,
} from "@/lib/services/ChannelService";

describe("ChannelService", () => {
  beforeEach(() => {
    mockGenerateId.mockReset();
  });

  it("createServerChannel appends position and auto-assigns active agents", async () => {
    mockGenerateId
      .mockReturnValueOnce("channel-new")
      .mockReturnValueOnce("channel-agent-1")
      .mockReturnValueOnce("channel-agent-2");

    const findFirst = vi.fn().mockResolvedValue({ position: 4 });
    const create = vi.fn().mockResolvedValue({
      id: "channel-new",
      name: "general",
      type: "TEXT",
      topic: null,
      position: 5,
    });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          channel: {
            findFirst,
            create,
          },
        }),
      ),
      agent: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "agent-1" }, { id: "agent-2" }]),
      },
      channelAgent: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const result = await createServerChannel(prisma as never, {
      serverId: "server-1",
      name: "general",
      topic: null,
      type: "TEXT",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { serverId: "server-1" },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        id: "channel-new",
        serverId: "server-1",
        name: "general",
        topic: null,
        type: "TEXT",
        position: 5,
      },
    });
    expect(prisma.channelAgent.createMany).toHaveBeenCalledWith({
      data: [
        { id: "channel-agent-1", channelId: "channel-new", agentId: "agent-1" },
        { id: "channel-agent-2", channelId: "channel-new", agentId: "agent-2" },
      ],
    });
    expect(result).toEqual({
      id: "channel-new",
      name: "general",
      type: "TEXT",
      topic: null,
      position: 5,
    });
  });

  it("updateServerChannel rejects agent ids that are not in the server", async () => {
    const prisma = {
      agent: {
        findMany: vi.fn().mockResolvedValue([{ id: "agent-1" }]),
      },
      $transaction: vi.fn(),
      channelAgent: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      channel: {
        update: vi.fn(),
      },
    };

    await expect(
      updateServerChannel(prisma as never, {
        serverId: "server-1",
        channelId: "channel-1",
        agentIds: ["agent-1", "agent-missing"],
      }),
    ).rejects.toThrow("Agents not found in this server: agent-missing");
  });

  it("updateServerChannel normalizes empty topics and parses charterAgentOrder", async () => {
    const prisma = {
      agent: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
      channelAgent: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      channel: {
        update: vi.fn().mockResolvedValue({
          id: "channel-1",
          serverId: "server-1",
          name: "general",
          topic: null,
          type: "TEXT",
          position: 0,
          lastSequence: 99n,
          defaultAgentId: null,
          swarmMode: "ROUND_ROBIN",
          charterGoal: "Ship it",
          charterRules: "Be kind",
          charterAgentOrder: JSON.stringify(["agent-1", "agent-2"]),
          charterMaxTurns: 8,
          channelAgents: [{ agentId: "agent-1" }, { agentId: "agent-2" }],
        }),
      },
    };

    const result = await updateServerChannel(prisma as never, {
      serverId: "server-1",
      channelId: "channel-1",
      topic: "",
      charterGoal: "Ship it",
      charterRules: "Be kind",
      charterAgentOrder: ["agent-1", "agent-2"],
      charterMaxTurns: 8,
    });

    expect(prisma.channel.update).toHaveBeenCalledWith({
      where: { id: "channel-1" },
      data: {
        topic: null,
        charterGoal: "Ship it",
        charterRules: "Be kind",
        charterAgentOrder: JSON.stringify(["agent-1", "agent-2"]),
        charterMaxTurns: 8,
      },
      include: {
        channelAgents: { select: { agentId: true } },
      },
    });
    expect(result).toMatchObject({
      lastSequence: "99",
      charterAgentOrder: ["agent-1", "agent-2"],
      agentIds: ["agent-1", "agent-2"],
    });
  });
});
