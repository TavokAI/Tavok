"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useChatContext } from "@/components/providers/chat-provider";
import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import { ManageAgentsModal } from "@/components/modals/manage-agents-modal";
import { Permissions } from "@/lib/permissions";
import { Bot, Users, Zap, Settings2 } from "lucide-react";

interface AgentInfo {
  id: string;
  name: string;
  isStreaming: boolean;
  llmModel?: string;
  thinkingSteps?: string[];
}

export function RightPanel() {
  const {
    members,
    currentServerOwnerId,
    serverDataById,
    ensureServerScopedData,
    hasPermission,
  } = useChatContext();
  const { panels, activeStreams } = useWorkspaceContext();
  const [showManageAgents, setShowManageAgents] = useState(false);

  const openPanels = useMemo(() => panels.filter((p) => !p.isClosed), [panels]);
  const openServerIds = useMemo(
    () =>
      Array.from(new Set(openPanels.map((p) => p.serverId))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [openPanels],
  );

  useEffect(() => {
    openServerIds.forEach((serverId) => {
      void ensureServerScopedData(serverId);
    });
  }, [openServerIds, ensureServerScopedData]);

  const agentList = useMemo(() => {
    const agentById = new Map<string, AgentInfo>();

    for (const panel of openPanels) {
      const scoped = serverDataById[panel.serverId];
      if (!scoped) continue;

      const channel = scoped.channels.find((c) => c.id === panel.channelId);
      if (!channel) continue;

      const agentIds = channel.agentIds?.length
        ? channel.agentIds
        : channel.defaultAgentId
          ? [channel.defaultAgentId]
          : [];

      const isStreaming = activeStreams.has(panel.channelId);

      for (const agentId of agentIds) {
        const agent = scoped.agents.find((b) => b.id === agentId);
        if (!agent) continue;

        let steps: string[] | undefined;
        if (agent.thinkingSteps) {
          try {
            steps = JSON.parse(agent.thinkingSteps);
          } catch {
            // Ignore invalid serialized steps.
          }
        }

        const existing = agentById.get(agent.id);
        if (existing) {
          existing.isStreaming = existing.isStreaming || isStreaming;
        } else {
          agentById.set(agent.id, {
            id: agent.id,
            name: agent.name,
            isStreaming,
            llmModel: agent.llmModel,
            thinkingSteps: steps,
          });
        }
      }
    }

    return Array.from(agentById.values());
  }, [openPanels, serverDataById, activeStreams]);

  const taskList = useMemo(() => {
    const tasks: { label: string; agentName: string; isActive: boolean }[] = [];
    for (const agent of agentList) {
      if (!agent.thinkingSteps?.length) continue;
      for (const step of agent.thinkingSteps) {
        tasks.push({
          label: step,
          agentName: agent.name,
          isActive: agent.isStreaming,
        });
      }
    }
    return tasks;
  }, [agentList]);

  return (
    <div className="chrome-panel flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        <div className="rounded-md p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-text-dim">
              <Bot className="h-3.5 w-3.5" />
              AGENTS
            </div>
            {hasPermission(Permissions.MANAGE_AGENTS) && (
              <button
                onClick={() => setShowManageAgents(true)}
                className="rounded p-1 text-text-dim transition-colors hover:text-text-muted"
                title="Manage Agents"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            {agentList.length === 0 ? (
              <div className="py-1 text-[11px] text-text-dim">
                No agents active
              </div>
            ) : (
              agentList.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between rounded-md bg-background-floating/40 px-2.5 py-1.5 text-[12px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        agent.isStreaming
                          ? "bg-accent-cyan shadow-[0_0_6px_rgba(34,211,238,0.5)]"
                          : "bg-status-offline"
                      }`}
                    />
                    <span className="truncate font-medium text-text-secondary">
                      {agent.name}
                    </span>
                  </div>
                  {agent.isStreaming ? (
                    <div className="flex items-center gap-1 text-[9px] font-semibold tracking-[0.12em] text-accent-cyan">
                      <span className="h-1 w-1 animate-pulse rounded-full bg-accent-cyan" />
                      LIVE
                    </div>
                  ) : (
                    <span className="text-[9px] font-semibold tracking-[0.12em] text-text-dim">
                      IDLE
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {taskList.length > 0 && (
          <div className="rounded-md p-3">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-text-dim">
              <Zap className="h-3.5 w-3.5" />
              TASKS
            </div>
            <div className="space-y-1.5">
              {taskList.map((task, i) => (
                <div
                  key={`${task.agentName}-${task.label}-${i}`}
                  className="rounded-md bg-background-floating/40 px-2.5 py-2"
                >
                  <div
                    className={`text-[12px] font-medium ${
                      task.isActive ? "text-text-secondary" : "text-text-muted"
                    }`}
                  >
                    {task.label}
                  </div>
                  <div className="mt-1 text-[10px] text-text-dim">
                    @{task.agentName.toLowerCase()}{" "}
                    {task.isActive ? "- active" : "- ready"}
                  </div>
                  {task.isActive && (
                    <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-background-primary">
                      <div
                        className="h-full rounded-full bg-accent-cyan"
                        style={{ width: "60%" }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md p-3">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-text-dim">
            <Users className="h-3.5 w-3.5" />
            MEMBERS
          </div>
          <div className="space-y-1">
            {members.length === 0 ? (
              <div className="text-[11px] text-text-dim">No members</div>
            ) : (
              members.map((member) => {
                const isOwner = member.userId === currentServerOwnerId;
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-2 rounded-md bg-background-floating/40 px-2.5 py-1.5 text-[12px]"
                  >
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
                    <span className="truncate font-medium text-text-secondary">
                      {member.displayName}
                    </span>
                    {isOwner && (
                      <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-brand/8 text-brand">
                        Owner
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ManageAgentsModal
        isOpen={showManageAgents}
        onClose={() => setShowManageAgents(false)}
      />
    </div>
  );
}
