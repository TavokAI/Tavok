import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RestAgent, RestStream } from "../rest";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

type FetchFn = typeof globalThis.fetch;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(responseBody: unknown = {}, status = 200) {
  const calls: FetchCall[] = [];

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => responseBody,
    } as Response;
  }) as unknown as FetchFn;

  return { fn, calls };
}

// ---------------------------------------------------------------------------
// RestAgent Tests
// ---------------------------------------------------------------------------

describe("RestAgent", () => {
  const apiUrl = "http://localhost:5555";
  const apiKey = "sk-tvk-test-key";
  const agentId = "agent-001";

  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---- poll() -----------------------------------------------------------

  describe("poll()", () => {
    it("should build correct URL with default query params", async () => {
      const { fn, calls } = mockFetch({ messages: [] });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await agent.poll();

      expect(calls).toHaveLength(1);
      const url = new URL(calls[0].url);
      expect(url.pathname).toBe("/api/v1/agents/agent-001/messages");
      expect(url.searchParams.get("limit")).toBe("50");
      expect(url.searchParams.get("ack")).toBe("true");
      expect(url.searchParams.has("wait")).toBe(false);
      expect(url.searchParams.has("channel_id")).toBe(false);
    });

    it("should include optional query params when provided", async () => {
      const { fn, calls } = mockFetch({ messages: [] });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await agent.poll({ channelId: "ch-abc", limit: 10, ack: false, wait: 15 });

      const url = new URL(calls[0].url);
      expect(url.searchParams.get("channel_id")).toBe("ch-abc");
      expect(url.searchParams.get("limit")).toBe("10");
      expect(url.searchParams.get("ack")).toBe("false");
      expect(url.searchParams.get("wait")).toBe("15");
    });

    it("should cap wait at 30 seconds", async () => {
      const { fn, calls } = mockFetch({ messages: [] });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await agent.poll({ wait: 60 });

      const url = new URL(calls[0].url);
      expect(url.searchParams.get("wait")).toBe("30");
    });

    it("should send Bearer auth header", async () => {
      const { fn, calls } = mockFetch({ messages: [] });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await agent.poll();

      const headers = calls[0].init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-tvk-test-key");
    });

    it("should return PollMessage array from response", async () => {
      const messages = [
        {
          id: "pm-1",
          channelId: "ch-abc",
          messageId: "msg-1",
          content: "Hello",
          authorId: "user-1",
          authorName: "Alice",
          authorType: "USER",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      const { fn } = mockFetch({ messages });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      const result = await agent.poll();

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello");
      expect(result[0].channelId).toBe("ch-abc");
    });

    it("should throw on non-ok response", async () => {
      const { fn } = mockFetch({}, 500);
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await expect(agent.poll()).rejects.toThrow("Poll failed");
    });
  });

  // ---- send() -----------------------------------------------------------

  describe("send()", () => {
    it("should POST correct body", async () => {
      const { fn, calls } = mockFetch({ messageId: "msg-1", sequence: "1" });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      await agent.send("ch-abc", "Hello world");

      expect(calls).toHaveLength(1);
      const url = new URL(calls[0].url);
      expect(url.pathname).toBe("/api/v1/agents/agent-001/messages");
      expect(calls[0].init?.method).toBe("POST");

      const body = JSON.parse(calls[0].init?.body as string);
      expect(body).toEqual({ channelId: "ch-abc", content: "Hello world" });
    });

    it("should return response JSON", async () => {
      const { fn } = mockFetch({ messageId: "msg-1", sequence: "42" });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      const result = await agent.send("ch-abc", "test");

      expect(result.messageId).toBe("msg-1");
      expect(result.sequence).toBe("42");
    });
  });

  // ---- startStream() ----------------------------------------------------

  describe("startStream()", () => {
    it("should POST to streams endpoint and return RestStream", async () => {
      const { fn, calls } = mockFetch({ messageId: "stream-msg-1" });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      const stream = await agent.startStream("ch-abc");

      expect(stream).toBeInstanceOf(RestStream);
      expect(stream.messageId).toBe("stream-msg-1");

      const url = new URL(calls[0].url);
      expect(url.pathname).toBe("/api/v1/agents/agent-001/streams");

      const body = JSON.parse(calls[0].init?.body as string);
      expect(body).toEqual({ channelId: "ch-abc" });
    });
  });

  // ---- close() ----------------------------------------------------------

  describe("close()", () => {
    it("should reject calls after close", async () => {
      const { fn } = mockFetch({});
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiUrl, apiKey, agentId });
      agent.close();

      await expect(agent.poll()).rejects.toThrow("RestAgent is closed");
      await expect(agent.send("ch", "hi")).rejects.toThrow("RestAgent is closed");
      await expect(agent.startStream("ch")).rejects.toThrow("RestAgent is closed");
    });
  });

  // ---- default apiUrl ---------------------------------------------------

  describe("default apiUrl", () => {
    it("should use http://localhost:5555 when apiUrl is not provided", async () => {
      const { fn, calls } = mockFetch({ messages: [] });
      globalThis.fetch = fn;

      const agent = new RestAgent({ apiKey, agentId });
      await agent.poll();

      expect(calls[0].url).toContain("http://localhost:5555");
    });
  });
});

// ---------------------------------------------------------------------------
// RestStream Tests
// ---------------------------------------------------------------------------

describe("RestStream", () => {
  const apiUrl = "http://localhost:5555";
  const apiKey = "sk-tvk-test-key";
  const agentId = "agent-001";
  const messageId = "stream-msg-1";

  let originalFetch: FetchFn;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should POST token to correct endpoint with index", async () => {
    const { fn, calls } = mockFetch({});
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await stream.token("Hello ");
    await stream.token("world!");

    expect(calls).toHaveLength(2);

    const url0 = new URL(calls[0].url);
    expect(url0.pathname).toBe(
      "/api/v1/agents/agent-001/streams/stream-msg-1/tokens",
    );
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      token: "Hello ",
      index: 0,
    });

    expect(JSON.parse(calls[1].init?.body as string)).toEqual({
      token: "world!",
      index: 1,
    });
  });

  it("should POST thinking to correct endpoint", async () => {
    const { fn, calls } = mockFetch({});
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await stream.thinking("Searching", "querying vector DB");

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(
      "/api/v1/agents/agent-001/streams/stream-msg-1/thinking",
    );
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      phase: "Searching",
      detail: "querying vector DB",
    });
  });

  it("should POST complete to correct endpoint", async () => {
    const { fn, calls } = mockFetch({});
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await stream.complete("Final answer", { model: "gpt-4" });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(
      "/api/v1/agents/agent-001/streams/stream-msg-1/complete",
    );
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      finalContent: "Final answer",
      metadata: { model: "gpt-4" },
    });
  });

  it("should POST error to correct endpoint", async () => {
    const { fn, calls } = mockFetch({});
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await stream.error("LLM timeout", "partial content here");

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(
      "/api/v1/agents/agent-001/streams/stream-msg-1/error",
    );
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      error: "LLM timeout",
      partialContent: "partial content here",
    });
  });

  it("should throw on non-ok response from token()", async () => {
    const { fn } = mockFetch({}, 500);
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await expect(stream.token("fail")).rejects.toThrow("Stream token failed");
  });

  it("should send Bearer auth header", async () => {
    const { fn, calls } = mockFetch({});
    globalThis.fetch = fn;

    const stream = new RestStream(apiUrl, apiKey, agentId, messageId);
    await stream.token("test");

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-tvk-test-key");
  });
});
