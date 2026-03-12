import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canMutateServerScopedResource,
  serializeSequence,
} from "@/lib/api-safety";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";
import { generateId } from "@/lib/ulid";

/** Valid swarm modes for TASK-0020 */
const VALID_SWARM_MODES = [
  "HUMAN_IN_THE_LOOP",
  "LEAD_AGENT",
  "ROUND_ROBIN",
  "STRUCTURED_DEBATE",
  "CODE_REVIEW_SPRINT",
  "FREEFORM",
  "CUSTOM",
] as const;

/** Zod schema for channel PATCH body — replaces manual validation chain. */
const channelPatchSchema = z
  .object({
    defaultAgentId: z.string().min(1).nullable().optional(),
    topic: z.string().max(300).nullable().optional(),
    swarmMode: z.enum(VALID_SWARM_MODES).optional(),
    charterGoal: z.string().nullable().optional(),
    charterRules: z.string().nullable().optional(),
    charterAgentOrder: z.array(z.string()).nullable().optional(),
    charterMaxTurns: z.number().int().nonnegative().optional(),
    agentIds: z.array(z.string()).optional(),
  })
  .strict();

type ChannelPatchBody = z.infer<typeof channelPatchSchema>;

/**
 * PATCH /api/servers/{serverId}/channels/{channelId}
 *
 * Update channel settings (assign agents, topic, etc.).
 * Supports both `defaultAgentId` (legacy single agent) and `agentIds` (multi-agent, TASK-0012).
 * Requires MANAGE_CHANNELS permission.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; channelId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, channelId } = await params;

  const check = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.MANAGE_CHANNELS,
  );
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Missing permission: Manage Channels" },
      { status: 403 },
    );
  }

  const existingChannel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (
    !existingChannel ||
    !canMutateServerScopedResource(serverId, existingChannel.serverId)
  ) {
    return NextResponse.json(
      { error: "Channel not found in this server" },
      { status: 404 },
    );
  }

  // Parse and validate body with zod
  let body: ChannelPatchBody;
  try {
    const rawBody = await request.json();
    const parsed = channelPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message || "Invalid request body" },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  // Validate defaultAgentId references an agent in this server
  if (body.defaultAgentId !== undefined) {
    if (body.defaultAgentId === null) {
      updateData.defaultAgentId = null;
    } else {
      const agent = await prisma.agent.findUnique({
        where: { id: body.defaultAgentId },
      });
      if (!agent || agent.serverId !== serverId) {
        return NextResponse.json(
          { error: "Agent not found in this server" },
          { status: 400 },
        );
      }
      updateData.defaultAgentId = body.defaultAgentId;
    }
  }

  if (body.topic !== undefined) {
    updateData.topic = body.topic === "" ? null : body.topic;
  }

  if (body.swarmMode !== undefined) {
    updateData.swarmMode = body.swarmMode;
  }

  if (body.charterGoal !== undefined) {
    updateData.charterGoal = body.charterGoal || null;
  }

  if (body.charterRules !== undefined) {
    updateData.charterRules = body.charterRules || null;
  }

  if (body.charterAgentOrder !== undefined) {
    updateData.charterAgentOrder = body.charterAgentOrder
      ? JSON.stringify(body.charterAgentOrder)
      : null;
  }

  if (body.charterMaxTurns !== undefined) {
    updateData.charterMaxTurns = body.charterMaxTurns;
  }

  // Handle agentIds array (multi-agent assignment — TASK-0012)
  if (body.agentIds !== undefined) {
    const agentIds = body.agentIds;

    // Validate all agent IDs exist in this server
    if (agentIds.length > 0) {
      const validAgents = await prisma.agent.findMany({
        where: { id: { in: agentIds }, serverId },
        select: { id: true },
      });
      const validIds = new Set(validAgents.map((a) => a.id));
      const invalid = agentIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Agents not found in this server: ${invalid.join(", ")}` },
          { status: 400 },
        );
      }
    }

    // Transaction: delete old ChannelAgent entries → create new ones → update defaultAgentId
    await prisma.$transaction([
      prisma.channelAgent.deleteMany({ where: { channelId } }),
      ...agentIds.map((agentId: string) =>
        prisma.channelAgent.create({
          data: { id: generateId(), channelId, agentId },
        }),
      ),
      // Set first agent as defaultAgentId for backward compat
      prisma.channel.update({
        where: { id: channelId },
        data: {
          defaultAgentId: agentIds.length > 0 ? agentIds[0] : null,
        },
      }),
    ]);
  }

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: updateData,
    include: {
      channelAgents: { select: { agentId: true } },
    },
  });

  // Parse charterAgentOrder JSON string → array for client
  let parsedAgentOrder: string[] | null = null;
  if (channel.charterAgentOrder) {
    try {
      parsedAgentOrder = JSON.parse(channel.charterAgentOrder);
    } catch {
      parsedAgentOrder = null;
    }
  }

  return NextResponse.json({
    ...channel,
    lastSequence: serializeSequence(channel.lastSequence),
    agentIds: channel.channelAgents.map((ca) => ca.agentId),
    charterAgentOrder: parsedAgentOrder,
  });
}

/**
 * DELETE /api/servers/{serverId}/channels/{channelId}
 * Requires MANAGE_CHANNELS permission. Cannot delete the last channel.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ serverId: string; channelId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, channelId } = await params;

  const permCheck = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.MANAGE_CHANNELS,
  );
  if (!permCheck.allowed) {
    return NextResponse.json(
      { error: "Missing permission: Manage Channels" },
      { status: 403 },
    );
  }

  try {
    // Cannot delete last channel
    const channelCount = await prisma.channel.count({
      where: { serverId },
    });
    if (channelCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last channel in a server" },
        { status: 400 },
      );
    }

    // Verify channel belongs to this server
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, serverId },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    await prisma.channel.delete({ where: { id: channelId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[channels] Failed to delete channel:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
