"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Channel } from "phoenix";
import type { CharterAction, CharterState } from "./use-channel-types";

export interface UseCharterResult {
  charterState: CharterState | null;
  setCharterState: Dispatch<SetStateAction<CharterState | null>>;
  sendCharterControl: (action: CharterAction) => void;
  registerCharterHandlers: (channel: Channel, mounted: () => boolean) => void;
}

export function useCharter(
  channelId: string | null,
  channelRef: MutableRefObject<Channel | null>,
): UseCharterResult {
  const [charterState, setCharterState] = useState<CharterState | null>(null);

  useEffect(() => {
    setCharterState(null);
  }, [channelId]);

  const registerCharterHandlers = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      channel.on("charter_status", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as {
          channelId: string;
          currentTurn: number;
          maxTurns: number;
          status: string;
          swarmMode?: string;
        };
        setCharterState((prev) => ({
          swarmMode:
            payload.swarmMode || prev?.swarmMode || "HUMAN_IN_THE_LOOP",
          currentTurn: payload.currentTurn,
          maxTurns: payload.maxTurns,
          status: payload.status,
        }));
      });
    },
    [],
  );

  const sendCharterControl = useCallback((action: CharterAction) => {
    if (!channelRef.current) return;
    channelRef.current.push("charter_control", { action });
  }, []);

  return {
    charterState,
    setCharterState,
    sendCharterControl,
    registerCharterHandlers,
  };
}
