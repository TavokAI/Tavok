"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "phoenix";
import { Presence } from "phoenix";
import type { PresenceUser } from "./use-channel-types";

export interface UsePresenceResult {
  presenceMap: Map<string, PresenceUser>;
  attachPresence: (channel: Channel, mounted: () => boolean) => void;
}

export function usePresence(channelId: string | null): UsePresenceResult {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceUser>>(
    new Map(),
  );
  const presenceRef = useRef<Presence | null>(null);

  useEffect(() => {
    presenceRef.current = null;
    setPresenceMap(new Map());
  }, [channelId]);

  const attachPresence = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      const presence = new Presence(channel);
      presence.onSync(() => {
        if (!mounted()) return;
        const nextMap = new Map<string, PresenceUser>();
        presence.list((userId: string, presenceData: unknown) => {
          const data = presenceData as { metas: Array<Record<string, string>> };
          const meta = data?.metas?.[0];
          if (meta) {
            nextMap.set(userId, {
              userId,
              username: meta.username || "",
              displayName: meta.display_name || "",
              status: meta.status || "online",
            });
          }
        });
        setPresenceMap(nextMap);
      });
      presenceRef.current = presence;
    },
    [],
  );

  return { presenceMap, attachPresence };
}
