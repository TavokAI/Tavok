import {
  broadcastStreamComplete,
  broadcastStreamError,
} from "@/lib/gateway-client";
import {
  completeStream,
  failStream,
} from "@/lib/internal-api-client";
import type { MessageMetadata } from "@/lib/message-metadata-contract";

interface FinalizeStreamCompletionArgs {
  channelId: string;
  messageId: string;
  finalContent: string;
  metadata?: MessageMetadata;
  thinkingTimeline?: string;
  tokenHistory?: string;
  checkpoints?: string;
  broadcastStreamCompleteFn?: typeof broadcastStreamComplete;
  completeStreamFn?: typeof completeStream;
}

interface FinalizeStreamErrorArgs {
  channelId: string;
  messageId: string;
  error: string;
  partialContent?: string | null;
  metadata?: MessageMetadata;
  thinkingTimeline?: string;
  tokenHistory?: string;
  checkpoints?: string;
  broadcastStreamErrorFn?: typeof broadcastStreamError;
  failStreamFn?: typeof failStream;
}

/**
 * Durably commit a completed stream before advertising `stream_complete`.
 */
export async function finalizeStreamCompletion({
  channelId,
  messageId,
  finalContent,
  metadata,
  thinkingTimeline,
  tokenHistory,
  checkpoints,
  broadcastStreamCompleteFn = broadcastStreamComplete,
  completeStreamFn = completeStream,
}: FinalizeStreamCompletionArgs): Promise<void> {
  await completeStreamFn(messageId, {
    content: finalContent,
    ...(metadata !== undefined ? { metadata } : {}),
    ...(thinkingTimeline !== undefined ? { thinkingTimeline } : {}),
    ...(tokenHistory !== undefined ? { tokenHistory } : {}),
    ...(checkpoints !== undefined ? { checkpoints } : {}),
  });

  await broadcastStreamCompleteFn(channelId, {
    messageId,
    finalContent,
    metadata: metadata ?? null,
  });
}

/**
 * Durably commit a failed stream before advertising `stream_error`.
 */
export async function finalizeStreamError({
  channelId,
  messageId,
  error,
  partialContent,
  metadata,
  thinkingTimeline,
  tokenHistory,
  checkpoints,
  broadcastStreamErrorFn = broadcastStreamError,
  failStreamFn = failStream,
}: FinalizeStreamErrorArgs): Promise<void> {
  const resolvedContent = partialContent ?? `*[Error: ${error}]*`;

  await failStreamFn(messageId, {
    content: resolvedContent,
    ...(metadata !== undefined ? { metadata } : {}),
    ...(thinkingTimeline !== undefined ? { thinkingTimeline } : {}),
    ...(tokenHistory !== undefined ? { tokenHistory } : {}),
    ...(checkpoints !== undefined ? { checkpoints } : {}),
  });

  await broadcastStreamErrorFn(channelId, {
    messageId,
    error,
    partialContent: partialContent ?? null,
  });
}
