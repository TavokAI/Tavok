import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildServerSearchQuery,
  PAGE_SIZE,
  type SearchResult,
  type ServerSearchParams,
} from "@/lib/search-query";
import { serializeSequence } from "@/lib/api-safety";

type MessageServiceClient = Pick<PrismaClient, "$queryRaw"> & {
  message: PrismaClient["message"];
  user: PrismaClient["user"];
  agent: PrismaClient["agent"];
};

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

interface AuthorMaps {
  userMap: Map<string, { displayName: string; avatarUrl: string | null }>;
  agentMap: Map<string, { name: string; avatarUrl: string | null }>;
}

async function loadAuthorMaps(
  prismaClient: MessageServiceClient,
  messages: Array<{ authorId: string; authorType: string }>,
  includeLegacyAgentUserFallback = false,
): Promise<AuthorMaps> {
  const userAuthorIds = [
    ...new Set(
      messages
        .filter((message) => message.authorType === "USER")
        .map((message) => message.authorId),
    ),
  ];
  const agentAuthorIds = [
    ...new Set(
      messages
        .filter((message) =>
          includeLegacyAgentUserFallback
            ? message.authorType === "AGENT" || message.authorType === "USER"
            : message.authorType === "AGENT",
        )
        .map((message) => message.authorId),
    ),
  ];

  const [users, agents] = await Promise.all([
    userAuthorIds.length > 0
      ? prismaClient.user.findMany({
          where: { id: { in: userAuthorIds } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [],
    agentAuthorIds.length > 0
      ? prismaClient.agent.findMany({
          where: { id: { in: agentAuthorIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [],
  ]);

  return {
    userMap: new Map(
      users.map((user) => [
        user.id,
        { displayName: user.displayName, avatarUrl: user.avatarUrl },
      ]),
    ),
    agentMap: new Map(
      agents.map((agent) => [
        agent.id,
        { name: agent.name, avatarUrl: agent.avatarUrl },
      ]),
    ),
  };
}

function mapReactions(reactions: Array<{ emoji: string; userId: string }>) {
  const reactionMap = new Map<string, string[]>();
  for (const reaction of reactions) {
    const existing = reactionMap.get(reaction.emoji) || [];
    existing.push(reaction.userId);
    reactionMap.set(reaction.emoji, existing);
  }

  return Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

export async function listInternalMessages(
  prismaClient: MessageServiceClient,
  input: {
    channelId: string;
    afterSequence: string | null;
    before: string | null;
    limit: number;
  },
) {
  const where: Prisma.MessageWhereInput = {
    channelId: input.channelId,
    isDeleted: false,
  };

  if (input.afterSequence !== null) {
    where.sequence = { gt: BigInt(input.afterSequence) };
  } else if (input.before) {
    where.id = { lt: input.before };
  }

  const messages = await prismaClient.message.findMany({
    where,
    include: {
      reactions: {
        select: { emoji: true, userId: true },
      },
    },
    orderBy: input.afterSequence ? { sequence: "asc" } : { id: "desc" },
    take: input.limit + 1,
  });

  const hasMore = messages.length > input.limit;
  if (hasMore) {
    messages.pop();
  }

  if (!input.afterSequence) {
    messages.reverse();
  }

  const { userMap, agentMap } = await loadAuthorMaps(
    prismaClient,
    messages,
    true,
  );

  const payload = messages.map((message) => {
    let authorName =
      message.authorType === "AGENT" ? "Deleted Agent" : "Deleted User";
    let authorAvatarUrl: string | null = null;

    if (message.authorType === "AGENT") {
      const agent = agentMap.get(message.authorId);
      if (agent) {
        authorName = agent.name;
        authorAvatarUrl = agent.avatarUrl;
      }
    } else if (message.authorType === "USER") {
      const user = userMap.get(message.authorId);
      if (user) {
        authorName = user.displayName;
        authorAvatarUrl = user.avatarUrl;
      } else {
        const agent = agentMap.get(message.authorId);
        if (agent) {
          authorName = agent.name;
          authorAvatarUrl = agent.avatarUrl;
        }
      }
    } else if (message.authorType === "SYSTEM") {
      authorName = "System";
      authorAvatarUrl = null;
    }

    return {
      id: message.id,
      channelId: message.channelId,
      authorId: message.authorId,
      authorType: message.authorType,
      authorName,
      authorAvatarUrl,
      content: message.content,
      type: message.type,
      streamingStatus: message.streamingStatus,
      sequence: serializeSequence(message.sequence),
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() || null,
      thinkingTimeline: message.thinkingTimeline
        ? JSON.parse(message.thinkingTimeline)
        : undefined,
      tokenHistory: message.tokenHistory
        ? JSON.parse(message.tokenHistory)
        : undefined,
      checkpoints: message.checkpoints
        ? JSON.parse(message.checkpoints)
        : undefined,
      metadata: message.metadata || undefined,
      reactions: mapReactions(message.reactions),
    };
  });

  return { messages: payload, hasMore };
}

export async function listAgentChannelMessages(
  prismaClient: MessageServiceClient,
  input: {
    channelId: string;
    limit: number;
    before: string | null;
    afterSequence: string | null;
  },
) {
  const where: Prisma.MessageWhereInput = {
    channelId: input.channelId,
    isDeleted: false,
  };

  if (input.afterSequence !== null) {
    const parsed = BigInt(input.afterSequence);
    if (parsed < 0n) {
      throw new RangeError("after_sequence must be a non-negative integer");
    }
    where.sequence = { gt: parsed };
  } else if (input.before) {
    where.id = { lt: input.before };
  }

  const messages = await prismaClient.message.findMany({
    where,
    include: {
      reactions: {
        select: { emoji: true, userId: true },
      },
    },
    orderBy: input.afterSequence ? { sequence: "asc" } : { id: "desc" },
    take: input.limit + 1,
  });

  const hasMore = messages.length > input.limit;
  if (hasMore) {
    messages.pop();
  }

  if (!input.afterSequence) {
    messages.reverse();
  }

  const { userMap, agentMap } = await loadAuthorMaps(prismaClient, messages);

  const payload = messages.map((message) => {
    let authorName =
      message.authorType === "AGENT" ? "Deleted Agent" : "Deleted User";
    let authorAvatarUrl: string | null = null;

    if (message.authorType === "AGENT") {
      const agent = agentMap.get(message.authorId);
      if (agent) {
        authorName = agent.name;
        authorAvatarUrl = agent.avatarUrl;
      }
    } else if (message.authorType === "USER") {
      const user = userMap.get(message.authorId);
      if (user) {
        authorName = user.displayName;
        authorAvatarUrl = user.avatarUrl;
      }
    }

    return {
      id: message.id,
      channelId: message.channelId,
      authorId: message.authorId,
      authorType: message.authorType,
      authorName,
      authorAvatarUrl,
      content: message.content,
      type: message.type,
      streamingStatus: message.streamingStatus,
      sequence: serializeSequence(message.sequence),
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() || null,
      metadata: message.metadata || undefined,
      reactions: mapReactions(message.reactions),
    };
  });

  return { messages: payload, hasMore };
}

export async function searchServerMessages(
  prismaClient: MessageServiceClient,
  input: {
    serverId: string;
    filters: Omit<ServerSearchParams, "serverId">;
  },
) {
  const sql = buildServerSearchQuery({
    query: input.filters.query,
    serverId: input.serverId,
    channelId: input.filters.channelId,
    userId: input.filters.userId,
    after: input.filters.after,
    before: input.filters.before,
    hasFile: input.filters.hasFile,
    hasLink: input.filters.hasLink,
    hasMention: input.filters.hasMention,
    page: input.filters.page,
  });

  const rows = await prismaClient.$queryRaw<RawSearchRow[]>(sql);
  const hasMore = rows.length > PAGE_SIZE;
  const resultRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const { userMap, agentMap } = await loadAuthorMaps(prismaClient, resultRows);

  const results: SearchResult[] = resultRows.map((row) => {
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

  return { results, hasMore };
}
