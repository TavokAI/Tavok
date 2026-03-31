"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Channel } from "phoenix";
import type { TypingUser } from "./use-channel-types";

export interface UseTypingResult {
  typingUsers: TypingUser[];
  sendTyping: () => void;
  registerTypingHandlers: (channel: Channel, mounted: () => boolean) => void;
}

export function useTyping(
  channelId: string | null,
  channelRef: MutableRefObject<Channel | null>,
): UseTypingResult {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    setTypingUsers([]);
    lastTypingSentRef.current = 0;
    typingTimersRef.current.forEach((timer) => clearTimeout(timer));
    typingTimersRef.current.clear();

    return () => {
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
    };
  }, [channelId]);

  const registerTypingHandlers = useCallback(
    (channel: Channel, mounted: () => boolean) => {
      channel.on("user_typing", (raw: unknown) => {
        if (!mounted()) return;
        const payload = raw as TypingUser;

        setTypingUsers((prev) => {
          const existing = prev.find((user) => user.userId === payload.userId);
          return existing ? prev : [...prev, payload];
        });

        const existingTimer = typingTimersRef.current.get(payload.userId);
        if (existingTimer) clearTimeout(existingTimer);

        typingTimersRef.current.set(
          payload.userId,
          setTimeout(() => {
            if (!mounted()) return;
            setTypingUsers((prev) =>
              prev.filter((user) => user.userId !== payload.userId),
            );
            typingTimersRef.current.delete(payload.userId);
          }, 3000),
        );
      });
    },
    [],
  );

  const sendTyping = useCallback(() => {
    if (!channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    channelRef.current.push("typing", {});
  }, []);

  return { typingUsers, sendTyping, registerTypingHandlers };
}
