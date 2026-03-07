"use client";

import React, { useMemo } from "react";
import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import { Database, Server, Box, Activity } from "lucide-react";

export function BottomBar() {
  const { panels, activeStreams } = useWorkspaceContext();

  const { openCount, minimizedCount } = useMemo(() => {
    const activePanels = panels.filter((p) => !p.isClosed);
    const minimized = activePanels.filter((p) => p.isMinimized).length;
    return {
      openCount: activePanels.length,
      minimizedCount: minimized,
    };
  }, [panels]);

  return (
    <div className="chrome-panel col-span-3 flex h-[44px] items-center justify-between rounded-[22px] px-4 text-[13px] font-medium text-text-muted">
      <div className="flex items-center gap-6">
        <div className="flex cursor-pointer items-center gap-2 text-text-secondary transition-colors hover:text-text-primary">
          <div className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_12px_rgba(41,211,145,0.5)]" />
          4 services healthy
        </div>
        <div className="flex items-center gap-2 text-text-dim">
          <Activity className="h-3.5 w-3.5 text-accent-cyan" />
          {activeStreams.size} active streams
        </div>
        <div className="flex items-center gap-2 text-text-dim">
          <Box className="h-3.5 w-3.5" />
          {openCount} panels / {minimizedCount} minimized
        </div>
      </div>
      <div className="flex items-center gap-6 text-text-dim">
        <div className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-text-primary">
          <Database className="h-3.5 w-3.5" />
          PostgreSQL 16
        </div>
        <div className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-text-primary">
          <Server className="h-3.5 w-3.5" />
          Redis 7
        </div>
        <div className="rounded-full border border-white/5 bg-background-tertiary/50 px-2.5 py-1 font-mono text-xs text-text-secondary">
          v1.0.0
        </div>
      </div>
    </div>
  );
}
