"use client";

import { useState, useEffect } from "react";

interface Channel {
  id: string;
  name: string;
}

interface ChannelPickerProps {
  serverId: string;
  selectedChannelIds: string[];
  onChange: (channelIds: string[]) => void;
}

/**
 * Checkbox-based channel selector for agent creation forms.
 * Fetches channels from the server and lets users pick which
 * channels the agent should be assigned to. (DEC-0073)
 *
 * All channels are selected by default (backward compatible).
 */
export function ChannelPicker({
  serverId,
  selectedChannelIds,
  onChange,
}: ChannelPickerProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchChannels() {
      try {
        const res = await fetch(`/api/servers/${serverId}/channels`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const chs: Channel[] = Array.isArray(data?.channels)
            ? data.channels
            : [];
          setChannels(chs);
          // Default: select all channels if nothing selected yet
          if (selectedChannelIds.length === 0 && chs.length > 0) {
            onChange(chs.map((ch) => ch.id));
          }
        }
      } catch {
        // Silently fail — channels will just not show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchChannels();
    return () => {
      cancelled = true;
    };
    // Only fetch once on mount — don't depend on selectedChannelIds/onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function handleToggle(channelId: string) {
    if (selectedChannelIds.includes(channelId)) {
      onChange(selectedChannelIds.filter((id) => id !== channelId));
    } else {
      onChange([...selectedChannelIds, channelId]);
    }
  }

  function handleSelectAll() {
    onChange(channels.map((ch) => ch.id));
  }

  function handleSelectNone() {
    onChange([]);
  }

  if (loading) {
    return (
      <div className="text-xs text-text-muted py-1">Loading channels...</div>
    );
  }

  if (channels.length === 0) {
    return null;
  }

  const allSelected = selectedChannelIds.length === channels.length;
  const noneSelected = selectedChannelIds.length === 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary">
          Channels
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={allSelected}
            className="text-[10px] text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            All
          </button>
          <button
            type="button"
            onClick={handleSelectNone}
            disabled={noneSelected}
            className="text-[10px] text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            None
          </button>
        </div>
      </div>
      <div className="rounded border border-background-tertiary bg-background-primary p-2 max-h-32 overflow-y-auto space-y-1">
        {channels.map((ch) => (
          <label
            key={ch.id}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-text-secondary hover:bg-background-secondary cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedChannelIds.includes(ch.id)}
              onChange={() => handleToggle(ch.id)}
              className="rounded border-background-tertiary"
            />
            <span className="text-text-muted">#</span>
            {ch.name}
          </label>
        ))}
      </div>
      {noneSelected && (
        <p className="mt-1 text-[10px] text-status-warning">
          No channels selected — agent won&apos;t be triggered anywhere.
        </p>
      )}
    </div>
  );
}
