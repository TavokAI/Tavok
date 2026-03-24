-- Performance indexes identified in code review audit (P2, P3)

-- P2: Agent API key auth filters by isActive
CREATE INDEX "Agent_isActive_idx" ON "Agent"("isActive");

-- P3: StreamWatchdog and internal APIs query by streamingStatus
CREATE INDEX "Message_streamingStatus_idx" ON "Message"("streamingStatus");
