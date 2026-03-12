import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { authenticateAgentById } from "@/lib/agent-auth";
import { logAgentAction } from "@/lib/agent-audit";

/**
 * POST /api/v1/agents/{id}/rotate-key — Rotate agent API key
 *
 * Generates a new API key, invalidating the old one immediately.
 * Returns the new raw key (shown once, never stored).
 *
 * Auth: Authorization: Bearer sk-tvk-... (current key, consumed on success)
 *
 * Use case: key leaked, periodic rotation, agent sharing revocation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params;

  const auth = await authenticateAgentById(request, agentId);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Look up the agent to get serverId for audit log
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { serverId: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Generate new key
  const randomBytes = crypto.randomBytes(32);
  const newKey = `sk-tvk-${randomBytes.toString("base64url")}`;
  const newHash = crypto.createHash("sha256").update(newKey).digest("hex");

  try {
    await prisma.agentRegistration.update({
      where: { agentId },
      data: { apiKeyHash: newHash },
    });

    logAgentAction({
      agentId,
      serverId: agent.serverId,
      action: "key_rotate",
      metadata: { note: "Old key invalidated, new key issued" },
    });

    return NextResponse.json({
      apiKey: newKey,
      message:
        "API key rotated successfully. The old key is immediately invalid. Store this new key securely — it will not be shown again.",
    });
  } catch (error) {
    console.error("[v1/agents/rotate-key] Key rotation failed:", error);
    return NextResponse.json({ error: "Key rotation failed" }, { status: 500 });
  }
}
