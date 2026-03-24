"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DmChatArea } from "@/components/dm/dm-chat-area";
import { ChatPanelSkeleton } from "@/components/ui/message-skeleton";
import { getDmListFromResponse } from "@/lib/dm-api";

interface DmListItem {
  id: string;
  participant: {
    displayName: string;
    username: string;
  } | null;
}

/**
 * TASK-0019: DM conversation page.
 * Route: /dms/{dmId}
 */
export default function DmPage() {
  const params = useParams<{ dmId: string }>();
  const dmId = params.dmId;

  const [otherUserName, setOtherUserName] = useState<string>("Direct Message");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch DM info to get the other user's name
  useEffect(() => {
    if (!dmId) return;

    async function fetchDmInfo() {
      try {
        const res = await fetch("/api/dms");
        if (res.ok) {
          const data = await res.json();
          const dms = getDmListFromResponse<DmListItem>(data);
          const dm = dms.find((conversation) => conversation.id === dmId);
          if (dm) {
            setOtherUserName(
              dm.participant?.displayName || dm.participant?.username || "User",
            );
          }
        }
        setLoading(false);
      } catch {
        setError("Failed to load conversation");
        setLoading(false);
      }
    }

    fetchDmInfo();
  }, [dmId]);

  if (loading) {
    return <ChatPanelSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background-primary">
        <div className="text-status-dnd text-sm font-mono">{error}</div>
      </div>
    );
  }

  if (!dmId) return null;

  return (
    <div className="flex h-full bg-background-primary">
      <DmChatArea dmId={dmId} otherUserName={otherUserName} />
    </div>
  );
}
