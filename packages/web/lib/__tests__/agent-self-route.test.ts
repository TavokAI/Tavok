// @ts-nocheck -- focused route test with partial service mocks.
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateAgentById,
  mockDeleteRegisteredAgent,
  mockGetRegisteredAgent,
  mockUpdateRegisteredAgent,
} = vi.hoisted(() => ({
  mockAuthenticateAgentById: vi.fn(),
  mockDeleteRegisteredAgent: vi.fn(),
  mockGetRegisteredAgent: vi.fn(),
  mockUpdateRegisteredAgent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/agent-auth", () => ({
  authenticateAgentById: mockAuthenticateAgentById,
}));
vi.mock("@/lib/services/AgentService", () => ({
  deleteRegisteredAgent: mockDeleteRegisteredAgent,
  getRegisteredAgent: mockGetRegisteredAgent,
  updateRegisteredAgent: mockUpdateRegisteredAgent,
}));

import { PATCH } from "@/app/api/v1/agents/[id]/route";

describe("PATCH /api/v1/agents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateAgentById.mockResolvedValue({ authorized: true });
    mockUpdateRegisteredAgent.mockResolvedValue(undefined);
  });

  it("does not let an agent self-edit capabilities or lifecycle guardrails", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/v1/agents/agent-1", {
        method: "PATCH",
        headers: {
          authorization: "Bearer sk-tvk-test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Helpful Bot",
          capabilities: ["agents:trigger"],
          isGuest: false,
          expiresAt: null,
          revokedAt: null,
        }),
      }) as any,
      { params: Promise.resolve({ id: "agent-1" }) },
    );

    expect(response.status).toBe(200);
    const updateInput = mockUpdateRegisteredAgent.mock.calls[0][1];
    expect(updateInput).toEqual({
      id: "agent-1",
      displayName: "Helpful Bot",
      avatarUrl: undefined,
      healthUrl: undefined,
      webhookUrl: undefined,
      maxTokensSec: undefined,
    });
    expect(updateInput).not.toHaveProperty("capabilities");
    expect(updateInput).not.toHaveProperty("isGuest");
    expect(updateInput).not.toHaveProperty("expiresAt");
    expect(updateInput).not.toHaveProperty("revokedAt");
  });
});
