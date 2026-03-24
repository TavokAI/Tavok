"use client";

import React from "react";
import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import { Activity, LayoutDashboard } from "lucide-react";

export function TopBar() {
  const { activeStreams } = useWorkspaceContext();

  return (
    <header className="chrome-panel col-span-3 flex items-center justify-between px-4 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-display text-base font-bold tracking-[0.18em] text-brand">
          TAVOK
        </span>
      </div>

      <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.12em]">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          CONNECTED
        </div>
        {activeStreams.size > 0 && (
          <div className="flex items-center gap-2 text-accent-cyan">
            <Activity className="h-3 w-3" />
            {activeStreams.size} STREAMING
          </div>
        )}
      </div>
    </header>
  );
}
