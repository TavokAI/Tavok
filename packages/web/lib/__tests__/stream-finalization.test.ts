import { describe, expect, it, vi } from "vitest";
import {
  finalizeStreamCompletion,
  finalizeStreamError,
} from "../stream-finalization";

describe("finalizeStreamCompletion", () => {
  it("persists COMPLETE before broadcasting stream_complete", async () => {
    const callOrder: string[] = [];
    const broadcastStreamCompleteFn = vi.fn().mockImplementation(async () => {
      callOrder.push("broadcast");
    });
    const completeStreamFn = vi.fn().mockImplementation(async () => {
      callOrder.push("persist");
      return {
        id: "message-0",
        channelId: "channel-0",
        authorId: "agent-0",
        authorType: "AGENT",
        content: "done",
        type: "STREAMING",
        streamingStatus: "COMPLETE",
        sequence: "1",
        metadata: null,
        thinkingTimeline: null,
        tokenHistory: null,
        checkpoints: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    });

    await finalizeStreamCompletion({
      channelId: "channel-0",
      messageId: "message-0",
      finalContent: "done",
      broadcastStreamCompleteFn,
      completeStreamFn,
    });

    expect(callOrder).toEqual(["persist", "broadcast"]);
  });

  it("uses the same metadata object for broadcast and persistence", async () => {
    const broadcastStreamCompleteFn = vi.fn().mockResolvedValue(undefined);
    const completeStreamFn = vi.fn().mockResolvedValue({
      id: "message-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      content: "done",
      type: "STREAMING",
      streamingStatus: "COMPLETE",
      sequence: "2",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    const metadata = {
      model: "claude-sonnet-4-20250514",
      tokensOut: 843,
      latencyMs: 2300,
    };

    await finalizeStreamCompletion({
      channelId: "channel-1",
      messageId: "message-1",
      finalContent: "done",
      metadata,
      broadcastStreamCompleteFn,
      completeStreamFn,
    });

    expect(broadcastStreamCompleteFn).toHaveBeenCalledWith("channel-1", {
      messageId: "message-1",
      finalContent: "done",
      metadata,
    });

    expect(completeStreamFn).toHaveBeenCalledWith("message-1", {
      content: "done",
      metadata,
    });
  });

  it("broadcasts null metadata and omits persistence metadata when absent", async () => {
    const broadcastStreamCompleteFn = vi.fn().mockResolvedValue(undefined);
    const completeStreamFn = vi.fn().mockResolvedValue({
      id: "message-2",
      channelId: "channel-2",
      authorId: "agent-2",
      authorType: "AGENT",
      content: "done",
      type: "STREAMING",
      streamingStatus: "COMPLETE",
      sequence: "3",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    await finalizeStreamCompletion({
      channelId: "channel-2",
      messageId: "message-2",
      finalContent: "done",
      broadcastStreamCompleteFn,
      completeStreamFn,
    });

    expect(broadcastStreamCompleteFn).toHaveBeenCalledWith("channel-2", {
      messageId: "message-2",
      finalContent: "done",
      metadata: null,
    });

    expect(completeStreamFn).toHaveBeenCalledWith("message-2", {
      content: "done",
    });
  });
});

describe("finalizeStreamError", () => {
  it("persists ERROR before broadcasting stream_error", async () => {
    const callOrder: string[] = [];
    const broadcastStreamErrorFn = vi.fn().mockImplementation(async () => {
      callOrder.push("broadcast");
    });
    const failStreamFn = vi.fn().mockImplementation(async () => {
      callOrder.push("persist");
      return {
        id: "message-e0",
        channelId: "channel-e0",
        authorId: "agent-e0",
        authorType: "AGENT",
        content: "*[Error: boom]*",
        type: "STREAMING",
        streamingStatus: "ERROR",
        sequence: "4",
        metadata: null,
        thinkingTimeline: null,
        tokenHistory: null,
        checkpoints: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    });

    await finalizeStreamError({
      channelId: "channel-e0",
      messageId: "message-e0",
      error: "boom",
      broadcastStreamErrorFn,
      failStreamFn,
    });

    expect(callOrder).toEqual(["persist", "broadcast"]);
  });

  it("uses the provided partial content for persistence and broadcast", async () => {
    const broadcastStreamErrorFn = vi.fn().mockResolvedValue(undefined);
    const failStreamFn = vi.fn().mockResolvedValue({
      id: "message-e1",
      channelId: "channel-e1",
      authorId: "agent-e1",
      authorType: "AGENT",
      content: "partial draft",
      type: "STREAMING",
      streamingStatus: "ERROR",
      sequence: "5",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    await finalizeStreamError({
      channelId: "channel-e1",
      messageId: "message-e1",
      error: "boom",
      partialContent: "partial draft",
      broadcastStreamErrorFn,
      failStreamFn,
    });

    expect(failStreamFn).toHaveBeenCalledWith("message-e1", {
      content: "partial draft",
    });

    expect(broadcastStreamErrorFn).toHaveBeenCalledWith("channel-e1", {
      messageId: "message-e1",
      error: "boom",
      partialContent: "partial draft",
    });
  });

  it("falls back to a durable error placeholder when no partial content exists", async () => {
    const broadcastStreamErrorFn = vi.fn().mockResolvedValue(undefined);
    const failStreamFn = vi.fn().mockResolvedValue({
      id: "message-e2",
      channelId: "channel-e2",
      authorId: "agent-e2",
      authorType: "AGENT",
      content: "*[Error: boom]*",
      type: "STREAMING",
      streamingStatus: "ERROR",
      sequence: "6",
      metadata: null,
      thinkingTimeline: null,
      tokenHistory: null,
      checkpoints: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    await finalizeStreamError({
      channelId: "channel-e2",
      messageId: "message-e2",
      error: "boom",
      broadcastStreamErrorFn,
      failStreamFn,
    });

    expect(failStreamFn).toHaveBeenCalledWith("message-e2", {
      content: "*[Error: boom]*",
    });

    expect(broadcastStreamErrorFn).toHaveBeenCalledWith("channel-e2", {
      messageId: "message-e2",
      error: "boom",
      partialContent: null,
    });
  });
});
