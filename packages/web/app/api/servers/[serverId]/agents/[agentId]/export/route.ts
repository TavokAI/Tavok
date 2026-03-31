import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canMutateServerScopedResource } from "@/lib/api-safety";

/**
 * GET /api/servers/{serverId}/agents/{agentId}/export
 * Export agent config as a shareable JSON template (no secrets).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; agentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, agentId } = await params;

  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId } },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      name: true,
      llmProvider: true,
      llmModel: true,
      apiEndpoint: true,
      systemPrompt: true,
      temperature: true,
      maxTokens: true,
      triggerMode: true,
      thinkingSteps: true,
      enabledTools: true,
      serverId: true,
    },
  });

  if (!agent || !canMutateServerScopedResource(serverId, agent.serverId)) {
    return NextResponse.json(
      { error: "Agent not found in this server" },
      { status: 404 },
    );
  }

  // Build portable template — no secrets, no IDs, no server binding
  const template = {
    _tavokAgentTemplate: 1,
    name: agent.name,
    llmProvider: agent.llmProvider,
    llmModel: agent.llmModel,
    apiEndpoint: agent.apiEndpoint,
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    triggerMode: agent.triggerMode,
    thinkingSteps: agent.thinkingSteps,
    enabledTools: agent.enabledTools,
  };

  return NextResponse.json(template);
}
