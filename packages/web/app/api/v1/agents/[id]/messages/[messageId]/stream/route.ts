import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAgentRequest } from "@/lib/agent-auth";
import {
  broadcastStreamToken,
  broadcastStreamError,
  broadcastToChannel,
} from "@/lib/gateway-client";
import { updateMessage } from "@/lib/internal-api-client";
import { checkAgentRateLimit } from "@/lib/rate-limit";
import { logAgentAction } from "@/lib/agent-audit";
import { validateOptionalMessageMetadata } from "@/lib/message-metadata-contract";
import { finalizeStreamCompletion } from "@/lib/stream-finalization";

/**
 * POST /api/v1/agents/{id}/messages/{messageId}/stream — Stream tokens (DEC-0043)
 *
 * Auth: Authorization: Bearer sk-tvk-...
 *
 * Send tokens (any of these field names work):
 *   {"tokens": ["Hello ", "world!"], "done": false}   — array of strings (canonical)
 *   {"token": "Hello world", "done": false}            — singular string
 *   {"text": "Hello world"}                            — alias
 *   {"content": "Hello world"}                         — alias
 *   {"chunk": "Hello world"}                           — alias
 *   {"delta": "Hello world"}                           — alias
 *
 * Complete:    {"tokens": ["last"], "done": true, "finalContent": "...", "metadata": {...}}
 * Thinking:    {"thinking": {"phase": "Searching", "detail": "..."}}
 * Error:       {"error": "Something went wrong"}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: agentId, messageId } = await params;

  const agent = await authenticateAgentRequest(request);
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  // ── Rate limiting (per-agent, critical for stream token flood prevention) ──
  const rateCheck = checkAgentRateLimit(agent.agentId);
  if (!rateCheck.allowed) {
    logAgentAction({
      agentId: agent.agentId,
      serverId: agent.serverId,
      action: "rate_limited",
      messageId,
    });
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retryAfterMs: rateCheck.resetAt - Date.now(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
          ),
        },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { done, finalContent, metadata, thinking, error, tokenOffset } =
    body as {
      done?: boolean;
      finalContent?: string;
      metadata?: Record<string, unknown>;
      thinking?: { phase: string; detail?: string };
      error?: string;
      tokenOffset?: number;
    };

  // Accept multiple token field names — agents naturally use different names.
  // Normalize everything to string[] for processing.
  let tokens: string[] | undefined;
  if (Array.isArray(body.tokens)) {
    tokens = body.tokens;
  } else if (typeof body.tokens === "string") {
    tokens = [body.tokens];
  } else if (typeof body.token === "string") {
    tokens = [body.token];
  } else if (typeof body.text === "string") {
    tokens = [body.text];
  } else if (typeof body.content === "string") {
    tokens = [body.content];
  } else if (typeof body.chunk === "string") {
    tokens = [body.chunk];
  } else if (typeof body.delta === "string") {
    tokens = [body.delta];
  }

  // Reject requests with no recognized fields (prevent silent data loss)
  if (!tokens && !done && !thinking && !error) {
    return NextResponse.json(
      {
        error:
          'No recognized field. Send tokens via: "tokens" (string[]), "token", "text", "content", "chunk", or "delta" (string). Or use "done", "thinking", or "error".',
      },
      { status: 400 },
    );
  }

  // Verify message ownership and resolve channelId from DB (not from request body)
  const ownership = await verifyMessageOwnership(messageId, agent.agentId);
  if (!ownership.valid) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const resolvedChannelId = ownership.channelId;
  const metadataResult = validateOptionalMessageMetadata(metadata);
  if (!metadataResult.ok) {
    return NextResponse.json({ error: metadataResult.error }, { status: 400 });
  }

  try {
    // Handle error
    if (error) {
      logAgentAction({
        agentId: agent.agentId,
        serverId: agent.serverId,
        action: "stream_error",
        channelId: resolvedChannelId,
        messageId,
        metadata: { error },
      });
      await broadcastStreamError(resolvedChannelId, {
        messageId,
        error,
        partialContent: finalContent || null,
      });

      await updateMessage(messageId, {
        streamingStatus: "ERROR",
        content: finalContent || `*[Error: ${error}]*`,
      });

      return NextResponse.json({ ok: true });
    }

    // Handle thinking
    if (thinking) {
      await broadcastToChannel(`room:${resolvedChannelId}`, "stream_thinking", {
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
        await broadcastStreamToken(resolvedChannelId, {
          messageId,
          token: tokenText,
          index: tokenIndex++,
        });
      }
    }

    // Handle completion
    if (done) {
      logAgentAction({
        agentId: agent.agentId,
        serverId: agent.serverId,
        action: "stream_complete",
        channelId: resolvedChannelId,
        messageId,
        metadata: { tokensReceived: tokens?.length || 0 },
      });
      const resolvedContent = finalContent || (tokens ? tokens.join("") : "");

      await finalizeStreamCompletion({
        channelId: resolvedChannelId,
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
    console.error("[v1/agents/stream] Agent stream failed:", err);
    return NextResponse.json(
      { error: "Failed to process stream" },
      { status: 500 },
    );
  }
}

async function verifyMessageOwnership(
  messageId: string,
  agentId: string,
): Promise<
  | { valid: true; channelId: string }
  | { valid: false; error: string; status: number }
> {
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
    console.error("[v1/agents/stream] Ownership check DB query failed:", err);
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
      error: "Message does not belong to this agent",
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

  return { valid: true, channelId: message.channelId };
}
