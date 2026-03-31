import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAgentRequest } from "@/lib/agent-auth";
import { checkAgentRateLimit } from "@/lib/rate-limit";
import { logAgentAction } from "@/lib/agent-audit";
import { verifyAgentChannelAccess } from "@/lib/agent-channel-acl";
import { listAgentChannelMessages } from "@/lib/services/MessageService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  const { id: agentId, channelId } = await params;

  const agent = await authenticateAgentRequest(request);
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  const channelAccess = await verifyAgentChannelAccess(agent, channelId);
  if (!channelAccess.ok) {
    return NextResponse.json(
      { error: channelAccess.error },
      { status: channelAccess.status },
    );
  }

  const rateCheck = checkAgentRateLimit(agent.agentId);
  if (!rateCheck.allowed) {
    logAgentAction({
      agentId: agent.agentId,
      serverId: agent.serverId,
      action: "rate_limited",
      channelId,
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

  logAgentAction({
    agentId: agent.agentId,
    serverId: agent.serverId,
    action: "channel_history_read",
    channelId,
  });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
    100,
  );
  const before = searchParams.get("before");
  const afterSequence = searchParams.get("after_sequence");

  try {
    const payload = await listAgentChannelMessages(prisma, {
      channelId,
      limit,
      before,
      afterSequence,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RangeError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid cursor parameter" },
        { status: 400 },
      );
    }
    console.error(
      "[v1/agents/channels/messages] Channel history fetch failed:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}
