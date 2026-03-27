import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import {
  broadcastMessageNew,
  broadcastStreamStart,
  broadcastTypedMessage,
  fetchChannelSequence,
} from "@/lib/gateway-client";
import { webhookLimiter } from "@/lib/rate-limit";
import { getPublicBaseUrl } from "@/lib/internal-auth";
import {
  persistMessage,
  startStreamPlaceholder,
} from "@/lib/internal-api-client";

/** Valid typed message types for webhook payloads. */
const VALID_TYPED_TYPES = [
  "TOOL_CALL",
  "TOOL_RESULT",
  "CODE_BLOCK",
  "ARTIFACT",
  "STATUS",
] as const;

/** Zod schema for webhook message POST body. */
const webhookMessageSchema = z
  .object({
    content: z.union([z.string(), z.record(z.unknown())]).optional(),
    streaming: z.boolean().optional(),
    username: z.string().optional(),
    avatarUrl: z.string().optional(),
    type: z.enum(VALID_TYPED_TYPES).optional(),
  })
  .strict();

type WebhookMessageBody = z.infer<typeof webhookMessageSchema>;

/**
 * POST /api/v1/webhooks/{token} — Send a message via inbound webhook (DEC-0045)
 *
 * No auth header required. The token in the URL IS the authentication.
 * Identical to Discord's incoming webhook pattern.
 *
 * Simple message:
 *   POST /api/v1/webhooks/whk_...
 *   {"content": "Build #1234 passed"}
 *
 * Start streaming:
 *   POST /api/v1/webhooks/whk_...
 *   {"streaming": true}
 *   → Returns {messageId, streamUrl}
 *
 * Typed message (tool call, code block, etc.):
 *   POST /api/v1/webhooks/whk_...
 *   {"type": "TOOL_CALL", "content": {"callId": "...", "toolName": "...", ...}}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Rate limit: 60 requests per 60s per webhook token
  const rl = webhookLimiter.check(token);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // Look up webhook by token (indexed query)
  const webhook = await prisma.inboundWebhook.findUnique({
    where: { token },
    select: {
      id: true,
      channelId: true,
      agentId: true,
      name: true,
      avatarUrl: true,
      isActive: true,
    },
  });

  if (!webhook) {
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 404 },
    );
  }

  if (!webhook.isActive) {
    return NextResponse.json({ error: "Webhook is disabled" }, { status: 403 });
  }

  let body: WebhookMessageBody;
  try {
    const rawBody = await request.json();
    const parsed = webhookMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message || "Invalid request body" },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    content,
    streaming,
    username,
    avatarUrl: overrideAvatar,
    type: msgType,
  } = body;

  // Resolve display name/avatar (allow per-message overrides like Discord)
  const displayName = username || webhook.name;
  const displayAvatar = overrideAvatar || webhook.avatarUrl;

  const messageId = generateId();

  // Get the next Gateway-owned channel sequence.
  const sequence = await fetchChannelSequence(webhook.channelId);

  try {
    // Handle typed messages (TOOL_CALL, TOOL_RESULT, CODE_BLOCK, etc.)
    if (msgType) {
      const typedContent = content;

      // Persist message
      await persistMessage({
        id: messageId,
        channelId: webhook.channelId,
        authorId: webhook.agentId,
        authorType: "AGENT",
        content:
          typeof typedContent === "string"
            ? typedContent
            : JSON.stringify(typedContent),
        type: msgType,
        sequence,
      });

      // Broadcast typed_message
      await broadcastTypedMessage(webhook.channelId, {
        id: messageId,
        channelId: webhook.channelId,
        authorId: webhook.agentId,
        authorType: "AGENT",
        authorName: displayName,
        authorAvatarUrl: displayAvatar,
        content:
          typeof typedContent === "string"
            ? typedContent
            : JSON.stringify(typedContent),
        type: msgType,
        sequence,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({ messageId, sequence });
    }

    // Handle streaming initiation
    if (streaming) {
      // Persist placeholder
      await startStreamPlaceholder({
        id: messageId,
        channelId: webhook.channelId,
        authorId: webhook.agentId,
        authorType: "AGENT",
        content: "",
        sequence,
      });

      // Broadcast stream_start
      await broadcastStreamStart(webhook.channelId, {
        messageId,
        agentId: webhook.agentId,
        agentName: displayName,
        agentAvatarUrl: displayAvatar,
        sequence,
      });

      const webUrl = getPublicBaseUrl();

      return NextResponse.json(
        {
          messageId,
          sequence,
          streamUrl: `${webUrl}/api/v1/webhooks/${token}/stream`,
        },
        { status: 201 },
      );
    }

    // Handle simple message
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "content is required (or use streaming: true)" },
        { status: 400 },
      );
    }

    // Persist message
    await persistMessage({
      id: messageId,
      channelId: webhook.channelId,
      authorId: webhook.agentId,
      authorType: "AGENT",
      content,
      type: "STANDARD",
      sequence,
    });

    // Broadcast message_new
    await broadcastMessageNew(webhook.channelId, {
      id: messageId,
      channelId: webhook.channelId,
      authorId: webhook.agentId,
      authorType: "AGENT",
      authorName: displayName,
      authorAvatarUrl: displayAvatar,
      content,
      type: "STANDARD",
      streamingStatus: null,
      sequence,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ messageId, sequence });
  } catch (error) {
    console.error("[v1/webhooks] Webhook message failed:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
