INSERT INTO "Member" (id, "userId", "serverId", "joinedAt")
SELECT 
  '01' || substring(md5(random()::text), 1, 24),
  u.id,
  '01KJGKJ6KP70ZBM0YQX1WX547S',
  NOW()
FROM "User" u
WHERE u.username = 'testuser3'
AND NOT EXISTS (
  SELECT 1 FROM "Member" m 
  WHERE m."userId" = u.id 
  AND m."serverId" = '01KJGKJ6KP70ZBM0YQX1WX547S'
);
