import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAICompatAgent } from "../openai-compat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index] + "\n\n"));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAICompatAgent", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ---- Non-streaming chat -------------------------------------------------

  it("should return content string for non-streaming chat", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello from the LLM!" } }],
      }),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    const result = await agent.chat("ch-abc", [
      { role: "user", content: "Hi" },
    ]);

    expect(result).toBe("Hello from the LLM!");
  });

  it("should send correct request body with channelId as model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
      apiUrl: "http://tavok.local:3000",
    });

    await agent.chat("ch-abc", [{ role: "user", content: "test" }]);

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://tavok.local:3000/api/v1/chat/completions");

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      model: "ch-abc",
      messages: [{ role: "user", content: "test" }],
      stream: false,
    });
  });

  it("should use custom model when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    await agent.chat("ch-abc", [{ role: "user", content: "test" }], {
      model: "gpt-4",
    });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("gpt-4");
  });

  // ---- Auth header --------------------------------------------------------

  it("should include Bearer auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_secret_key",
      agentId: "agent-001",
    });

    await agent.chat("ch-abc", [{ role: "user", content: "test" }]);

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ak_secret_key");
  });

  // ---- Streaming chat -----------------------------------------------------

  it("should return async iterable for streaming chat", async () => {
    const sseEvents = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "data: [DONE]",
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream(sseEvents),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    const stream = await agent.chat(
      "ch-abc",
      [{ role: "user", content: "Hi" }],
      { stream: true },
    );

    // Collect all yielded chunks
    const chunks: string[] = [];
    for await (const chunk of stream as AsyncIterable<string>) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("should set stream: true in request body for streaming", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSseStream(["data: [DONE]"]),
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    const stream = await agent.chat(
      "ch-abc",
      [{ role: "user", content: "Hi" }],
      { stream: true },
    );

    // Drain the stream
    for await (const _ of stream as AsyncIterable<string>) {
      // consume
    }

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.stream).toBe(true);
  });

  // ---- Error handling -----------------------------------------------------

  it("should throw on non-OK response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    globalThis.fetch = mockFetch;

    const agent = new OpenAICompatAgent({
      apiKey: "ak_test",
      agentId: "agent-001",
    });

    await expect(
      agent.chat("ch-abc", [{ role: "user", content: "test" }]),
    ).rejects.toThrow("Chat request failed: 500 Internal Server Error");
  });
});
