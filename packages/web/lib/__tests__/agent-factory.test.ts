import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @prisma/client — agent-factory.ts imports { Prisma } for unique constraint handling
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(
      message: string,
      { code, clientVersion }: { code: string; clientVersion?: string },
    ) {
      super(message);
      this.code = code;
      this.clientVersion = clientVersion || "0.0.0";
      this.name = "PrismaClientKnownRequestError";
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
  };
});

// Mock prisma transaction
const mockAgentCreate = vi.fn();
const mockRegistrationCreate = vi.fn();
const mockChannelFindMany = vi.fn();
const mockChannelAgentCreateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        agent: { create: mockAgentCreate },
        agentRegistration: { create: mockRegistrationCreate },
        channel: { findMany: mockChannelFindMany },
        channelAgent: { createMany: mockChannelAgentCreateMany },
      };
      return fn(tx);
    }),
  },
}));

// Mock ulid
vi.mock("@/lib/ulid", () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => `id-${++counter}`),
  };
});

// Mock internal-auth
vi.mock("@/lib/internal-auth", () => ({
  getInternalBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

import {
  createAgent,
  buildConnectionInfo,
  AgentNameConflictError,
} from "../agent-factory";

describe("createAgent", () => {
  beforeEach(() => {
    mockAgentCreate.mockReset();
    mockRegistrationCreate.mockReset();
    mockChannelFindMany.mockReset();
    mockChannelAgentCreateMany.mockReset();

    mockAgentCreate.mockImplementation(({ data }: any) => ({
      id: data.id,
      name: data.name,
    }));
    mockRegistrationCreate.mockResolvedValue({});
    mockChannelFindMany.mockResolvedValue([]);
  });

  it("returns an API key with sk-tvk- prefix", async () => {
    const result = await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });

    expect(result.apiKey).toMatch(/^sk-tvk-/);
    expect(result.apiKey.length).toBeGreaterThan(10);
  });

  it("stores hash, not raw key", async () => {
    const result = await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });

    const storedHash = mockRegistrationCreate.mock.calls[0][0].data.apiKeyHash;
    expect(storedHash).not.toBe(result.apiKey);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it("creates agent with correct fields", async () => {
    await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
      triggerMode: "ALWAYS",
      systemPrompt: "You are a test bot",
    });

    const agentData = mockAgentCreate.mock.calls[0][0].data;
    expect(agentData.name).toBe("TestBot");
    expect(agentData.serverId).toBe("server-1");
    expect(agentData.connectionMethod).toBe("WEBSOCKET");
    expect(agentData.triggerMode).toBe("ALWAYS");
    expect(agentData.systemPrompt).toBe("You are a test bot");
    expect(agentData.isActive).toBe(true);
  });

  it("defaults triggerMode to MENTION", async () => {
    await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });

    const agentData = mockAgentCreate.mock.calls[0][0].data;
    expect(agentData.triggerMode).toBe("MENTION");
  });

  it("generates webhookSecret only for WEBHOOK method", async () => {
    const webhookResult = await createAgent({
      name: "WebhookBot",
      serverId: "server-1",
      connectionMethod: "WEBHOOK",
      webhookUrl: "https://example.com/hook",
    });
    expect(webhookResult.webhookSecret).toBeDefined();
    expect(webhookResult.webhookSecret!.length).toBe(64); // 32 bytes hex

    const wsResult = await createAgent({
      name: "WSBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });
    expect(wsResult.webhookSecret).toBeUndefined();
  });

  it("auto-assigns agent to all server channels", async () => {
    mockChannelFindMany.mockResolvedValue([
      { id: "ch-1" },
      { id: "ch-2" },
      { id: "ch-3" },
    ]);

    await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });

    expect(mockChannelAgentCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ channelId: "ch-1" }),
        expect.objectContaining({ channelId: "ch-2" }),
        expect.objectContaining({ channelId: "ch-3" }),
      ]),
    });
  });

  it("skips channel assignment when no channels exist", async () => {
    mockChannelFindMany.mockResolvedValue([]);

    await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
    });

    expect(mockChannelAgentCreateMany).not.toHaveBeenCalled();
  });

  it("passes capabilities to registration", async () => {
    await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "WEBSOCKET",
      capabilities: ["chat", "stream"],
    });

    const regData = mockRegistrationCreate.mock.calls[0][0].data;
    expect(regData.capabilities).toEqual(["chat", "stream"]);
  });

  it("throws AgentNameConflictError on duplicate name", async () => {
    const { Prisma } = await import("@prisma/client");
    mockAgentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "0.0.0",
      }),
    );

    await expect(
      createAgent({
        name: "DuplicateBot",
        serverId: "server-1",
        connectionMethod: "WEBSOCKET",
      }),
    ).rejects.toThrow("already exists");
  });

  it("returns connectionMethod in result", async () => {
    const result = await createAgent({
      name: "TestBot",
      serverId: "server-1",
      connectionMethod: "SSE",
    });

    expect(result.connectionMethod).toBe("SSE");
  });
});

describe("buildConnectionInfo", () => {
  it("returns websocketUrl for WEBSOCKET method", () => {
    const info = buildConnectionInfo("agent-1", "WEBSOCKET");
    expect(info.websocketUrl).toBeDefined();
    expect(info.websocketUrl).toContain("/websocket");
  });

  it("returns webhookUrl and webhookSecret for WEBHOOK method", () => {
    const info = buildConnectionInfo("agent-1", "WEBHOOK", {
      webhookUrl: "https://example.com/hook",
      webhookSecret: "secret123",
    });
    expect(info.webhookUrl).toBe("https://example.com/hook");
    expect(info.webhookSecret).toBe("secret123");
  });

  it("returns pollUrl for REST_POLL method", () => {
    const info = buildConnectionInfo("agent-1", "REST_POLL");
    expect(info.pollUrl).toContain("/api/v1/agents/agent-1/messages");
  });

  it("returns eventsUrl for SSE method", () => {
    const info = buildConnectionInfo("agent-1", "SSE");
    expect(info.eventsUrl).toContain("/api/v1/agents/agent-1/events");
  });

  it("returns chatCompletionsUrl and modelsUrl for OPENAI_COMPAT method", () => {
    const info = buildConnectionInfo("agent-1", "OPENAI_COMPAT");
    expect(info.chatCompletionsUrl).toContain("/api/v1/chat/completions");
    expect(info.modelsUrl).toContain("/api/v1/models");
  });

  it("returns inboundWebhookUrl for INBOUND_WEBHOOK method", () => {
    const info = buildConnectionInfo("agent-1", "INBOUND_WEBHOOK");
    expect(info.inboundWebhookUrl).toContain("/api/v1/webhooks/");
  });
});
