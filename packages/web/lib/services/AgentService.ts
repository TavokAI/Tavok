import type { PrismaClient } from "@prisma/client";
import { logAgentAction } from "@/lib/agent-audit";
import {
  AgentNameConflictError,
  buildConnectionInfo,
  createAgent,
  type ConnectionMethodValue,
} from "@/lib/agent-factory";

type AgentServiceClient = {
  agent: PrismaClient["agent"];
  server?: PrismaClient["server"];
};

export async function getRegisteredAgent(
  prismaClient: AgentServiceClient,
  id: string,
) {
  const agent = await prismaClient.agent.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      serverId: true,
      llmModel: true,
      isActive: true,
      triggerMode: true,
      createdAt: true,
      agentRegistration: {
        select: {
          capabilities: true,
          healthUrl: true,
          webhookUrl: true,
          maxTokensSec: true,
          lastHealthCheck: true,
          lastHealthOk: true,
          connectionMethod: true,
        },
      },
    },
  });

  if (!agent || !agent.agentRegistration) {
    return null;
  }

  return {
    agentId: agent.id,
    displayName: agent.name,
    avatarUrl: agent.avatarUrl,
    serverId: agent.serverId,
    model: agent.llmModel,
    isActive: agent.isActive,
    triggerMode: agent.triggerMode,
    capabilities: agent.agentRegistration.capabilities,
    healthUrl: agent.agentRegistration.healthUrl,
    webhookUrl: agent.agentRegistration.webhookUrl,
    maxTokensSec: agent.agentRegistration.maxTokensSec,
    lastHealthCheck: agent.agentRegistration.lastHealthCheck,
    lastHealthOk: agent.agentRegistration.lastHealthOk,
    connectionMethod: agent.agentRegistration.connectionMethod,
    createdAt: agent.createdAt,
  };
}

export async function updateRegisteredAgent(
  prismaClient: Pick<PrismaClient, "$transaction"> & {
    agent: PrismaClient["agent"];
    agentRegistration: PrismaClient["agentRegistration"];
  },
  input: {
    id: string;
    displayName?: string;
    avatarUrl?: string;
    capabilities?: string[];
    healthUrl?: string;
    webhookUrl?: string;
    maxTokensSec?: number;
  },
) {
  const agentRecord = await prismaClient.agent.findUnique({
    where: { id: input.id },
    select: { serverId: true },
  });

  logAgentAction({
    agentId: input.id,
    serverId: agentRecord?.serverId || "unknown",
    action: "agent_update",
    metadata: {
      fields: Object.entries(input)
        .filter(([key, value]) => key !== "id" && value !== undefined)
        .map(([key]) => key),
    },
  });

  await prismaClient.$transaction(async (tx) => {
    const agentUpdate: Record<string, unknown> = {};
    if (input.displayName !== undefined) agentUpdate.name = input.displayName;
    if (input.avatarUrl !== undefined) agentUpdate.avatarUrl = input.avatarUrl;

    if (Object.keys(agentUpdate).length > 0) {
      await tx.agent.update({ where: { id: input.id }, data: agentUpdate });
    }

    const registrationUpdate: Record<string, unknown> = {};
    if (input.capabilities !== undefined) {
      registrationUpdate.capabilities = input.capabilities;
    }
    if (input.healthUrl !== undefined) {
      registrationUpdate.healthUrl = input.healthUrl;
    }
    if (input.webhookUrl !== undefined) {
      registrationUpdate.webhookUrl = input.webhookUrl;
    }
    if (input.maxTokensSec !== undefined) {
      registrationUpdate.maxTokensSec = input.maxTokensSec;
    }

    if (Object.keys(registrationUpdate).length > 0) {
      await tx.agentRegistration.update({
        where: { agentId: input.id },
        data: registrationUpdate,
      });
    }
  });
}

export async function deleteRegisteredAgent(
  prismaClient: AgentServiceClient,
  id: string,
) {
  const agentRecord = await prismaClient.agent.findUnique({
    where: { id },
    select: { serverId: true },
  });

  logAgentAction({
    agentId: id,
    serverId: agentRecord?.serverId || "unknown",
    action: "agent_deregister",
  });

  await prismaClient.agent.delete({ where: { id } });
}

export async function ensureServerExists(
  prismaClient: { server: PrismaClient["server"] },
  serverId: string,
) {
  return prismaClient.server.findUnique({
    where: { id: serverId },
    select: { id: true },
  });
}

export async function bootstrapCreateAgent(input: {
  name: string;
  serverId: string;
  connectionMethod: ConnectionMethodValue;
  webhookUrl?: string;
  channelIds?: string[];
}) {
  const result = await createAgent({
    name: input.name,
    serverId: input.serverId,
    connectionMethod: input.connectionMethod,
    webhookUrl: input.webhookUrl,
    channelIds: input.channelIds,
  });

  const connectionInfo = buildConnectionInfo(
    result.agent.id,
    result.connectionMethod,
    {
      webhookUrl: input.webhookUrl,
      webhookSecret: result.webhookSecret,
    },
  );

  return {
    id: result.agent.id,
    name: result.agent.name,
    apiKey: result.apiKey,
    serverId: input.serverId,
    connectionMethod: result.connectionMethod,
    ...connectionInfo,
  };
}

export { AgentNameConflictError };
