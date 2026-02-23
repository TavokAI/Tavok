"use client";

import { signOut } from "next-auth/react";

const placeholderChannels = [
  { id: "1", name: "general" },
  { id: "2", name: "random" },
  { id: "3", name: "help" },
];

interface ChannelSidebarProps {
  username: string;
  displayName: string;
}

export function ChannelSidebar({ username, displayName }: ChannelSidebarProps) {
  return (
    <div className="flex w-60 flex-col bg-background-secondary">
      {/* Server name header */}
      <div className="flex h-12 items-center border-b border-background-tertiary px-4">
        <h2 className="truncate text-base font-bold text-text-primary">
          HiveChat
        </h2>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pt-4">
        <div className="mb-1 flex items-center px-1">
          <span className="text-xs font-bold uppercase text-text-muted">
            Text Channels
          </span>
        </div>
        {placeholderChannels.map((channel) => (
          <button
            key={channel.id}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-text-secondary transition hover:bg-background-primary hover:text-text-primary"
          >
            <span className="text-lg text-text-muted">#</span>
            <span className="truncate text-sm">{channel.name}</span>
          </button>
        ))}
      </div>

      {/* User panel */}
      <div className="flex items-center gap-2 border-t border-background-tertiary bg-background-floating/50 px-2 py-2">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-background-floating">
            {displayName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background-floating bg-status-online" />
        </div>

        {/* User info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {displayName || "User"}
          </p>
          <p className="truncate text-xs text-text-muted">
            {username || "username"}
          </p>
        </div>

        {/* Sign out / Settings button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-text-muted transition hover:bg-background-primary hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM6.5 5.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8 13a5 5 0 01-3.87-1.84C4.56 10.1 6.19 9.5 8 9.5s3.44.6 3.87 1.66A5 5 0 018 13z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
