import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { generateId } from "@/lib/ulid";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import {
  createAgent,
  buildConnectionInfo,
  AgentNameConflictError,
  VALID_CONNECTION_METHODS,
  type ConnectionMethodValue,
} from "@/lib/agent-factory";

/**
 * GET /api/servers/{serverId}/agents — List all agents for a server
 * POST /api/servers/{serverId}/agents — Create a new agent (MANAGE_AGENTS)
 *
 * Extended (DEC-0047): GET includes connectionMethod.
 * POST supports non-BYOK creation when `connectionMethod` is provided.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;

  // Verify membership
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId } },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const agents = await prisma.agent.findMany({
    where: { serverId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      llmProvider: true,
      llmModel: true,
      apiEndpoint: true,
      systemPrompt: true,
      temperature: true,
      maxTokens: true,
      isActive: true,
      triggerMode: true,
      thinkingSteps: true,
      connectionMethod: true, // DEC-0047
      createdAt: true,
      // Never expose apiKeyEncrypted
      agentRegistration: {
        select: {
          connectionMethod: true,
          capabilities: true,
        },
      },
      // DEC-0073: Include channel assignments
      channelAgents: {
        select: {
          channel: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Deduplicate by name — keep the most recently created agent per name
  const seen = new Map<string, (typeof agents)[number]>();
  for (const agent of agents) {
    const existing = seen.get(agent.name);
    if (!existing || agent.createdAt > existing.createdAt) {
      seen.set(agent.name, agent);
    }
  }
  const dedupedAgents = [...seen.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Transform: flatten agentRegistration fields for the client
  const result = dedupedAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    avatarUrl: agent.avatarUrl,
    llmProvider: agent.llmProvider,
    llmModel: agent.llmModel,
    apiEndpoint: agent.apiEndpoint,
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    isActive: agent.isActive,
    triggerMode: agent.triggerMode,
    thinkingSteps: agent.thinkingSteps,
    connectionMethod: agent.connectionMethod || null, // null = BYOK
    capabilities: agent.agentRegistration?.capabilities || null,
    createdAt: agent.createdAt,
    // DEC-0073: Channel assignments
    channels: agent.channelAgents.map((ca) => ({
      id: ca.channel.id,
      name: ca.channel.name,
    })),
  }));

  return NextResponse.json({ agents: result });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId } = await params;

  const check = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.MANAGE_AGENTS,
  );
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Missing permission: Manage Agents" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    name,
    connectionMethod,
    llmProvider,
    llmModel,
    apiEndpoint,
    apiKey,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 4096,
    triggerMode = "MENTION",
    thinkingSteps,
    // Method-specific fields
    webhookUrl,
    capabilities,
    // DEC-0073: Optional channel assignment
    channelIds,
  } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Validate channelIds if provided (DEC-0073)
  const validatedChannelIds = Array.isArray(channelIds)
    ? channelIds.filter((id: unknown) => typeof id === "string")
    : undefined;

  // --- Non-BYOK creation (DEC-0047) ---
  if (connectionMethod && VALID_CONNECTION_METHODS.includes(connectionMethod)) {
    return createNonBYOKAgent(serverId, {
      name: name.trim(),
      connectionMethod: connectionMethod as ConnectionMethodValue,
      triggerMode,
      webhookUrl,
      capabilities,
      systemPrompt,
      channelIds: validatedChannelIds,
    });
  }

  // --- BYOK creation (existing flow) ---
  if (!llmProvider || !llmModel || !apiEndpoint || !apiKey || !systemPrompt) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: name, llmProvider, llmModel, apiEndpoint, apiKey, systemPrompt",
      },
      { status: 400 },
    );
  }

  const apiKeyEncrypted = encrypt(apiKey);

  const agentId = generateId();
  let agent;
  try {
    agent = await prisma.agent.create({
      data: {
        id: agentId,
        name,
        serverId,
        llmProvider,
        llmModel,
        apiEndpoint,
        apiKeyEncrypted,
        systemPrompt,
        temperature,
        maxTokens,
        isActive: true,
        triggerMode,
        thinkingSteps: thinkingSteps
          ? JSON.stringify(thinkingSteps)
          : undefined,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: `Agent with name "${name}" already exists in this server`,
        },
        { status: 409 },
      );
    }
    throw error;
  }

  // Assign BYOK agent to channels — specific if provided, all if not (DEC-0073)
  let assignChannelIds: string[];
  if (validatedChannelIds && validatedChannelIds.length > 0) {
    const validChannels = await prisma.channel.findMany({
      where: { serverId, id: { in: validatedChannelIds } },
      select: { id: true },
    });
    assignChannelIds = validChannels.map((ch) => ch.id);
  } else {
    const allChannels = await prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    });
    assignChannelIds = allChannels.map((ch) => ch.id);
  }
  if (assignChannelIds.length > 0) {
    await prisma.channelAgent.createMany({
      data: assignChannelIds.map((chId) => ({
        id: generateId(),
        channelId: chId,
        agentId: agent.id,
      })),
    });
  }

  return NextResponse.json(
    {
      id: agent.id,
      name: agent.name,
      llmProvider: agent.llmProvider,
      llmModel: agent.llmModel,
      apiEndpoint: agent.apiEndpoint,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      isActive: agent.isActive,
      triggerMode: agent.triggerMode,
      thinkingSteps: agent.thinkingSteps
        ? JSON.parse(agent.thinkingSteps)
        : null,
    },
    { status: 201 },
  );
}

/**
 * Create a non-BYOK agent (owner-initiated).
 * Delegates to shared createAgent factory, wraps result in NextResponse.
 */
async function createNonBYOKAgent(
  serverId: string,
  opts: {
    name: string;
    connectionMethod: ConnectionMethodValue;
    triggerMode?: "ALWAYS" | "MENTION" | "KEYWORD";
    webhookUrl?: string;
    capabilities?: string[];
    systemPrompt?: string;
    channelIds?: string[];
  },
) {
  try {
    const result = await createAgent({
      ...opts,
      serverId,
    });

    const connectionInfo = buildConnectionInfo(
      result.agent.id,
      result.connectionMethod,
      {
        webhookUrl: opts.webhookUrl,
        webhookSecret: result.webhookSecret,
      },
    );

    return NextResponse.json(
      {
        id: result.agent.id,
        name: result.agent.name,
        connectionMethod: result.connectionMethod,
        apiKey: result.apiKey,
        ...connectionInfo,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AgentNameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[servers/agents] Non-BYOK agent creation failed:", error);
    return NextResponse.json(
      { error: "Agent creation failed" },
      { status: 500 },
    );
  }
}
