import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { validateInternalSecret } from "@/lib/internal-auth";
import { getAgentLifecycleError } from "@/lib/agent-capabilities";

/**
 * GET /api/internal/channels/{channelId}/agents
 *
 * Returns ALL agents assigned to a channel with API keys DECRYPTED.
 * Falls back to the single defaultAgent if no ChannelAgent entries exist (backward compat).
 * Used by the Gateway to trigger multiple agents on message send (TASK-0012).
 * Auth: X-Internal-Secret header.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channelId } = await params;

  try {
    // 1. Try ChannelAgent join table first (multi-agent)
    const channelAgents = await prisma.channelAgent.findMany({
      where: { channelId },
      include: {
        agent: {
          include: {
            agentRegistration: {
              select: {
                capabilities: true,
                connectionMethod: true,
                expiresAt: true,
                isGuest: true,
                revokedAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (channelAgents.length > 0) {
      // Return all active agents with decrypted keys
      const agents = channelAgents
        .filter(
          (ca: (typeof channelAgents)[number]) =>
            getAgentLifecycleError({
              isActive: ca.agent.isActive,
              isGuest: ca.agent.agentRegistration?.isGuest ?? false,
              capabilities: ca.agent.agentRegistration?.capabilities ?? [],
              expiresAt: ca.agent.agentRegistration?.expiresAt ?? null,
              revokedAt: ca.agent.agentRegistration?.revokedAt ?? null,
            }) === null,
        )
        .map((ca: (typeof channelAgents)[number]) => {
          let apiKey = "";
          try {
            apiKey = decrypt(ca.agent.apiKeyEncrypted);
          } catch {
            console.error(
              `[internal/channels/agents] Failed to decrypt API key for agent ${ca.agent.id}`,
            );
          }

          return {
            id: ca.agent.id,
            name: ca.agent.name,
            avatarUrl: ca.agent.avatarUrl,
            llmProvider: ca.agent.llmProvider,
            llmModel: ca.agent.llmModel,
            apiEndpoint: ca.agent.apiEndpoint,
            apiKey,
            systemPrompt: ca.agent.systemPrompt,
            temperature: ca.agent.temperature,
            maxTokens: ca.agent.maxTokens,
            triggerMode: ca.agent.triggerMode,
            thinkingSteps: ca.agent.thinkingSteps
              ? JSON.parse(ca.agent.thinkingSteps)
              : [], // TASK-0011
            connectionMethod:
              ca.agent.agentRegistration?.connectionMethod || null, // DEC-0043: null = BYOK (no registration)
          };
        });

      return NextResponse.json({ agents });
    }

    // 2. Fallback: check defaultAgent (backward compat for channels not yet migrated)
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        defaultAgent: {
          include: {
            agentRegistration: {
              select: {
                capabilities: true,
                connectionMethod: true,
                expiresAt: true,
                isGuest: true,
                revokedAt: true,
              },
            },
          },
        },
      },
    });

    if (
      !channel ||
      !channel.defaultAgent ||
      getAgentLifecycleError({
        isActive: channel.defaultAgent.isActive,
        isGuest: channel.defaultAgent.agentRegistration?.isGuest ?? false,
        capabilities:
          channel.defaultAgent.agentRegistration?.capabilities ?? [],
        expiresAt: channel.defaultAgent.agentRegistration?.expiresAt ?? null,
        revokedAt: channel.defaultAgent.agentRegistration?.revokedAt ?? null,
      })
    ) {
      // BUG-008: Log when no agents found — helps diagnose BYOK trigger failures
      console.info(
        `[Internal] No active agents for channel ${channelId} (no ChannelAgent records, no active defaultAgent)`,
      );
      return NextResponse.json({ agents: [] });
    }

    const agent = channel.defaultAgent;
    let apiKey = "";
    try {
      apiKey = decrypt(agent.apiKeyEncrypted);
    } catch {
      console.error(
        `[internal/channels/agents] Failed to decrypt API key for agent ${agent.id}`,
      );
    }

    return NextResponse.json({
      agents: [
        {
          id: agent.id,
          name: agent.name,
          avatarUrl: agent.avatarUrl,
          llmProvider: agent.llmProvider,
          llmModel: agent.llmModel,
          apiEndpoint: agent.apiEndpoint,
          apiKey,
          systemPrompt: agent.systemPrompt,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          triggerMode: agent.triggerMode,
          thinkingSteps: agent.thinkingSteps
            ? JSON.parse(agent.thinkingSteps)
            : [], // TASK-0011
          connectionMethod: agent.agentRegistration?.connectionMethod || null, // DEC-0043: null = BYOK (no registration)
        },
      ],
    });
  } catch (error) {
    console.error(
      "[internal/channels/agents] Failed to get channel agents:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to get channel agents" },
      { status: 500 },
    );
  }
}
