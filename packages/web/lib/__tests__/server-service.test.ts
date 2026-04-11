import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

import {
  createServerWithDefaultChannel,
  getServerDetail,
  normalizeDefaultChannelName,
} from "@/lib/services/ServerService";

describe("ServerService", () => {
  beforeEach(() => {
    mockGenerateId.mockReset();
  });

  it("normalizeDefaultChannelName sanitizes input and falls back to general", () => {
    expect(normalizeDefaultChannelName("  Product Updates!  ")).toBe(
      "product-updates",
    );
    expect(normalizeDefaultChannelName("!!!")).toBe("general");
    expect(normalizeDefaultChannelName(undefined)).toBe("general");
  });

  it("createServerWithDefaultChannel creates the server, default channel, and everyone role", async () => {
    mockGenerateId
      .mockReturnValueOnce("server-1")
      .mockReturnValueOnce("channel-1")
      .mockReturnValueOnce("member-1")
      .mockReturnValueOnce("role-everyone");

    const prisma = {
      server: {
        create: vi.fn().mockResolvedValue({
          id: "server-1",
          name: "Tavok",
          iconUrl: null,
          ownerId: "user-1",
        }),
        findUnique: vi.fn(),
      },
      channel: {
        create: vi.fn().mockResolvedValue({ id: "channel-1" }),
      },
      member: {
        create: vi.fn().mockResolvedValue({ id: "member-1" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      role: {
        create: vi.fn().mockResolvedValue({ id: "role-everyone" }),
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    const result = await createServerWithDefaultChannel(prisma as never, {
      userId: "user-1",
      name: "Tavok",
      iconUrl: null,
      defaultChannelName: "general",
      defaultChannelTopic: "Introductions",
    });

    expect(prisma.server.create).toHaveBeenCalledWith({
      data: {
        id: "server-1",
        name: "Tavok",
        iconUrl: null,
        ownerId: "user-1",
      },
    });
    expect(prisma.channel.create).toHaveBeenCalledWith({
      data: {
        id: "channel-1",
        serverId: "server-1",
        name: "general",
        topic: "Introductions",
        type: "TEXT",
        position: 0,
      },
    });
    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        id: "role-everyone",
        serverId: "server-1",
        name: "@everyone",
        permissions: DEFAULT_PERMISSIONS,
        position: 0,
      },
    });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: {
        roles: { connect: { id: "role-everyone" } },
      },
    });
    expect(result).toEqual({
      id: "server-1",
      name: "Tavok",
      iconUrl: null,
      ownerId: "user-1",
      defaultChannelId: "channel-1",
    });
  });

  it("getServerDetail flattens channelAgents into agentIds", async () => {
    const prisma = {
      server: {
        findUnique: vi.fn().mockResolvedValue({
          id: "server-1",
          name: "Tavok",
          iconUrl: null,
          ownerId: "user-1",
          channels: [
            {
              id: "channel-1",
              name: "general",
              type: "TEXT",
              topic: null,
              position: 0,
              defaultAgentId: "agent-1",
              channelAgents: [{ agentId: "agent-1" }, { agentId: "agent-2" }],
            },
          ],
          _count: { members: 3 },
        }),
      },
      member: {
        findMany: vi.fn(),
      },
      channel: {
        create: vi.fn(),
      },
      role: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const result = await getServerDetail(prisma as never, "server-1");

    expect(result).toEqual({
      id: "server-1",
      name: "Tavok",
      iconUrl: null,
      ownerId: "user-1",
      channels: [
        {
          id: "channel-1",
          name: "general",
          type: "TEXT",
          topic: null,
          position: 0,
          defaultAgentId: "agent-1",
          channelAgents: undefined,
          agentIds: ["agent-1", "agent-2"],
        },
      ],
      memberCount: 3,
    });
  });
});
