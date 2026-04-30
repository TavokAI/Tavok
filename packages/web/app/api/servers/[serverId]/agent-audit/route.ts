import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;
  const permission = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.MANAGE_AGENTS,
  );

  if (!permission.allowed) {
    return NextResponse.json(
      { error: "Missing permission: Manage Agents" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "25", 10) || 25, 1),
    100,
  );

  const events = await prisma.agentAuditLog.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const agentIds = [...new Set(events.map((event) => event.agentId))];
  const agents =
    agentIds.length > 0
      ? await prisma.agent.findMany({
          where: { id: { in: agentIds }, serverId },
          select: { id: true, name: true },
        })
      : [];
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      agentId: event.agentId,
      agentName: agentNames.get(event.agentId) ?? null,
      action: event.action,
      channelId: event.channelId,
      messageId: event.messageId,
      metadata: event.metadata ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}
