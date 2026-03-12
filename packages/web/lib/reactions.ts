import { NextResponse } from "next/server";
import { broadcastToChannel } from "@/lib/gateway-client";

export const ALLOWED_EMOJIS = ["👍", "👎", "✅", "❌", "🚀"];

interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

/** Aggregate raw reaction rows into emoji → userIds groups. */
export function aggregateReactions(
  reactions: { emoji: string; userId: string }[],
): AggregatedReaction[] {
  const aggregated = new Map<string, string[]>();
  for (const reaction of reactions) {
    const existing = aggregated.get(reaction.emoji) || [];
    existing.push(reaction.userId);
    aggregated.set(reaction.emoji, existing);
  }

  return Array.from(aggregated.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

/** Build a NextResponse with aggregated reactions and hasReacted flag. */
export function reactionsResponse(
  reactions: AggregatedReaction[],
  currentUserId: string,
) {
  return NextResponse.json({
    reactions: reactions.map((r) => ({
      ...r,
      hasReacted: r.userIds.includes(currentUserId),
    })),
  });
}

/** Broadcast a reaction_update event to all connected clients on a topic. */
export function broadcastReactionUpdate(
  topic: string,
  messageId: string,
  reactions: AggregatedReaction[],
) {
  broadcastToChannel(topic, "reaction_update", {
    messageId,
    reactions,
  }).catch((err) => {
    console.error("Failed to broadcast reaction update:", err);
  });
}
