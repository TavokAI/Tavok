import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { canMutateServerScopedResource } from "@/lib/api-safety";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";
import { normalizeAgentCapabilities } from "@/lib/agent-capabilities";

/**
 * GET /api/servers/{serverId}/agents/{agentId} — Get agent details (no key)
 * PATCH /api/servers/{serverId}/agents/{agentId} — Update agent (MANAGE_AGENTS)
 * DELETE /api/servers/{serverId}/agents/{agentId} — Delete agent (MANAGE_AGENTS)
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

  // Verify membership
  const member = await prisma.member.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId } },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
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
      createdAt: true,
      serverId: true,
      agentRegistration: {
        select: {
          capabilities: true,
          isGuest: true,
          expiresAt: true,
          revokedAt: true,
          connectionMethod: true,
        },
      },
    },
  });

  if (!agent || !canMutateServerScopedResource(serverId, agent.serverId)) {
    return NextResponse.json(
      { error: "Agent not found in this server" },
      { status: 404 },
    );
  }

  const { serverId: _serverId, agentRegistration, ...safeAgent } = agent;
  const registrationState = {
    capabilities: agentRegistration?.capabilities ?? null,
    connectionMethod: agentRegistration?.connectionMethod ?? null,
    isGuest: agentRegistration?.isGuest ?? false,
    expiresAt: agentRegistration?.expiresAt ?? null,
    revokedAt: agentRegistration?.revokedAt ?? null,
  };
  return NextResponse.json({ ...safeAgent, ...registrationState });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; agentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, agentId } = await params;

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

  const existingAgent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      serverId: true,
      agentRegistration: {
        select: {
          isGuest: true,
          expiresAt: true,
          revokedAt: true,
        },
      },
    },
  });
  if (
    !existingAgent ||
    !canMutateServerScopedResource(serverId, existingAgent.serverId)
  ) {
    return NextResponse.json(
      { error: "Agent not found in this server" },
      { status: 404 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsedBody = await request.json();
    if (
      !parsedBody ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  const registrationUpdateData: Record<string, unknown> = {};
  const allowedFields = [
    "name",
    "llmProvider",
    "llmModel",
    "apiEndpoint",
    "systemPrompt",
    "temperature",
    "maxTokens",
    "isActive",
    "triggerMode",
  ];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (typeof body.apiKey === "string" && body.apiKey.length > 0) {
    updateData.apiKeyEncrypted = encrypt(body.apiKey);
  }

  if (Array.isArray(body.capabilities)) {
    registrationUpdateData.capabilities = normalizeAgentCapabilities(
      body.capabilities,
    );
  }
  if (typeof body.isGuest === "boolean") {
    registrationUpdateData.isGuest = body.isGuest;
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt !== null && typeof body.expiresAt !== "string") {
      return NextResponse.json(
        { error: "expiresAt must be an ISO timestamp or null" },
        { status: 400 },
      );
    }
    const expiresAt =
      typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json(
        { error: "expiresAt must be a valid ISO timestamp" },
        { status: 400 },
      );
    }
    registrationUpdateData.expiresAt = expiresAt;
  }
  if (body.revokedAt !== undefined) {
    if (body.revokedAt === null) {
      return NextResponse.json(
        { error: "revokedAt cannot be cleared" },
        { status: 400 },
      );
    }
    if (typeof body.revokedAt !== "string") {
      return NextResponse.json(
        { error: "revokedAt must be a valid ISO timestamp" },
        { status: 400 },
      );
    }
    const revokedAt = new Date(body.revokedAt);
    if (Number.isNaN(revokedAt.getTime())) {
      return NextResponse.json(
        { error: "revokedAt must be a valid ISO timestamp" },
        { status: 400 },
      );
    }
    registrationUpdateData.revokedAt = revokedAt;
  }

  const currentRegistration = existingAgent.agentRegistration;
  const finalIsGuest =
    typeof registrationUpdateData.isGuest === "boolean"
      ? registrationUpdateData.isGuest
      : (currentRegistration?.isGuest ?? false);
  const finalExpiresAt =
    registrationUpdateData.expiresAt !== undefined
      ? registrationUpdateData.expiresAt
      : (currentRegistration?.expiresAt ?? null);

  if (finalIsGuest && !finalExpiresAt) {
    return NextResponse.json(
      { error: "Guest agents require an explicit expiresAt" },
      { status: 400 },
    );
  }

  const agent = await prisma.$transaction(async (tx) => {
    const updatedAgent = await tx.agent.update({
      where: { id: agentId },
      data: updateData,
      select: {
        id: true,
        name: true,
        llmProvider: true,
        llmModel: true,
        apiEndpoint: true,
        systemPrompt: true,
        temperature: true,
        maxTokens: true,
        isActive: true,
        triggerMode: true,
      },
    });

    if (Object.keys(registrationUpdateData).length > 0) {
      await tx.agentRegistration.update({
        where: { agentId },
        data: registrationUpdateData,
      });
    }

    return updatedAgent;
  });

  return NextResponse.json(agent);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; agentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, agentId } = await params;

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

  const existingAgent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { serverId: true },
  });
  if (
    !existingAgent ||
    !canMutateServerScopedResource(serverId, existingAgent.serverId)
  ) {
    return NextResponse.json(
      { error: "Agent not found in this server" },
      { status: 404 },
    );
  }

  await prisma.agent.delete({ where: { id: agentId } });

  return NextResponse.json({ success: true });
}
