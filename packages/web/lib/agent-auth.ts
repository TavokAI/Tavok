import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Agent authentication result — returned on successful API key validation.
 * Used by all /api/v1/agents/* and /api/v1/webhooks/* endpoints.
 */
interface AgentAuthResult {
  agentId: string;
  agentName: string;
  agentAvatarUrl: string | null;
  serverId: string;
  capabilities: string[];
  connectionMethod: string;
}

/**
 * Core agent authentication — validates an API key and returns agent info.
 * Shared by both header-based and direct key authentication.
 */
async function authenticateApiKey(
  apiKey: string,
): Promise<AgentAuthResult | null> {
  if (!apiKey.startsWith("sk-tvk-")) {
    return null;
  }

  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const registration = await prisma.agentRegistration.findFirst({
    where: { apiKeyHash },
    select: {
      agentId: true,
      capabilities: true,
      connectionMethod: true,
      agent: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          serverId: true,
          isActive: true,
        },
      },
    },
  });

  if (!registration || !registration.agent.isActive) {
    return null;
  }

  return {
    agentId: registration.agentId,
    agentName: registration.agent.name,
    agentAvatarUrl: registration.agent.avatarUrl,
    serverId: registration.agent.serverId,
    capabilities: (registration.capabilities ?? []) as string[],
    connectionMethod: registration.connectionMethod,
  };
}

/**
 * Validate Bearer sk-tvk-... header and return agent info.
 *
 * Used by all /api/v1/ endpoints that require agent identity.
 * Mirrors the logic in /api/internal/agents/verify but returns richer data
 * and is callable directly from Next.js route handlers.
 *
 * @returns AgentAuthResult on success, null on failure
 */
export async function authenticateAgentRequest(
  request: NextRequest,
): Promise<AgentAuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer sk-tvk-")) {
    return null;
  }

  return authenticateApiKey(authHeader.slice(7));
}

/**
 * Validate an API key string directly (not from request headers).
 * Used by endpoints that receive the key via query parameters or URL tokens.
 */
export async function authenticateAgentKey(
  apiKey: string,
): Promise<AgentAuthResult | null> {
  return authenticateApiKey(apiKey);
}

/**
 * Authenticate an agent by Authorization header, verifying the key belongs to a
 * specific agentId.  Returns a discriminated union suitable for route handlers
 * that need {authorized, error, status}.
 *
 * This replaces per-route auth helpers that duplicated hashing + lookup logic.
 */
export async function authenticateAgentById(
  request: NextRequest,
  agentId: string,
): Promise<
  | { authorized: true; error?: undefined; status?: undefined }
  | { authorized: false; error: string; status: number }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      authorized: false,
      error: "Missing Authorization header",
      status: 401,
    };
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("sk-tvk-")) {
    return { authorized: false, error: "Invalid API key", status: 401 };
  }

  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const registration = await prisma.agentRegistration.findFirst({
    where: { apiKeyHash, agentId },
    select: { id: true, agent: { select: { isActive: true } } },
  });

  if (!registration) {
    return { authorized: false, error: "Invalid API key", status: 401 };
  }

  if (!registration.agent.isActive) {
    return { authorized: false, error: "Agent is inactive", status: 403 };
  }

  return { authorized: true };
}
