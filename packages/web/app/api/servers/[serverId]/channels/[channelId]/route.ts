import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canMutateServerScopedResource } from "@/lib/api-safety";
import { checkMemberPermission } from "@/lib/check-member-permission";
import { Permissions } from "@/lib/permissions";
import {
  countServerChannels,
  deleteServerChannel,
  getChannelServerOwnership,
  getServerChannel,
  updateServerChannel,
} from "@/lib/services/ChannelService";

const VALID_SWARM_MODES = [
  "HUMAN_IN_THE_LOOP",
  "LEAD_AGENT",
  "ROUND_ROBIN",
  "STRUCTURED_DEBATE",
  "CODE_REVIEW_SPRINT",
  "FREEFORM",
  "CUSTOM",
] as const;

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serverId: string; channelId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serverId, channelId } = await params;

  const check = await checkMemberPermission(
    session.user.id,
    serverId,
    Permissions.SEND_MESSAGES,
  );
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const channel = await getServerChannel(prisma, serverId, channelId);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json(channel);
  } catch (error) {
    console.error("[channels] Failed to get channel:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string; channelId: string }> },
) {
  const session = await auth();
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

  const existingChannel = await getChannelServerOwnership(prisma, channelId);
  if (
    !existingChannel ||
    !canMutateServerScopedResource(serverId, existingChannel.serverId)
  ) {
    return NextResponse.json(
      { error: "Channel not found in this server" },
      { status: 404 },
    );
  }

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

  try {
    const channel = await updateServerChannel(prisma, {
      serverId,
      channelId,
      defaultAgentId: body.defaultAgentId,
      topic: body.topic,
      swarmMode: body.swarmMode,
      charterGoal: body.charterGoal,
      charterRules: body.charterRules,
      charterAgentOrder: body.charterAgentOrder,
      charterMaxTurns: body.charterMaxTurns,
      agentIds: body.agentIds,
    });

    return NextResponse.json(channel);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("not found in this server")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[channels] Failed to update channel:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ serverId: string; channelId: string }> },
) {
  const session = await auth();
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
    const channelCount = await countServerChannels(prisma, serverId);
    if (channelCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last channel in a server" },
        { status: 400 },
      );
    }

    const channel = await getServerChannel(prisma, serverId, channelId);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    await deleteServerChannel(prisma, channelId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[channels] Failed to delete channel:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
