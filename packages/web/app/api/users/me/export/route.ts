import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/users/me/export — Personal data export (L2, GDPR-style)
 *
 * Returns a JSON archive of the authenticated user's data:
 * - Profile info (no password hash)
 * - All messages across all servers
 * - Server memberships
 * - DM conversations and messages
 *
 * Auth: session-based (logged-in user only).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [user, memberships, messages, dmParticipations, dmMessages] =
      await Promise.all([
        // User profile (exclude password)
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            createdAt: true,
          },
        }),
        // Server memberships
        prisma.member.findMany({
          where: { userId },
          select: {
            id: true,
            serverId: true,
            server: { select: { name: true } },
            joinedAt: true,
          },
        }),
        // All messages by this user
        prisma.message.findMany({
          where: { authorId: userId, authorType: "USER", isDeleted: false },
          select: {
            id: true,
            channelId: true,
            content: true,
            createdAt: true,
            editedAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        // DM participations
        prisma.dmParticipant.findMany({
          where: { userId },
          select: {
            dmId: true,
            dm: {
              select: {
                id: true,
                createdAt: true,
                participants: {
                  select: {
                    user: { select: { displayName: true } },
                  },
                },
              },
            },
          },
        }),
        // DM messages by this user
        prisma.directMessage.findMany({
          where: { authorId: userId, isDeleted: false },
          select: {
            id: true,
            dmId: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    const exportData = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      user,
      memberships: memberships.map((m) => ({
        serverId: m.serverId,
        serverName: m.server.name,
        joinedAt: m.joinedAt,
      })),
      messages,
      directMessages: {
        conversations: dmParticipations.map((p) => ({
          dmId: p.dmId,
          participants: p.dm.participants.map(
            (pp: { user: { displayName: string } }) => pp.user.displayName,
          ),
          createdAt: p.dm.createdAt,
        })),
        messages: dmMessages,
      },
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="tavok-export-${userId}.json"`,
      },
    });
  } catch (error) {
    console.error("[users/me/export] Export failed:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
