/**
 * TASK-0022: useSearch hook
 *
 * Manages search state, debounced API calls, and pagination
 * for both server and DM message search.
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SearchResult, SearchFilters } from "@/lib/search-query";

interface UseSearchOptions {
  serverId?: string;
  dmId?: string; // if set, searches only this DM; if unset + no serverId, searches all DMs
  mode: "server" | "dm";
}

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  filters: SearchFilters;
  setFilters: (f: Partial<SearchFilters>) => void;
  results: SearchResult[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
}

const DEBOUNCE_MS = 300;

export function useSearch({
  serverId,
  dmId,
  mode,
}: UseSearchOptions): UseSearchReturn {
  const [query, setQuery] = useState("");
  const [filters, setFiltersState] = useState<SearchFilters>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const setFilters = useCallback((partial: Partial<SearchFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setFiltersState({});
    setResults([]);
    setPage(1);
    setHasMore(false);
  }, []);

  // Debounced search — reset results and page when query or filters change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasMore(false);
      setPage(1);
      return;
    }

    setIsLoading(true);
    setPage(1);

    const timeout = setTimeout(() => {
      void fetchResults(query, filters, 1, false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, serverId, dmId, mode]);

  const fetchResults = useCallback(
    async (q: string, f: SearchFilters, p: number, append: boolean) => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("page", String(p));
        if (f.channelId) params.set("channelId", f.channelId);
        if (f.userId) params.set("userId", f.userId);
        if (f.after) params.set("after", f.after);
        if (f.before) params.set("before", f.before);
        if (f.has && f.has.length > 0) params.set("has", f.has.join(","));

        let url: string;
        if (mode === "server" && serverId) {
          url = `/api/servers/${serverId}/search?${params.toString()}`;
        } else {
          if (dmId) params.set("dmId", dmId);
          url = `/api/dms/search?${params.toString()}`;
        }

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        if (append) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setHasMore(data.hasMore);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Search error:", err);
        }
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [serverId, dmId, mode],
  );

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !query.trim()) return;
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchResults(query, filters, nextPage, true);
  }, [hasMore, isLoading, query, page, filters, fetchResults]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    isLoading,
    hasMore,
    loadMore,
    reset,
  };
}
