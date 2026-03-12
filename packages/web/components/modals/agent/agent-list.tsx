"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { AgentListItem } from "./types";
import { getMethodBadgeClasses, getMethodLabel } from "./types";
import { Download, Upload } from "lucide-react";

interface AgentListProps {
  agents: AgentListItem[];
  serverId: string;
  onAddAgent: () => void;
  onEditAgent: (agent: AgentListItem) => void;
  onRefresh: () => void;
}

export function AgentList({
  agents,
  serverId,
  onAddAgent,
  onEditAgent,
  onRefresh,
}: AgentListProps) {
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAgents = agents.filter((a) => a.isActive);
  const inactiveAgents = agents.filter((a) => !a.isActive);

  async function handleDelete(agentId: string) {
    if (deletingAgentId !== agentId) {
      setDeletingAgentId(agentId);
      return;
    }

    try {
      const res = await fetch(`/api/servers/${serverId}/agents/${agentId}`, {
        method: "DELETE",
      });
      if (res.ok) onRefresh();
    } catch {
      console.error("Failed to delete agent");
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function handleExport(agentId: string, agentName: string) {
    try {
      const res = await fetch(
        `/api/servers/${serverId}/agents/${agentId}/export`,
      );
      if (!res.ok) return;
      const template = await res.json();
      const blob = new Blob([JSON.stringify(template, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agentName.replace(/[^a-zA-Z0-9_-]/g, "_")}.tavok-agent.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      console.error("Failed to export agent");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImporting(true);

    try {
      const text = await file.text();
      const template = JSON.parse(text);
      if (!template || typeof template !== "object" || !template.name) {
        setImportError("Invalid template: missing 'name' field");
        return;
      }

      const res = await fetch(`/api/servers/${serverId}/agents/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });

      if (!res.ok) {
        const data = await res.json();
        setImportError(data.error || "Import failed");
        return;
      }

      onRefresh();
    } catch {
      setImportError("Failed to parse template file");
    } finally {
      setImporting(false);
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      {/* Active Agents */}
      {activeAgents.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase text-text-muted">
            Active Agents — {activeAgents.length}
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {activeAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                deletingAgentId={deletingAgentId}
                onEdit={() => onEditAgent(agent)}
                onDelete={() => handleDelete(agent.id)}
                onBlurDelete={() => setDeletingAgentId(null)}
                onExport={() => handleExport(agent.id, agent.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Agents */}
      {inactiveAgents.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase text-text-muted">
            Inactive — {inactiveAgents.length}
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto opacity-60">
            {inactiveAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                deletingAgentId={deletingAgentId}
                onEdit={() => onEditAgent(agent)}
                onDelete={() => handleDelete(agent.id)}
                onBlurDelete={() => setDeletingAgentId(null)}
                onExport={() => handleExport(agent.id, agent.name)}
              />
            ))}
          </div>
        </div>
      )}

      {agents.length === 0 && (
        <p className="text-sm text-text-muted py-4">
          No agents yet. Add one to bring AI to your server.
        </p>
      )}

      {importError && (
        <p className="text-sm text-status-danger mb-2">{importError}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.tavok-agent.json"
            onChange={handleImportFile}
            className="hidden"
            data-testid="agent-import-input"
          />
          <Button
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            data-testid="agent-import-btn"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>
        <Button onClick={onAddAgent}>Add Agent</Button>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  deletingAgentId,
  onEdit,
  onDelete,
  onBlurDelete,
  onExport,
}: {
  agent: AgentListItem;
  deletingAgentId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onBlurDelete: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-background-primary p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {agent.name}
          </span>
          <MethodBadge method={agent.connectionMethod} />
          {agent.connectionMethod === null && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400">
              {agent.llmProvider}
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted truncate">
          {agent.connectionMethod === null
            ? `${agent.llmModel} \u00b7 ${agent.triggerMode.toLowerCase()}`
            : `${getMethodLabel(agent.connectionMethod)} agent \u00b7 ${agent.triggerMode.toLowerCase()}`}
        </p>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onExport}
          title="Export agent template"
          data-testid={`agent-export-btn-${agent.name.replace(/\s+/g, "-").toLowerCase()}`}
          className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-background-secondary hover:text-text-primary"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {agent.connectionMethod === null && (
          <button
            onClick={onEdit}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-background-secondary hover:text-text-primary"
          >
            Edit
          </button>
        )}
        <button
          onClick={onDelete}
          onBlur={onBlurDelete}
          className={`rounded px-2 py-1 text-xs ${
            deletingAgentId === agent.id
              ? "bg-status-danger text-white font-semibold"
              : "text-status-danger hover:bg-status-danger/10"
          }`}
        >
          {deletingAgentId === agent.id ? "Confirm?" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function MethodBadge({
  method,
}: {
  method: AgentListItem["connectionMethod"];
}) {
  if (method === null) return null; // BYOK shows provider badge instead
  return (
    <span
      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${getMethodBadgeClasses(method)}`}
    >
      {getMethodLabel(method)}
    </span>
  );
}
