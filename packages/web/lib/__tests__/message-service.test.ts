import { describe, expect, it, vi } from "vitest";
import {
  listAgentChannelMessages,
  listInternalMessages,
  searchServerMessages,
} from "@/lib/services/MessageService";

function createMessageServiceClient() {
  return {
    message: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
}

describe("MessageService", () => {
  it("listInternalMessages maps authors, parses metadata, and groups reactions", async () => {
    const prisma = createMessageServiceClient();
    prisma.message.findMany.mockResolvedValue([
      {
        id: "system-1",
        channelId: "channel-1",
        authorId: "system",
        authorType: "SYSTEM",
        content: "Server created",
        type: "STANDARD",
        streamingStatus: null,
        sequence: 3n,
        createdAt: new Date("2026-01-01T00:00:03.000Z"),
        editedAt: null,
        thinkingTimeline: null,
        tokenHistory: null,
        checkpoints: null,
        metadata: null,
        reactions: [],
        isDeleted: false,
      },
      {
        id: "legacy-1",
        channelId: "channel-1",
        authorId: "legacy-agent",
        authorType: "USER",
        content: "I used to be a user row",
        type: "STREAMING",
        streamingStatus: "COMPLETE",
        sequence: 2n,
        createdAt: new Date("2026-01-01T00:00:02.000Z"),
        editedAt: new Date("2026-01-01T00:00:05.000Z"),
        thinkingTimeline: JSON.stringify([
          { phase: "Thinking", timestamp: "2026-01-01T00:00:02.000Z" },
        ]),
        tokenHistory: JSON.stringify([{ o: 0, t: 1 }]),
        checkpoints: JSON.stringify([
          {
            index: 0,
            label: "Draft",
            contentOffset: 10,
            timestamp: "2026-01-01T00:00:03.000Z",
          },
        ]),
        metadata: { model: "gpt-4.1" },
        reactions: [
          { emoji: "👍", userId: "user-1" },
          { emoji: "👍", userId: "user-2" },
        ],
        isDeleted: false,
      },
      {
        id: "agent-1",
        channelId: "channel-1",
        authorId: "agent-1",
        authorType: "AGENT",
        content: "Hello",
        type: "STANDARD",
        streamingStatus: null,
        sequence: 1n,
        createdAt: new Date("2026-01-01T00:00:01.000Z"),
        editedAt: null,
        thinkingTimeline: null,
        tokenHistory: null,
        checkpoints: null,
        metadata: null,
        reactions: [],
        isDeleted: false,
      },
    ]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.agent.findMany.mockResolvedValue([
      { id: "agent-1", name: "Assistant", avatarUrl: null },
      { id: "legacy-agent", name: "Legacy Bot", avatarUrl: "/legacy.png" },
    ]);

    const result = await listInternalMessages(prisma as never, {
      channelId: "channel-1",
      afterSequence: null,
      before: null,
      limit: 10,
    });

    expect(result.hasMore).toBe(false);
    expect(result.messages.map((message) => message.id)).toEqual([
      "agent-1",
      "legacy-1",
      "system-1",
    ]);
    expect(result.messages[1]).toMatchObject({
      authorName: "Legacy Bot",
      authorAvatarUrl: "/legacy.png",
      sequence: "2",
      editedAt: "2026-01-01T00:00:05.000Z",
      thinkingTimeline: [
        { phase: "Thinking", timestamp: "2026-01-01T00:00:02.000Z" },
      ],
      tokenHistory: [{ o: 0, t: 1 }],
      checkpoints: [
        {
          index: 0,
          label: "Draft",
          contentOffset: 10,
          timestamp: "2026-01-01T00:00:03.000Z",
        },
      ],
      metadata: { model: "gpt-4.1" },
      reactions: [{ emoji: "👍", count: 2, userIds: ["user-1", "user-2"] }],
    });
    expect(result.messages[2]).toMatchObject({
      authorName: "System",
      authorAvatarUrl: null,
    });
  });

  it("listAgentChannelMessages rejects negative afterSequence values", async () => {
    const prisma = createMessageServiceClient();

    await expect(
      listAgentChannelMessages(prisma as never, {
        channelId: "channel-1",
        before: null,
        afterSequence: "-1",
        limit: 50,
      }),
    ).rejects.toThrow("after_sequence must be a non-negative integer");
  });

  it("searchServerMessages maps system authors distinctly from deleted users", async () => {
    const prisma = createMessageServiceClient();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: "system-result-1",
        channelId: "channel-1",
        authorId: "system",
        authorType: "SYSTEM",
        content: "The system did a thing",
        highlightedContent: "<mark>system</mark> did a thing",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        channelName: "general",
      },
    ]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.agent.findMany.mockResolvedValue([]);

    const result = await searchServerMessages(prisma as never, {
      serverId: "server-1",
      filters: {
        query: "system",
        channelId: undefined,
        userId: undefined,
        after: undefined,
        before: undefined,
        hasFile: false,
        hasLink: false,
        hasMention: false,
        page: 1,
      },
    });

    expect(result.hasMore).toBe(false);
    expect(result.results[0]).toMatchObject({
      id: "system-result-1",
      authorName: "System",
      authorAvatarUrl: null,
      channelName: "general",
    });
  });
});
