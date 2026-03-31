"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel } from "phoenix";
import { getSocket } from "@/lib/socket";
import { useCharter } from "./useCharter";
import { useMessages } from "./useMessages";
import { usePresence } from "./usePresence";
import {
  applyStreamComplete,
  applyStreamError,
  applyStreamThinking,
  applyStreamToolCall,
  applyStreamToolResult,
  buildStreamErrorFallback,
  bufferOrphanStreamToken,
  CAPACITY_EXCEEDED_CONTENT,
  CAPACITY_EXCEEDED_HINT,
  getStreamErrorContent,
  getStreamErrorHint,
  isCapacityExceededStreamError,
  pruneExpiredOrphanTokens,
  STREAM_ORPHAN_TOKEN_TTL_MS,
  takeBufferedOrphanTokens,
  useStreaming,
} from "./useStreaming";
import { useTyping } from "./useTyping";
import type { UseChannelReturn } from "./use-channel-types";

export type {
  CharterAction,
  CharterState,
  MessagePayload,
  PendingStreamMeta,
  PresenceUser,
  ReactionData,
  ToolCallData,
  ToolResultData,
  TypingUser,
  UseChannelReturn,
} from "./use-channel-types";

export {
  applyStreamComplete,
  applyStreamError,
  applyStreamThinking,
  applyStreamToolCall,
  applyStreamToolResult,
  buildStreamErrorFallback,
  bufferOrphanStreamToken,
  CAPACITY_EXCEEDED_CONTENT,
  CAPACITY_EXCEEDED_HINT,
  getStreamErrorContent,
  getStreamErrorHint,
  isCapacityExceededStreamError,
  pruneExpiredOrphanTokens,
  STREAM_ORPHAN_TOKEN_TTL_MS,
  takeBufferedOrphanTokens,
} from "./useStreaming";

export function useChannel(channelId: string | null): UseChannelReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoinedOnce, setHasJoinedOnce] = useState(false);

  const channelRef = useRef<Channel | null>(null);

  const {
    messages,
    setMessages,
    addMessages,
    agentTriggerHint,
    setAgentTriggerHint,
    hasMoreHistory,
    loadHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    updateReactions,
    registerMessageHandlers,
    registerMutationHandlers,
    lastSequenceRef,
    messageIdsRef,
  } = useMessages(channelId, channelRef);
  const { typingUsers, sendTyping, registerTypingHandlers } = useTyping(
    channelId,
    channelRef,
  );
  const { presenceMap, attachPresence } = usePresence(channelId);
  const {
    charterState,
    setCharterState,
    sendCharterControl,
    registerCharterHandlers,
  } = useCharter(channelId, channelRef);
  const { activeStreamCount, registerStreamingHandlers, sendResumeStream } =
    useStreaming({
      channelId,
      channelRef,
      messages,
      addMessages,
      setMessages,
      setAgentTriggerHint,
      lastSequenceRef,
      messageIdsRef,
    });

  useEffect(() => {
    if (!channelId) {
      if (channelRef.current) {
        channelRef.current.leave();
        channelRef.current = null;
      }
      setIsConnected(false);
      setHasJoinedOnce(false);
      return;
    }

    let mounted = true;
    setIsConnected(false);
    setHasJoinedOnce(false);

    async function joinChannel() {
      const socket = await getSocket();
      if (!socket || !mounted) return;

      if (channelRef.current) {
        channelRef.current.leave();
      }

      const channel = socket.channel(`room:${channelId}`, {
        lastSequence:
          lastSequenceRef.current !== "0" ? lastSequenceRef.current : undefined,
      });

      channel.onError(() => {
        if (mounted) setIsConnected(false);
      });

      channel.onClose(() => {
        if (mounted) setIsConnected(false);
      });

      attachPresence(channel, () => mounted);
      registerMessageHandlers(channel, () => mounted);
      registerMutationHandlers(channel, () => mounted);
      registerTypingHandlers(channel, () => mounted);
      registerStreamingHandlers(channel, () => mounted);
      registerCharterHandlers(channel, () => mounted);

      channel
        .join()
        .receive("ok", () => {
          if (!mounted) return;
          setIsConnected(true);
          setHasJoinedOnce(true);
          channelRef.current = channel;

          if (lastSequenceRef.current === "0") {
            channel.push("history", { limit: 50 });
          }
        })
        .receive("error", (resp: unknown) => {
          console.error("[Channel] Join error:", resp);
        });
    }

    joinChannel();

    return () => {
      mounted = false;
      if (channelRef.current) {
        channelRef.current.leave();
        channelRef.current = null;
      }
    };
  }, [
    attachPresence,
    channelId,
    lastSequenceRef,
    registerCharterHandlers,
    registerMessageHandlers,
    registerMutationHandlers,
    registerStreamingHandlers,
    registerTypingHandlers,
  ]);

  return {
    messages,
    agentTriggerHint,
    sendMessage,
    editMessage,
    deleteMessage,
    loadHistory,
    updateReactions,
    hasMoreHistory,
    isConnected,
    hasJoinedOnce,
    typingUsers,
    sendTyping,
    presenceMap,
    activeStreamCount,
    charterState,
    setCharterState,
    sendCharterControl,
    sendResumeStream,
  };
}
