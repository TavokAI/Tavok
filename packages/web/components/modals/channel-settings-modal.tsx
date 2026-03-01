"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/components/providers/chat-provider";

interface Bot {
  id: string;
  name: string;
  llmProvider: string;
  llmModel: string;
}

interface ChannelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  currentBotIds?: string[];
  currentDefaultBotId: string | null;
}

export function ChannelSettingsModal({
  isOpen,
  onClose,
  channelId,
  channelName,
  currentBotIds,
  currentDefaultBotId,
}: ChannelSettingsModalProps) {
  const { currentServerId } = useChatContext();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchBots = useCallback(async () => {
    if (!currentServerId) return;
    try {
      const res = await fetch(`/api/servers/${currentServerId}/bots`);
      if (res.ok) {
        const data = await res.json();
        const nextBots = Array.isArray(data?.bots)
          ? data.bots
          : Array.isArray(data)
            ? data
            : [];
        setBots(nextBots);
      }
    } catch {
      console.error("Failed to fetch bots");
    }
  }, [currentServerId]);

  useEffect(() => {
    if (isOpen) {
      fetchBots();
      // Initialize from currentBotIds or fall back to single defaultBotId
      if (currentBotIds && currentBotIds.length > 0) {
        setSelectedBotIds(new Set(currentBotIds));
      } else if (currentDefaultBotId) {
        setSelectedBotIds(new Set([currentDefaultBotId]));
      } else {
        setSelectedBotIds(new Set());
      }
      setError("");
    }
  }, [isOpen, fetchBots, currentBotIds, currentDefaultBotId]);

  function toggleBot(botId: string) {
    setSelectedBotIds((prev) => {
      const next = new Set(prev);
      if (next.has(botId)) {
        next.delete(botId);
      } else {
        next.add(botId);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!currentServerId) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/servers/${currentServerId}/channels/${channelId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            botIds: Array.from(selectedBotIds),
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update channel");
        return;
      }

      onClose();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`#${channelName} Settings`}>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-text-primary">
            Channel Agents
          </label>
          <p className="mb-3 text-xs text-text-muted">
            Select one or more agents to respond in this channel. Multiple agents can stream simultaneously.
          </p>

          {bots.length === 0 ? (
            <p className="text-xs text-text-muted py-2">
              No bots created yet. Use &quot;Manage Bots&quot; to create one first.
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {bots.map((bot) => (
                <label
                  key={bot.id}
                  className={`flex items-center gap-3 rounded px-3 py-2 cursor-pointer transition-colors ${
                    selectedBotIds.has(bot.id)
                      ? "bg-accent-cyan/10 border border-accent-cyan/30"
                      : "bg-background-primary border border-background-tertiary hover:border-text-dim"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedBotIds.has(bot.id)}
                    onChange={() => toggleBot(bot.id)}
                    className="rounded border-text-dim text-accent-cyan focus:ring-accent-cyan"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-mono text-text-primary">{bot.name}</span>
                    <span className="ml-2 text-[10px] text-text-muted">
                      {bot.llmProvider}/{bot.llmModel}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={loading}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
