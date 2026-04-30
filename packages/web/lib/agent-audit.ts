/**
 * Agent audit logging — structured logs for all agent API actions.
 *
 * Provides detection surface for rogue agents: message flooding,
 * channel scraping, unexpected access patterns. Logs to stdout
 * as structured JSON for ingestion by any log aggregator.
 *
 * Each log entry includes: agentId, serverId, action, channelId (if
 * applicable), metadata, and timestamp. Format designed for
 * grep/jq filtering in dev and structured indexing in production.
 */

import { prisma } from "@/lib/db";
import { generateId } from "@/lib/ulid";

type AgentAction =
  | "message_send"
  | "message_poll"
  | "channel_history_read"
  | "stream_start"
  | "stream_token"
  | "stream_complete"
  | "stream_error"
  | "webhook_create"
  | "webhook_delete"
  | "agent_update"
  | "agent_deregister"
  | "key_rotate"
  | "rate_limited";

interface AgentAuditEntry {
  agentId: string;
  serverId: string;
  action: AgentAction;
  channelId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an agent action as structured JSON to stdout.
 *
 * Format:
 * {"level":"audit","agent_id":"01HX...","server_id":"01HX...","action":"message_send","channel_id":"01HX...","ts":"2026-03-12T..."}
 */
export async function logAgentAction(entry: AgentAuditEntry): Promise<void> {
  const log: Record<string, unknown> = {
    level: "audit",
    agent_id: entry.agentId,
    server_id: entry.serverId,
    action: entry.action,
    ts: new Date().toISOString(),
  };

  if (entry.channelId) log.channel_id = entry.channelId;
  if (entry.messageId) log.message_id = entry.messageId;
  if (entry.metadata) log.meta = entry.metadata;

  // Structured JSON to stdout — compatible with Docker log drivers,
  // CloudWatch, Datadog, and plain `docker logs | jq`
  console.log(JSON.stringify(log));

  await persistAgentAction(entry);
}

async function persistAgentAction(entry: AgentAuditEntry): Promise<void> {
  if (entry.serverId === "unknown") {
    return;
  }

  const auditDelegate = (
    prisma as typeof prisma & {
      agentAuditLog?: {
        create: (args: {
          data: {
            id: string;
            agentId: string;
            serverId: string;
            action: string;
            channelId?: string;
            messageId?: string;
            metadata?: Record<string, unknown>;
          };
        }) => Promise<unknown>;
      };
    }
  ).agentAuditLog;

  if (!auditDelegate) {
    return;
  }

  try {
    await auditDelegate.create({
      data: {
        id: generateId(),
        agentId: entry.agentId,
        serverId: entry.serverId,
        action: entry.action,
        ...(entry.channelId ? { channelId: entry.channelId } : {}),
        ...(entry.messageId ? { messageId: entry.messageId } : {}),
        ...(entry.metadata ? { metadata: entry.metadata } : {}),
      },
    });
  } catch (error) {
    console.error("[agent-audit] Failed to persist audit entry:", error);
  }
}
