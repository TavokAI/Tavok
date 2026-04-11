import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogAgentAction, mockBuildConnectionInfo, mockCreateAgent } =
  vi.hoisted(() => ({
    mockLogAgentAction: vi.fn(),
    mockBuildConnectionInfo: vi.fn(),
    mockCreateAgent: vi.fn(),
  }));

vi.mock("@/lib/agent-audit", () => ({
  logAgentAction: mockLogAgentAction,
}));

vi.mock("@/lib/agent-factory", () => ({
  AgentNameConflictError: class AgentNameConflictError extends Error {},
  buildConnectionInfo: mockBuildConnectionInfo,
  createAgent: mockCreateAgent,
}));

import {
  bootstrapCreateAgent,
  getRegisteredAgent,
  updateRegisteredAgent,
} from "@/lib/services/AgentService";

describe("AgentService", () => {
  beforeEach(() => {
    mockLogAgentAction.mockReset();
    mockBuildConnectionInfo.mockReset();
    mockCreateAgent.mockReset();
  });

  it("getRegisteredAgent returns null when the registration row is missing", async () => {
    const prisma = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          agentRegistration: null,
        }),
      },
    };

    await expect(
      getRegisteredAgent(prisma as never, "agent-1"),
    ).resolves.toBeNull();
  });

  it("updateRegisteredAgent updates only provided fields and logs the change", async () => {
    const tx = {
      agent: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      agentRegistration: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({ serverId: "server-1" }),
      },
      agentRegistration: {
        update: vi.fn(),
      },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      ),
    };

    await updateRegisteredAgent(prisma as never, {
      id: "agent-1",
      displayName: "Renamed Agent",
      capabilities: ["stream", "tools"],
    });

    expect(mockLogAgentAction).toHaveBeenCalledWith({
      agentId: "agent-1",
      serverId: "server-1",
      action: "agent_update",
      metadata: {
        fields: ["displayName", "capabilities"],
      },
    });
    expect(tx.agent.update).toHaveBeenCalledWith({
      where: { id: "agent-1" },
      data: { name: "Renamed Agent" },
    });
    expect(tx.agentRegistration.update).toHaveBeenCalledWith({
      where: { agentId: "agent-1" },
      data: { capabilities: ["stream", "tools"] },
    });
  });

  it("bootstrapCreateAgent merges createAgent output with connection info", async () => {
    mockCreateAgent.mockResolvedValue({
      agent: { id: "agent-1", name: "Planner" },
      apiKey: "sk-tvk-123",
      connectionMethod: "WEBHOOK",
      webhookSecret: "secret-1",
    });
    mockBuildConnectionInfo.mockReturnValue({
      webhookUrl: "https://example.com/webhook",
      webhookSecret: "secret-1",
    });

    const result = await bootstrapCreateAgent({
      name: "Planner",
      serverId: "server-1",
      connectionMethod: "WEBHOOK",
      webhookUrl: "https://example.com/webhook",
      channelIds: ["channel-1"],
    });

    expect(mockCreateAgent).toHaveBeenCalledWith({
      name: "Planner",
      serverId: "server-1",
      connectionMethod: "WEBHOOK",
      webhookUrl: "https://example.com/webhook",
      channelIds: ["channel-1"],
    });
    expect(mockBuildConnectionInfo).toHaveBeenCalledWith("agent-1", "WEBHOOK", {
      webhookUrl: "https://example.com/webhook",
      webhookSecret: "secret-1",
    });
    expect(result).toEqual({
      id: "agent-1",
      name: "Planner",
      apiKey: "sk-tvk-123",
      serverId: "server-1",
      connectionMethod: "WEBHOOK",
      webhookUrl: "https://example.com/webhook",
      webhookSecret: "secret-1",
    });
  });
});
