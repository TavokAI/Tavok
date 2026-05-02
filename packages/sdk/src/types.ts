/**
 * Tavok SDK data types.
 *
 * Type definitions for messages, streams, and events that flow through the SDK.
 * Ported from the Python SDK (`sdk/python/tavok/types.py`).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Who authored a message. */
export enum AuthorType {
  USER = "USER",
  AGENT = "AGENT",
  SYSTEM = "SYSTEM",
}

/** Message category. */
export enum MessageType {
  STANDARD = "STANDARD",
  STREAMING = "STREAMING",
  SYSTEM = "SYSTEM",
  TOOL_CALL = "TOOL_CALL",
  TOOL_RESULT = "TOOL_RESULT",
  CODE_BLOCK = "CODE_BLOCK",
  ARTIFACT = "ARTIFACT",
  STATUS = "STATUS",
}

/** Streaming message lifecycle state. */
export enum StreamStatus {
  ACTIVE = "ACTIVE",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A chat message received from a Tavok channel. */
export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorType: AuthorType;
  content: string;
  type: MessageType;
  sequence: string;
  createdAt: string;
  editedAt: string | null;
  authorAvatarUrl: string | null;
  streamingStatus: StreamStatus | null;
  metadata: Record<string, unknown> | null;
  tokenHistory: Array<Record<string, unknown>> | null;
  checkpoints: Array<Record<string, unknown>> | null;
}

/** A single streaming token from an LLM response. */
export interface StreamToken {
  messageId: string;
  token: string;
  index: number;
}

/** Broadcast when an agent starts streaming. */
export interface StreamStart {
  messageId: string;
  agentId: string;
  agentName: string;
  agentAvatarUrl: string | null;
  sequence: string;
  status: string;
}

/** Broadcast when an agent finishes streaming. */
export interface StreamComplete {
  messageId: string;
  finalContent: string;
  thinkingTimeline: Array<Record<string, unknown>>;
  metadata: Record<string, unknown> | null;
}

/** Broadcast when streaming fails. */
export interface StreamError {
  messageId: string;
  error: string;
  partialContent: string | null;
  code: string | null;
}

/** A message from the poll endpoint. */
export interface PollMessage {
  id: string;
  channelId: string;
  messageId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorType: string;
  createdAt: string;
}

/** Inbound webhook event payload. */
export interface WebhookEvent {
  type: string;
  channelId: string;
  triggerMessage: {
    id: string;
    content: string;
    authorName: string;
    authorType: string;
  };
  contextMessages: Array<{ role: string; content: string }>;
  callbackUrl: string | null;
  raw: Record<string, unknown>;
}

/** Credentials returned after agent registration. */
export interface AgentCredentials {
  id: string;
  apiKey: string;
  connectionMethod?: string;
}

/** SDK configuration data. */
export interface TavokConfigData {
  url: string;
  gatewayUrl: string;
  serverId?: string;
  channelId?: string;
}

// ---------------------------------------------------------------------------
// Factory helpers — convert server payloads (camelCase from Phoenix)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Create a {@link Message} from a Phoenix Channel broadcast payload. */
export function messageFromPayload(payload: Record<string, any>): Message {
  const authorType = payload.authorType ?? payload.author_type ?? "USER";
  const msgType = payload.type ?? payload.message_type ?? "STANDARD";
  const streaming = payload.streamingStatus ?? payload.streaming_status ?? null;

  return {
    id: payload.id,
    channelId: payload.channelId ?? payload.channel_id ?? "",
    authorId: payload.authorId ?? payload.author_id ?? "",
    authorName: payload.authorName ?? payload.author_name ?? "",
    authorType: authorType as AuthorType,
    content: payload.content ?? "",
    type: msgType as MessageType,
    sequence: String(payload.sequence ?? "0"),
    createdAt: payload.createdAt ?? payload.created_at ?? "",
    editedAt: payload.editedAt ?? payload.edited_at ?? null,
    authorAvatarUrl: payload.authorAvatarUrl ?? payload.author_avatar_url ?? null,
    streamingStatus: streaming ? (streaming as StreamStatus) : null,
    metadata: payload.metadata ?? null,
    tokenHistory: payload.tokenHistory ?? payload.token_history ?? null,
    checkpoints: payload.checkpoints ?? null,
  };
}

/** Create a {@link StreamToken} from a server payload. */
export function streamTokenFromPayload(payload: Record<string, any>): StreamToken {
  return {
    messageId: payload.messageId ?? payload.message_id,
    token: payload.token ?? "",
    index: payload.index ?? 0,
  };
}

/** Create a {@link StreamStart} from a server payload. */
export function streamStartFromPayload(payload: Record<string, any>): StreamStart {
  return {
    messageId: payload.messageId ?? payload.message_id,
    agentId: payload.agentId ?? payload.agent_id ?? "",
    agentName: payload.agentName ?? payload.agent_name ?? "",
    agentAvatarUrl: payload.agentAvatarUrl ?? payload.agent_avatar_url ?? null,
    sequence: String(payload.sequence ?? "0"),
    status: payload.status ?? "active",
  };
}

/** Create a {@link StreamComplete} from a server payload. */
export function streamCompleteFromPayload(payload: Record<string, any>): StreamComplete {
  return {
    messageId: payload.messageId ?? payload.message_id,
    finalContent: payload.finalContent ?? payload.final_content ?? "",
    thinkingTimeline: payload.thinkingTimeline ?? payload.thinking_timeline ?? [],
    metadata: payload.metadata ?? null,
  };
}

/** Create a {@link StreamError} from a server payload. */
export function streamErrorFromPayload(payload: Record<string, any>): StreamError {
  return {
    messageId: payload.messageId ?? payload.message_id,
    error: payload.error ?? "Unknown error",
    partialContent: payload.partialContent ?? payload.partial_content ?? null,
    code: payload.code ?? null,
  };
}
