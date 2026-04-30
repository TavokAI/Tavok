import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { validateInternalSecret } from "@/lib/internal-auth";
import { getAgentLifecycleError } from "@/lib/agent-capabilities";

/**
 * GET /api/internal/channels/{channelId}/agent
 *
 * Returns the default agent config for a channel with the API key DECRYPTED.
 * Used by the Gateway to check agent triggers and build stream requests.
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
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        defaultAgent: {
          include: {
            agentRegistration: {
              select: {
                capabilities: true,
                expiresAt: true,
                isGuest: true,
                revokedAt: true,
              },
            },
          },
        },
      },
    });

    if (!channel || !channel.defaultAgent) {
      return NextResponse.json({ error: "No default agent" }, { status: 404 });
    }

    const agent = channel.defaultAgent;

    const lifecycleError = getAgentLifecycleError({
      isActive: agent.isActive,
      isGuest: agent.agentRegistration?.isGuest ?? false,
      capabilities: agent.agentRegistration?.capabilities ?? [],
      expiresAt: agent.agentRegistration?.expiresAt ?? null,
      revokedAt: agent.agentRegistration?.revokedAt ?? null,
    });

    // Only return active, unexpired, unrevoked agents.
    if (lifecycleError) {
      return NextResponse.json({ error: lifecycleError }, { status: 404 });
    }

    // Decrypt API key for internal use
    let apiKey = "";
    try {
      apiKey = decrypt(agent.apiKeyEncrypted);
    } catch {
      console.error(
        `[internal/channels/agent] Failed to decrypt API key for agent ${agent.id}`,
      );
      return NextResponse.json(
        { error: "Failed to decrypt agent API key" },
        { status: 500 },
      );
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error(
      "[internal/channels/agent] Failed to get channel agent:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to get channel agent" },
      { status: 500 },
    );
  }
}
