import { generateId } from "@/lib/ulid";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPublicBaseUrl } from "@/lib/internal-auth";
import type { TriggerMode, ConnectionMethod } from "@tavok/shared/agent";

export class AgentNameConflictError extends Error {
  constructor(name: string) {
    super(`Agent with name "${name}" already exists in this server`);
    this.name = "AgentNameConflictError";
  }
}

/**
 * Shared agent creation logic — used by both:
 * - POST /api/servers/{serverId}/agents (UI-initiated, session auth)
 * - POST /api/v1/bootstrap/agents (CLI-initiated, admin token auth)
 *
 * Creates an Agent + AgentRegistration in a transaction, returns
 * the raw API key (shown once, never stored).
 */

export const VALID_CONNECTION_METHODS = [
  "WEBSOCKET",
  "WEBHOOK",
  "INBOUND_WEBHOOK",
  "REST_POLL",
  "SSE",
  "OPENAI_COMPAT",
] as const;

export type ConnectionMethodValue = ConnectionMethod;

interface CreateAgentOptions {
  name: string;
  serverId: string;
  connectionMethod: ConnectionMethodValue;
  triggerMode?: TriggerMode;
  webhookUrl?: string;
  capabilities?: string[];
  systemPrompt?: string;
}

interface CreateAgentResult {
  agent: { id: string; name: string };
  apiKey: string; // raw key — shown once, never stored
  connectionMethod: ConnectionMethodValue;
  webhookSecret?: string; // for WEBHOOK method only
}

/**
 * Create an agent (Agent + AgentRegistration) with a generated API key.
 *
 * The raw API key is returned in the result and must be shown to the user
 * exactly once. Only the SHA-256 hash is stored in the database.
 *
 * @throws Error if the database transaction fails
 */
export async function createAgent(
  opts: CreateAgentOptions,
): Promise<CreateAgentResult> {
  const agentId = generateId();
  const registrationId = generateId();

  // Generate API key: sk-tvk- prefix + 32 random bytes base64url
  const randomBytes = crypto.randomBytes(32);
  const generatedKey = `sk-tvk-${randomBytes.toString("base64url")}`;
  const apiKeyHash = crypto
    .createHash("sha256")
    .update(generatedKey)
    .digest("hex");

  // Generate webhook secret for WEBHOOK method
  const webhookSecret =
    opts.connectionMethod === "WEBHOOK"
      ? crypto.randomBytes(32).toString("hex")
      : undefined;

  let result: { agent: { id: string; name: string } };
  try {
    result = await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          id: agentId,
          name: opts.name,
          serverId: opts.serverId,
          llmProvider: "custom",
          llmModel: "custom",
          apiEndpoint: "",
          apiKeyEncrypted: "",
          systemPrompt: opts.systemPrompt || "",
          temperature: 0.7,
          maxTokens: 4096,
          isActive: true,
          triggerMode: opts.triggerMode || "MENTION",
          connectionMethod: opts.connectionMethod,
        },
      });

      await tx.agentRegistration.create({
        data: {
          id: registrationId,
          agentId: agent.id,
          apiKeyHash,
          capabilities: Array.isArray(opts.capabilities)
            ? opts.capabilities
            : [],
          webhookUrl: opts.webhookUrl,
          connectionMethod: opts.connectionMethod,
          webhookSecret,
        },
      });

      // Auto-assign agent to all channels in the server so Gateway can trigger it
      const channels = await tx.channel.findMany({
        where: { serverId: opts.serverId },
        select: { id: true },
      });

      if (channels.length > 0) {
        await tx.channelAgent.createMany({
          data: channels.map((ch) => ({
            id: generateId(),
            channelId: ch.id,
            agentId: agent.id,
          })),
        });
      }

      return { agent };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AgentNameConflictError(opts.name);
    }
    throw error;
  }

  return {
    agent: { id: result.agent.id, name: result.agent.name },
    apiKey: generatedKey,
    connectionMethod: opts.connectionMethod,
    webhookSecret,
  };
}

/**
 * Build method-specific connection URLs for an agent.
 *
 * Used by both the agents route and the bootstrap/agents route
 * to return connection info after agent creation.
 */
export function buildConnectionInfo(
  agentId: string,
  connectionMethod: ConnectionMethodValue,
  opts?: { webhookUrl?: string; webhookSecret?: string },
): Record<string, string | undefined> {
  const gatewayUrl =
    process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:4001/socket";
  const webUrl = getPublicBaseUrl();

  const info: Record<string, string | undefined> = {};

  switch (connectionMethod) {
    case "WEBSOCKET":
      info.websocketUrl = `${gatewayUrl}/websocket`;
      break;
    case "WEBHOOK":
      info.webhookUrl = opts?.webhookUrl;
      info.webhookSecret = opts?.webhookSecret;
      break;
    case "REST_POLL":
      info.pollUrl = `${webUrl}/api/v1/agents/${agentId}/messages`;
      break;
    case "SSE":
      info.eventsUrl = `${webUrl}/api/v1/agents/${agentId}/events`;
      break;
    case "OPENAI_COMPAT":
      info.chatCompletionsUrl = `${webUrl}/api/v1/chat/completions`;
      info.modelsUrl = `${webUrl}/api/v1/models`;
      break;
    case "INBOUND_WEBHOOK":
      info.inboundWebhookUrl = `${webUrl}/api/v1/webhooks/{token}`;
      info.note =
        "Replace {token} with the webhook token from agent registration";
      break;
  }

  return info;
}
