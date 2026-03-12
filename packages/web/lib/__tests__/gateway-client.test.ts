import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Save original env
const originalEnv = { ...process.env };

import {
  broadcastToChannel,
  broadcastMessageNew,
  broadcastStreamStart,
  broadcastStreamToken,
  broadcastStreamComplete,
  broadcastStreamError,
  broadcastTypedMessage,
  fetchChannelSequence,
  type MessageNewPayload,
  type StreamStartPayload,
  type StreamTokenPayload,
  type StreamCompletePayload,
  type StreamErrorPayload,
  type TypedMessagePayload,
} from "../gateway-client";

// Test fixture helpers
const makeMessagePayload = (overrides?: Partial<MessageNewPayload>): MessageNewPayload => ({
  id: "msg-1",
  channelId: "ch-1",
  authorId: "user-1",
  authorType: "USER",
  authorName: "Test User",
  authorAvatarUrl: null,
  content: "hello",
  type: "STANDARD",
  streamingStatus: null,
  sequence: "1",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const makeStreamStart = (overrides?: Partial<StreamStartPayload>): StreamStartPayload => ({
  messageId: "msg-1",
  agentId: "agent-1",
  agentName: "TestBot",
  agentAvatarUrl: null,
  sequence: "1",
  ...overrides,
});

const makeTypedMessage = (overrides?: Partial<TypedMessagePayload>): TypedMessagePayload => ({
  id: "msg-1",
  channelId: "ch-1",
  authorId: "user-1",
  authorType: "USER",
  authorName: "Test User",
  authorAvatarUrl: null,
  content: "hello",
  type: "STANDARD",
  sequence: "1",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("gateway-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.INTERNAL_API_SECRET = "test-secret";
    process.env.GATEWAY_INTERNAL_URL = "http://gateway:4001";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("broadcastToChannel", () => {
    it("sends POST to Gateway broadcast endpoint with correct headers", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await broadcastToChannel("room:ch-1", "message_new", { id: "msg-1" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://gateway:4001/api/internal/broadcast",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": "test-secret",
          },
          body: JSON.stringify({
            topic: "room:ch-1",
            event: "message_new",
            payload: { id: "msg-1" },
          }),
        },
      );
    });

    it("throws when INTERNAL_API_SECRET is not set", async () => {
      delete process.env.INTERNAL_API_SECRET;

      await expect(
        broadcastToChannel("room:ch-1", "message_new", {}),
      ).rejects.toThrow("INTERNAL_API_SECRET is not configured");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws on non-ok response with status details", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("gateway down"),
      });

      await expect(
        broadcastToChannel("room:ch-1", "message_new", {}),
      ).rejects.toThrow("Gateway broadcast failed: 500 Internal Server Error — gateway down");
    });

    it("handles body read failure gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () => Promise.reject(new Error("read error")),
      });

      await expect(
        broadcastToChannel("room:ch-1", "message_new", {}),
      ).rejects.toThrow("Gateway broadcast failed: 503 Service Unavailable — unknown");
    });

    it("uses GATEWAY_WEB_URL fallback when GATEWAY_INTERNAL_URL is not set", async () => {
      delete process.env.GATEWAY_INTERNAL_URL;
      process.env.GATEWAY_WEB_URL = "http://custom-gateway:5000";
      mockFetch.mockResolvedValue({ ok: true });

      await broadcastToChannel("room:ch-1", "test_event", {});

      expect(mockFetch).toHaveBeenCalledWith(
        "http://custom-gateway:5000/api/internal/broadcast",
        expect.any(Object),
      );
    });

    it("uses default URL when no gateway env vars are set", async () => {
      delete process.env.GATEWAY_INTERNAL_URL;
      delete process.env.GATEWAY_WEB_URL;
      mockFetch.mockResolvedValue({ ok: true });

      await broadcastToChannel("room:ch-1", "test_event", {});

      expect(mockFetch).toHaveBeenCalledWith(
        "http://gateway:4001/api/internal/broadcast",
        expect.any(Object),
      );
    });
  });

  describe("broadcast convenience wrappers", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: true });
    });

    it("broadcastMessageNew sends message_new event", async () => {
      const payload = makeMessagePayload();
      await broadcastMessageNew("ch-1", payload);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.topic).toBe("room:ch-1");
      expect(body.event).toBe("message_new");
      expect(body.payload.id).toBe("msg-1");
    });

    it("broadcastStreamStart sends stream_start event", async () => {
      await broadcastStreamStart("ch-1", makeStreamStart());

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe("stream_start");
    });

    it("broadcastStreamToken sends stream_token event", async () => {
      const payload: StreamTokenPayload = { messageId: "msg-1", token: "hello", index: 0 };
      await broadcastStreamToken("ch-1", payload);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe("stream_token");
    });

    it("broadcastStreamComplete sends stream_complete event", async () => {
      const payload: StreamCompletePayload = { messageId: "msg-1", content: "done" };
      await broadcastStreamComplete("ch-1", payload);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe("stream_complete");
    });

    it("broadcastStreamError sends stream_error event", async () => {
      const payload: StreamErrorPayload = { messageId: "msg-1", error: "failed" };
      await broadcastStreamError("ch-1", payload);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe("stream_error");
    });

    it("broadcastTypedMessage sends typed_message event", async () => {
      await broadcastTypedMessage("ch-1", makeTypedMessage());

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe("typed_message");
    });
  });

  describe("fetchChannelSequence", () => {
    it("returns sequence from Gateway", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sequence: 42 }),
      });

      const seq = await fetchChannelSequence("ch-1");

      expect(seq).toBe("42");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://gateway:4001/api/internal/sequence?channelId=ch-1",
        {
          headers: { "x-internal-secret": "test-secret" },
        },
      );
    });

    it("falls back to timestamp when Gateway returns non-ok", async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const seq = await fetchChannelSequence("ch-1");

      // Should be a numeric timestamp string
      expect(Number(seq)).toBeGreaterThan(0);
      expect(Number(seq)).toBeLessThanOrEqual(Date.now());
    });

    it("falls back to timestamp when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));

      const seq = await fetchChannelSequence("ch-1");

      expect(Number(seq)).toBeGreaterThan(0);
    });

    it("uses empty string for secret when not configured", async () => {
      delete process.env.INTERNAL_API_SECRET;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sequence: 1 }),
      });

      await fetchChannelSequence("ch-1");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        {
          headers: { "x-internal-secret": "" },
        },
      );
    });
  });
});
