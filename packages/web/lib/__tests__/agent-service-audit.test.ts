// @ts-nocheck - service tests use focused Prisma delegate fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogAgentAction } = vi.hoisted(() => ({
  mockLogAgentAction: vi.fn(),
}));

vi.mock("@/lib/agent-audit", () => ({
  logAgentAction: mockLogAgentAction,
}));

import {
  deleteRegisteredAgent,
  updateRegisteredAgent,
} from "../services/AgentService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentService audit logging", () => {
  it("records update audit only after the registration update succeeds", async () => {
    const operations: string[] = [];
    mockLogAgentAction.mockImplementation(async () => {
      operations.push("audit");
    });

    const tx = {
      agent: {
        update: vi.fn(async () => {
          operations.push("agent.update");
        }),
      },
      agentRegistration: {
        update: vi.fn(async () => {
          operations.push("registration.update");
        }),
      },
    };
    const prismaClient = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({ serverId: "server-1" }),
      },
      agentRegistration: {},
      $transaction: vi.fn(async (callback) => {
        operations.push("transaction.start");
        await callback(tx);
        operations.push("transaction.done");
      }),
    };

    await updateRegisteredAgent(prismaClient, {
      id: "agent-1",
      displayName: "Updated",
      capabilities: ["history:read"],
    });

    expect(operations).toEqual([
      "transaction.start",
      "agent.update",
      "registration.update",
      "transaction.done",
      "audit",
    ]);
    expect(mockLogAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_update",
        agentId: "agent-1",
        serverId: "server-1",
      }),
    );
  });

  it("does not record update audit when the mutation fails", async () => {
    const prismaClient = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({ serverId: "server-1" }),
      },
      agentRegistration: {},
      $transaction: vi.fn(async () => {
        throw new Error("write failed");
      }),
    };

    await expect(
      updateRegisteredAgent(prismaClient, {
        id: "agent-1",
        displayName: "Updated",
      }),
    ).rejects.toThrow("write failed");

    expect(mockLogAgentAction).not.toHaveBeenCalled();
  });

  it("does not record deregistration audit when delete fails", async () => {
    const prismaClient = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({ serverId: "server-1" }),
        delete: vi.fn(async () => {
          throw new Error("delete failed");
        }),
      },
    };

    await expect(
      deleteRegisteredAgent(prismaClient, "agent-1"),
    ).rejects.toThrow("delete failed");

    expect(mockLogAgentAction).not.toHaveBeenCalled();
  });
});
