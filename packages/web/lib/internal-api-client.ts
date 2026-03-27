import { getInternalBaseUrl } from "@/lib/internal-auth";
import type { MessageMetadata } from "@/lib/message-metadata-contract";
import type { StreamLifecycleMessage } from "@/lib/stream-lifecycle";

/**
 * Shared helpers for calling internal API endpoints from route handlers.
 * Consolidates duplicate persistMessage / updateMessage implementations
 * across webhook, agent message, and dispatch routes.
 */

export interface PersistMessageData {
  id: string;
  channelId: string;
  authorId: string;
  authorType: string;
  content: string;
  type: string;
  streamingStatus?: string;
  sequence: string;
}

export interface StartStreamPlaceholderData {
  id: string;
  channelId: string;
  authorId: string;
  authorType: string;
  content?: string;
  sequence: string;
}

export interface TerminalStreamData {
  content: string;
  metadata?: MessageMetadata;
  thinkingTimeline?: string;
  tokenHistory?: string;
  checkpoints?: string;
}

async function readErrorBody(response: Response) {
  return response.text().catch(() => "unknown");
}

/**
 * Persist a new message via POST /api/internal/messages.
 * Ignores 409 (duplicate) — all other errors throw.
 */
export async function persistMessage(data: PersistMessageData) {
  const internalUrl = getInternalBaseUrl();

  const response = await fetch(`${internalUrl}/api/internal/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok && response.status !== 409) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(
      `Message persistence failed: ${response.status} ${errorBody}`,
    );
  }
}

/**
 * Update an existing message via PUT /api/internal/messages/{messageId}.
 * All non-ok responses throw.
 */
export async function updateMessage(
  messageId: string,
  data: Record<string, unknown>,
) {
  const internalUrl = getInternalBaseUrl();

  const response = await fetch(
    `${internalUrl}/api/internal/messages/${messageId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    throw new Error(`Message update failed: ${response.status} ${errorBody}`);
  }
}

export async function startStreamPlaceholder(
  data: StartStreamPlaceholderData,
): Promise<StreamLifecycleMessage> {
  const internalUrl = getInternalBaseUrl();

  const response = await fetch(`${internalUrl}/api/internal/streams/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    throw new Error(`Stream start failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

export async function completeStream(
  messageId: string,
  data: TerminalStreamData,
): Promise<StreamLifecycleMessage> {
  const internalUrl = getInternalBaseUrl();

  const response = await fetch(
    `${internalUrl}/api/internal/streams/${messageId}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    throw new Error(
      `Stream completion failed: ${response.status} ${errorBody}`,
    );
  }

  return response.json();
}

export async function failStream(
  messageId: string,
  data: TerminalStreamData,
): Promise<StreamLifecycleMessage> {
  const internalUrl = getInternalBaseUrl();

  const response = await fetch(
    `${internalUrl}/api/internal/streams/${messageId}/error`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    throw new Error(`Stream failure failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}
