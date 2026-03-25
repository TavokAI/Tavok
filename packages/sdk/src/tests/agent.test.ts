import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We can't import Agent directly because its constructor calls
// TavokConfig.discover() and discoverCredentials() which hit the filesystem.
// We mock those modules before importing.
// ---------------------------------------------------------------------------

vi.mock("../config", () => ({
  TavokConfig: {
    discover: vi.fn(() => ({
      url: "http://localhost:5555",
      gatewayUrl: "ws://localhost:4001/socket",
      serverId: null,
      channelId: null,
    })),
  },
}));

vi.mock("../auth", () => ({
  discoverCredentials: vi.fn(() => null),
}));

// Mock the PhoenixSocket class so Agent.start() doesn't open a real WebSocket
const mockConnect = vi.fn(async () => {});
const mockDisconnect = vi.fn(async () => {});
const mockJoin = vi.fn(async () => ({ status: "ok", response: {} }));
const mockLeave = vi.fn(async () => {});
const mockPush = vi.fn(async () => ({ status: "ok", response: {} }));
const mockPushNoReply = vi.fn(async () => {});
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock("../phoenix", () => {
  const MockPhoenixSocket = vi.fn(function (this: Record<string, unknown>) {
    this.connected = true;
    this.connect = mockConnect;
    this.disconnect = mockDisconnect;
    this.join = mockJoin;
    this.leave = mockLeave;
    this.push = mockPush;
    this.pushNoReply = mockPushNoReply;
    this.on = mockOn;
    this.off = mockOff;
  });
  return { PhoenixSocket: MockPhoenixSocket };
});

// Now import the modules under test
import { Agent } from "../agent";
import type { AgentOptions } from "../agent";
import { TavokConfig } from "../config";
import { discoverCredentials } from "../auth";
import { PhoenixSocket } from "../phoenix";
import type { Message } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Message> = {}): Record<string, unknown> {
  return {
    id: "msg-001",
    channelId: "ch-abc",
    authorId: "user-001",
    authorName: "Alice",
    authorType: "USER",
    content: "Hello world",
    type: "STANDARD",
    sequence: "42",
    createdAt: "2026-01-01T00:00:00Z",
    editedAt: null,
    authorAvatarUrl: null,
    streamingStatus: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Agent", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear relevant env vars
    for (const key of ["TAVOK_API_KEY", "TAVOK_AGENT_ID", "TAVOK_URL", "TAVOK_GATEWAY_URL"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // -----------------------------------------------------------------------
  // Credential resolution
  // -----------------------------------------------------------------------

  describe("credential resolution", () => {
    it("should use explicit apiKey and agentId from constructor", () => {
      const agent = new Agent({
        apiKey: "explicit-key",
        agentId: "explicit-id",
        name: "TestBot",
      });

      expect(agent.apiKey).toBe("explicit-key");
      expect(agent.agentId).toBe("explicit-id");
      expect(agent.name).toBe("TestBot");
    });

    it("should fall back to env vars when constructor args not provided", () => {
      process.env.TAVOK_API_KEY = "env-key";
      process.env.TAVOK_AGENT_ID = "env-id";

      const agent = new Agent({ name: "TestBot" });

      expect(agent.apiKey).toBe("env-key");
      expect(agent.agentId).toBe("env-id");
    });

    it("should prefer explicit args over env vars", () => {
      process.env.TAVOK_API_KEY = "env-key";
      process.env.TAVOK_AGENT_ID = "env-id";

      const agent = new Agent({
        apiKey: "explicit-key",
        agentId: "explicit-id",
      });

      expect(agent.apiKey).toBe("explicit-key");
      expect(agent.agentId).toBe("explicit-id");
    });

    it("should fall back to discoverCredentials when no key in args or env", () => {
      vi.mocked(discoverCredentials).mockReturnValueOnce({
        id: "discovered-id",
        name: "DiscoverBot",
        apiKey: "discovered-key",
        connectionMethod: "websocket",
      });

      const agent = new Agent({ name: "DiscoverBot" });

      expect(discoverCredentials).toHaveBeenCalledWith("DiscoverBot");
      expect(agent.apiKey).toBe("discovered-key");
      expect(agent.agentId).toBe("discovered-id");
    });

    it("should not call discoverCredentials when apiKey is provided", () => {
      const agent = new Agent({ apiKey: "my-key", name: "Bot" });

      expect(discoverCredentials).not.toHaveBeenCalled();
      expect(agent.apiKey).toBe("my-key");
    });

    it("should use default name 'Tavok Agent' when none provided", () => {
      const agent = new Agent({ apiKey: "key" });

      expect(agent.name).toBe("Tavok Agent");
    });

    it("should use TavokConfig.discover() for topology", () => {
      const agent = new Agent({ apiKey: "key" });

      expect(TavokConfig.discover).toHaveBeenCalled();
      // Agent was created without errors using the mocked config
      expect(agent).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  describe("handler registration", () => {
    it("onMention should return `this` for chaining", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent.onMention(async () => {});

      expect(result).toBe(agent);
    });

    it("onMessage should return `this` for chaining", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent.onMessage(async () => {});

      expect(result).toBe(agent);
    });

    it("onStreamStart should return `this` for chaining", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent.onStreamStart(async () => {});

      expect(result).toBe(agent);
    });

    it("onStreamComplete should return `this` for chaining", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent.onStreamComplete(async () => {});

      expect(result).toBe(agent);
    });

    it("onStreamError should return `this` for chaining", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent.onStreamError(async () => {});

      expect(result).toBe(agent);
    });

    it("should support fluent chaining of multiple handlers", () => {
      const agent = new Agent({ apiKey: "key" });
      const result = agent
        .onMention(async () => {})
        .onMessage(async () => {})
        .onStreamStart(async () => {})
        .onStreamComplete(async () => {})
        .onStreamError(async () => {});

      expect(result).toBe(agent);
    });
  });

  // -----------------------------------------------------------------------
  // start / stop lifecycle
  // -----------------------------------------------------------------------

  describe("lifecycle", () => {
    it("start() should throw when no API key is available", async () => {
      const agent = new Agent({ name: "NoKey" });

      await expect(agent.start()).rejects.toThrow("No API key found");
    });

    it("start() should connect the socket and join channels", async () => {
      const agent = new Agent({
        apiKey: "key",
        agentId: "agent-001",
        channelIds: ["ch-1", "ch-2"],
      });

      await agent.start();

      expect(PhoenixSocket).toHaveBeenCalledWith(
        "ws://localhost:4001/socket/socket/websocket",
        { api_key: "key" },
      );
      expect(mockConnect).toHaveBeenCalledOnce();
      expect(mockJoin).toHaveBeenCalledTimes(2);
      expect(mockJoin).toHaveBeenCalledWith("room:ch-1", {});
      expect(mockJoin).toHaveBeenCalledWith("room:ch-2", {});
    });

    it("start() should register event handlers on the socket", async () => {
      const agent = new Agent({ apiKey: "key" });

      await agent.start();

      // Should register handlers for message_new, stream_start, stream_complete, stream_error
      const registeredEvents = mockOn.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain("message_new");
      expect(registeredEvents).toContain("stream_start");
      expect(registeredEvents).toContain("stream_complete");
      expect(registeredEvents).toContain("stream_error");
    });

    it("stop() should disconnect the socket", async () => {
      const agent = new Agent({ apiKey: "key" });

      await agent.start();
      await agent.stop();

      expect(mockDisconnect).toHaveBeenCalledOnce();
      expect(agent.connected).toBe(false);
    });

    it("connected should reflect socket state", async () => {
      const agent = new Agent({ apiKey: "key" });

      expect(agent.connected).toBe(false);

      await agent.start();
      // The mock socket has connected = true
      expect(agent.connected).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // joinChannel / leaveChannel
  // -----------------------------------------------------------------------

  describe("joinChannel / leaveChannel", () => {
    it("joinChannel should join with topic room:{channelId}", async () => {
      const agent = new Agent({ apiKey: "key" });
      await agent.start();

      await agent.joinChannel("ch-new");

      expect(mockJoin).toHaveBeenCalledWith("room:ch-new", {});
    });

    it("joinChannel should pass lastSequence if tracked", async () => {
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      await agent.start();

      // Simulate receiving a message that sets a sequence
      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      await messageNewHandler("room:ch-abc", makeMessage({ sequence: "99" }));

      // Now join that channel -- should include lastSequence
      await agent.joinChannel("ch-abc");

      expect(mockJoin).toHaveBeenCalledWith("room:ch-abc", {
        lastSequence: "99",
      });
    });

    it("leaveChannel should leave with topic room:{channelId}", async () => {
      const agent = new Agent({ apiKey: "key" });
      await agent.start();

      await agent.leaveChannel("ch-old");

      expect(mockLeave).toHaveBeenCalledWith("room:ch-old");
    });

    it("joinChannel should throw if not connected", async () => {
      const agent = new Agent({ apiKey: "key" });

      await expect(agent.joinChannel("ch-1")).rejects.toThrow(
        "Agent not connected",
      );
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe("send", () => {
    it("should push new_message to the correct topic", async () => {
      const agent = new Agent({ apiKey: "key" });
      await agent.start();

      await agent.send("ch-abc", "Hello!");

      expect(mockPush).toHaveBeenCalledWith("room:ch-abc", "new_message", {
        content: "Hello!",
      });
    });

    it("should throw when not connected", async () => {
      const agent = new Agent({ apiKey: "key" });

      await expect(agent.send("ch-abc", "Hello!")).rejects.toThrow(
        "Agent not connected",
      );
    });

    it("should track sequence from response", async () => {
      mockPush.mockResolvedValueOnce({
        status: "ok",
        response: { id: "msg-123", sequence: "50" },
      });

      const agent = new Agent({ apiKey: "key" });
      await agent.start();

      await agent.send("ch-abc", "Hello!");

      // Now joining the channel should include lastSequence
      await agent.joinChannel("ch-abc");
      expect(mockJoin).toHaveBeenCalledWith("room:ch-abc", {
        lastSequence: "50",
      });
    });
  });

  // -----------------------------------------------------------------------
  // stream()
  // -----------------------------------------------------------------------

  describe("stream", () => {
    it("should return a StreamContext", async () => {
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      await agent.start();

      const ctx = agent.stream("ch-abc");

      // StreamContext should exist and not be started yet
      expect(ctx).toBeDefined();
      expect(ctx.messageId).toBeUndefined();
    });

    it("should pass replyTo to StreamContext", async () => {
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      await agent.start();

      const ctx = agent.stream("ch-abc", { replyTo: "msg-999" });

      // We can verify by starting the stream and checking the push
      // The StreamContext constructor stores replyTo internally
      expect(ctx).toBeDefined();
    });

    it("should throw when not connected", () => {
      const agent = new Agent({ apiKey: "key" });

      expect(() => agent.stream("ch-abc")).toThrow("Agent not connected");
    });
  });

  // -----------------------------------------------------------------------
  // Mention detection
  // -----------------------------------------------------------------------

  describe("mention detection", () => {
    it("should invoke onMention handler when message contains <@agentId>", async () => {
      const mentionHandler = vi.fn();
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMention(mentionHandler);

      await agent.start();

      // Get the registered message_new handler
      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Dispatch a message that mentions the agent
      await messageNewHandler(
        "room:ch-abc",
        makeMessage({ content: "Hey <@agent-001> what's up?" }),
      );

      expect(mentionHandler).toHaveBeenCalledOnce();
      expect(mentionHandler.mock.calls[0][0].content).toBe(
        "Hey <@agent-001> what's up?",
      );
    });

    it("should NOT invoke onMention when message does not mention agent", async () => {
      const mentionHandler = vi.fn();
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMention(mentionHandler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      await messageNewHandler(
        "room:ch-abc",
        makeMessage({ content: "Hello everyone" }),
      );

      expect(mentionHandler).not.toHaveBeenCalled();
    });

    it("should NOT invoke handlers for own messages", async () => {
      const messageHandler = vi.fn();
      const mentionHandler = vi.fn();
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMessage(messageHandler);
      agent.onMention(mentionHandler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Message from the agent itself
      await messageNewHandler(
        "room:ch-abc",
        makeMessage({
          authorId: "agent-001",
          content: "I said <@agent-001>",
        }),
      );

      expect(messageHandler).not.toHaveBeenCalled();
      expect(mentionHandler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onMessage handler
  // -----------------------------------------------------------------------

  describe("onMessage", () => {
    it("should invoke onMessage handler for every non-self message", async () => {
      const handler = vi.fn();
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMessage(handler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      await messageNewHandler("room:ch-abc", makeMessage());

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].id).toBe("msg-001");
    });
  });

  // -----------------------------------------------------------------------
  // Handler exceptions don't crash
  // -----------------------------------------------------------------------

  describe("handler error isolation", () => {
    it("should not crash when onMessage handler throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badHandler = vi.fn(() => {
        throw new Error("handler exploded");
      });
      const goodHandler = vi.fn();

      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMessage(badHandler);
      agent.onMessage(goodHandler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Should not throw
      await messageNewHandler("room:ch-abc", makeMessage());

      expect(badHandler).toHaveBeenCalled();
      // The second handler should still be called
      expect(goodHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should not crash when onMention handler throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badHandler = vi.fn(() => {
        throw new Error("mention handler exploded");
      });

      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMention(badHandler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Should not throw even though the handler does
      await messageNewHandler(
        "room:ch-abc",
        makeMessage({ content: "Hey <@agent-001>" }),
      );

      expect(badHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should not crash when onStreamStart handler throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badHandler = vi.fn(() => {
        throw new Error("stream start handler exploded");
      });

      const agent = new Agent({ apiKey: "key" });
      agent.onStreamStart(badHandler);

      await agent.start();

      const streamStartHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "stream_start",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Should not throw
      await streamStartHandler("room:ch-abc", {
        messageId: "msg-001",
        agentId: "other-agent",
        agentName: "Other",
        sequence: "1",
      });

      expect(badHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should not crash when async handler rejects", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badHandler = vi.fn(async () => {
        throw new Error("async handler exploded");
      });

      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      agent.onMessage(badHandler);

      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      // Should not throw
      await messageNewHandler("room:ch-abc", makeMessage());

      expect(badHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Sequence tracking
  // -----------------------------------------------------------------------

  describe("sequence tracking", () => {
    it("should track sequences from incoming messages", async () => {
      const agent = new Agent({ apiKey: "key", agentId: "agent-001" });
      await agent.start();

      const messageNewHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === "message_new",
      )?.[1] as (topic: string, payload: Record<string, unknown>) => void;

      await messageNewHandler(
        "room:ch-abc",
        makeMessage({ sequence: "100" }),
      );

      // Join should pass lastSequence
      await agent.joinChannel("ch-abc");
      expect(mockJoin).toHaveBeenCalledWith("room:ch-abc", {
        lastSequence: "100",
      });
    });
  });
});
