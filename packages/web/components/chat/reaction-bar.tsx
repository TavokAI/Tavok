"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { ReactionData } from "@/lib/hooks/use-channel";

const EMOJI_PRESETS = ["👍", "👎", "✅", "❌", "🚀"];

interface ReactionBarProps {
  messageId: string;
  reactions: ReactionData[];
  onReactionsChange: (reactions: ReactionData[]) => void;
  /** Override API base path for DM reactions. Default: "/api/messages" (TASK-0030) */
  apiBasePath?: string;
}

export function ReactionBar({
  messageId,
  reactions,
  onReactionsChange,
  apiBasePath = "/api/messages",
}: ReactionBarProps) {
  const { data: session } = useSession();
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentUserId = session?.user?.id;

  // F2: Keyboard navigation for emoji picker
  useEffect(() => {
    if (!showPicker) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowPicker(false);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPickerIndex((prev) => (prev + 1) % EMOJI_PRESETS.length);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPickerIndex(
          (prev) => (prev - 1 + EMOJI_PRESETS.length) % EMOJI_PRESETS.length,
        );
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleReaction(EMOJI_PRESETS[pickerIndex]);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showPicker, pickerIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!currentUserId || loading) return;
      setLoading(true);

      const existingReaction = reactions.find(
        (reaction) => reaction.emoji === emoji,
      );
      const hasReacted = existingReaction?.userIds.includes(currentUserId);

      let optimisticReactions: ReactionData[];
      if (hasReacted) {
        optimisticReactions = reactions
          .map((reaction) => {
            if (reaction.emoji === emoji) {
              return {
                ...reaction,
                count: reaction.count - 1,
                userIds: reaction.userIds.filter((id) => id !== currentUserId),
              };
            }
            return reaction;
          })
          .filter((reaction) => reaction.count > 0);
      } else if (existingReaction) {
        optimisticReactions = reactions.map((reaction) => {
          if (reaction.emoji === emoji) {
            return {
              ...reaction,
              count: reaction.count + 1,
              userIds: [...reaction.userIds, currentUserId],
            };
          }
          return reaction;
        });
      } else {
        optimisticReactions = [
          ...reactions,
          { emoji, count: 1, userIds: [currentUserId] },
        ];
      }

      onReactionsChange(optimisticReactions);

      try {
        const method = hasReacted ? "DELETE" : "POST";
        const res = await fetch(`${apiBasePath}/${messageId}/reactions`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });

        if (res.ok) {
          const data = await res.json();
          onReactionsChange(data.reactions || []);
        } else {
          onReactionsChange(reactions);
        }
      } catch {
        onReactionsChange(reactions);
      } finally {
        setLoading(false);
        setShowPicker(false);
      }
    },
    [
      currentUserId,
      loading,
      messageId,
      onReactionsChange,
      reactions,
      apiBasePath,
    ],
  );

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const hasReacted = currentUserId
          ? reaction.userIds.includes(currentUserId)
          : false;

        return (
          <button
            key={reaction.emoji}
            onClick={() => toggleReaction(reaction.emoji)}
            aria-label={`${reaction.emoji} ${reaction.count} reaction${reaction.count !== 1 ? "s" : ""}${hasReacted ? ", you reacted" : ""}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
              hasReacted
                ? "bg-brand/20 text-text-primary ring-1 ring-brand"
                : "bg-background-tertiary text-text-muted hover:bg-background-primary"
            }`}
          >
            <span>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          onClick={() => {
            setShowPicker((prev) => !prev);
            setPickerIndex(0);
          }}
          aria-label="Add reaction"
          aria-expanded={showPicker}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-background-tertiary text-text-muted opacity-0 transition hover:bg-background-primary hover:text-text-primary group-hover:opacity-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        {showPicker && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPicker(false)}
              aria-hidden="true"
            />
            <div
              ref={pickerRef}
              role="listbox"
              aria-label="Choose a reaction"
              className="absolute bottom-full left-0 z-50 mb-1 rounded-lg border border-background-tertiary bg-background-floating p-2 shadow-xl"
            >
              <div className="grid grid-cols-5 gap-1">
                {EMOJI_PRESETS.map((emoji, index) => (
                  <button
                    key={emoji}
                    role="option"
                    aria-selected={index === pickerIndex}
                    aria-label={emoji}
                    onClick={() => toggleReaction(emoji)}
                    className={`flex h-8 w-8 items-center justify-center rounded text-base transition ${
                      index === pickerIndex
                        ? "bg-brand/20 ring-1 ring-brand"
                        : "hover:bg-background-primary"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
