import type { PrismaClient } from "@prisma/client";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { generateId } from "@/lib/ulid";

type ServerServiceClient = Pick<PrismaClient, "$transaction"> & {
  member: PrismaClient["member"];
  server: PrismaClient["server"];
  channel: PrismaClient["channel"];
  role: PrismaClient["role"];
};

export interface CreateServerInput {
  userId: string;
  name: string;
  iconUrl: string | null;
  defaultChannelName: string;
  defaultChannelTopic: string | null;
}

export function normalizeDefaultChannelName(value: unknown): string {
  const raw = typeof value === "string" ? value : "general";
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 100) || "general"
  );
}

export async function listServersForUser(
  prismaClient: ServerServiceClient,
  userId: string,
) {
  const memberships = await prismaClient.member.findMany({
    where: { userId },
    include: {
      server: {
        include: {
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((membership) => ({
    id: membership.server.id,
    name: membership.server.name,
    iconUrl: membership.server.iconUrl,
    ownerId: membership.server.ownerId,
    memberCount: membership.server._count.members,
    joinedAt: membership.joinedAt.toISOString(),
  }));
}

export async function createServerWithDefaultChannel(
  prismaClient: ServerServiceClient,
  input: CreateServerInput,
) {
  const serverId = generateId();
  const channelId = generateId();
  const memberId = generateId();
  const everyoneRoleId = generateId();

  const [server] = await prismaClient.$transaction([
    prismaClient.server.create({
      data: {
        id: serverId,
        name: input.name,
        iconUrl: input.iconUrl,
        ownerId: input.userId,
      },
    }),
    prismaClient.channel.create({
      data: {
        id: channelId,
        serverId,
        name: input.defaultChannelName,
        topic: input.defaultChannelTopic,
        type: "TEXT",
        position: 0,
      },
    }),
    prismaClient.member.create({
      data: {
        id: memberId,
        userId: input.userId,
        serverId,
      },
    }),
    prismaClient.role.create({
      data: {
        id: everyoneRoleId,
        serverId,
        name: "@everyone",
        permissions: DEFAULT_PERMISSIONS,
        position: 0,
      },
    }),
  ]);

  await prismaClient.member.update({
    where: { id: memberId },
    data: {
      roles: { connect: { id: everyoneRoleId } },
    },
  });

  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    defaultChannelId: channelId,
  };
}

export async function getServerMembership(
  prismaClient: ServerServiceClient,
  userId: string,
  serverId: string,
) {
  return prismaClient.member.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId,
      },
    },
  });
}

export async function getServerDetail(
  prismaClient: ServerServiceClient,
  serverId: string,
) {
  const server = await prismaClient.server.findUnique({
    where: { id: serverId },
    include: {
      channels: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          topic: true,
          position: true,
          defaultAgentId: true,
          channelAgents: { select: { agentId: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });

  if (!server) {
    return null;
  }

  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    channels: server.channels.map((channel) => ({
      ...channel,
      agentIds: channel.channelAgents.map((entry) => entry.agentId),
      channelAgents: undefined,
    })),
    memberCount: server._count.members,
  };
}

export async function getServerOwner(
  prismaClient: ServerServiceClient,
  serverId: string,
) {
  return prismaClient.server.findUnique({
    where: { id: serverId },
    select: { id: true, ownerId: true },
  });
}

export async function updateServerById(
  prismaClient: ServerServiceClient,
  serverId: string,
  updateData: Record<string, unknown>,
) {
  const server = await prismaClient.server.update({
    where: { id: serverId },
    data: updateData,
  });

  return {
    id: server.id,
    name: server.name,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
  };
}

export async function deleteServerById(
  prismaClient: ServerServiceClient,
  serverId: string,
) {
  await prismaClient.server.delete({
    where: { id: serverId },
  });
}
