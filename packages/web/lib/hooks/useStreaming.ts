"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Channel } from "phoenix";
import { compareSequences } from "@/lib/api-safety";
import type {
  MessagePayload,
  PendingStreamMeta,
} from "./use-channel-types";

export const CAPACITY_EXCEEDED_CONTENT =
  "[All agents are busy right now. Please try again in a moment.]";
export const CAPACITY_EXCEEDED_HINT =
  "All agents are busy right now. Try again in a moment.";
export const STREAM_ORPHAN_TOKEN_TTL_MS = 5000;

export interface StreamTokenPayload {
  messageId: string;
  token: string;
  index: number;
}

export interface OrphanTokenBufferEntry {
  tokens: StreamTokenPayload[];
  timestamp: number;
}

export interface UseStreamingOptions {
  channelId: string | null;
  channelRef: MutableRefObject<Channel | null>;
  messages: MessagePayload[];
  addMessages: (messages: MessagePayload[], prepend?: boolean) => void;
  setMessages: Dispatch<SetStateAction<MessagePayload[]>>;
  setAgentTriggerHint: Dispatch<SetStateAction<string | null>>;
  lastSequenceRef: MutableRefObject<string>;
  messageIdsRef: MutableRefObject<Set<string>>;
}

export interface UseStreamingResult {
  activeStreamCount: number;
  registerStreamingHandlers: (channel: Channel, mounted: () => boolean) => void;
  sendResumeStream: (
    messageId: string,
    checkpointIndex: number,
    agentId: string,
  ) => void;
}

export function applyStreamComplete(
  message: MessagePayload,
  payload: {
    messageId: string;
    finalContent: string;
    thinkingTimeline?: Array<{ phase: string; timestamp: string }>;
    metadata?: Record<string, unknown>;
  },
): MessagePayload {
  if (message.id !== payload.messageId) return message;
  return {
    ...message,
    content: payload.finalContent,
    streamingStatus: "COMPLETE",
    type: "STREAMING",
    thinkingPhase: undefined,
    thinkingTimeline: payload.thinkingTimeline || message.thinkingTimeline,
    metadata: payload.metadata || message.metadata,
  };
}

export function applyStreamError(
  message: MessagePayload,
  payload: {
    messageId: string;
    error: string;
    partialContent: string | null;
    code?: string;
  },
): MessagePayload {
  if (message.id !== payload.messageId) return message;

  const errorContent =
    payload.code === "CAPACITY_EXCEEDED"
      ? CAPACITY_EXCEEDED_CONTENT
      : payload.partialContent || message.content || `[Error: ${payload.error}]`;

  return {
    ...message,
    content: errorContent,
    type: "STREAMING",
    streamingStatus: "ERROR",
    thinkingPhase: undefined,
  };
}

export function applyStreamThinking(
  message: MessagePayload,
  payload: { messageId: string; phase: string; timestamp?: string },
): MessagePayload {
  if (message.id !== payload.messageId) return message;
  return {
    ...message,
    thinkingPhase: payload.phase,
    thinkingTimeline: [
      ...(message.thinkingTimeline || []),
      {
        phase: payload.phase,
        timestamp: payload.timestamp || new Date().toISOString(),
      },
    ],
  };
}

export function applyStreamToolCall(
  message: MessagePayload,
  payload: {
    messageId: string;
    callId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    timestamp: string;
  },
): MessagePayload {
  if (message.id !== payload.messageId) return message;
  return {
    ...message,
    thinkingPhase: `Using ${payload.toolName}`,
    toolCalls: [
      ...(message.toolCalls || []),
      {
        callId: payload.callId,
        toolName: payload.toolName,
        arguments: payload.arguments,
        timestamp: payload.timestamp,
      },
    ],
  };
}

export function applyStreamToolResult(
  message: MessagePayload,
  payload: {
    messageId: string;
    callId: string;
    toolName: string;
    content: string;
    isError: boolean;
    timestamp: string;
  },
): MessagePayload {
  if (message.id !== payload.messageId) return message;
  return {
    ...message,
    toolResults: [
      ...(message.toolResults || []),
      {
        callId: payload.callId,
        toolName: payload.toolName,
        content: payload.content,
        isError: payload.isError,
        timestamp: payload.timestamp,
      },
    ],
  };
}

export function buildStreamErrorFallback(
  channelId: string,
  payload: {
    messageId: string;
    error: string;
    partialContent: string | null;
    code?: string;
  },
  streamMeta: PendingStreamMeta | undefined,
  lastSequence: string,
): MessagePayload {
  const errorContent =
    payload.code === "CAPACITY_EXCEEDED"
      ? CAPACITY_EXCEEDED_CONTENT
      : payload.partialContent || `[Error: ${payload.error}]`;

  return {
    id: payload.messageId,
    channelId,
    authorId: streamMeta?.agentId || "",
    authorType: "AGENT",
    authorName: streamMeta?.agentName || "Agent",
    authorAvatarUrl: streamMeta?.agentAvatarUrl || null,
    content: errorContent,
    type: "STREAMING",
    streamingStatus: "ERROR",
    sequence: streamMeta?.sequence || lastSequence,
    createdAt: new Date().toISOString(),
    reactions: [],
  };
}

export function pruneExpiredOrphanTokens(
  orphanBuffer: Map<string, OrphanTokenBufferEntry>,
  now: number,
  ttlMs = STREAM_ORPHAN_TOKEN_TTL_MS,
): void {
  orphanBuffer.forEach((entry, messageId) => {
    if (now - entry.timestamp > ttlMs) {
      orphanBuffer.delete(messageId);
    }
  });
}

export function bufferOrphanStreamToken(
  orphanBuffer: Map<string, OrphanTokenBufferEntry>,
  payload: StreamTokenPayload,
  now: number,
  ttlMs = STREAM_ORPHAN_TOKEN_TTL_MS,
): void {
  pruneExpiredOrphanTokens(orphanBuffer, now, ttlMs);

  const existing = orphanBuffer.get(payload.messageId);
  if (existing && now - existing.timestamp <= ttlMs) {
    orphanBuffer.set(payload.messageId, {
      tokens: [...existing.tokens, payload],
      timestamp: now,
    });
    return;
  }

  orphanBuffer.set(payload.messageId, {
    tokens: [payload],
    timestamp: now,
  });
}

export function takeBufferedOrphanTokens(
  orphanBuffer: Map<string, OrphanTokenBufferEntry>,
  messageId: string,
  now: number,
  ttlMs = STREAM_ORPHAN_TOKEN_TTL_MS,
): StreamTokenPayload[] {
  pruneExpiredOrphanTokens(orphanBuffer, now, ttlMs);

  const entry = orphanBuffer.get(messageId);
  if (!entry) return [];

  orphanBuffer.delete(messageId);
  if (now - entry.timestamp > ttlMs) {
    return [];
  }

  return [...entry.tokens].sort((left, right) => left.index - right.index);
}

export function useStreaming({
  channelId,
  channelRef,
  messages,
  addMessages,
  setMessages,
  setAgentTriggerHint,
  lastSequenceRef,
  messageIdsRef,
}: UseStreamingOptions): UseStreamingResult {
  const pendingStreamMetaRef = useRef<Map<string, PendingStreamMeta>>(
    new Map(),
  );
  const streamLastTokenRef = useRef<Map<string, number>>(new Map());
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const streamNextIndexRef = useRef<Map<string, number>>(new Map());
  const streamOooBufferRef = useRef<Map<string, Map<number, string>>>(
    new Map(),
  );
  const orphanTokenBufferRef = useRef<Map<string, OrphanTokenBufferEntry>>(
    new Map(),
  );
  const rafRef = useRef<number | null>(null);
  const streamTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    pendingStreamMetaRef.current = new Map();
    streamLastTokenRef.current = new Map();
    streamBufferRef.current = new Map();
    streamNextIndexRef.current = new Map();
    streamOooBufferRef.current = new Map();
    orphanTokenBufferRef.current = new Map();

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamTimeoutRef.current !== null) {
      window.clearInterval(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }

    if (!channelId) return;

    const streamTimeoutInterval = window.setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];

      streamLastTokenRef.current.forEach((lastToken, messageId) => {
        if (now - lastToken > 60_000) {
          expired.push(messageId);
        }
      });

      if (expired.length === 0) return;

      expired.forEach((messageId) => {
        streamLastTokenRef.current.delete(messageId);
        pendingStreamMetaRef.current.delete(messageId);
        streamNextIndexRef.current.delete(messageId);
        streamOooBufferRef.current.delete(messageId);
        streamBufferRef.current.delete(messageId);
      });

      setMessages((prev) =>
        prev.map((message) =>
          expired.includes(message.id) && message.streamingStatus === "ACTIVE"
            ? {
                ...message,
                streamingStatus: "ERROR",
                content: message.content || "[Stream timed out]",
              }
            : message,
        ),
      );
    }, 10_000);

    streamTimeoutRef.current = streamTimeoutInterval;

    return () => {
      window.clearInterval(streamTimeoutInterval);
      streamTimeoutRef.current = null;
      pendingStreamMetaRef.current.clear();
      streamLastTokenRef.current.clear();
      streamBufferRef.current.clear();
      streamNextIndexRef.current.clear();
      streamOooBufferRef.current.clear();
      orphanTokenBufferRef.current.clear();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [channelId, setMessages]);

  const flushStreamBuffer = useCallback(() => {
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const updates = new Map(streamBufferRef.current);
      streamBufferRef.current.clear();

      if (updates.size === 0) return;

      setMessages((prev) =>
        prev.map((message) => {
          const nextContent = updates.get(message.id);
          if (nextContent === undefined) return message;
          return { ...message, content: message.content + nextContent };
        }),
      );
    });
  }, [setMessages]);

  const applyStreamToken = useCallback(
    (payload: StreamTokenPayload, timestamp = Date.now()) => {
      streamLastTokenRef.current.set(payload.messageId, timestamp);

      const nextIndex = streamNextIndexRef.current.get(payload.messageId) ?? 0;
      if (payload.index === nextIndex) {
        let text = payload.token;
        let cursor = nextIndex + 1;
        const outOfOrder = streamOooBufferRef.current.get(payload.messageId);

        if (outOfOrder) {
          while (outOfOrder.has(cursor)) {
            text += outOfOrder.get(cursor) || "";
            outOfOrder.delete(cursor);
            cursor++;
          }

          if (outOfOrder.size === 0) {
            streamOooBufferRef.current.delete(payload.messageId);
          }
        }

        streamNextIndexRef.current.set(payload.messageId, cursor);
        const existing = streamBufferRef.current.get(payload.messageId) || "";
        streamBufferRef.current.set(payload.messageId, existing + text);
      } else if (payload.index > nextIndex) {
        let outOfOrder = streamOooBufferRef.current.get(payload.messageId);
        if (!outOfOrder) {
          outOfOrder = new Map();
          streamOooBufferRef.current.set(payload.messageId, outOfOrder);
        }
        outOfOrder.set(payload.index, payload.token);
      }

      flushStreamBuffer();
    },
    [flushStreamBuffer],
  );

  const registerStreamingHandlers = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      channel.on("stream_start", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          agentId: string;
          agentName: string;
          agentAvatarUrl: string | null;
          sequence: string;
        };
        const now = Date.now();

        pendingStreamMetaRef.current.set(payload.messageId, {
          agentId: payload.agentId,
          agentName: payload.agentName,
          agentAvatarUrl: payload.agentAvatarUrl,
          sequence: payload.sequence,
        });
        streamLastTokenRef.current.set(payload.messageId, now);
        streamNextIndexRef.current.set(payload.messageId, 0);
        pruneExpiredOrphanTokens(orphanTokenBufferRef.current, now);

        const placeholder: MessagePayload = {
          id: payload.messageId,
          channelId: channelId!,
          authorId: payload.agentId,
          authorType: "AGENT",
          authorName: payload.agentName,
          authorAvatarUrl: payload.agentAvatarUrl,
          content: "",
          type: "STREAMING",
          streamingStatus: "ACTIVE",
          sequence: payload.sequence,
          createdAt: new Date().toISOString(),
          reactions: [],
        };
        addMessages([placeholder]);

        const bufferedTokens = takeBufferedOrphanTokens(
          orphanTokenBufferRef.current,
          payload.messageId,
          now,
        );
        bufferedTokens.forEach((token) => applyStreamToken(token, now));
      });

      channel.on("stream_token", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as StreamTokenPayload;
        const now = Date.now();
        pruneExpiredOrphanTokens(orphanTokenBufferRef.current, now);

        if (!pendingStreamMetaRef.current.has(payload.messageId)) {
          bufferOrphanStreamToken(orphanTokenBufferRef.current, payload, now);
          return;
        }

        applyStreamToken(payload, now);
      });

      channel.on("stream_complete", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          finalContent: string;
          thinkingTimeline?: Array<{ phase: string; timestamp: string }>;
          metadata?: Record<string, unknown>;
        };

        pendingStreamMetaRef.current.delete(payload.messageId);
        streamLastTokenRef.current.delete(payload.messageId);
        streamBufferRef.current.delete(payload.messageId);
        streamNextIndexRef.current.delete(payload.messageId);
        streamOooBufferRef.current.delete(payload.messageId);
        orphanTokenBufferRef.current.delete(payload.messageId);

        setMessages((prev) =>
          prev.map((message) => applyStreamComplete(message, payload)),
        );
      });

      channel.on("stream_error", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          error: string;
          partialContent: string | null;
          code?: string;
        };

        streamLastTokenRef.current.delete(payload.messageId);
        streamBufferRef.current.delete(payload.messageId);
        streamNextIndexRef.current.delete(payload.messageId);
        streamOooBufferRef.current.delete(payload.messageId);
        orphanTokenBufferRef.current.delete(payload.messageId);

        setMessages((prev) => {
          const hasMatch = prev.some((message) => message.id === payload.messageId);
          const streamMeta = pendingStreamMetaRef.current.get(payload.messageId);

          if (hasMatch) {
            pendingStreamMetaRef.current.delete(payload.messageId);
            return prev.map((message) => applyStreamError(message, payload));
          }

          const fallback = buildStreamErrorFallback(
            channelId!,
            payload,
            streamMeta,
            lastSequenceRef.current,
          );
          messageIdsRef.current.add(payload.messageId);
          pendingStreamMetaRef.current.delete(payload.messageId);

          return [...prev, fallback].sort((left, right) =>
            compareSequences(left.sequence, right.sequence),
          );
        });

        const errorText = (payload.error || "").trim();
        if (errorText) {
          const hint =
            payload.code === "CAPACITY_EXCEEDED"
              ? CAPACITY_EXCEEDED_HINT
              : `Agent response failed: ${errorText}`;
          setAgentTriggerHint(hint);
        }
      });

      channel.on("stream_thinking", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          phase: string;
          timestamp?: string;
        };
        setMessages((prev) =>
          prev.map((message) => applyStreamThinking(message, payload)),
        );
      });

      channel.on("stream_tool_call", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          callId: string;
          toolName: string;
          arguments: Record<string, unknown>;
          timestamp: string;
        };
        setMessages((prev) =>
          prev.map((message) => applyStreamToolCall(message, payload)),
        );
      });

      channel.on("stream_tool_result", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          callId: string;
          toolName: string;
          content: string;
          isError: boolean;
          timestamp: string;
        };
        setMessages((prev) =>
          prev.map((message) => applyStreamToolResult(message, payload)),
        );
      });

      channel.on("stream_checkpoint", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          index: number;
          label: string;
          contentOffset: number;
          timestamp: string;
        };

        if (
          typeof payload.messageId !== "string" ||
          typeof payload.index !== "number" ||
          payload.index < 0 ||
          typeof payload.contentOffset !== "number" ||
          payload.contentOffset < 0
        ) {
          console.warn("[stream_checkpoint] Invalid payload, skipping:", payload);
          return;
        }

        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== payload.messageId) return message;
            const existing = message.checkpoints || [];
            if (existing.some((checkpoint) => checkpoint.index === payload.index)) {
              return message;
            }

            return {
              ...message,
              checkpoints: [
                ...existing,
                {
                  index: payload.index,
                  label: payload.label || `Checkpoint ${payload.index}`,
                  contentOffset: payload.contentOffset,
                  timestamp: payload.timestamp,
                },
              ],
            };
          }),
        );
      });
    },
    [
      addMessages,
      applyStreamToken,
      channelId,
      lastSequenceRef,
      messageIdsRef,
      setAgentTriggerHint,
      setMessages,
    ],
  );

  const activeStreamCount = useMemo(
    () => messages.filter((message) => message.streamingStatus === "ACTIVE").length,
    [messages],
  );

  const sendResumeStream = useCallback(
    (messageId: string, checkpointIndex: number, agentId: string) => {
      if (!channelRef.current) return;
      channelRef.current.push("stream_resume", {
        messageId,
        checkpointIndex,
        agentId,
      });
    },
    [],
  );

  return {
    activeStreamCount,
    registerStreamingHandlers,
    sendResumeStream,
  };
}
