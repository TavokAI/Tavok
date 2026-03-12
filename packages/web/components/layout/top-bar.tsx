"use client";

import React from "react";
import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import {
  Activity,
  LayoutDashboard,
  MessageSquare,
  CreditCard,
  CheckSquare,
  FileText,
} from "lucide-react";

export function TopBar() {
  const { activeStreams } = useWorkspaceContext();

  return (
    <div className="chrome-panel col-span-3 flex h-[56px] items-center justify-between rounded-lg px-4 text-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand/40 bg-brand/10 text-brand">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold tracking-[0.14em] text-white">
            Tavok
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3.5 py-2 text-sm font-semibold text-white">
            <LayoutDashboard className="h-4 w-4 text-brand" />
            Workspace
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <MessageSquare className="h-4 w-4" />
            DMs
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <CreditCard className="h-4 w-4" />
            Costs
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <CheckSquare className="h-4 w-4" />
            Tasks
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <FileText className="h-4 w-4" />
            Notes
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <Activity className="h-4 w-4" />
            Activity
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-semibold">
        <div className="chrome-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_14px_rgba(16,185,129,0.55)]" />
          CONNECTED
        </div>
        <div className="chrome-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-text-secondary">
          <Activity className="h-3.5 w-3.5 text-accent-cyan" />
          {activeStreams.size} STREAMING
        </div>
        <div className="chrome-pill rounded-full px-3 py-1.5 text-text-muted">
          0 tokens/min
        </div>
      </div>
    </div>
  );
}
