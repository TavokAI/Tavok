import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/servers/{serverId}/export — Server data export (L2)
 *
 * Returns a JSON archive of the entire server:
 * - Server metadata
 * - Channels and their messages
 * - Agents (no encrypted keys)
 * - Members
 *
 * Auth: server owner only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;

  try {
    // Verify ownership
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, ownerId: true, createdAt: true },
    });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (server.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the server owner can export" },
        { status: 403 },
      );
    }

    const [channels, agents, members] = await Promise.all([
      // Channels with messages
      prisma.channel.findMany({
        where: { serverId },
        select: {
          id: true,
          name: true,
          type: true,
          topic: true,
          position: true,
          createdAt: true,
          messages: {
            where: { isDeleted: false },
            select: {
              id: true,
              authorId: true,
              authorType: true,
              content: true,
              type: true,
              createdAt: true,
              editedAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { position: "asc" },
      }),
      // Agents (no encrypted keys)
      prisma.agent.findMany({
        where: { serverId },
        select: {
          id: true,
          name: true,
          llmProvider: true,
          llmModel: true,
          isActive: true,
          triggerMode: true,
          connectionMethod: true,
          systemPrompt: true,
          createdAt: true,
        },
      }),
      // Members
      prisma.member.findMany({
        where: { serverId },
        select: {
          userId: true,
          user: {
            select: { displayName: true, username: true },
          },
          joinedAt: true,
        },
      }),
    ]);

    const exportData = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      server: {
        id: server.id,
        name: server.name,
        createdAt: server.createdAt,
      },
      channels: channels.map((ch) => ({
        ...ch,
        messageCount: ch.messages.length,
      })),
      agents,
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        username: m.user.username,
        joinedAt: m.joinedAt,
      })),
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="tavok-server-${serverId}.json"`,
      },
    });
  } catch (error) {
    console.error("[servers/export] Export failed:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
