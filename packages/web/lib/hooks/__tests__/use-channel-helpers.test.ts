import { describe, it, expect } from "vitest";
import {
  applyStreamComplete,
  applyStreamError,
  applyStreamThinking,
  applyStreamToolCall,
  applyStreamToolResult,
  buildStreamErrorFallback,
  bufferOrphanStreamToken,
  CAPACITY_EXCEEDED_CONTENT,
  takeBufferedOrphanTokens,
} from "../use-channel";
import type { MessagePayload } from "../use-channel";

// Test fixtures
const makeMsg = (overrides?: Partial<MessagePayload>): MessagePayload => ({
  id: "msg-1",
  channelId: "ch-1",
  authorId: "agent-1",
  authorType: "AGENT",
  authorName: "TestBot",
  authorAvatarUrl: null,
  content: "streaming...",
  type: "STREAMING",
  streamingStatus: "ACTIVE",
  sequence: "1",
  createdAt: "2026-01-01T00:00:00Z",
  reactions: [],
  ...overrides,
});

describe("applyStreamComplete", () => {
  it("updates matching message with final content", () => {
    const msg = makeMsg();
    const result = applyStreamComplete(msg, {
      messageId: "msg-1",
      finalContent: "Hello, world!",
    });
    expect(result.content).toBe("Hello, world!");
    expect(result.streamingStatus).toBe("COMPLETE");
    expect(result.type).toBe("STREAMING");
    expect(result.thinkingPhase).toBeUndefined();
  });

  it("returns unmodified message for non-matching ID", () => {
    const msg = makeMsg();
    const result = applyStreamComplete(msg, {
      messageId: "msg-other",
      finalContent: "Hello!",
    });
    expect(result).toBe(msg); // Same reference
  });

  it("preserves existing thinkingTimeline when payload has none", () => {
    const timeline = [{ phase: "thinking", timestamp: "2026-01-01T00:00:00Z" }];
    const msg = makeMsg({ thinkingTimeline: timeline });
    const result = applyStreamComplete(msg, {
      messageId: "msg-1",
      finalContent: "Done",
    });
    expect(result.thinkingTimeline).toBe(timeline);
  });

  it("replaces thinkingTimeline when payload provides one", () => {
    const newTimeline = [{ phase: "done", timestamp: "2026-01-01T00:01:00Z" }];
    const msg = makeMsg({
      thinkingTimeline: [{ phase: "old", timestamp: "2026-01-01T00:00:00Z" }],
    });
    const result = applyStreamComplete(msg, {
      messageId: "msg-1",
      finalContent: "Done",
      thinkingTimeline: newTimeline,
    });
    expect(result.thinkingTimeline).toBe(newTimeline);
  });

  it("applies metadata from payload", () => {
    const msg = makeMsg();
    const result = applyStreamComplete(msg, {
      messageId: "msg-1",
      finalContent: "Done",
      metadata: { model: "gpt-4", tokens: 100 },
    });
    expect(result.metadata).toEqual({ model: "gpt-4", tokens: 100 });
  });
});

describe("applyStreamError", () => {
  it("uses partialContent when available", () => {
    const msg = makeMsg();
    const result = applyStreamError(msg, {
      messageId: "msg-1",
      error: "timeout",
      partialContent: "partial response",
    });
    expect(result.content).toBe("partial response");
    expect(result.streamingStatus).toBe("ERROR");
  });

  it("falls back to existing content when partialContent is null", () => {
    const msg = makeMsg({ content: "existing content" });
    const result = applyStreamError(msg, {
      messageId: "msg-1",
      error: "timeout",
      partialContent: null,
    });
    expect(result.content).toBe("existing content");
  });

  it("uses error message when no content available", () => {
    const msg = makeMsg({ content: "" });
    const result = applyStreamError(msg, {
      messageId: "msg-1",
      error: "connection lost",
      partialContent: null,
    });
    expect(result.content).toBe("[Error: connection lost]");
  });

  it("clears thinkingPhase", () => {
    const msg = makeMsg({ thinkingPhase: "processing" });
    const result = applyStreamError(msg, {
      messageId: "msg-1",
      error: "failed",
      partialContent: null,
    });
    expect(result.thinkingPhase).toBeUndefined();
  });

  it("returns unmodified message for non-matching ID", () => {
    const msg = makeMsg();
    const result = applyStreamError(msg, {
      messageId: "msg-other",
      error: "fail",
      partialContent: null,
    });
    expect(result).toBe(msg);
  });

  it("uses the terminal capacity copy for capacity errors", () => {
    const msg = makeMsg({ content: "" });
    const result = applyStreamError(msg, {
      messageId: "msg-1",
      error: "capacity",
      partialContent: null,
      code: "CAPACITY_EXCEEDED",
    });
    expect(result.content).toBe(CAPACITY_EXCEEDED_CONTENT);
  });
});

describe("applyStreamThinking", () => {
  it("sets thinking phase", () => {
    const msg = makeMsg();
    const result = applyStreamThinking(msg, {
      messageId: "msg-1",
      phase: "analyzing",
    });
    expect(result.thinkingPhase).toBe("analyzing");
  });

  it("appends to thinkingTimeline", () => {
    const msg = makeMsg({
      thinkingTimeline: [{ phase: "init", timestamp: "2026-01-01T00:00:00Z" }],
    });
    const result = applyStreamThinking(msg, {
      messageId: "msg-1",
      phase: "processing",
      timestamp: "2026-01-01T00:01:00Z",
    });
    expect(result.thinkingTimeline).toHaveLength(2);
    expect(result.thinkingTimeline![1].phase).toBe("processing");
  });

  it("initializes thinkingTimeline when empty", () => {
    const msg = makeMsg();
    const result = applyStreamThinking(msg, {
      messageId: "msg-1",
      phase: "start",
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.thinkingTimeline).toHaveLength(1);
    expect(result.thinkingTimeline![0].phase).toBe("start");
  });

  it("returns unmodified for non-matching ID", () => {
    const msg = makeMsg();
    const result = applyStreamThinking(msg, {
      messageId: "msg-other",
      phase: "think",
    });
    expect(result).toBe(msg);
  });
});

describe("applyStreamToolCall", () => {
  it("adds tool call and sets thinkingPhase", () => {
    const msg = makeMsg();
    const result = applyStreamToolCall(msg, {
      messageId: "msg-1",
      callId: "call-1",
      toolName: "search",
      arguments: { query: "test" },
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.thinkingPhase).toBe("Using search");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].toolName).toBe("search");
  });

  it("appends to existing tool calls", () => {
    const msg = makeMsg({
      toolCalls: [
        {
          callId: "call-0",
          toolName: "read",
          arguments: {},
          timestamp: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const result = applyStreamToolCall(msg, {
      messageId: "msg-1",
      callId: "call-1",
      toolName: "write",
      arguments: { path: "/tmp" },
      timestamp: "2026-01-01T00:01:00Z",
    });
    expect(result.toolCalls).toHaveLength(2);
  });
});

describe("applyStreamToolResult", () => {
  it("adds tool result", () => {
    const msg = makeMsg();
    const result = applyStreamToolResult(msg, {
      messageId: "msg-1",
      callId: "call-1",
      toolName: "search",
      content: "found 3 results",
      isError: false,
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults![0].content).toBe("found 3 results");
    expect(result.toolResults![0].isError).toBe(false);
  });

  it("handles error results", () => {
    const msg = makeMsg();
    const result = applyStreamToolResult(msg, {
      messageId: "msg-1",
      callId: "call-1",
      toolName: "search",
      content: "connection failed",
      isError: true,
      timestamp: "2026-01-01T00:00:00Z",
    });
    expect(result.toolResults![0].isError).toBe(true);
  });
});

describe("buildStreamErrorFallback", () => {
  it("creates error message with stream metadata", () => {
    const result = buildStreamErrorFallback(
      "ch-1",
      { messageId: "msg-1", error: "timeout", partialContent: null },
      {
        agentId: "agent-1",
        agentName: "TestBot",
        agentAvatarUrl: "/avatar.png",
        sequence: "42",
      },
      "1",
    );
    expect(result.id).toBe("msg-1");
    expect(result.channelId).toBe("ch-1");
    expect(result.authorId).toBe("agent-1");
    expect(result.authorName).toBe("TestBot");
    expect(result.content).toBe("[Error: timeout]");
    expect(result.streamingStatus).toBe("ERROR");
    expect(result.sequence).toBe("42");
  });

  it("uses partialContent when available", () => {
    const result = buildStreamErrorFallback(
      "ch-1",
      { messageId: "msg-1", error: "fail", partialContent: "partial" },
      undefined,
      "1",
    );
    expect(result.content).toBe("partial");
  });

  it("uses defaults when no stream metadata", () => {
    const result = buildStreamErrorFallback(
      "ch-1",
      { messageId: "msg-1", error: "fail", partialContent: null },
      undefined,
      "99",
    );
    expect(result.authorId).toBe("");
    expect(result.authorName).toBe("Agent");
    expect(result.sequence).toBe("99");
  });

  it("uses the terminal capacity copy in fallback errors", () => {
    const result = buildStreamErrorFallback(
      "ch-1",
      {
        messageId: "msg-1",
        error: "capacity",
        partialContent: null,
        code: "CAPACITY_EXCEEDED",
      },
      undefined,
      "99",
    );
    expect(result.content).toBe(CAPACITY_EXCEEDED_CONTENT);
  });
});

describe("orphan token buffering", () => {
  it("buffers orphan tokens by message id and replays them", () => {
    const orphanBuffer = new Map();
    bufferOrphanStreamToken(
      orphanBuffer,
      { messageId: "msg-1", token: "Hello", index: 0 },
      1_000,
    );
    bufferOrphanStreamToken(
      orphanBuffer,
      { messageId: "msg-1", token: " world", index: 1 },
      1_500,
    );

    expect(takeBufferedOrphanTokens(orphanBuffer, "msg-1", 2_000)).toEqual([
      { messageId: "msg-1", token: "Hello", index: 0 },
      { messageId: "msg-1", token: " world", index: 1 },
    ]);
    expect(orphanBuffer.has("msg-1")).toBe(false);
  });

  it("expires orphan token buffers after the ttl", () => {
    const orphanBuffer = new Map();
    bufferOrphanStreamToken(
      orphanBuffer,
      { messageId: "msg-1", token: "late", index: 0 },
      1_000,
    );

    expect(takeBufferedOrphanTokens(orphanBuffer, "msg-1", 7_000)).toEqual([]);
    expect(orphanBuffer.has("msg-1")).toBe(false);
  });
});
