import { serializeSequence } from "@/lib/api-safety";

interface DmReactionRow {
  emoji: string;
  userId: string;
}

interface DmAuthor {
  displayName: string;
  avatarUrl: string | null;
}

interface DmMessageRecord {
  id: string;
  dmId: string;
  authorId: string;
  content: string;
  sequence: bigint;
  createdAt: Date;
  editedAt: Date | null;
  author: DmAuthor;
  reactions?: DmReactionRow[];
}

export function aggregateDmReactions(reactions: DmReactionRow[]) {
  const reactionMap = new Map<string, string[]>();

  for (const reaction of reactions) {
    const userIds = reactionMap.get(reaction.emoji) || [];
    userIds.push(reaction.userId);
    reactionMap.set(reaction.emoji, userIds);
  }

  return Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

export function serializeDmMessage(message: DmMessageRecord) {
  return {
    id: message.id,
    dmId: message.dmId,
    authorId: message.authorId,
    authorType: "USER" as const,
    authorName: message.author.displayName,
    authorAvatarUrl: message.author.avatarUrl,
    content: message.content,
    type: "STANDARD" as const,
    streamingStatus: null,
    sequence: serializeSequence(message.sequence),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() || null,
    reactions: aggregateDmReactions(message.reactions || []),
  };
}
