import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ulid } from "ulid";
import crypto from "crypto";

/**
 * POST /api/v1/agents/register — Agent self-registration (DEC-0040)
 *
 * An agent calls this endpoint to register itself. Creates a Bot record
 * (so all existing streaming/channel/persistence logic works) and an
 * AgentRegistration record with a hashed API key.
 *
 * The raw API key is returned ONCE in the response. It is never stored.
 *
 * No session auth required — this is a public registration endpoint.
 * Rate limiting should be applied at the infrastructure level.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    displayName,
    model,
    capabilities,
    healthUrl,
    webhookUrl,
    serverId,
    systemPrompt,
    avatarUrl,
  } = body as {
    displayName?: string;
    model?: string;
    capabilities?: string[];
    healthUrl?: string;
    webhookUrl?: string;
    serverId?: string;
    systemPrompt?: string;
    avatarUrl?: string;
  };

  // Validate required fields
  if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json(
      { error: "displayName is required" },
      { status: 400 }
    );
  }

  if (!serverId || typeof serverId !== "string") {
    return NextResponse.json(
      { error: "serverId is required" },
      { status: 400 }
    );
  }

  // Verify server exists
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true },
  });

  if (!server) {
    return NextResponse.json(
      { error: "Server not found" },
      { status: 404 }
    );
  }

  // Generate API key: sk-tvk- prefix + 32 random bytes base64url
  const randomBytes = crypto.randomBytes(32);
  const apiKey = `sk-tvk-${randomBytes.toString("base64url")}`;

  // Hash with SHA-256 for fast indexed lookup (keys are high-entropy)
  const apiKeyHash = crypto
    .createHash("sha256")
    .update(apiKey)
    .digest("hex");

  const botId = ulid();
  const registrationId = ulid();

  try {
    // Create Bot + AgentRegistration in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const bot = await tx.bot.create({
        data: {
          id: botId,
          name: displayName.trim(),
          avatarUrl: avatarUrl as string | undefined,
          serverId,
          llmProvider: "custom", // Agent manages its own LLM
          llmModel: (model as string) || "custom",
          apiEndpoint: "", // Not used — agent handles its own API calls
          apiKeyEncrypted: "", // Not used — agent handles its own keys
          systemPrompt: (systemPrompt as string) || "",
          temperature: 0.7,
          maxTokens: 4096,
          isActive: true,
          triggerMode: "MENTION",
        },
      });

      const registration = await tx.agentRegistration.create({
        data: {
          id: registrationId,
          botId: bot.id,
          apiKeyHash,
          capabilities: Array.isArray(capabilities) ? capabilities : [],
          healthUrl: healthUrl as string | undefined,
          webhookUrl: webhookUrl as string | undefined,
        },
      });

      return { bot, registration };
    });

    // Build WebSocket URL
    const gatewayUrl =
      process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:4001/socket";
    const wsUrl = `${gatewayUrl}/websocket`;

    return NextResponse.json(
      {
        agentId: result.bot.id,
        apiKey, // Shown ONCE — never stored raw
        websocketUrl: wsUrl,
        serverId,
        capabilities: result.registration.capabilities,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Agent registration failed:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
