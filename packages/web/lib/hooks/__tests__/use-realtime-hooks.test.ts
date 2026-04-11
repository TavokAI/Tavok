// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessages } from "../useMessages";
import {
  CAPACITY_EXCEEDED_CONTENT,
  CAPACITY_EXCEEDED_HINT,
  useStreaming,
} from "../useStreaming";
import type { MessagePayload, ReactionData } from "../use-channel-types";

class FakePush {
  private receivers = new Map<string, Array<(payload?: unknown) => void>>();

  receive(status: string, callback: (payload?: unknown) => void) {
    const callbacks = this.receivers.get(status) || [];
    callbacks.push(callback);
    this.receivers.set(status, callbacks);
    return this;
  }

  trigger(status: string, payload?: unknown) {
    for (const callback of this.receivers.get(status) || []) {
      callback(payload);
    }
  }
}

class FakeChannel {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();
  pushes: Array<{ event: string; payload: unknown; push: FakePush }> = [];

  on(event: string, callback: (payload: unknown) => void) {
    const callbacks = this.handlers.get(event) || [];
    callbacks.push(callback);
    this.handlers.set(event, callbacks);
  }

  push(event: string, payload: unknown) {
    const push = new FakePush();
    this.pushes.push({ event, payload, push });
    return push;
  }

  emit(event: string, payload: unknown) {
    for (const callback of this.handlers.get(event) || []) {
      callback(payload);
    }
  }
}

function makeMessage(overrides: Partial<MessagePayload> = {}): MessagePayload {
  return {
    id: "message-1",
    channelId: "channel-1",
    authorId: "agent-1",
    authorType: "AGENT",
    authorName: "TestBot",
    authorAvatarUrl: null,
    content: "",
    type: "STANDARD",
    streamingStatus: null,
    sequence: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    reactions: [],
    ...overrides,
  };
}

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
  });
}

function useRealtimeHarness(
  channelId: string | null,
  channelRef: { current: FakeChannel | null },
) {
  const messages = useMessages(channelId, channelRef as never);
  const streaming = useStreaming({
    channelId,
    channelRef: channelRef as never,
    messages: messages.messages,
    addMessages: messages.addMessages,
    setMessages: messages.setMessages,
    setAgentTriggerHint: messages.setAgentTriggerHint,
    lastSequenceRef: messages.lastSequenceRef,
    messageIdsRef: messages.messageIdsRef,
  });

  return {
    ...messages,
    ...streaming,
  };
}

describe("useMessages", () => {
  beforeEach(() => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", ((
      callback: FrameRequestCallback,
    ) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal(
      "cancelAnimationFrame",
      cancelAnimationFrame as typeof globalThis.cancelAnimationFrame,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("deduplicates messages and keeps them ordered by sequence", () => {
    const channelRef = { current: null as FakeChannel | null };
    const { result } = renderHook(() =>
      useMessages("channel-1", channelRef as never),
    );

    act(() => {
      result.current.addMessages([
        makeMessage({ id: "message-2", sequence: "2", content: "second" }),
        makeMessage({ id: "message-1", sequence: "1", content: "first" }),
        makeMessage({ id: "message-2", sequence: "2", content: "duplicate" }),
      ]);
    });

    expect(result.current.messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(result.current.messages[1].content).toBe("second");
    expect(result.current.lastSequenceRef.current).toBe("2");
  });

  it("resolves false and sets a hint when sendMessage times out", async () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useMessages("channel-1", channelRef as never),
    );

    let resolved = false;
    let value: boolean | undefined;
    let sendPromise!: Promise<boolean>;

    act(() => {
      sendPromise = result.current
        .sendMessage("  hello world  ")
        .then((next) => {
          resolved = true;
          value = next;
          return next;
        });
    });

    expect(channel.pushes).toHaveLength(1);
    expect(channel.pushes[0]).toMatchObject({
      event: "new_message",
      payload: { content: "hello world" },
    });

    act(() => {
      channel.pushes[0].push.trigger("timeout");
    });
    await flushMicrotasks();

    expect(resolved).toBe(true);
    expect(value).toBe(false);
    expect(result.current.agentTriggerHint).toBe(
      "Message send failed: request timed out. Please try again.",
    );

    await sendPromise;
  });

  it("releases the history-loading lock after a timeout", async () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useMessages("channel-1", channelRef as never),
    );

    act(() => {
      result.current.addMessages([makeMessage()]);
      result.current.loadHistory();
    });

    expect(result.current.loadingHistoryRef.current).toBe(true);
    expect(
      channel.pushes.filter((push) => push.event === "history"),
    ).toHaveLength(1);

    act(() => {
      channel.pushes[0].push.trigger("timeout");
    });
    await flushMicrotasks();

    expect(result.current.loadingHistoryRef.current).toBe(false);

    act(() => {
      result.current.loadHistory();
    });

    expect(
      channel.pushes.filter((push) => push.event === "history"),
    ).toHaveLength(2);
  });

  it("applies reaction, edit, and delete mutations from channel events", () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useMessages("channel-1", channelRef as never),
    );
    const reactions: ReactionData[] = [
      { emoji: "👍", count: 2, userIds: ["user-1", "user-2"] },
    ];

    act(() => {
      result.current.addMessages([makeMessage({ content: "before" })]);
      result.current.registerMutationHandlers(channel as never, () => true);
      channel.emit("reaction_update", { messageId: "message-1", reactions });
      channel.emit("message_edited", {
        messageId: "message-1",
        content: "after",
        editedAt: "2026-01-01T00:01:00.000Z",
      });
      channel.emit("message_deleted", {
        messageId: "message-1",
        deletedBy: "user-9",
      });
    });

    expect(result.current.messages[0]).toMatchObject({
      content: "after",
      editedAt: "2026-01-01T00:01:00.000Z",
      isDeleted: true,
      reactions,
    });
  });
});

describe("useStreaming", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", ((
      callback: FrameRequestCallback,
    ) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn() as typeof globalThis.cancelAnimationFrame,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("replays orphaned out-of-order tokens after stream_start", async () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useRealtimeHarness("channel-1", channelRef),
    );

    act(() => {
      result.current.registerStreamingHandlers(channel as never, () => true);
      channel.emit("stream_token", {
        messageId: "stream-1",
        token: "world",
        index: 1,
      });
      channel.emit("stream_token", {
        messageId: "stream-1",
        token: "hello ",
        index: 0,
      });
      channel.emit("stream_start", {
        messageId: "stream-1",
        agentId: "agent-1",
        agentName: "TestBot",
        agentAvatarUrl: null,
        sequence: "5",
      });
    });

    await waitFor(() => {
      expect(result.current.messages[0]).toMatchObject({
        id: "stream-1",
        content: "hello world",
        streamingStatus: "ACTIVE",
      });
    });
    expect(result.current.activeStreamCount).toBe(1);
  });

  it("creates a fallback error message and hint when a capacity error arrives first", async () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useRealtimeHarness("channel-1", channelRef),
    );

    act(() => {
      result.current.registerStreamingHandlers(channel as never, () => true);
      channel.emit("stream_error", {
        messageId: "stream-err-1",
        error: "no capacity",
        partialContent: null,
        code: "CAPACITY_EXCEEDED",
      });
    });

    await waitFor(() => {
      expect(result.current.messages[0]).toMatchObject({
        id: "stream-err-1",
        content: CAPACITY_EXCEEDED_CONTENT,
        streamingStatus: "ERROR",
      });
    });
    expect(result.current.agentTriggerHint).toBe(CAPACITY_EXCEEDED_HINT);
  });

  it("marks stale active streams as timed out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T00:00:00.000Z"));

    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useRealtimeHarness("channel-1", channelRef),
    );

    act(() => {
      result.current.registerStreamingHandlers(channel as never, () => true);
      channel.emit("stream_start", {
        messageId: "stream-timeout-1",
        agentId: "agent-1",
        agentName: "TestBot",
        agentAvatarUrl: null,
        sequence: "9",
      });
    });

    act(() => {
      vi.advanceTimersByTime(70_000);
    });

    expect(result.current.messages[0]).toMatchObject({
      id: "stream-timeout-1",
      streamingStatus: "ERROR",
      content: "[Stream timed out]",
    });
  });

  it("deduplicates checkpoints and sends resume requests", () => {
    const channel = new FakeChannel();
    const channelRef = { current: channel };
    const { result } = renderHook(() =>
      useRealtimeHarness("channel-1", channelRef),
    );

    act(() => {
      result.current.registerStreamingHandlers(channel as never, () => true);
      channel.emit("stream_start", {
        messageId: "stream-checkpoint-1",
        agentId: "agent-1",
        agentName: "TestBot",
        agentAvatarUrl: null,
        sequence: "11",
      });
      channel.emit("stream_checkpoint", {
        messageId: "stream-checkpoint-1",
        index: 0,
        label: "Draft",
        contentOffset: 12,
        timestamp: "2026-01-01T00:00:00.000Z",
      });
      channel.emit("stream_checkpoint", {
        messageId: "stream-checkpoint-1",
        index: 0,
        label: "Duplicate",
        contentOffset: 99,
        timestamp: "2026-01-01T00:00:01.000Z",
      });
      result.current.sendResumeStream("stream-checkpoint-1", 0, "agent-1");
    });

    expect(result.current.messages[0].checkpoints).toEqual([
      {
        index: 0,
        label: "Draft",
        contentOffset: 12,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(channel.pushes.at(-1)).toMatchObject({
      event: "stream_resume",
      payload: {
        messageId: "stream-checkpoint-1",
        checkpointIndex: 0,
        agentId: "agent-1",
      },
    });
  });
});
