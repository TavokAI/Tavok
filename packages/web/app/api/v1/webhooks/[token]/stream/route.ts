import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { broadcastStreamToken, broadcastToChannel } from "@/lib/gateway-client";
import { validateOptionalMessageMetadata } from "@/lib/message-metadata-contract";
import {
  finalizeStreamCompletion,
  finalizeStreamError,
} from "@/lib/stream-finalization";

/**
 * POST /api/v1/webhooks/{token}/stream — Send streaming tokens (DEC-0045)
 *
 * No auth header required. The token in the URL IS the authentication.
 *
 * Send tokens (not final):
 *   {"messageId": "01HXY...", "tokens": ["Hello ", "world!"], "done": false}
 *
 * Final batch with completion:
 *   {"messageId": "01HXY...", "tokens": ["last tokens"], "done": true,
 *    "finalContent": "Full message content", "metadata": {...}}
 *
 * Send thinking/status update:
 *   {"messageId": "01HXY...", "thinking": {"phase": "Searching", "detail": "..."}}
 *
 * Send error:
 *   {"messageId": "01HXY...", "error": "Something went wrong"}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Verify webhook token
  const webhook = await prisma.inboundWebhook.findUnique({
    where: { token },
    select: { channelId: true, agentId: true, isActive: true },
  });

  if (!webhook || !webhook.isActive) {
    return NextResponse.json(
      { error: "Invalid or disabled webhook" },
      { status: 404 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    messageId,
    tokens,
    done,
    finalContent,
    metadata,
    thinking,
    error,
    tokenOffset,
  } = body as {
    messageId?: string;
    tokens?: string[];
    done?: boolean;
    finalContent?: string;
    metadata?: Record<string, unknown>;
    thinking?: { phase: string; detail?: string };
    error?: string;
    tokenOffset?: number;
  };

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json(
      { error: "messageId is required" },
      { status: 400 },
    );
  }

  const metadataResult = validateOptionalMessageMetadata(metadata);
  if (!metadataResult.ok) {
    return NextResponse.json({ error: metadataResult.error }, { status: 400 });
  }

  // Verify the message belongs to this webhook's agent and channel
  const ownership = await verifyWebhookMessageOwnership(
    messageId,
    webhook.agentId,
    webhook.channelId,
  );
  if (!ownership.valid) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  try {
    // Handle error
    if (error) {
      await finalizeStreamError({
        channelId: webhook.channelId,
        messageId,
        error,
        partialContent: (finalContent as string) || null,
      });

      return NextResponse.json({ ok: true });
    }

    // Handle thinking/status updates
    if (thinking) {
      await broadcastToChannel(`room:${webhook.channelId}`, "stream_thinking", {
        messageId,
        phase: thinking.phase,
        detail: thinking.detail || null,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    // Broadcast tokens — use caller-supplied offset for cross-batch monotonicity
    let tokenIndex = typeof tokenOffset === "number" ? tokenOffset : 0;
    if (tokens && Array.isArray(tokens)) {
      for (const tokenText of tokens) {
        await broadcastStreamToken(webhook.channelId, {
          messageId,
          token: tokenText,
          index: tokenIndex++,
        });
      }
    }

    // Handle completion
    if (done) {
      const resolvedContent =
        (finalContent as string) || (tokens ? tokens.join("") : "");

      await finalizeStreamCompletion({
        channelId: webhook.channelId,
        messageId,
        finalContent: resolvedContent,
        metadata: metadataResult.metadata,
      });

      return NextResponse.json({
        ok: true,
        tokensReceived: tokens?.length || 0,
        nextTokenOffset: tokenIndex,
        completed: true,
      });
    }

    return NextResponse.json({
      ok: true,
      tokensReceived: tokens?.length || 0,
      nextTokenOffset: tokenIndex,
    });
  } catch (err) {
    console.error("[v1/webhooks/stream] Webhook stream failed:", err);
    return NextResponse.json(
      { error: "Failed to process stream" },
      { status: 500 },
    );
  }
}

async function verifyWebhookMessageOwnership(
  messageId: string,
  agentId: string,
  channelId: string,
): Promise<{ valid: true } | { valid: false; error: string; status: number }> {
  let message;
  try {
    message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        authorId: true,
        streamingStatus: true,
        isDeleted: true,
      },
    });
  } catch (err) {
    console.error("[v1/webhooks/stream] Ownership check DB query failed:", err);
    return {
      valid: false,
      error: "Internal error during ownership verification",
      status: 500,
    };
  }

  if (!message || message.isDeleted) {
    return { valid: false, error: "Message not found", status: 404 };
  }

  if (message.authorId !== agentId) {
    return {
      valid: false,
      error: "Message does not belong to this webhook's agent",
      status: 403,
    };
  }

  if (message.channelId !== channelId) {
    return {
      valid: false,
      error: "Message does not belong to this webhook's channel",
      status: 403,
    };
  }

  if (message.streamingStatus !== "ACTIVE") {
    return {
      valid: false,
      error: "Message is not in active streaming state",
      status: 409,
    };
  }

  return { valid: true };
}
