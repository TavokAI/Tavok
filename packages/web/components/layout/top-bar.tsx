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
    <div className="chrome-panel col-span-3 flex h-[56px] items-center justify-between rounded-[24px] px-4 text-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand/40 bg-[linear-gradient(180deg,rgba(255,164,76,0.22),rgba(255,133,31,0.14))] text-brand shadow-[0_12px_26px_rgba(255,155,69,0.16)]">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <span className="font-display text-lg font-semibold tracking-[0.14em] text-white">
            Tavok
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-2 rounded-xl border border-brand/30 bg-[linear-gradient(180deg,rgba(255,159,67,0.18),rgba(255,159,67,0.1))] px-3.5 py-2 text-sm font-semibold text-orange-100 shadow-[0_12px_24px_rgba(255,155,69,0.12)]">
            <LayoutDashboard className="h-4 w-4 text-brand" />
            Workspace
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <MessageSquare className="h-4 w-4" />
            DMs
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <CreditCard className="h-4 w-4" />
            Costs
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <CheckSquare className="h-4 w-4" />
            Tasks
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <FileText className="h-4 w-4" />
            Notes
          </button>
          <button className="chrome-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-text-muted hover:text-text-primary">
            <Activity className="h-4 w-4" />
            Activity
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs font-semibold">
        <div className="chrome-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_14px_rgba(41,211,145,0.55)]" />
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
