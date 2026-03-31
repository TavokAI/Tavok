/**
 * TASK-0022: Server Message Search
 *
 * GET /api/servers/{serverId}/search?q=&channelId=&userId=&before=&after=&has=&page=1
 *
 * Full-text search across all messages in a server. Requires membership.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkMembership } from "@/lib/check-member-permission";
import { parseSearchFilters } from "@/lib/search-query";
import { searchServerMessages } from "@/lib/services/MessageService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;

  // Check membership (read-only — no specific permission needed beyond being a member)
  const { isMember } = await checkMembership(session.user.id, serverId);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse and validate search params
  let filters;
  try {
    filters = parseSearchFilters(request.nextUrl.searchParams);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  const { results, hasMore } = await searchServerMessages(prisma, {
    serverId,
    filters,
  });
  return NextResponse.json({ results, hasMore });
}
