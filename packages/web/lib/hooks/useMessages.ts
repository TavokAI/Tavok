"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Channel } from "phoenix";
import { compareSequences } from "@/lib/api-safety";
import type { MessagePayload, ReactionData } from "./use-channel-types";

function getSendErrorHint(resp: unknown): string {
  const payload =
    resp && typeof resp === "object" ? (resp as Record<string, unknown>) : null;
  const reason = typeof payload?.reason === "string" ? payload.reason : null;

  switch (reason) {
    case "rate_limited":
      return "Slow down - you can send up to 5 messages every 10 seconds per channel (20/sec channel-wide).";
    case "content_too_long":
      return "Message send failed: message is too long for this channel.";
    case "empty_content":
      return "Message send failed: message content is empty.";
    default:
      return "Message send failed: couldn't send your message. Please try again.";
  }
}

export interface UseMessagesResult {
  messages: MessagePayload[];
  setMessages: Dispatch<SetStateAction<MessagePayload[]>>;
  addMessages: (messages: MessagePayload[], prepend?: boolean) => void;
  agentTriggerHint: string | null;
  setAgentTriggerHint: Dispatch<SetStateAction<string | null>>;
  hasMoreHistory: boolean;
  loadHistory: () => void;
  sendMessage: (content: string) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  updateReactions: (messageId: string, reactions: ReactionData[]) => void;
  registerMessageHandlers: (channel: Channel, mounted: () => boolean) => void;
  registerMutationHandlers: (channel: Channel, mounted: () => boolean) => void;
  loadingHistoryRef: MutableRefObject<boolean>;
  lastSequenceRef: MutableRefObject<string>;
  messageIdsRef: MutableRefObject<Set<string>>;
}

export function useMessages(
  channelId: string | null,
  channelRef: MutableRefObject<Channel | null>,
): UseMessagesResult {
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [agentTriggerHint, setAgentTriggerHint] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const loadingHistoryRef = useRef(false);
  const lastSequenceRef = useRef("0");
  const messageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMessages([]);
    setAgentTriggerHint(null);
    setHasMoreHistory(true);
    loadingHistoryRef.current = false;
    lastSequenceRef.current = "0";
    messageIdsRef.current = new Set();
  }, [channelId]);

  const addMessages = useCallback(
    (newMessages: MessagePayload[], prepend = false) => {
      setMessages((prev) => {
        const normalizedNew = newMessages.map((message) => ({
          ...message,
          reactions: message.reactions || [],
        }));
        const uniqueNew = normalizedNew.filter(
          (message) => !messageIdsRef.current.has(message.id),
        );
        if (uniqueNew.length === 0) return prev;

        uniqueNew.forEach((message) => messageIdsRef.current.add(message.id));

        for (const message of uniqueNew) {
          if (compareSequences(message.sequence, lastSequenceRef.current) > 0) {
            lastSequenceRef.current = message.sequence;
          }
        }

        const merged = prepend
          ? [...uniqueNew, ...prev]
          : [...prev, ...uniqueNew];
        return merged.sort((left, right) =>
          compareSequences(left.sequence, right.sequence),
        );
      });
    },
    [],
  );

  const registerMessageHandlers = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      channel.on("message_new", (raw: unknown) => {
        if (!mounted()) return;
        addMessages([raw as MessagePayload]);
      });

      channel.on("sync_response", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as { messages: MessagePayload[]; hasMore: boolean };
        if (payload.messages.length > 0) addMessages(payload.messages);
      });

      channel.on("history_response", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as { messages: MessagePayload[]; hasMore: boolean };
        loadingHistoryRef.current = false;
        setHasMoreHistory(payload.hasMore);
        if (payload.messages.length > 0) addMessages(payload.messages, true);
      });

      channel.on("typed_message", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as MessagePayload;
        addMessages([{ ...payload, reactions: payload.reactions || [] }]);
      });

      channel.on("agent_trigger_skipped", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          agentId: string;
          agentName: string;
          reason: string;
          triggerMode: string;
        };
        if (payload.reason === "mention_required" && payload.agentName) {
          setAgentTriggerHint(
            `Action needed: no agent triggered. Mention @${payload.agentName} to trigger it.`,
          );
        }
      });
    },
    [addMessages],
  );

  const registerMutationHandlers = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      channel.on("reaction_update", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as { messageId: string; reactions: ReactionData[] };
        setMessages((prev) =>
          prev.map((message) =>
            message.id === payload.messageId
              ? { ...message, reactions: payload.reactions || [] }
              : message,
          ),
        );
      });

      channel.on("message_edited", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          messageId: string;
          content: string;
          editedAt: string;
        };
        setMessages((prev) =>
          prev.map((message) =>
            message.id === payload.messageId
              ? {
                  ...message,
                  content: payload.content,
                  editedAt: payload.editedAt,
                }
              : message,
          ),
        );
      });

      channel.on("message_deleted", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as { messageId: string; deletedBy: string };
        setMessages((prev) =>
          prev.map((message) =>
            message.id === payload.messageId
              ? { ...message, isDeleted: true }
              : message,
          ),
        );
      });
    },
    [],
  );

  const sendMessage = useCallback((content: string): Promise<boolean> => {
    const trimmed = content.trim();
    if (!trimmed) return Promise.resolve(false);

    if (!channelRef.current) {
      setAgentTriggerHint(
        "Message send failed: disconnected from channel gateway. Reconnecting...",
      );
      return Promise.resolve(false);
    }

    setAgentTriggerHint(null);
    const push = channelRef.current.push("new_message", { content: trimmed });

    return new Promise((resolve) => {
      push
        .receive("ok", () => {
          resolve(true);
        })
        .receive("error", (resp: unknown) => {
          setAgentTriggerHint(getSendErrorHint(resp));
          resolve(false);
        });
    });
  }, []);

  const loadHistory = useCallback(() => {
    if (!channelRef.current || !hasMoreHistory || loadingHistoryRef.current) {
      return;
    }

    loadingHistoryRef.current = true;
    const oldestMessage = messages[0];
    channelRef.current.push("history", {
      before: oldestMessage?.id,
      limit: 50,
    });
  }, [hasMoreHistory, messages]);

  const updateReactions = useCallback(
    (messageId: string, reactions: ReactionData[]) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, reactions } : message,
        ),
      );
    },
    [],
  );

  const editMessage = useCallback(
    (messageId: string, content: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (!channelRef.current) {
          resolve(false);
          return;
        }
        channelRef.current
          .push("message_edit", { messageId, content })
          .receive("ok", () => resolve(true))
          .receive("error", (resp: unknown) => {
            console.error("[Channel] Edit error:", resp);
            resolve(false);
          })
          .receive("timeout", () => {
            console.error("[Channel] Edit timeout");
            resolve(false);
          });
      });
    },
    [],
  );

  const deleteMessage = useCallback((messageId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!channelRef.current) {
        resolve(false);
        return;
      }
      channelRef.current
        .push("message_delete", { messageId })
        .receive("ok", () => resolve(true))
        .receive("error", (resp: unknown) => {
          console.error("[Channel] Delete error:", resp);
          resolve(false);
        })
        .receive("timeout", () => {
          console.error("[Channel] Delete timeout");
          resolve(false);
        });
    });
  }, []);

  return {
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
    loadingHistoryRef,
    lastSequenceRef,
    messageIdsRef,
  };
}
