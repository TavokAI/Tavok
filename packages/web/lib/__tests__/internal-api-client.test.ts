import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock getInternalBaseUrl before importing the module under test
vi.mock("@/lib/internal-auth", () => ({
  getInternalBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  completeStream,
  failStream,
  persistMessage,
  startStreamPlaceholder,
  updateMessage,
} from "../internal-api-client";

const TEST_SECRET = "test-internal-secret";

describe("persistMessage", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = TEST_SECRET;
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it("sends POST to /api/internal/messages with correct headers", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const data = {
      id: "msg-1",
      channelId: "ch-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "Hello",
      type: "STANDARD",
      sequence: "1",
    };

    await persistMessage(data);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/internal/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": TEST_SECRET,
        },
        body: JSON.stringify(data),
      },
    );
  });

  it("does not throw on 409 (duplicate)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 409 });

    await expect(
      persistMessage({
        id: "msg-1",
        channelId: "ch-1",
        authorId: "agent-1",
        authorType: "AGENT",
        content: "Hello",
        type: "STANDARD",
        sequence: "1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws on non-409 error responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(
      persistMessage({
        id: "msg-1",
        channelId: "ch-1",
        authorId: "agent-1",
        authorType: "AGENT",
        content: "Hello",
        type: "STANDARD",
        sequence: "1",
      }),
    ).rejects.toThrow("Message persistence failed: 500 Internal Server Error");
  });

  it("handles error body read failure gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error("read failed")),
    });

    await expect(
      persistMessage({
        id: "msg-1",
        channelId: "ch-1",
        authorId: "agent-1",
        authorType: "AGENT",
        content: "Hello",
        type: "STANDARD",
        sequence: "1",
      }),
    ).rejects.toThrow("Message persistence failed: 502 unknown");
  });

  it("uses empty string when INTERNAL_API_SECRET is not set", async () => {
    delete process.env.INTERNAL_API_SECRET;
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await persistMessage({
      id: "msg-1",
      channelId: "ch-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "Hello",
      type: "STANDARD",
      sequence: "1",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-internal-secret": "",
        }),
      }),
    );
  });
});

describe("updateMessage", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = TEST_SECRET;
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it("sends PUT to /api/internal/messages/{messageId}", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const data = { content: "Updated content", streamingStatus: "COMPLETE" };
    await updateMessage("msg-123", data);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/internal/messages/msg-123",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": TEST_SECRET,
        },
        body: JSON.stringify(data),
      },
    );
  });

  it("throws on error responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });

    await expect(updateMessage("msg-123", { content: "x" })).rejects.toThrow(
      "Message update failed: 404 Not Found",
    );
  });

  it("handles error body read failure gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("read failed")),
    });

    await expect(updateMessage("msg-123", { content: "x" })).rejects.toThrow(
      "Message update failed: 500 unknown",
    );
  });
});

describe("stream lifecycle calls", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = TEST_SECRET;
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it("sends POST to /api/internal/streams/start", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "msg-1",
          streamingStatus: "ACTIVE",
          sequence: "42",
        }),
    });

    const data = {
      id: "msg-1",
      channelId: "ch-1",
      authorId: "agent-1",
      authorType: "AGENT",
      sequence: "42",
    };

    await expect(startStreamPlaceholder(data)).resolves.toMatchObject({
      id: "msg-1",
      streamingStatus: "ACTIVE",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/internal/streams/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": TEST_SECRET,
        },
        body: JSON.stringify(data),
      },
    );
  });

  it("sends POST to /api/internal/streams/{messageId}/complete", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "msg-1",
          streamingStatus: "COMPLETE",
          content: "done",
        }),
    });

    const data = { content: "done" };
    await expect(completeStream("msg-1", data)).resolves.toMatchObject({
      id: "msg-1",
      streamingStatus: "COMPLETE",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/internal/streams/msg-1/complete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": TEST_SECRET,
        },
        body: JSON.stringify(data),
      },
    );
  });

  it("sends POST to /api/internal/streams/{messageId}/error", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "msg-1",
          streamingStatus: "ERROR",
          content: "*[Error]*",
        }),
    });

    const data = { content: "*[Error]*" };
    await expect(failStream("msg-1", data)).resolves.toMatchObject({
      id: "msg-1",
      streamingStatus: "ERROR",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/internal/streams/msg-1/error",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": TEST_SECRET,
        },
        body: JSON.stringify(data),
      },
    );
  });
});
