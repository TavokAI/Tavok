"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock3 } from "lucide-react";
import { getCapabilityLabel } from "./types";

export interface AgentAuditLogEntry {
  id: string;
  agentId: string;
  agentName: string | null;
  action: string;
  actionLabel: string;
  channelId: string | null;
  messageId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

type AuditStatus = "loading" | "ready" | "unavailable" | "error";

interface AgentAuditLogProps {
  serverId: string;
}

export function normalizeAgentAuditEvents(
  payload: unknown,
): AgentAuditLogEntry[] {
  const events = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.events)
      ? payload.events
      : [];

  return events.filter(isRecord).map((event) => {
    const agentId = getString(event.agentId) ?? getString(event.agent_id) ?? "";
    const action = getString(event.action) ?? "unknown";
    const createdAt =
      getString(event.createdAt) ??
      getString(event.ts) ??
      getString(event.timestamp) ??
      "";

    return {
      id: getString(event.id) ?? `${createdAt}-${agentId}-${action}`,
      agentId,
      agentName: getString(event.agentName) ?? getString(event.agent_name),
      action,
      actionLabel: getAuditActionLabel(action),
      channelId:
        getString(event.channelId) ?? getString(event.channel_id) ?? null,
      messageId:
        getString(event.messageId) ?? getString(event.message_id) ?? null,
      metadata: getRecord(event.metadata) ?? getRecord(event.meta),
      createdAt,
    };
  });
}

export function AgentAuditLog({ serverId }: AgentAuditLogProps) {
  const [status, setStatus] = useState<AuditStatus>("loading");
  const [events, setEvents] = useState<AgentAuditLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAuditLog() {
      setStatus("loading");
      try {
        const res = await fetch(`/api/servers/${serverId}/agent-audit?limit=10`);
        if (cancelled) return;

        if (res.status === 404 || res.status === 501) {
          setEvents([]);
          setStatus("unavailable");
          return;
        }

        if (!res.ok) {
          setEvents([]);
          setStatus("error");
          return;
        }

        const data = await res.json();
        setEvents(normalizeAgentAuditEvents(data));
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setEvents([]);
          setStatus("error");
        }
      }
    }

    fetchAuditLog();

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  return (
    <div className="mt-4 rounded border border-background-tertiary bg-background-primary p-3">
      <div className="mb-2 flex items-center gap-2">
        <Clock3 className="h-3.5 w-3.5 text-text-muted" />
        <p className="text-xs font-bold uppercase text-text-muted">
          Agent Audit Log
        </p>
      </div>

      {status === "loading" && (
        <p className="text-xs text-text-muted">Loading recent activity...</p>
      )}

      {status === "unavailable" && (
        <AuditNotice text="Audit log storage is not connected yet. Recent agent actions are still written to structured server logs." />
      )}

      {status === "error" && (
        <AuditNotice text="Could not load audit activity right now." />
      )}

      {status === "ready" && events.length === 0 && (
        <p className="text-xs text-text-muted">No agent activity recorded yet.</p>
      )}

      {status === "ready" && events.length > 0 && (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded bg-background-secondary/60 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-text-primary">
                  {event.agentName || event.agentId || "Unknown agent"}
                </p>
                <time className="shrink-0 text-[10px] text-text-muted">
                  {formatAuditTime(event.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">
                {event.actionLabel}
                {event.channelId ? ` in ${event.channelId}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded bg-background-secondary/60 px-2.5 py-2">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
      <p className="text-xs leading-relaxed text-text-muted">{text}</p>
    </div>
  );
}

function getAuditActionLabel(action: string): string {
  switch (action) {
    case "channel_history_read":
      return "History read";
    case "stream_start":
      return "Stream started";
    case "stream_token":
      return "Stream token sent";
    case "stream_complete":
      return "Stream completed";
    case "stream_error":
      return "Stream failed";
    case "message_send":
      return "Message sent";
    case "message_poll":
      return "Messages polled";
    case "rate_limited":
      return "Rate limited";
    default:
      return getCapabilityLabel(action);
  }
}

function formatAuditTime(value: string): string {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
