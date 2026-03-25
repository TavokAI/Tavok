import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamContext, type PhoenixSocket } from "../stream";

// ---------------------------------------------------------------------------
// Mock socket
// ---------------------------------------------------------------------------

interface PushCall {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  timeout?: number;
}

interface PushNoReplyCall {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

function createMockSocket(messageId = "msg-001") {
  const pushCalls: PushCall[] = [];
  const pushNoReplyCalls: PushNoReplyCall[] = [];

  const socket: PhoenixSocket = {
    push: vi.fn(async (topic, event, payload, timeout) => {
      pushCalls.push({ topic, event, payload, timeout });
      // stream_start returns a messageId
      if (event === "stream_start") {
        return { response: { messageId } };
      }
      return { response: {} };
    }),
    pushNoReply: vi.fn(async (topic, event, payload) => {
      pushNoReplyCalls.push({ topic, event, payload });
    }),
  };

  return { socket, pushCalls, pushNoReplyCalls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StreamContext", () => {
  const channelId = "ch-abc";
  const agentId = "agent-001";
  const agentName = "TestBot";

  let mock: ReturnType<typeof createMockSocket>;
  let ctx: StreamContext;

  beforeEach(() => {
    mock = createMockSocket();
    ctx = new StreamContext(mock.socket, channelId, agentId, agentName);
  });

  // ---- start / token / finish sequence -----------------------------------

  it("should complete a start -> token -> finish lifecycle", async () => {
    await ctx.start();

    expect(ctx.messageId).toBe("msg-001");

    await ctx.token("Hello ");
    await ctx.token("world!");

    await ctx.finish();

    // stream_start was pushed
    expect(mock.pushCalls[0]).toMatchObject({
      topic: `room:${channelId}`,
      event: "stream_start",
      payload: { agentId, agentName },
    });

    // tokens were fire-and-forget
    expect(mock.pushNoReplyCalls).toHaveLength(2);
    expect(mock.pushNoReplyCalls[0].payload).toMatchObject({
      messageId: "msg-001",
      token: "Hello ",
      index: 0,
    });
    expect(mock.pushNoReplyCalls[1].payload).toMatchObject({
      messageId: "msg-001",
      token: "world!",
      index: 1,
    });

    // stream_complete sends finalContent
    const completePush = mock.pushCalls.find((c) => c.event === "stream_complete");
    expect(completePush).toBeDefined();
    expect(completePush!.payload.finalContent).toBe("Hello world!");
  });

  // ---- content accumulation ----------------------------------------------

  it("should accumulate content from all tokens", async () => {
    await ctx.start();
    await ctx.token("a");
    await ctx.token("b");
    await ctx.token("c");

    expect(ctx.content).toBe("abc");
  });

  it("should have empty content before any tokens", async () => {
    await ctx.start();
    expect(ctx.content).toBe("");
  });

  // ---- error path --------------------------------------------------------

  it("should send stream_error with partial content", async () => {
    await ctx.start();
    await ctx.token("partial ");
    await ctx.error("LLM timeout");

    const errorPush = mock.pushCalls.find((c) => c.event === "stream_error");
    expect(errorPush).toBeDefined();
    expect(errorPush!.payload).toMatchObject({
      messageId: "msg-001",
      error: "LLM timeout",
      partialContent: "partial ",
    });
  });

  it("should send empty partialContent when error occurs before tokens", async () => {
    await ctx.start();
    await ctx.error("Immediate failure");

    const errorPush = mock.pushCalls.find((c) => c.event === "stream_error");
    expect(errorPush!.payload.partialContent).toBe("");
  });

  // ---- token before start throws -----------------------------------------

  it("should throw when token is called before start", async () => {
    await expect(ctx.token("oops")).rejects.toThrow("Stream not started");
  });

  // ---- replyTo -----------------------------------------------------------

  it("should include replyTo in stream_start when provided", async () => {
    const ctxWithReply = new StreamContext(
      mock.socket,
      channelId,
      agentId,
      agentName,
      "reply-msg-id",
    );
    await ctxWithReply.start();

    expect(mock.pushCalls[0].payload.replyTo).toBe("reply-msg-id");
  });

  // ---- tool_call / tool_result -------------------------------------------

  it("should send TOOL_CALL and return callId", async () => {
    await ctx.start();
    const callId = await ctx.toolCall("search", { query: "test" });

    expect(callId).toBe("search");

    const toolPush = mock.pushCalls.find(
      (c) => c.event === "typed_message" && (c.payload as Record<string, unknown>).type === "TOOL_CALL",
    );
    expect(toolPush).toBeDefined();
    expect(toolPush!.payload).toMatchObject({
      type: "TOOL_CALL",
      content: {
        callId: "search",
        toolName: "search",
        arguments: { query: "test" },
        status: "running",
      },
    });
  });

  it("should send TOOL_CALL with custom callId and status", async () => {
    await ctx.start();
    const callId = await ctx.toolCall("fetch", { url: "https://example.com" }, {
      callId: "fetch-1",
      status: "pending",
    });

    expect(callId).toBe("fetch-1");

    const toolPush = mock.pushCalls.find(
      (c) => c.event === "typed_message" && (c.payload as Record<string, unknown>).type === "TOOL_CALL",
    );
    expect((toolPush!.payload.content as Record<string, unknown>).callId).toBe("fetch-1");
    expect((toolPush!.payload.content as Record<string, unknown>).status).toBe("pending");
  });

  it("should send TOOL_RESULT payload", async () => {
    await ctx.start();
    await ctx.toolResult("search", { results: [1, 2, 3] }, { durationMs: 42 });

    const resultPush = mock.pushCalls.find(
      (c) => c.event === "typed_message" && (c.payload as Record<string, unknown>).type === "TOOL_RESULT",
    );
    expect(resultPush).toBeDefined();
    expect(resultPush!.payload).toMatchObject({
      type: "TOOL_RESULT",
      content: {
        callId: "search",
        result: { results: [1, 2, 3] },
        error: null,
        durationMs: 42,
      },
    });
  });

  // ---- finish sends finalContent = joined tokens -------------------------

  it("should send finalContent equal to all joined tokens on finish", async () => {
    await ctx.start();
    await ctx.token("The ");
    await ctx.token("quick ");
    await ctx.token("brown ");
    await ctx.token("fox");

    await ctx.finish({ model: "gpt-4" });

    const completePush = mock.pushCalls.find((c) => c.event === "stream_complete");
    expect(completePush!.payload.finalContent).toBe("The quick brown fox");
    expect(completePush!.payload.metadata).toEqual({ model: "gpt-4" });
  });

  // ---- status / thinking -------------------------------------------------

  it("should send stream_thinking event", async () => {
    await ctx.start();
    await ctx.status("Searching", "querying vector DB");

    expect(mock.pushNoReplyCalls[0]).toMatchObject({
      event: "stream_thinking",
      payload: {
        messageId: "msg-001",
        phase: "Searching",
        detail: "querying vector DB",
      },
    });
  });

  // ---- code and artifact -------------------------------------------------

  it("should send CODE_BLOCK typed message", async () => {
    await ctx.start();
    await ctx.code("typescript", "console.log('hi')", { filename: "test.ts" });

    const codePush = mock.pushCalls.find(
      (c) => c.event === "typed_message" && (c.payload as Record<string, unknown>).type === "CODE_BLOCK",
    );
    expect(codePush).toBeDefined();
    expect(codePush!.payload.content).toMatchObject({
      language: "typescript",
      code: "console.log('hi')",
      filename: "test.ts",
    });
  });

  it("should send ARTIFACT typed message", async () => {
    await ctx.start();
    await ctx.artifact("Chart", "<svg></svg>", "svg");

    const artPush = mock.pushCalls.find(
      (c) => c.event === "typed_message" && (c.payload as Record<string, unknown>).type === "ARTIFACT",
    );
    expect(artPush).toBeDefined();
    expect(artPush!.payload.content).toMatchObject({
      artifactType: "svg",
      title: "Chart",
      content: "<svg></svg>",
    });
  });
});
