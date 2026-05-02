import { describe, expect, it } from "vitest";
import {
  MessageType,
  StreamStatus,
  messageFromPayload,
  streamCompleteFromPayload,
  streamErrorFromPayload,
  streamStartFromPayload,
} from "../types";

describe("contract payload helpers", () => {
  it("accepts current message payload fields including typed messages and metadata", () => {
    const msg = messageFromPayload({
      id: "msg-1",
      channelId: "ch-1",
      authorId: "agent-1",
      authorName: "Agent",
      authorType: "AGENT",
      content: "{\"state\":\"thinking\"}",
      type: "STATUS",
      streamingStatus: "ACTIVE",
      sequence: "42",
      createdAt: "2026-03-01T12:00:00.000Z",
      editedAt: null,
      metadata: { model: "gpt-4o" },
      tokenHistory: [{ o: 0, t: 12 }],
      checkpoints: [{ index: 0, label: "start", contentOffset: 0 }],
    });

    expect(MessageType.STATUS).toBe("STATUS");
    expect(StreamStatus.ACTIVE).toBe("ACTIVE");
    expect(msg.type).toBe(MessageType.STATUS);
    expect(msg.streamingStatus).toBe(StreamStatus.ACTIVE);
    expect(msg.metadata).toEqual({ model: "gpt-4o" });
    expect(msg.tokenHistory).toEqual([{ o: 0, t: 12 }]);
    expect(msg.checkpoints).toEqual([
      { index: 0, label: "start", contentOffset: 0 },
    ]);
  });

  it("preserves stream_start status from the durable-first contract", () => {
    const start = streamStartFromPayload({
      messageId: "msg-1",
      agentId: "agent-1",
      agentName: "Agent",
      agentAvatarUrl: null,
      sequence: "43",
      status: "active",
    });

    expect(start.status).toBe("active");
  });

  it("preserves stream terminal metadata and tagged error codes", () => {
    const complete = streamCompleteFromPayload({
      messageId: "msg-1",
      finalContent: "done",
      thinkingTimeline: [{ phase: "Writing", timestamp: "now" }],
      metadata: { provider: "openai", tokensOut: 12 },
    });
    const error = streamErrorFromPayload({
      messageId: "msg-2",
      error: "All stream slots are full",
      partialContent: "partial",
      code: "CAPACITY_EXCEEDED",
    });

    expect(complete.metadata).toEqual({ provider: "openai", tokensOut: 12 });
    expect(error.code).toBe("CAPACITY_EXCEEDED");
  });
});
