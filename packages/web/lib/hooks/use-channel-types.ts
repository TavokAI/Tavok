"use client";

import type { Dispatch, SetStateAction } from "react";

export interface ReactionData {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ToolCallData {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResultData {
  callId: string;
  toolName: string;
  content: string;
  isError: boolean;
  timestamp: string;
}

export interface MessagePayload {
  id: string;
  channelId: string;
  authorId: string;
  authorType: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  type: string;
  streamingStatus: string | null;
  thinkingPhase?: string;
  thinkingTimeline?: Array<{ phase: string; timestamp: string }>;
  metadata?: Record<string, unknown> | null;
  tokenHistory?: Array<{ o: number; t: number }>;
  checkpoints?: Array<{
    index: number;
    label: string;
    contentOffset: number;
    timestamp: string;
  }>;
  toolCalls?: ToolCallData[];
  toolResults?: ToolResultData[];
  sequence: string;
  createdAt: string;
  reactions: ReactionData[];
  editedAt?: string | null;
  isDeleted?: boolean;
}

export interface TypingUser {
  userId: string;
  username: string;
  displayName: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  displayName: string;
  status: string;
}

export interface CharterState {
  swarmMode: string;
  currentTurn: number;
  maxTurns: number;
  status: string;
}

export type CharterAction = "start" | "pause" | "resume" | "end";

export interface PendingStreamMeta {
  agentId: string;
  agentName: string;
  agentAvatarUrl: string | null;
  sequence: string;
}

export interface UseChannelReturn {
  messages: MessagePayload[];
  agentTriggerHint: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  loadHistory: () => void;
  updateReactions: (messageId: string, reactions: ReactionData[]) => void;
  hasMoreHistory: boolean;
  isConnected: boolean;
  hasJoinedOnce: boolean;
  typingUsers: TypingUser[];
  sendTyping: () => void;
  presenceMap: Map<string, PresenceUser>;
  activeStreamCount: number;
  charterState: CharterState | null;
  setCharterState: Dispatch<SetStateAction<CharterState | null>>;
  sendCharterControl: (action: CharterAction) => void;
  sendResumeStream: (
    messageId: string,
    checkpointIndex: number,
    agentId: string,
  ) => void;
}
