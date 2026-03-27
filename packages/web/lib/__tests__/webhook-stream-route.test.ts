import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockBroadcastStreamComplete,
  mockBroadcastStreamError,
  mockBroadcastStreamToken,
  mockBroadcastToChannel,
  mockCompleteStream,
  mockFailStream,
} = vi.hoisted(() => ({
  mockPrisma: {
    inboundWebhook: {
      findUnique: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
    },
  },
  mockBroadcastStreamComplete: vi.fn(),
  mockBroadcastStreamError: vi.fn(),
  mockBroadcastStreamToken: vi.fn(),
  mockBroadcastToChannel: vi.fn(),
  mockCompleteStream: vi.fn(),
  mockFailStream: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/gateway-client", () => ({
  broadcastStreamComplete: mockBroadcastStreamComplete,
  broadcastStreamError: mockBroadcastStreamError,
  broadcastStreamToken: mockBroadcastStreamToken,
  broadcastToChannel: mockBroadcastToChannel,
}));

vi.mock("@/lib/internal-api-client", () => ({
  completeStream: mockCompleteStream,
  failStream: mockFailStream,
}));

import { POST } from "@/app/api/v1/webhooks/[token]/stream/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/webhooks/token/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/v1/webhooks/[token]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.inboundWebhook.findUnique.mockResolvedValue({
      channelId: "channel-1",
      agentId: "agent-1",
      isActive: true,
    });

    mockPrisma.message.findUnique.mockResolvedValue({
      id: "message-1",
      channelId: "channel-1",
      authorId: "agent-1",
      streamingStatus: "ACTIVE",
      isDeleted: false,
    });

    mockBroadcastStreamComplete.mockResolvedValue(undefined);
    mockBroadcastStreamError.mockResolvedValue(undefined);
    mockBroadcastStreamToken.mockResolvedValue(undefined);
    mockBroadcastToChannel.mockResolvedValue(undefined);
    mockCompleteStream.mockResolvedValue({
      id: "message-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "done",
      type: "STREAMING",
      streamingStatus: "COMPLETE",
      sequence: "1",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    mockFailStream.mockResolvedValue({
      id: "message-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "*[Error: Agent failed]*",
      type: "STREAMING",
      streamingStatus: "ERROR",
      sequence: "1",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  });

  it("preserves object metadata on completion for broadcast and persistence", async () => {
    const metadata = {
      model: "claude-sonnet-4-20250514",
      tokensOut: 843,
      latencyMs: 2300,
    };

    const response = await POST(
      makeRequest({
        messageId: "message-1",
        done: true,
        finalContent: "done",
        metadata,
      }),
      {
        params: Promise.resolve({ token: "whk_test" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      completed: true,
      tokensReceived: 0,
      nextTokenOffset: 0,
    });

    expect(mockBroadcastStreamComplete).toHaveBeenCalledWith("channel-1", {
      messageId: "message-1",
      finalContent: "done",
      metadata,
    });

    expect(mockCompleteStream).toHaveBeenCalledWith("message-1", {
      content: "done",
      metadata,
    });
  });

  it("does not emit stream_complete when the durable COMPLETE transition fails", async () => {
    mockCompleteStream.mockRejectedValueOnce(new Error("write failed"));

    const response = await POST(
      makeRequest({
        messageId: "message-1",
        done: true,
        finalContent: "done",
      }),
      {
        params: Promise.resolve({ token: "whk_test" }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to process stream",
    });

    expect(mockCompleteStream).toHaveBeenCalledWith("message-1", {
      content: "done",
    });
    expect(mockBroadcastStreamComplete).not.toHaveBeenCalled();
  });

  it("does not emit stream_error when the durable ERROR transition fails", async () => {
    mockFailStream.mockRejectedValueOnce(new Error("write failed"));

    const response = await POST(
      makeRequest({
        messageId: "message-1",
        error: "Agent failed",
      }),
      {
        params: Promise.resolve({ token: "whk_test" }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to process stream",
    });

    expect(mockFailStream).toHaveBeenCalledWith("message-1", {
      content: "*[Error: Agent failed]*",
    });
    expect(mockBroadcastStreamError).not.toHaveBeenCalled();
  });

  it("rejects non-object metadata before broadcasting or persisting", async () => {
    const response = await POST(
      makeRequest({
        messageId: "message-1",
        done: true,
        finalContent: "done",
        metadata: '{"model":"bad"}',
      }),
      {
        params: Promise.resolve({ token: "whk_test" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "metadata must be a JSON object when provided",
    });

    expect(mockBroadcastStreamComplete).not.toHaveBeenCalled();
    expect(mockCompleteStream).not.toHaveBeenCalled();
    expect(mockFailStream).not.toHaveBeenCalled();
  });
});
