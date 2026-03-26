/**
 * TASK-0022: Server Message Search
 *
 * GET /api/servers/{serverId}/search?q=&channelId=&userId=&before=&after=&has=&page=1
 *
 * Full-text search across all messages in a server. Requires membership.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkMembership } from "@/lib/check-member-permission";
import {
  parseSearchFilters,
  buildServerSearchQuery,
  PAGE_SIZE,
} from "@/lib/search-query";
import type { SearchResult } from "@/lib/search-query";

interface RawSearchRow {
  id: string;
  channelId: string;
  authorId: string;
  authorType: string;
  content: string;
  highlightedContent: string;
  createdAt: Date;
  channelName: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getServerSession(authOptions);
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

  // Build and execute FTS query
  const sql = buildServerSearchQuery({
    query: filters.query,
    serverId,
    channelId: filters.channelId,
    userId: filters.userId,
    after: filters.after,
    before: filters.before,
    hasFile: filters.hasFile,
    hasLink: filters.hasLink,
    hasMention: filters.hasMention,
    page: filters.page,
  });

  const rows = await prisma.$queryRaw<RawSearchRow[]>(sql);

  // Detect hasMore
  const hasMore = rows.length > PAGE_SIZE;
  const resultRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Batch-load author info
  const userAuthorIds = new Set<string>();
  const agentAuthorIds = new Set<string>();
  for (const row of resultRows) {
    if (row.authorType === "USER") {
      userAuthorIds.add(row.authorId);
    } else if (row.authorType === "AGENT") {
      agentAuthorIds.add(row.authorId);
    }
  }

  const [users, agents] = await Promise.all([
    userAuthorIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: [...userAuthorIds] } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [],
    agentAuthorIds.size > 0
      ? prisma.agent.findMany({
          where: { id: { in: [...agentAuthorIds] } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Map to SearchResult
  const results: SearchResult[] = resultRows.map((row) => {
    // L1: Consistent fallback for deleted authors (matches BUG-002 pattern)
    let authorName =
      row.authorType === "AGENT" ? "Deleted Agent" : "Deleted User";
    let authorAvatarUrl: string | null = null;

    if (row.authorType === "USER") {
      const user = userMap.get(row.authorId);
      if (user) {
        authorName = user.displayName;
        authorAvatarUrl = user.avatarUrl;
      }
    } else if (row.authorType === "AGENT") {
      const agent = agentMap.get(row.authorId);
      if (agent) {
        authorName = agent.name;
        authorAvatarUrl = agent.avatarUrl;
      }
    }

    return {
      id: row.id,
      channelId: row.channelId,
      channelName: row.channelName,
      authorId: row.authorId,
      authorType: row.authorType,
      authorName,
      authorAvatarUrl,
      content: row.content,
      highlightedContent: row.highlightedContent,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ results, hasMore });
}
