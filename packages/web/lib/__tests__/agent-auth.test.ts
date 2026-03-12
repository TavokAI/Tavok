import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock prisma
const mockFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    agentRegistration: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import {
  authenticateAgentRequest,
  authenticateAgentKey,
  authenticateAgentById,
} from "../agent-auth";

function createMockRequest(headers: Record<string, string> = {}): any {
  return {
    headers: {
      get(name: string) {
        return headers[name] ?? null;
      },
    },
  };
}

const TEST_API_KEY = "sk-tvk-test-key-abc123";
const TEST_API_KEY_HASH = crypto
  .createHash("sha256")
  .update(TEST_API_KEY)
  .digest("hex");

const MOCK_REGISTRATION = {
  agentId: "agent-1",
  capabilities: ["chat", "stream"],
  connectionMethod: "WEBSOCKET",
  agent: {
    id: "agent-1",
    name: "TestBot",
    avatarUrl: "https://example.com/avatar.png",
    serverId: "server-1",
    isActive: true,
  },
};

describe("authenticateAgentRequest", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("returns agent info for valid Bearer token", async () => {
    mockFindFirst.mockResolvedValue(MOCK_REGISTRATION);

    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentRequest(req);

    expect(result).toEqual({
      agentId: "agent-1",
      agentName: "TestBot",
      agentAvatarUrl: "https://example.com/avatar.png",
      serverId: "server-1",
      capabilities: ["chat", "stream"],
      connectionMethod: "WEBSOCKET",
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { apiKeyHash: TEST_API_KEY_HASH },
      select: expect.objectContaining({
        agentId: true,
        capabilities: true,
        connectionMethod: true,
      }),
    });
  });

  it("returns null when authorization header is missing", async () => {
    const req = createMockRequest({});
    const result = await authenticateAgentRequest(req);
    expect(result).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when authorization header has wrong prefix", async () => {
    const req = createMockRequest({ authorization: "Basic abc123" });
    const result = await authenticateAgentRequest(req);
    expect(result).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when key does not start with sk-tvk-", async () => {
    const req = createMockRequest({ authorization: "Bearer sk-other-key" });
    const result = await authenticateAgentRequest(req);
    expect(result).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when registration not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentRequest(req);
    expect(result).toBeNull();
  });

  it("returns null when agent is inactive", async () => {
    mockFindFirst.mockResolvedValue({
      ...MOCK_REGISTRATION,
      agent: { ...MOCK_REGISTRATION.agent, isActive: false },
    });
    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentRequest(req);
    expect(result).toBeNull();
  });

  it("handles null capabilities gracefully", async () => {
    mockFindFirst.mockResolvedValue({
      ...MOCK_REGISTRATION,
      capabilities: null,
    });
    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentRequest(req);
    expect(result?.capabilities).toEqual([]);
  });

  it("handles null avatarUrl", async () => {
    mockFindFirst.mockResolvedValue({
      ...MOCK_REGISTRATION,
      agent: { ...MOCK_REGISTRATION.agent, avatarUrl: null },
    });
    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentRequest(req);
    expect(result?.agentAvatarUrl).toBeNull();
  });
});

describe("authenticateAgentKey", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("returns agent info for valid API key", async () => {
    mockFindFirst.mockResolvedValue(MOCK_REGISTRATION);
    const result = await authenticateAgentKey(TEST_API_KEY);

    expect(result).toEqual({
      agentId: "agent-1",
      agentName: "TestBot",
      agentAvatarUrl: "https://example.com/avatar.png",
      serverId: "server-1",
      capabilities: ["chat", "stream"],
      connectionMethod: "WEBSOCKET",
    });
  });

  it("returns null for key without sk-tvk- prefix", async () => {
    const result = await authenticateAgentKey("invalid-key");
    expect(result).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when registration not found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await authenticateAgentKey(TEST_API_KEY);
    expect(result).toBeNull();
  });
});

describe("authenticateAgentById", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("returns authorized for valid key matching agentId", async () => {
    mockFindFirst.mockResolvedValue({
      id: "reg-1",
      agent: { isActive: true },
    });

    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentById(req, "agent-1");

    expect(result).toEqual({ authorized: true });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { apiKeyHash: TEST_API_KEY_HASH, agentId: "agent-1" },
      select: { id: true, agent: { select: { isActive: true } } },
    });
  });

  it("returns 401 when authorization header is missing", async () => {
    const req = createMockRequest({});
    const result = await authenticateAgentById(req, "agent-1");

    expect(result).toEqual({
      authorized: false,
      error: "Missing Authorization header",
      status: 401,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when key does not start with sk-tvk-", async () => {
    const req = createMockRequest({
      authorization: "Bearer sk-other-key",
    });
    const result = await authenticateAgentById(req, "agent-1");

    expect(result).toEqual({
      authorized: false,
      error: "Invalid API key",
      status: 401,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when registration not found (wrong agentId)", async () => {
    mockFindFirst.mockResolvedValue(null);

    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentById(req, "wrong-agent");

    expect(result).toEqual({
      authorized: false,
      error: "Invalid API key",
      status: 401,
    });
  });

  it("returns 403 when agent is inactive", async () => {
    mockFindFirst.mockResolvedValue({
      id: "reg-1",
      agent: { isActive: false },
    });

    const req = createMockRequest({
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const result = await authenticateAgentById(req, "agent-1");

    expect(result).toEqual({
      authorized: false,
      error: "Agent is inactive",
      status: 403,
    });
  });

  it("returns 401 for Bearer without sk-tvk- prefix", async () => {
    const req = createMockRequest({
      authorization: "Bearer regular-api-key",
    });
    const result = await authenticateAgentById(req, "agent-1");

    expect(result).toEqual({
      authorized: false,
      error: "Invalid API key",
      status: 401,
    });
  });
});
