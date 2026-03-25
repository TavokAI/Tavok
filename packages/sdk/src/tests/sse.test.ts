import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SseAgent } from "../sse";
import type { PollMessage } from "../types";

// ---------------------------------------------------------------------------
// Helpers — mock fetch that returns a ReadableStream simulating SSE
// ---------------------------------------------------------------------------

function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        // Each SSE event ends with a double newline
        controller.enqueue(encoder.encode(events[index] + "\n\n"));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function makePollMessage(overrides: Partial<PollMessage> = {}): PollMessage {
  return {
    id: "evt-1",
    channelId: "ch-abc",
    messageId: "msg-001",
    content: "Hello",
    authorId: "user-1",
    authorName: "Alice",
    authorType: "USER",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SseAgent", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---- connect() ----------------------------------------------------------

  it("should make a GET fetch with correct headers on connect", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([]),
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "ak_test123",
      agentId: "agent-001",
      channelIds: ["ch-abc", "ch-def"],
    });

    await agent.connect();

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:5555/api/v1/agents/agent-001/events?channel_ids=ch-abc,ch-def");
    expect(opts.method).toBe("GET");
    expect(opts.headers).toMatchObject({
      Accept: "text/event-stream",
      Authorization: "Bearer ak_test123",
    });

    agent.disconnect();
  });

  it("should connect without channel_ids query param when none provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([]),
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    await agent.connect();

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:5555/api/v1/agents/agent-001/events");

    agent.disconnect();
  });

  // ---- SSE event parsing --------------------------------------------------

  it("should parse SSE events and dispatch to message handler", async () => {
    const msg = makePollMessage({ content: "test message" });
    const sseEvent = `data: ${JSON.stringify(msg)}`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([sseEvent]),
    });
    globalThis.fetch = mockFetch;

    const received: PollMessage[] = [];
    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    agent.onMessage((m) => {
      received.push(m);
    });

    await agent.connect();

    // Allow the stream to be consumed
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe("test message");
    expect(received[0].channelId).toBe("ch-abc");

    agent.disconnect();
  });

  it("should dispatch to multiple handlers in order", async () => {
    const msg = makePollMessage();
    const sseEvent = `data: ${JSON.stringify(msg)}`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([sseEvent]),
    });
    globalThis.fetch = mockFetch;

    const order: number[] = [];
    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    agent
      .onMessage(() => { order.push(1); })
      .onMessage(() => { order.push(2); });

    await agent.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(order).toEqual([1, 2]);

    agent.disconnect();
  });

  it("should skip malformed SSE data gracefully", async () => {
    const validMsg = makePollMessage({ content: "valid" });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([
        "data: {not valid json",
        `data: ${JSON.stringify(validMsg)}`,
      ]),
    });
    globalThis.fetch = mockFetch;

    const received: PollMessage[] = [];
    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    agent.onMessage((m) => { received.push(m); });

    await agent.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe("valid");

    agent.disconnect();
  });

  // ---- disconnect() -------------------------------------------------------

  it("should abort the connection on disconnect", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([]),
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    await agent.connect();

    // Verify the signal was passed
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect((opts.signal as AbortSignal).aborted).toBe(false);

    agent.disconnect();

    expect((opts.signal as AbortSignal).aborted).toBe(true);
  });

  // ---- send() -------------------------------------------------------------

  it("should POST to the correct messages endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-new", sequence: "42" }),
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
      apiUrl: "http://tavok.local:3000",
    });

    const result = await agent.send("ch-xyz", "Hello world");

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://tavok.local:3000/api/v1/agents/agent-001/messages");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer ak_test",
    });
    expect(JSON.parse(opts.body as string)).toEqual({
      channelId: "ch-xyz",
      content: "Hello world",
    });

    expect(result).toEqual({ messageId: "msg-new", sequence: "42" });
  });

  it("should throw on non-OK send response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    await expect(agent.send("ch-xyz", "test")).rejects.toThrow("Send failed: 403 Forbidden");
  });

  // ---- connect error handling ---------------------------------------------

  it("should throw on non-OK connect response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    globalThis.fetch = mockFetch;

    const agent = new SseAgent({
      apiKey: "bad_key",
      agentId: "agent-001",
    });

    await expect(agent.connect()).rejects.toThrow("SSE connect failed: 401 Unauthorized");
  });
});
