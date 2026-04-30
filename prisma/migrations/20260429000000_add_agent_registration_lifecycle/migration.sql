ALTER TABLE "AgentRegistration"
ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "AgentRegistration_expiresAt_idx" ON "AgentRegistration"("expiresAt");
CREATE INDEX "AgentRegistration_revokedAt_idx" ON "AgentRegistration"("revokedAt");

CREATE TABLE "AgentAuditLog" (
  "id" VARCHAR(26) NOT NULL,
  "agentId" VARCHAR(26) NOT NULL,
  "serverId" VARCHAR(26) NOT NULL,
  "action" TEXT NOT NULL,
  "channelId" VARCHAR(26),
  "messageId" VARCHAR(26),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentAuditLog"
ADD CONSTRAINT "AgentAuditLog_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AgentAuditLog_serverId_createdAt_idx" ON "AgentAuditLog"("serverId", "createdAt");
CREATE INDEX "AgentAuditLog_agentId_createdAt_idx" ON "AgentAuditLog"("agentId", "createdAt");
CREATE INDEX "AgentAuditLog_action_createdAt_idx" ON "AgentAuditLog"("action", "createdAt");
