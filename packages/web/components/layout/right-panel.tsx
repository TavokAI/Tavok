"use client";

import React, { useEffect, useMemo } from "react";
import { useChatContext } from "@/components/providers/chat-provider";
import { useWorkspaceContext } from "@/components/providers/workspace-provider";

export function RightPanel() {
  const { members, currentServerOwnerId, serverDataById, ensureServerScopedData } =
    useChatContext();
  const { panels, activeStreams } = useWorkspaceContext();

  const openPanels = useMemo(
    () => panels.filter((p) => !p.isClosed),
    [panels]
  );
  const openServerIds = useMemo(
    () => Array.from(new Set(openPanels.map((p) => p.serverId))).sort(),
    [openPanels]
  );

  useEffect(() => {
    openServerIds.forEach((serverId) => {
      void ensureServerScopedData(serverId);
    });
  }, [openServerIds, ensureServerScopedData]);

  const agentList = useMemo(() => {
    const agentById = new Map<
      string,
      { id: string; name: string; isStreaming: boolean }
    >();

    for (const panel of openPanels) {
      const scoped = serverDataById[panel.serverId];
      if (!scoped) continue;

      const channel = scoped.channels.find((c) => c.id === panel.channelId);
      if (!channel?.defaultBotId) continue;

      const agent = scoped.bots.find((b) => b.id === channel.defaultBotId);
      if (!agent) continue;

      const existing = agentById.get(agent.id);
      const isStreaming = activeStreams.has(panel.channelId);
      if (existing) {
        existing.isStreaming = existing.isStreaming || isStreaming;
      } else {
        agentById.set(agent.id, {
          id: agent.id,
          name: agent.name,
          isStreaming,
        });
      }
    }

    return Array.from(agentById.values());
  }, [openPanels, serverDataById, activeStreams]);

  return (
    <div className="flex flex-col border-l border-border bg-background-primary h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        
        {/* Agents */}
        <div>
          <div className="text-xs font-bold text-text-dim mb-3 uppercase tracking-wider">Agents</div>
          <div className="space-y-2">
            {agentList.length === 0 ? (
              <div className="text-xs text-text-muted">No agents active</div>
            ) : (
              agentList.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${agent.isStreaming ? 'bg-accent-cyan animate-pulse' : 'bg-status-offline'}`} />
                    <span className="text-text-primary truncate">{agent.name}</span>
                  </div>
                  {agent.isStreaming ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-accent-cyan animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1 w-1 rounded-full bg-accent-cyan animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1 w-1 rounded-full bg-accent-cyan animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-dim font-mono tracking-wide shrink-0">IDLE</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tasks - Placeholder */}
        <div>
          <div className="text-xs font-bold text-text-dim mb-3 uppercase tracking-wider">Tasks</div>
          <div className="space-y-3">
            <div className="border-l-2 border-accent-cyan pl-2">
              <div className="text-xs text-text-primary">Summarize context</div>
              <div className="text-[10px] text-text-muted mt-1">@architect-agent • active</div>
              <div className="mt-1.5 h-0.5 w-full bg-background-tertiary rounded-full overflow-hidden">
                <div className="h-full bg-accent-cyan w-1/3" />
              </div>
            </div>
            <div className="border-l-2 border-accent-green pl-2">
              <div className="text-xs text-text-primary">Analyze sentiment</div>
              <div className="text-[10px] text-text-muted mt-1">@ops-agent • done</div>
            </div>
            <div className="border-l-2 border-border pl-2">
              <div className="text-xs text-text-muted">Generate response</div>
              <div className="text-[10px] text-text-muted mt-1">queued</div>
            </div>
          </div>
        </div>

        {/* Members */}
        <div>
          <div className="text-xs font-bold text-text-dim mb-3 uppercase tracking-wider">Members</div>
          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="text-xs text-text-muted">No members</div>
            ) : (
              members.map(member => {
                const isOwner = member.userId === currentServerOwnerId;
                return (
                  <div key={member.userId} className="flex items-center gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-status-online shrink-0" />
                    <span className="text-text-primary truncate">{member.displayName}</span>
                    {isOwner && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase font-bold shrink-0">
                        Owner
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Costs - Placeholder */}
        <div>
          <div className="text-xs font-bold text-text-dim mb-3 uppercase tracking-wider">Costs</div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between text-text-secondary">
              <span>gemini-2.0</span>
              <span>$0.04</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>claude-3.5</span>
              <span>$0.12</span>
            </div>
            <div className="flex justify-between text-text-primary border-t border-border pt-2 mt-2">
              <span>TOTAL</span>
              <span>$0.16</span>
            </div>
            <div className="flex justify-between text-brand mt-1">
              <span>BUDGET</span>
              <span>98%</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}