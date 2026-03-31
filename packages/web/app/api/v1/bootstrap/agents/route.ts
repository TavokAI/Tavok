import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminToken } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  AgentNameConflictError,
  VALID_CONNECTION_METHODS,
  type ConnectionMethodValue,
} from "@/lib/agent-factory";
import { RateLimiter, getClientIp } from "@/lib/rate-limit";
import {
  bootstrapCreateAgent,
  ensureServerExists,
} from "@/lib/services/AgentService";

/**
 * POST /api/v1/bootstrap/agents — CLI-initiated agent creation
 *
 * Creates an agent (Agent + AgentRegistration) using admin token auth.
 * Used by `tavok init` to set up agents without a user session.
 *
 * Auth: Authorization: Bearer admin-{TAVOK_ADMIN_TOKEN}
 *
 * Body:
 *   name       — required, display name for the agent
 *   serverId   — required, which server to add the agent to
 *   connectionMethod — optional, defaults to WEBSOCKET
 *   webhookUrl — optional, only for WEBHOOK agents
 *
 * Returns the raw API key (shown once, never stored).
 */

/** Rate limit agent creation: 10 per 60s per IP */
const bootstrapLimiter = new RateLimiter({ max: 10, windowSec: 60 });

export async function POST(request: NextRequest) {
  // Rate limit before any auth check to prevent brute-force
  const ip = getClientIp(request);
  const rateCheck = bootstrapLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Admin token auth (same as bootstrap endpoint)
  if (!authenticateAdminToken(request)) {
    return NextResponse.json(
      { error: "Invalid or missing admin token" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, serverId, connectionMethod, webhookUrl, channelIds } = body as {
    name?: string;
    serverId?: string;
    connectionMethod?: string;
    webhookUrl?: string;
    channelIds?: string[];
  };

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!serverId || typeof serverId !== "string") {
    return NextResponse.json(
      { error: "serverId is required" },
      { status: 400 },
    );
  }

  // Verify server exists
  const server = await ensureServerExists(prisma, serverId);

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  // Resolve connection method (default WEBSOCKET)
  const resolvedMethod: ConnectionMethodValue =
    connectionMethod &&
    VALID_CONNECTION_METHODS.includes(connectionMethod as ConnectionMethodValue)
      ? (connectionMethod as ConnectionMethodValue)
      : "WEBSOCKET";

  try {
    // DEC-0073: Pass optional channelIds for selective assignment
    const validatedChannelIds = Array.isArray(channelIds)
      ? channelIds.filter((id): id is string => typeof id === "string")
      : undefined;

    const result = await bootstrapCreateAgent({
      name: name.trim(),
      serverId,
      connectionMethod: resolvedMethod,
      webhookUrl,
      channelIds: validatedChannelIds,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AgentNameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(
      "[v1/bootstrap/agents] Bootstrap agent creation failed:",
      error,
    );
    return NextResponse.json(
      { error: "Agent creation failed" },
      { status: 500 },
    );
  }
}
