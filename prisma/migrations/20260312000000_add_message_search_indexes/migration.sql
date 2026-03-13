-- TASK-0022: Add GIN indexes for full-text search on message content

-- GIN index for full-text search on Message.content
CREATE INDEX "Message_content_fts_idx"
  ON "Message" USING GIN (to_tsvector('english', content));

-- GIN index for full-text search on DirectMessage.content
CREATE INDEX "DirectMessage_content_fts_idx"
  ON "DirectMessage" USING GIN (to_tsvector('english', content));
