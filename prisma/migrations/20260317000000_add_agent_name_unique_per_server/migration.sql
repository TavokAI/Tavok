-- Prevent duplicate agent names within a server.
-- Deletes older duplicates first so the constraint can be applied cleanly.

DELETE FROM "Agent"
WHERE id IN (
  SELECT unnest((array_agg(id ORDER BY "createdAt"))[1:array_length(array_agg(id), 1) - 1])
  FROM "Agent"
  GROUP BY "serverId", name
  HAVING COUNT(*) > 1
);

CREATE UNIQUE INDEX "Agent_serverId_name_key" ON "Agent"("serverId", "name");
