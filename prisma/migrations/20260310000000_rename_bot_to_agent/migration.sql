-- Rename Bot → Agent across all tables (DEC-0062)
-- Manual migration: Prisma cannot auto-generate renames (it drops + creates).

-- 1. Rename AuthorType enum value: BOT → AGENT
ALTER TYPE "AuthorType" RENAME VALUE 'BOT' TO 'AGENT';

-- 2. Rename Bot table → Agent
ALTER TABLE "Bot" RENAME TO "Agent";

-- 3. Rename ChannelBot table → ChannelAgent
ALTER TABLE "ChannelBot" RENAME TO "ChannelAgent";

-- 4. Rename columns: botId → agentId
ALTER TABLE "ChannelAgent" RENAME COLUMN "botId" TO "agentId";
ALTER TABLE "AgentRegistration" RENAME COLUMN "botId" TO "agentId";
ALTER TABLE "AgentMessage" RENAME COLUMN "botId" TO "agentId";
ALTER TABLE "InboundWebhook" RENAME COLUMN "botId" TO "agentId";

-- 5. Rename Channel.defaultBotId → defaultAgentId
ALTER TABLE "Channel" RENAME COLUMN "defaultBotId" TO "defaultAgentId";

-- 6. Rename indexes (Prisma expects names matching new schema)
-- ChannelAgent unique index
ALTER INDEX "ChannelBot_channelId_botId_key" RENAME TO "ChannelAgent_channelId_agentId_key";

-- AgentRegistration unique index on agentId (was botId)
ALTER INDEX "AgentRegistration_botId_key" RENAME TO "AgentRegistration_agentId_key";

-- AgentMessage indexes
ALTER INDEX "AgentMessage_botId_delivered_createdAt_idx" RENAME TO "AgentMessage_agentId_delivered_createdAt_idx";
ALTER INDEX "AgentMessage_botId_channelId_idx" RENAME TO "AgentMessage_agentId_channelId_idx";

-- 7. Rename foreign key constraints
ALTER TABLE "ChannelAgent" RENAME CONSTRAINT "ChannelBot_botId_fkey" TO "ChannelAgent_agentId_fkey";
ALTER TABLE "ChannelAgent" RENAME CONSTRAINT "ChannelBot_channelId_fkey" TO "ChannelAgent_channelId_fkey";
ALTER TABLE "Channel" RENAME CONSTRAINT "Channel_defaultBotId_fkey" TO "Channel_defaultAgentId_fkey";
ALTER TABLE "Agent" RENAME CONSTRAINT "Bot_serverId_fkey" TO "Agent_serverId_fkey";
ALTER TABLE "AgentRegistration" RENAME CONSTRAINT "AgentRegistration_botId_fkey" TO "AgentRegistration_agentId_fkey";
ALTER TABLE "InboundWebhook" RENAME CONSTRAINT "InboundWebhook_botId_fkey" TO "InboundWebhook_agentId_fkey";
