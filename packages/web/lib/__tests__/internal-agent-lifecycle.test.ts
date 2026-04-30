import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockDecrypt, mockPersistMessage, mockBroadcastMessageNew } =
  vi.hoisted(() => ({
    mockPrisma: {
      agentMessage: {
        create: vi.fn(),
      },
      agentRegistration: {
        findUnique: vi.fn(),
      },
      channel: {
        findUnique: vi.fn(),
      },
      channelAgent: {
        findMany: vi.fn(),
      },
    },
    mockDecrypt: vi.fn(() => "decrypted-key"),
    mockPersistMessage: vi.fn(),
    mockBroadcastMessageNew: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/encryption", () => ({ decrypt: mockDecrypt }));
vi.mock("@/lib/internal-auth", () => ({
  validateInternalSecret: vi.fn(() => true),
}));
vi.mock("@/lib/ulid", () => ({
  generateId: vi.fn(() => "generated-id"),
}));
vi.mock("@/lib/internal-api-client", () => ({
  persistMessage: mockPersistMessage,
  startStreamPlaceholder: vi.fn(),
}));
vi.mock("@/lib/gateway-client", () => ({
  broadcastMessageNew: mockBroadcastMessageNew,
  broadcastStreamStart: vi.fn(),
  broadcastStreamToken: vi.fn(),
  fetchChannelSequence: vi.fn(async () => "1"),
}));

import { POST as dispatchAgent } from "@/app/api/internal/agents/[agentId]/dispatch/route";
import { POST as enqueueAgent } from "@/app/api/internal/agents/[agentId]/enqueue/route";
import { GET as listChannelAgents } from "@/app/api/internal/channels/[channelId]/agents/route";

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    name: "Agent One",
    avatarUrl: null,
    llmProvider: "openai",
    llmModel: "gpt-5.5",
    apiEndpoint: "https://api.openai.com/v1/chat/completions",
    apiKeyEncrypted: "encrypted",
    systemPrompt: "Help.",
    temperature: 0.7,
    maxTokens: 4096,
    triggerMode: "MENTION",
    thinkingSteps: null,
    isActive: true,
    agentRegistration: null,
    ...overrides,
  };
}

function makeRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": "test",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("internal agent lifecycle gates", () => {
  it("omits revoked registered agents from the Gateway channel agent list", async () => {
    mockPrisma.channelAgent.findMany.mockResolvedValueOnce([
      { agent: makeAgent({ id: "byok-agent" }) },
      {
        agent: makeAgent({
          id: "revoked-agent",
          agentRegistration: {
            capabilities: ["history:read"],
            connectionMethod: "WEBHOOK",
            expiresAt: null,
            isGuest: true,
            revokedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        }),
      },
    ]);

    const response = await listChannelAgents(
      makeRequest("http://localhost/api/internal/channels/channel-1/agents"),
      { params: Promise.resolve({ channelId: "channel-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      agents: [{ id: "byok-agent" }],
    });
    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it("rejects outbound webhook dispatch for expired registrations before calling the webhook", async () => {
    mockPrisma.agentRegistration.findUnique.mockResolvedValueOnce({
      webhookUrl: "https://agent.example/webhook",
      webhookSecret: null,
      webhookTimeout: 30000,
      capabilities: ["history:read", "messages:send"],
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      isGuest: true,
      revokedAt: null,
      agent: {
        name: "Guest Agent",
        avatarUrl: null,
        isActive: true,
      },
    });

    const response = await dispatchAgent(
      makeRequest("http://localhost/api/internal/agents/agent-1/dispatch", {
        channelId: "channel-1",
        triggerMessageId: "message-1",
        triggerContent: "hello",
      }),
      { params: Promise.resolve({ agentId: "agent-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Agent registration is expired",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects queued poll delivery when the agent cannot read channel history", async () => {
    mockPrisma.agentRegistration.findUnique.mockResolvedValueOnce({
      capabilities: [],
      expiresAt: null,
      isGuest: true,
      revokedAt: null,
      agent: {
        isActive: true,
      },
    });

    const response = await enqueueAgent(
      makeRequest("http://localhost/api/internal/agents/agent-1/enqueue", {
        channelId: "channel-1",
        messageId: "message-1",
        content: "hello",
      }),
      { params: Promise.resolve({ agentId: "agent-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Missing capability: history:read",
    });
    expect(mockPrisma.agentMessage.create).not.toHaveBeenCalled();
  });

  it("rejects sync webhook responses when the agent cannot send messages", async () => {
    mockPrisma.agentRegistration.findUnique.mockResolvedValueOnce({
      webhookUrl: "https://agent.example/webhook",
      webhookSecret: null,
      webhookTimeout: 30000,
      capabilities: ["history:read"],
      expiresAt: null,
      isGuest: true,
      revokedAt: null,
      agent: {
        name: "Guest Agent",
        avatarUrl: null,
        isActive: true,
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ content: "agent reply" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await dispatchAgent(
      makeRequest("http://localhost/api/internal/agents/agent-1/dispatch", {
        channelId: "channel-1",
        triggerMessageId: "message-1",
        triggerContent: "hello",
      }),
      { params: Promise.resolve({ agentId: "agent-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Missing capability: messages:send",
    });
    expect(mockPersistMessage).not.toHaveBeenCalled();
    expect(mockBroadcastMessageNew).not.toHaveBeenCalled();
  });
});
