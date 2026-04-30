import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import { authenticateAgentRequest } from "@/lib/agent-auth";
import {
  broadcastMessageNew,
  broadcastStreamStart,
  fetchChannelSequence,
} from "@/lib/gateway-client";
import { getPublicBaseUrl } from "@/lib/internal-auth";
import { persistMessage } from "@/lib/internal-api-client";
import { checkAgentRateLimit } from "@/lib/rate-limit";
import { logAgentAction } from "@/lib/agent-audit";
import { verifyAgentChannelAccess } from "@/lib/agent-channel-acl";
import {
  AGENT_CAPABILITIES,
  hasAgentCapability,
  missingCapabilityError,
} from "@/lib/agent-capabilities";

const AGENT_MESSAGE_TYPES = new Set([
  "STANDARD",
  "TOOL_CALL",
  "TOOL_RESULT",
  "CODE_BLOCK",
  "ARTIFACT",
  "STATUS",
]);

const TYPED_ARTIFACT_MESSAGE_TYPES = new Set([
  "TOOL_CALL",
  "TOOL_RESULT",
  "CODE_BLOCK",
  "ARTIFACT",
  "STATUS",
]);

/**
 * GET /api/v1/agents/{id}/messages — Poll for messages (DEC-0043, Phase 4)
 *
 * REST polling endpoint. Agent calls this to receive messages that triggered it.
 * Supports long-polling via ?wait=N (seconds).
 *
 * Auth: Authorization: Bearer sk-tvk-...
 *
 * Query params:
 *   channel_id — filter to specific channel
 *   limit — max messages (default 50, max 100)
 *   ack — if true, mark returned messages as delivered
 *   wait — long-polling timeout in seconds (0-30, default 0)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params;

  const agent = await authenticateAgentRequest(request);
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  if (!hasAgentCapability(agent, AGENT_CAPABILITIES.READ_HISTORY)) {
    return NextResponse.json(
      { error: missingCapabilityError(AGENT_CAPABILITIES.READ_HISTORY) },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channel_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const ack = searchParams.get("ack") === "true";
  const wait = Math.min(parseInt(searchParams.get("wait") || "0", 10), 30);

  await logAgentAction({
    agentId: agent.agentId,
    serverId: agent.serverId,
    action: "message_poll",
    channelId: channelId || undefined,
  });

  try {
    // Polling the full queue is agent-scoped. If the caller narrows to a
    // channel, enforce ChannelAgent so the filter itself can't be used to
    // probe unassigned channels.
    if (channelId) {
      const channelAccess = await verifyAgentChannelAccess(agent, channelId);
      if (!channelAccess.ok) {
        return NextResponse.json(
          { error: channelAccess.error },
          { status: channelAccess.status },
        );
      }
    }

    // Build query
    const where: Record<string, unknown> = {
      agentId: agentId,
      delivered: false,
    };
    if (channelId) {
      where.channelId = channelId;
    }

    // Initial fetch
    let messages = await prisma.agentMessage.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    // Long-poll: if no messages and wait > 0, retry with increasing intervals.
    // Uses 1s → 2s → 3s backoff to reduce DB pressure during quiet periods.
    if (messages.length === 0 && wait > 0) {
      const deadline = Date.now() + wait * 1000;
      let interval = 1000;
      while (Date.now() < deadline && messages.length === 0) {
        const remaining = deadline - Date.now();
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(interval, remaining)),
        );
        if (Date.now() >= deadline) break;
        messages = await prisma.agentMessage.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: limit,
        });
        interval = Math.min(interval + 1000, 3000);
      }
    }

    // Atomic find+ack: re-fetch and mark as delivered inside a transaction
    // to prevent duplicate delivery under concurrent pollers.
    if (ack && messages.length > 0) {
      const ids = messages.map((m) => m.id);
      messages = await prisma.$transaction(async (tx) => {
        const claimed = await tx.agentMessage.findMany({
          where: { id: { in: ids }, delivered: false },
          orderBy: { createdAt: "asc" },
        });
        if (claimed.length > 0) {
          await tx.agentMessage.updateMany({
            where: { id: { in: claimed.map((m) => m.id) } },
            data: { delivered: true },
          });
        }
        return claimed;
      });
    }

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        messageId: m.messageId,
        content: m.content,
        authorId: m.authorId,
        authorName: m.authorName,
        authorType: m.authorType,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore: messages.length === limit,
      pollAgainAfterMs: messages.length === 0 ? 1000 : 0,
    });
  } catch (error) {
    console.error("[v1/agents/messages] Agent message poll failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/agents/{id}/messages — Send a message or start streaming (DEC-0043)
 *
 * Auth: Authorization: Bearer sk-tvk-...
 *
 * Simple message: {"channelId": "...", "content": "Hello!"}
 * Start stream: {"channelId": "...", "streaming": true}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params;

  const agent = await authenticateAgentRequest(request);
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { channelId, content, streaming, type } = body as {
    channelId?: string;
    content?: string;
    streaming?: boolean;
    type?: string;
  };

  if (!channelId || typeof channelId !== "string") {
    return NextResponse.json(
      { error: "channelId is required" },
      { status: 400 },
    );
  }

  const messageType =
    typeof type === "string" && AGENT_MESSAGE_TYPES.has(type)
      ? type
      : "STANDARD";

  if (streaming) {
    if (!hasAgentCapability(agent, AGENT_CAPABILITIES.STREAM)) {
      return NextResponse.json(
        { error: missingCapabilityError(AGENT_CAPABILITIES.STREAM) },
        { status: 403 },
      );
    }
  } else if (!hasAgentCapability(agent, AGENT_CAPABILITIES.SEND_MESSAGES)) {
    return NextResponse.json(
      { error: missingCapabilityError(AGENT_CAPABILITIES.SEND_MESSAGES) },
      { status: 403 },
    );
  }

  if (
    TYPED_ARTIFACT_MESSAGE_TYPES.has(messageType) &&
    !hasAgentCapability(agent, AGENT_CAPABILITIES.SEND_ARTIFACTS)
  ) {
    return NextResponse.json(
      { error: missingCapabilityError(AGENT_CAPABILITIES.SEND_ARTIFACTS) },
      { status: 403 },
    );
  }

  // ── Rate limiting (per-agent) ──
  const rateCheck = checkAgentRateLimit(agent.agentId);
  if (!rateCheck.allowed) {
    await logAgentAction({
      agentId: agent.agentId,
      serverId: agent.serverId,
      action: "rate_limited",
      channelId,
      metadata: { resetAt: rateCheck.resetAt },
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

  const channelAccess = await verifyAgentChannelAccess(agent, channelId);
  if (!channelAccess.ok) {
    return NextResponse.json(
      { error: channelAccess.error },
      { status: channelAccess.status },
    );
  }

  const messageId = generateId();
  const sequence = await fetchChannelSequence(channelId);

  try {
    if (streaming) {
      await logAgentAction({
        agentId: agent.agentId,
        serverId: agent.serverId,
        action: "stream_start",
        channelId,
      });

      // Start streaming
      await persistMessage({
        id: messageId,
        channelId,
        authorId: agent.agentId,
        authorType: "AGENT",
        content: "",
        type: "STREAMING",
        streamingStatus: "ACTIVE",
        sequence,
      });

      await broadcastStreamStart(channelId, {
        messageId,
        agentId: agent.agentId,
        agentName: agent.agentName,
        agentAvatarUrl: agent.agentAvatarUrl,
        sequence,
      });

      const webUrl = getPublicBaseUrl();

      return NextResponse.json(
        {
          messageId,
          sequence,
          streamUrl: `${webUrl}/api/v1/agents/${agentId}/messages/${messageId}/stream`,
        },
        { status: 201 },
      );
    }

    await logAgentAction({
      agentId: agent.agentId,
      serverId: agent.serverId,
      action: "message_send",
      channelId,
    });

    // Simple message
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "content is required (or use streaming: true)" },
        { status: 400 },
      );
    }

    await persistMessage({
      id: messageId,
      channelId,
      authorId: agent.agentId,
      authorType: "AGENT",
      content,
      type: messageType,
      sequence,
    });

    await broadcastMessageNew(channelId, {
      id: messageId,
      channelId,
      authorId: agent.agentId,
      authorType: "AGENT",
      authorName: agent.agentName,
      authorAvatarUrl: agent.agentAvatarUrl,
      content,
      type: messageType,
      streamingStatus: null,
      sequence,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ messageId, sequence });
  } catch (error) {
    console.error("[v1/agents/messages] Agent message send failed:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
