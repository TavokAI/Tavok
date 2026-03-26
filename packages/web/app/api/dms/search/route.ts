/**
 * TASK-0022: DM Message Search
 *
 * GET /api/dms/search?q=&dmId=&before=&after=&page=1
 *
 * Full-text search across the current user's DM conversations.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseSearchFilters,
  buildDmSearchQuery,
  PAGE_SIZE,
} from "@/lib/search-query";
import type { SearchResult } from "@/lib/search-query";

interface RawDmSearchRow {
  id: string;
  dmId: string;
  authorId: string;
  content: string;
  highlightedContent: string;
  createdAt: Date;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Get all DM channel IDs where this user is a participant
  const participations = await prisma.dmParticipant.findMany({
    where: { userId: session.user.id },
    select: { dmId: true },
  });
  const participantDmIds = participations.map((p) => p.dmId);

  if (participantDmIds.length === 0) {
    return NextResponse.json({ results: [], hasMore: false });
  }

  // If filtering by specific DM, verify user is a participant
  const dmIdFilter =
    filters.channelId || request.nextUrl.searchParams.get("dmId") || undefined;
  if (dmIdFilter && !participantDmIds.includes(dmIdFilter)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build and execute FTS query
  const sql = buildDmSearchQuery({
    query: filters.query,
    participantDmIds,
    dmId: dmIdFilter,
    after: filters.after,
    before: filters.before,
    page: filters.page,
  });

  const rows = await prisma.$queryRaw<RawDmSearchRow[]>(sql);

  // Detect hasMore
  const hasMore = rows.length > PAGE_SIZE;
  const resultRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Batch-load author info
  const authorIds = new Set(resultRows.map((r) => r.authorId));
  const users =
    authorIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...authorIds] } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Load DM participant names for context (the "other" participant)
  const dmIds = new Set(resultRows.map((r) => r.dmId));
  const otherParticipants =
    dmIds.size > 0
      ? await prisma.dmParticipant.findMany({
          where: {
            dmId: { in: [...dmIds] },
            userId: { not: session.user.id },
          },
          include: { user: { select: { id: true, displayName: true } } },
        })
      : [];
  const dmParticipantMap = new Map(
    otherParticipants.map((p) => [p.dmId, p.user.displayName]),
  );

  // Map to SearchResult
  const results: SearchResult[] = resultRows.map((row) => {
    const user = userMap.get(row.authorId);
    return {
      id: row.id,
      dmId: row.dmId,
      dmParticipantName: dmParticipantMap.get(row.dmId) || "Deleted User",
      authorId: row.authorId,
      authorType: "USER",
      authorName: user?.displayName || "Deleted User",
      authorAvatarUrl: user?.avatarUrl || null,
      content: row.content,
      highlightedContent: row.highlightedContent,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ results, hasMore });
}
