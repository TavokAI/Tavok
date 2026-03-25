import { describe, it, expect, vi, afterEach } from "vitest";
import { InboundWebhookClient } from "../inbound-webhook";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InboundWebhookClient", () => {
  const originalFetch = globalThis.fetch;
  const webhookUrl = "https://tavok.example.com/api/v1/webhooks/whk_abc123";

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ---- send() body --------------------------------------------------------

  it("should POST correct body to the webhook URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-001", sequence: "1" }),
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);
    await client.send("Hello from webhook!");

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(webhookUrl);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({
      "Content-Type": "application/json",
    });

    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ content: "Hello from webhook!" });
  });

  it("should include username and avatarUrl when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-002", sequence: "2" }),
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);
    await client.send("Test", {
      username: "WebhookBot",
      avatarUrl: "https://example.com/avatar.png",
    });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toEqual({
      content: "Test",
      username: "WebhookBot",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("should not include optional fields when not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-003", sequence: "3" }),
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);
    await client.send("Just content");

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ content: "Just content" });
    expect(body).not.toHaveProperty("username");
    expect(body).not.toHaveProperty("avatarUrl");
  });

  // ---- Response parsing ---------------------------------------------------

  it("should return messageId and sequence from response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-456", sequence: "99" }),
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);
    const result = await client.send("test");

    expect(result).toEqual({
      messageId: "msg-456",
      sequence: "99",
    });
  });

  // ---- No auth header -----------------------------------------------------

  it("should not include an Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-1", sequence: "1" }),
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);
    await client.send("test");

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
  });

  // ---- Error handling -----------------------------------------------------

  it("should throw on non-OK response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    globalThis.fetch = mockFetch;

    const client = new InboundWebhookClient(webhookUrl);

    await expect(client.send("test")).rejects.toThrow(
      "Webhook send failed: 404 Not Found",
    );
  });
});
