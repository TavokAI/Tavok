// @ts-nocheck -- route tests use partial Prisma mocks
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockAuthenticateAgentRequest,
  mockVerifyAgentChannelAccess,
  mockBroadcastMessageNew,
  mockFetchChannelSequence,
  mockGetInternalBaseUrl,
  mockGenerateId,
  mockFetch,
} = vi.hoisted(() => {
  return {
    mockPrisma: {
      message: {
        findMany: vi.fn(),
      },
    },
    mockAuthenticateAgentRequest: vi.fn(),
    mockVerifyAgentChannelAccess: vi.fn(),
    mockBroadcastMessageNew: vi.fn(),
    mockFetchChannelSequence: vi.fn(),
    mockGetInternalBaseUrl: vi.fn(),
    mockGenerateId: vi.fn(),
    mockFetch: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agent-auth", () => ({
  authenticateAgentRequest: mockAuthenticateAgentRequest,
}));
vi.mock("@/lib/agent-channel-acl", () => ({
  verifyAgentChannelAccess: mockVerifyAgentChannelAccess,
}));
vi.mock("@/lib/gateway-client", () => ({
  broadcastMessageNew: mockBroadcastMessageNew,
  fetchChannelSequence: mockFetchChannelSequence,
}));
vi.mock("@/lib/internal-auth", () => ({
  getInternalBaseUrl: mockGetInternalBaseUrl,
}));
vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

import { POST } from "@/app/api/v1/chat/completions/route";

const agentAuth = {
  agentId: "agent-1",
  agentName: "SDK Agent",
  agentAvatarUrl: null,
  serverId: "server-1",
  capabilities: [],
  connectionMethod: "SSE",
};

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer sk-tvk-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/v1/chat/completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    vi.stubGlobal("fetch", mockFetch);

    process.env.INTERNAL_API_SECRET = "internal-secret";
    delete process.env.COMPLETIONS_TIMEOUT_MS;

    mockAuthenticateAgentRequest.mockResolvedValue(agentAuth);
    mockVerifyAgentChannelAccess.mockResolvedValue({
      ok: true,
      channelId: "channel-1",
    });
    mockFetchChannelSequence.mockResolvedValue("42");
    mockGetInternalBaseUrl.mockReturnValue("http://internal.test");
    mockFetch.mockResolvedValue({ ok: true, status: 201 });

    let generatedIds = 0;
    mockGenerateId.mockImplementation(() => {
      generatedIds += 1;
      return generatedIds === 1 ? "user-msg-1" : "completion-1";
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.COMPLETIONS_TIMEOUT_MS;
    delete process.env.INTERNAL_API_SECRET;
  });

  it("returns a non-streaming completion after persisting and polling for an agent reply", async () => {
    mockPrisma.message.findMany.mockResolvedValueOnce([
      {
        content: "Hello from Tavok",
        metadata: { tokensIn: 11, tokensOut: 7 },
      },
    ]);

    const responsePromise = POST(
      makeRequest({
        model: "tavok-channel-channel-1",
        messages: [{ role: "user", content: "hello tavok" }],
      }),
    );

    await vi.advanceTimersByTimeAsync(500);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "chatcmpl-completion-1",
      object: "chat.completion",
      model: "tavok-channel-channel-1",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello from Tavok",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://internal.test/api/internal/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-internal-secret": "internal-secret",
        }),
      }),
    );
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toMatchObject(
      {
        id: "user-msg-1",
        channelId: "channel-1",
        authorId: "agent-1",
        authorType: "AGENT",
        content: "hello tavok",
        type: "STANDARD",
        sequence: "42",
      },
    );
    expect(mockBroadcastMessageNew).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({
        id: "user-msg-1",
        authorId: "agent-1",
        authorName: "SDK Agent",
        content: "hello tavok",
        sequence: "42",
      }),
    );
  });

  it("returns a timeout error when no agent response arrives before the deadline", async () => {
    process.env.COMPLETIONS_TIMEOUT_MS = "1000";
    mockPrisma.message.findMany.mockResolvedValue([]);

    const responsePromise = POST(
      makeRequest({
        model: "tavok-channel-channel-1",
        messages: [{ role: "user", content: "still waiting?" }],
      }),
    );

    await vi.advanceTimersByTimeAsync(1000);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "timeout",
        message: "No response received within timeout",
      },
    });
    expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(2);
  });

  it("returns SSE chunks for streaming completions once a reply is found", async () => {
    mockPrisma.message.findMany.mockResolvedValueOnce([
      {
        content: "streamed reply",
        metadata: { tokensIn: 3, tokensOut: 2 },
      },
    ]);

    const responsePromise = POST(
      makeRequest({
        model: "tavok-channel-channel-1",
        stream: true,
        messages: [{ role: "user", content: "stream please" }],
      }),
    );

    await vi.advanceTimersByTimeAsync(500);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const body = await response.text();
    expect(body).toContain('"object":"chat.completion.chunk"');
    expect(body).toContain('"delta":{"role":"assistant","content":""}');
    expect(body).toContain('"delta":{"content":"streamed reply"}');
    expect(body).toContain('"finish_reason":"stop"');
    expect(body).toContain("data: [DONE]");
  });
});
