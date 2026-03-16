/**
 * TASK-0022: Message Search — Query builder utilities
 *
 * Builds parameterized PostgreSQL full-text search queries using Prisma.sql
 * tagged template literals for SQL injection safety.
 */
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerSearchParams {
  query: string;
  serverId: string;
  channelId?: string;
  userId?: string;
  after?: string; // ISO date
  before?: string; // ISO date
  hasFile?: boolean;
  hasLink?: boolean;
  hasMention?: boolean;
  page?: number; // 1-based
}

export interface DmSearchParams {
  query: string;
  participantDmIds: string[];
  dmId?: string;
  after?: string;
  before?: string;
  page?: number;
}

export interface SearchResult {
  id: string;
  channelId?: string;
  channelName?: string;
  dmId?: string;
  dmParticipantName?: string;
  authorId: string;
  authorType: string;
  authorName?: string;
  authorAvatarUrl?: string | null;
  content: string;
  highlightedContent: string;
  createdAt: string;
}

export interface SearchFilters {
  channelId?: string;
  userId?: string;
  after?: string;
  before?: string;
  has?: string[]; // "file" | "link" | "mention"
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 200;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function parseSearchFilters(searchParams: URLSearchParams): {
  query: string;
  channelId?: string;
  userId?: string;
  after?: string;
  before?: string;
  hasFile: boolean;
  hasLink: boolean;
  hasMention: boolean;
  page: number;
} {
  const query = (searchParams.get("q") || "").trim();
  if (!query) {
    throw new Error("Search query is required");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(
      `Search query must be ${MAX_QUERY_LENGTH} characters or less`,
    );
  }

  const hasParam = searchParams.get("has") || "";
  const hasParts = hasParam
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const pageStr = searchParams.get("page");
  const page = pageStr ? Math.max(1, parseInt(pageStr, 10) || 1) : 1;

  return {
    query,
    channelId: searchParams.get("channelId") || undefined,
    userId: searchParams.get("userId") || undefined,
    after: searchParams.get("after") || undefined,
    before: searchParams.get("before") || undefined,
    hasFile: hasParts.includes("file"),
    hasLink: hasParts.includes("link"),
    hasMention: hasParts.includes("mention"),
    page,
  };
}

// ---------------------------------------------------------------------------
// Server Message Search Query
// ---------------------------------------------------------------------------

export function buildServerSearchQuery(params: ServerSearchParams): Prisma.Sql {
  const offset = ((params.page || 1) - 1) * PAGE_SIZE;

  // Build dynamic WHERE conditions
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c."serverId" = ${params.serverId}`,
    Prisma.sql`m."isDeleted" = false`,
    Prisma.sql`to_tsvector('english', m.content) @@ plainto_tsquery('english', ${params.query})`,
  ];

  if (params.channelId) {
    conditions.push(Prisma.sql`m."channelId" = ${params.channelId}`);
  }
  if (params.userId) {
    conditions.push(Prisma.sql`m."authorId" = ${params.userId}`);
  }
  if (params.after) {
    conditions.push(Prisma.sql`m."createdAt" >= ${new Date(params.after)}`);
  }
  if (params.before) {
    conditions.push(Prisma.sql`m."createdAt" <= ${new Date(params.before)}`);
  }
  if (params.hasFile) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Attachment" a WHERE a."messageId" = m.id)`,
    );
  }
  if (params.hasLink) {
    conditions.push(Prisma.sql`m.content ~ 'https?://'`);
  }
  if (params.hasMention) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "MessageMention" mm WHERE mm."messageId" = m.id)`,
    );
  }

  const whereClause = Prisma.join(conditions, " AND ");

  return Prisma.sql`
    SELECT
      m.id,
      m."channelId",
      m."authorId",
      m."authorType",
      m.content,
      regexp_replace(
        ts_headline(
          'english',
          m.content,
          plainto_tsquery('english', ${params.query}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20'
        ),
        '<(?!/?(mark)( |>))[^>]*>',
        '',
        'gi'
      ) AS "highlightedContent",
      m."createdAt",
      c.name AS "channelName"
    FROM "Message" m
    JOIN "Channel" c ON m."channelId" = c.id
    WHERE ${whereClause}
    ORDER BY
      ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', ${params.query})) DESC,
      m."createdAt" DESC
    LIMIT ${PAGE_SIZE + 1}
    OFFSET ${offset}
  `;
}

// ---------------------------------------------------------------------------
// DM Message Search Query
// ---------------------------------------------------------------------------

export function buildDmSearchQuery(params: DmSearchParams): Prisma.Sql {
  const offset = ((params.page || 1) - 1) * PAGE_SIZE;

  if (params.participantDmIds.length === 0) {
    // Return a query that returns no results
    return Prisma.sql`SELECT NULL WHERE false`;
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`dm."dmId" = ANY(${params.participantDmIds})`,
    Prisma.sql`dm."isDeleted" = false`,
    Prisma.sql`to_tsvector('english', dm.content) @@ plainto_tsquery('english', ${params.query})`,
  ];

  if (params.dmId) {
    conditions.push(Prisma.sql`dm."dmId" = ${params.dmId}`);
  }
  if (params.after) {
    conditions.push(Prisma.sql`dm."createdAt" >= ${new Date(params.after)}`);
  }
  if (params.before) {
    conditions.push(Prisma.sql`dm."createdAt" <= ${new Date(params.before)}`);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  return Prisma.sql`
    SELECT
      dm.id,
      dm."dmId",
      dm."authorId",
      dm.content,
      ts_headline(
        'english',
        dm.content,
        plainto_tsquery('english', ${params.query}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20'
      ) AS "highlightedContent",
      dm."createdAt"
    FROM "DirectMessage" dm
    WHERE ${whereClause}
    ORDER BY
      ts_rank(to_tsvector('english', dm.content), plainto_tsquery('english', ${params.query})) DESC,
      dm."createdAt" DESC
    LIMIT ${PAGE_SIZE + 1}
    OFFSET ${offset}
  `;
}

export { PAGE_SIZE };
