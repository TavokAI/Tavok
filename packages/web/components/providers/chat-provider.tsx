"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasPermission as hasPermissionBit } from "@/lib/permissions";
import { useUnread } from "@/lib/hooks/use-unread";
import type { UnreadState } from "@/lib/hooks/use-unread";
import type { ChannelType } from "@tavok/shared/channel";

interface ServerData {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  memberCount: number;
}

interface ChannelData {
  id: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  defaultAgentId: string | null;
  agentIds?: string[];
}

interface MemberData {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AgentData {
  id: string;
  name: string;
  isActive: boolean;
  llmModel?: string;
  thinkingSteps?: string | null; // JSON array of phase labels
}

interface ServerScopedData {
  channels: ChannelData[];
  members: MemberData[];
  agents: AgentData[];
}

const EMPTY_SERVER_DATA: ServerScopedData = {
  channels: [],
  members: [],
  agents: [],
};

/** Merge a partial update into a single server's scoped data entry. */
export function mergeServerData(
  prev: Record<string, ServerScopedData>,
  id: string,
  patch: Partial<ServerScopedData>,
): Record<string, ServerScopedData> {
  return { ...prev, [id]: { ...EMPTY_SERVER_DATA, ...prev[id], ...patch } };
}

/**
 * Generic fetch-parse-set helper that DRYs up the repetitive pattern shared
 * by refreshChannels, refreshMembers, refreshAgents, and similar functions.
 *
 * Fetches `url`, parses JSON, extracts `data[key]`, and passes the result
 * to `onSuccess`. Logs a consistent `[ChatProvider]` error on failure.
 */
export async function fetchAndSet<T>(
  url: string,
  key: string,
  onSuccess: (items: T[]) => void,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(
        `[ChatProvider] Failed to fetch ${key}: HTTP ${res.status}`,
      );
      return null;
    }
    const data = await res.json();
    const items = (data[key] || []) as T[];
    onSuccess(items);
    return data as Record<string, unknown>;
  } catch (error) {
    console.error(`[ChatProvider] Failed to fetch ${key}:`, error);
    return null;
  }
}

interface ChatContextValue {
  servers: ServerData[];
  serversLoaded: boolean;
  serversError: string | null;
  currentServerId: string | null;
  currentChannelId: string | null;
  currentServerName: string | null;
  currentServerOwnerId: string | null;
  channels: ChannelData[];
  channelsError: string | null;
  members: MemberData[];
  agents: AgentData[];
  serverDataById: Record<string, ServerScopedData>;
  refreshServers: () => Promise<void>;
  refreshChannels: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  ensureServerScopedData: (serverId: string) => Promise<void>;
  refreshServerScopedData: (serverId: string) => Promise<void>;
  userPermissions: bigint;
  isOwner: boolean;
  hasPermission: (permission: bigint) => boolean;
  /** TASK-0016: unread state per channel */
  unreadMap: Map<string, UnreadState>;
  markAsRead: (channelId: string) => void;
  refreshUnread: () => Promise<void>;
  /** TASK-0016: aggregate unread per server (for server sidebar dots) */
  serverUnreadMap: Map<string, { hasUnread: boolean; hasMentions: boolean }>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

/**
 * Parse serverId and channelId from the URL pathname.
 * Expected pattern: /servers/{serverId}/channels/{channelId}
 */
function parsePathIds(pathname: string) {
  const match = pathname.match(/\/servers\/([^/]+)(?:\/channels\/([^/]+))?/);
  return {
    serverId: match?.[1] || null,
    channelId: match?.[2] || null,
  };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { serverId, channelId } = parsePathIds(pathname);

  const [servers, setServers] = useState<ServerData[]>([]);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [serverDataById, setServerDataById] = useState<
    Record<string, ServerScopedData>
  >({});
  const [currentServerName, setCurrentServerName] = useState<string | null>(
    null,
  );
  const [currentServerOwnerId, setCurrentServerOwnerId] = useState<
    string | null
  >(null);
  const [userPermissions, setUserPermissions] = useState<bigint>(BigInt(0));
  const [isOwner, setIsOwner] = useState(false);

  // BUG-003: Clear stale localStorage when server ID changes (e.g., after `tavok init`)
  useEffect(() => {
    if (!serverId) return;

    try {
      const storedServerId = localStorage.getItem("tavok-server-id");
      if (storedServerId && storedServerId !== serverId) {
        // Server ID changed (re-init happened) — clear stale state
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("tavok-") && key !== "tavok-server-id") {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }
      localStorage.setItem("tavok-server-id", serverId);
    } catch {
      // localStorage may be unavailable (SSR, privacy mode)
    }
  }, [serverId]);

  const refreshServers = useCallback(async () => {
    const data = await fetchAndSet<ServerData>("/api/servers", "servers", setServers);
    if (data) {
      setServersError(null);
    } else {
      setServers([]);
      setServersError("Failed to load");
    }
    setServersLoaded(true);
  }, []);

  const refreshChannels = useCallback(async () => {
    if (!serverId) {
      setChannels([]);
      setAgents([]);
      setCurrentServerName(null);
      setCurrentServerOwnerId(null);
      setChannelsError(null);
      return;
    }
    const data = await fetchAndSet<ChannelData>(
      `/api/servers/${serverId}`,
      "channels",
      (nextChannels) => {
        setChannels(nextChannels);
        setServerDataById((prev) =>
          mergeServerData(prev, serverId, { channels: nextChannels }),
        );
      },
    );
    if (data) {
      setChannelsError(null);
      setCurrentServerName((data.name as string) || null);
      setCurrentServerOwnerId((data.ownerId as string) || null);
    } else {
      setChannels([]);
      setCurrentServerName(null);
      setCurrentServerOwnerId(null);
      setChannelsError("Failed to load");
    }
  }, [serverId]);

  const refreshMembers = useCallback(async () => {
    if (!serverId) {
      setMembers([]);
      return;
    }
    await fetchAndSet<MemberData>(
      `/api/servers/${serverId}/members`,
      "members",
      (nextMembers) => {
        setMembers(nextMembers);
        setServerDataById((prev) =>
          mergeServerData(prev, serverId, { members: nextMembers }),
        );
      },
    );
  }, [serverId]);

  const refreshAgents = useCallback(async () => {
    if (!serverId) {
      setAgents([]);
      return;
    }
    await fetchAndSet<AgentData>(
      `/api/servers/${serverId}/agents`,
      "agents",
      (allAgents) => {
        const nextAgents = allAgents.filter((b) => b.isActive);
        setAgents(nextAgents);
        setServerDataById((prev) =>
          mergeServerData(prev, serverId, { agents: nextAgents }),
        );
      },
    );
  }, [serverId]);

  const refreshPermissions = useCallback(async () => {
    if (!serverId) {
      setUserPermissions(BigInt(0));
      setIsOwner(false);
      return;
    }

    try {
      const res = await fetch(`/api/servers/${serverId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setUserPermissions(BigInt(data.permissions || "0"));
        setIsOwner(!!data.isOwner);
      } else {
        console.error(
          `[ChatProvider] Failed to fetch permissions: HTTP ${res.status}`,
        );
        setUserPermissions(BigInt(0));
        setIsOwner(false);
      }
    } catch (error) {
      console.error("[ChatProvider] Failed to fetch permissions:", error);
      setUserPermissions(BigInt(0));
      setIsOwner(false);
    }
  }, [serverId]);

  const hasPermission = useCallback(
    (permission: bigint) => {
      if (isOwner) return true;
      return hasPermissionBit(userPermissions, permission);
    },
    [userPermissions, isOwner],
  );

  // TASK-0016: Unread state for all channels in the current server
  const {
    unreadMap,
    markAsRead: markAsReadHook,
    refreshUnread,
  } = useUnread(serverId);

  // TASK-0016: Aggregate unread per server (for server sidebar dots)
  const [serverUnreadMap, setServerUnreadMap] = useState<
    Map<string, { hasUnread: boolean; hasMentions: boolean }>
  >(new Map());

  const refreshAllServerUnreads = useCallback(
    async (serverList: ServerData[], skipServerId: string | null) => {
      if (serverList.length === 0) return;
      try {
        // Skip the current server — useUnread already fetches it
        const toFetch = serverList.filter((s) => s.id !== skipServerId);
        const results = await Promise.allSettled(
          toFetch.map(async (s) => {
            const res = await fetch(`/api/servers/${s.id}/unread`);
            if (!res.ok)
              return { serverId: s.id, hasUnread: false, hasMentions: false };
            const data = await res.json();
            const channels: { hasUnread: boolean; mentionCount: number }[] =
              data.channels || [];
            return {
              serverId: s.id,
              hasUnread: channels.some((c) => c.hasUnread),
              hasMentions: channels.some((c) => c.mentionCount > 0),
            };
          }),
        );
        setServerUnreadMap((prev) => {
          const nextMap = new Map(prev);
          for (const r of results) {
            if (r.status === "fulfilled") {
              nextMap.set(r.value.serverId, {
                hasUnread: r.value.hasUnread,
                hasMentions: r.value.hasMentions,
              });
            }
          }
          return nextMap;
        });
      } catch (error) {
        console.error("[ChatProvider] Failed to fetch server unreads:", error);
      }
    },
    [],
  );

  // Wrapper that also optimistically updates serverUnreadMap when marking a channel read
  const markAsRead = useCallback(
    (channelId: string) => {
      markAsReadHook(channelId);

      // Also optimistically re-evaluate the current server's aggregate unread state.
      // After marking this channel read, check if any OTHER channel still has unreads.
      if (serverId) {
        setServerUnreadMap((prev) => {
          const next = new Map(prev);
          // Check if there are still other unread channels in this server
          let stillHasUnread = false;
          let stillHasMentions = false;
          for (const [cid, state] of unreadMap) {
            if (cid === channelId) continue; // this one is being marked read
            if (state.hasUnread) stillHasUnread = true;
            if (state.mentionCount > 0) stillHasMentions = true;
          }
          next.set(serverId, {
            hasUnread: stillHasUnread,
            hasMentions: stillHasMentions,
          });
          return next;
        });
      }
    },
    [markAsReadHook, serverId, unreadMap],
  );

  const refreshServerScopedData = useCallback(
    async (targetServerId: string) => {
      if (!targetServerId) return;

      try {
        const [serverRes, membersRes, agentsRes] = await Promise.all([
          fetch(`/api/servers/${targetServerId}`),
          fetch(`/api/servers/${targetServerId}/members`),
          fetch(`/api/servers/${targetServerId}/agents`),
        ]);

        if (!serverRes.ok) return;

        const serverJson = await serverRes.json();
        const membersJson = membersRes.ok
          ? await membersRes.json()
          : { members: [] };
        const agentsJson = agentsRes.ok
          ? await agentsRes.json()
          : { agents: [] };

        setServerDataById((prev) =>
          mergeServerData(prev, targetServerId, {
            channels: serverJson.channels || [],
            members: membersJson.members || [],
            agents: (agentsJson.agents || []).filter(
              (b: AgentData) => b.isActive,
            ),
          }),
        );
      } catch (error) {
        console.error(
          "[ChatProvider] Failed to refresh server scoped data:",
          error,
        );
      }
    },
    [],
  );

  const ensureServerScopedData = useCallback(
    async (targetServerId: string) => {
      if (!targetServerId) return;
      if (serverDataById[targetServerId]) return;
      await refreshServerScopedData(targetServerId);
    },
    [serverDataById, refreshServerScopedData],
  );

  // Fetch servers on mount
  useEffect(() => {
    refreshServers();
  }, [refreshServers]);

  // BUG-001: Redirect to a valid server when the URL contains a stale serverId.
  // This happens after `tavok init --force` when the browser still has the old
  // server URL bookmarked or in history. All API calls return 403 because the
  // admin's Member record points to the new server, not the stale one in the URL.
  useEffect(() => {
    if (!serverId || servers.length === 0) return;
    const isMember = servers.some((s) => s.id === serverId);
    if (!isMember) {
      const first = servers[0];
      console.warn(
        `[Tavok] Server ${serverId} not found in user's servers — redirecting to ${first.id}`,
      );
      router.replace(`/servers/${first.id}`);
    }
  }, [serverId, servers, router]);

  // TASK-0016: Derive current server's aggregate unread from the channel-level unreadMap
  // (which is already kept fresh by useUnread) instead of double-fetching.
  useEffect(() => {
    if (!serverId || unreadMap.size === 0) return;
    let hasUnread = false;
    let hasMentions = false;
    for (const state of unreadMap.values()) {
      if (state.hasUnread) hasUnread = true;
      if (state.mentionCount > 0) hasMentions = true;
    }
    setServerUnreadMap((prev) => {
      const next = new Map(prev);
      next.set(serverId, { hasUnread, hasMentions });
      return next;
    });
  }, [serverId, unreadMap]);

  // TASK-0016: Fetch server-level unreads when server list changes + poll every 30s
  useEffect(() => {
    if (servers.length === 0) return;
    void refreshAllServerUnreads(servers, serverId);
    const interval = setInterval(() => {
      void refreshAllServerUnreads(servers, serverId);
    }, 30_000);
    return () => clearInterval(interval);
  }, [servers, serverId, refreshAllServerUnreads]);

  // Fetch channels and members when serverId changes
  useEffect(() => {
    refreshChannels();
    refreshMembers();
    refreshAgents();
    refreshPermissions();
  }, [refreshChannels, refreshMembers, refreshAgents, refreshPermissions]);

  const contextValue = useMemo<ChatContextValue>(
    () => ({
      servers,
      serversLoaded,
      serversError,
      currentServerId: serverId,
      currentChannelId: channelId,
      currentServerName,
      currentServerOwnerId,
      channels,
      channelsError,
      members,
      agents,
      serverDataById,
      refreshServers,
      refreshChannels,
      refreshMembers,
      refreshAgents,
      ensureServerScopedData,
      refreshServerScopedData,
      userPermissions,
      isOwner,
      hasPermission,
      unreadMap,
      markAsRead,
      refreshUnread,
      serverUnreadMap,
    }),
    [
      servers,
      serversLoaded,
      serversError,
      serverId,
      channelId,
      currentServerName,
      currentServerOwnerId,
      channels,
      channelsError,
      members,
      agents,
      serverDataById,
      refreshServers,
      refreshChannels,
      refreshMembers,
      refreshAgents,
      ensureServerScopedData,
      refreshServerScopedData,
      userPermissions,
      isOwner,
      hasPermission,
      unreadMap,
      markAsRead,
      refreshUnread,
      serverUnreadMap,
    ],
  );

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
}
