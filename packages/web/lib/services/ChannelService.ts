import type { PrismaClient } from "@prisma/client";
import { serializeSequence } from "@/lib/api-safety";
import { generateId } from "@/lib/ulid";

type ChannelServiceClient = Pick<PrismaClient, "$transaction"> & {
  channel: PrismaClient["channel"];
  agent: PrismaClient["agent"];
  channelAgent: PrismaClient["channelAgent"];
};

export interface CreateChannelInput {
  serverId: string;
  name: string;
  topic: string | null;
  type: "TEXT" | "ANNOUNCEMENT";
}

export interface UpdateChannelInput {
  serverId: string;
  channelId: string;
  defaultAgentId?: string | null;
  topic?: string | null;
  swarmMode?: string;
  charterGoal?: string | null;
  charterRules?: string | null;
  charterAgentOrder?: string[] | null;
  charterMaxTurns?: number;
  agentIds?: string[];
}

export async function listServerChannels(
  prismaClient: ChannelServiceClient,
  serverId: string,
) {
  return prismaClient.channel.findMany({
    where: { serverId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      topic: true,
      position: true,
    },
  });
}

export async function createServerChannel(
  prismaClient: ChannelServiceClient,
  input: CreateChannelInput,
) {
  const channelId = generateId();
  const channel = await prismaClient.$transaction(async (tx) => {
    const lastChannel = await tx.channel.findFirst({
      where: { serverId: input.serverId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (lastChannel?.position ?? -1) + 1;

    return tx.channel.create({
      data: {
        id: channelId,
        serverId: input.serverId,
        name: input.name,
        topic: input.topic,
        type: input.type,
        position: nextPosition,
      },
    });
  });

  const serverAgents = await prismaClient.agent.findMany({
    where: { serverId: input.serverId, isActive: true },
    select: { id: true },
  });

  if (serverAgents.length > 0) {
    await prismaClient.channelAgent.createMany({
      data: serverAgents.map((agent) => ({
        id: generateId(),
        channelId: channel.id,
        agentId: agent.id,
      })),
    });
  }

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    topic: channel.topic,
    position: channel.position,
  };
}

export async function getServerChannel(
  prismaClient: ChannelServiceClient,
  serverId: string,
  channelId: string,
) {
  const channel = await prismaClient.channel.findFirst({
    where: { id: channelId, serverId },
  });

  if (!channel) {
    return null;
  }

  return {
    ...channel,
    lastSequence: serializeSequence(channel.lastSequence),
  };
}

export async function getChannelServerOwnership(
  prismaClient: ChannelServiceClient,
  channelId: string,
) {
  return prismaClient.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
}

export async function updateServerChannel(
  prismaClient: ChannelServiceClient,
  input: UpdateChannelInput,
) {
  const updateData: Record<string, unknown> = {};

  if (input.defaultAgentId !== undefined) {
    if (input.defaultAgentId === null) {
      updateData.defaultAgentId = null;
    } else {
      const agent = await prismaClient.agent.findUnique({
        where: { id: input.defaultAgentId },
      });
      if (!agent || agent.serverId !== input.serverId) {
        throw new Error("Agent not found in this server");
      }
      updateData.defaultAgentId = input.defaultAgentId;
    }
  }

  if (input.topic !== undefined) {
    updateData.topic = input.topic === "" ? null : input.topic;
  }

  if (input.swarmMode !== undefined) {
    updateData.swarmMode = input.swarmMode;
  }

  if (input.charterGoal !== undefined) {
    updateData.charterGoal = input.charterGoal || null;
  }

  if (input.charterRules !== undefined) {
    updateData.charterRules = input.charterRules || null;
  }

  if (input.charterAgentOrder !== undefined) {
    updateData.charterAgentOrder = input.charterAgentOrder
      ? JSON.stringify(input.charterAgentOrder)
      : null;
  }

  if (input.charterMaxTurns !== undefined) {
    updateData.charterMaxTurns = input.charterMaxTurns;
  }

  if (input.agentIds !== undefined) {
    if (input.agentIds.length > 0) {
      const validAgents = await prismaClient.agent.findMany({
        where: { id: { in: input.agentIds }, serverId: input.serverId },
        select: { id: true },
      });
      const validIds = new Set(validAgents.map((agent) => agent.id));
      const invalid = input.agentIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new Error(
          `Agents not found in this server: ${invalid.join(", ")}`,
        );
      }
    }

    await prismaClient.$transaction([
      prismaClient.channelAgent.deleteMany({
        where: { channelId: input.channelId },
      }),
      ...input.agentIds.map((agentId) =>
        prismaClient.channelAgent.create({
          data: {
            id: generateId(),
            channelId: input.channelId,
            agentId,
          },
        }),
      ),
      prismaClient.channel.update({
        where: { id: input.channelId },
        data: {
          defaultAgentId: input.agentIds.length > 0 ? input.agentIds[0] : null,
        },
      }),
    ]);
  }

  const channel = await prismaClient.channel.update({
    where: { id: input.channelId },
    data: updateData,
    include: {
      channelAgents: { select: { agentId: true } },
    },
  });

  let parsedAgentOrder: string[] | null = null;
  if (channel.charterAgentOrder) {
    try {
      parsedAgentOrder = JSON.parse(channel.charterAgentOrder);
    } catch {
      parsedAgentOrder = null;
    }
  }

  return {
    ...channel,
    lastSequence: serializeSequence(channel.lastSequence),
    agentIds: channel.channelAgents.map((entry) => entry.agentId),
    charterAgentOrder: parsedAgentOrder,
  };
}

export async function countServerChannels(
  prismaClient: ChannelServiceClient,
  serverId: string,
) {
  return prismaClient.channel.count({
    where: { serverId },
  });
}

export async function deleteServerChannel(
  prismaClient: ChannelServiceClient,
  channelId: string,
) {
  await prismaClient.channel.delete({ where: { id: channelId } });
}
