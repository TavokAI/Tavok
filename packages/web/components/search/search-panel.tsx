/**
 * TASK-0022: Search Panel
 *
 * Slide-in panel for full-text message search with filters and results.
 * Used in both server channels and DM views.
 */
"use client";

import { useRef, useEffect } from "react";
import { Search, X, Hash, Loader2 } from "lucide-react";
import { useSearch } from "@/lib/hooks/use-search";
import { formatTime } from "@/lib/format-time";
import type { SearchResult } from "@/lib/search-query";

interface SearchPanelProps {
  serverId?: string;
  dmId?: string;
  mode: "server" | "dm";
  channels?: { id: string; name: string }[];
  members?: { id: string; name: string }[];
  onClose: () => void;
  onJumpToMessage: (channelOrDmId: string, messageId: string) => void;
}

export function SearchPanel({
  serverId,
  dmId,
  mode,
  channels,
  members,
  onClose,
  onJumpToMessage,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    isLoading,
    hasMore,
    loadMore,
  } = useSearch({ serverId, dmId, mode });

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-full flex-col border-l border-background-tertiary bg-background-primary shadow-xl"
      data-testid="search-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-background-tertiary px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Search</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary transition-colors"
          data-testid="search-close-btn"
          aria-label="Close search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full rounded-md border border-background-tertiary bg-background-secondary py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-cyan focus:outline-none"
            data-testid="search-input"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-dim" />
          )}
        </div>
      </div>

      {/* Filters */}
      {mode === "server" && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {/* Channel filter */}
          {channels && channels.length > 0 && (
            <select
              value={filters.channelId || ""}
              onChange={(e) => setFilters({ channelId: e.target.value || undefined })}
              className="rounded border border-background-tertiary bg-background-secondary px-2 py-1 text-xs text-text-secondary focus:border-accent-cyan focus:outline-none"
              data-testid="search-filter-channel"
            >
              <option value="">All channels</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          )}

          {/* User filter */}
          {members && members.length > 0 && (
            <select
              value={filters.userId || ""}
              onChange={(e) => setFilters({ userId: e.target.value || undefined })}
              className="rounded border border-background-tertiary bg-background-secondary px-2 py-1 text-xs text-text-secondary focus:border-accent-cyan focus:outline-none"
              data-testid="search-filter-user"
            >
              <option value="">All users</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* Has filter chips */}
          <div className="flex gap-1">
            {(["file", "link", "mention"] as const).map((hasType) => {
              const isActive = filters.has?.includes(hasType);
              return (
                <button
                  key={hasType}
                  onClick={() => {
                    const current = filters.has || [];
                    const next = isActive
                      ? current.filter((h) => h !== hasType)
                      : [...current, hasType];
                    setFilters({ has: next.length > 0 ? next : undefined });
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
                      : "bg-background-tertiary text-text-dim hover:text-text-secondary"
                  }`}
                  data-testid={`search-filter-has-${hasType}`}
                >
                  has:{hasType}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto" data-testid="search-results">
        {/* Empty state: no query */}
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Search className="h-10 w-10 text-text-dim/50 mb-3" />
            <p className="text-sm text-text-muted">Search messages</p>
            <p className="text-xs text-text-dim mt-1">
              Find messages by content, user, or channel
            </p>
          </div>
        )}

        {/* Empty state: no results */}
        {query.trim() && !isLoading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-text-muted">No results found</p>
            <p className="text-xs text-text-dim mt-1">
              Try different keywords or filters
            </p>
          </div>
        )}

        {/* Result list */}
        {results.map((result) => (
          <SearchResultItem
            key={result.id}
            result={result}
            mode={mode}
            onClick={() => {
              const targetId = mode === "server" ? result.channelId! : result.dmId!;
              onJumpToMessage(targetId, result.id);
            }}
          />
        ))}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={loadMore}
              disabled={isLoading}
              className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors disabled:opacity-50"
              data-testid="search-load-more"
            >
              {isLoading ? "Loading..." : "Load more results"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Result Item
// ---------------------------------------------------------------------------

function SearchResultItem({
  result,
  mode,
  onClick,
}: {
  result: SearchResult;
  mode: "server" | "dm";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left hover:bg-background-secondary/60 transition-colors border-b border-background-tertiary/50"
      data-testid="search-result-item"
    >
      {/* Author + channel + time */}
      <div className="flex items-center gap-2 mb-1">
        {/* Avatar */}
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-background-tertiary text-[10px] font-semibold text-text-primary">
          {(result.authorName || "?").charAt(0).toUpperCase()}
        </div>

        <span className="text-xs font-semibold text-text-primary truncate">
          {result.authorName}
        </span>

        {mode === "server" && result.channelName && (
          <span className="flex items-center gap-0.5 text-[10px] text-text-dim">
            <Hash className="h-2.5 w-2.5" />
            {result.channelName}
          </span>
        )}

        {mode === "dm" && result.dmParticipantName && (
          <span className="text-[10px] text-text-dim">
            DM with {result.dmParticipantName}
          </span>
        )}

        <span className="ml-auto flex-shrink-0 text-[10px] text-text-dim">
          {formatTime(result.createdAt)}
        </span>
      </div>

      {/* Highlighted content */}
      <div
        className="text-xs text-text-secondary leading-relaxed line-clamp-3 [&_mark]:bg-accent-cyan/30 [&_mark]:text-text-primary [&_mark]:rounded-sm [&_mark]:px-0.5"
        dangerouslySetInnerHTML={{ __html: result.highlightedContent }}
        data-testid="search-result-highlight"
      />
    </button>
  );
}
