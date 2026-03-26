import { prisma } from "@/lib/db";
import { computeMemberPermissions, hasPermission } from "@/lib/permissions";

interface PermissionCheckResult {
  allowed: boolean;
  memberId?: string;
  effectivePermissions?: bigint;
}

// L42: Short-lived cache for member lookups — avoids repeated DB queries for the
// same user+server within a short window (e.g. multiple API calls on page load).
// TTL is 5 seconds — long enough to deduplicate concurrent requests, short enough
// that permission changes propagate quickly.
const CACHE_TTL_MS = 5_000;
const memberCache = new Map<
  string,
  {
    memberId: string;
    effectivePermissions: bigint;
    expiresAt: number;
  }
>();

function getCachedMember(userId: string, serverId: string) {
  const key = `${userId}:${serverId}`;
  const entry = memberCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry;
  }
  if (entry) {
    memberCache.delete(key);
  }
  return null;
}

/** Clear the permission cache (for testing). */
export function clearPermissionCache() {
  memberCache.clear();
}

function setCachedMember(
  userId: string,
  serverId: string,
  memberId: string,
  effectivePermissions: bigint,
) {
  const key = `${userId}:${serverId}`;
  memberCache.set(key, {
    memberId,
    effectivePermissions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  // Evict stale entries periodically to prevent unbounded growth
  if (memberCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of memberCache) {
      if (v.expiresAt <= now) memberCache.delete(k);
    }
  }
}

/**
 * Check if a user has a specific permission in a server.
 *
 * Returns { allowed: true, memberId, effectivePermissions } on success,
 * or { allowed: false } if not a member or missing permission.
 *
 * L42: Uses a 5s in-memory cache to deduplicate identical lookups.
 */
export async function checkMemberPermission(
  userId: string,
  serverId: string,
  requiredPermission: bigint,
): Promise<PermissionCheckResult> {
  // Check cache first
  const cached = getCachedMember(userId, serverId);
  if (cached) {
    if (!hasPermission(cached.effectivePermissions, requiredPermission)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      memberId: cached.memberId,
      effectivePermissions: cached.effectivePermissions,
    };
  }

  const member = await prisma.member.findUnique({
    where: {
      userId_serverId: { userId, serverId },
    },
    include: {
      roles: { select: { permissions: true } },
      server: { select: { ownerId: true } },
    },
  });

  if (!member) {
    return { allowed: false };
  }

  const effectivePermissions = computeMemberPermissions(
    userId,
    member.server.ownerId,
    member.roles,
  );

  // Cache the result for subsequent calls
  setCachedMember(userId, serverId, member.id, effectivePermissions);

  if (!hasPermission(effectivePermissions, requiredPermission)) {
    return { allowed: false };
  }

  return {
    allowed: true,
    memberId: member.id,
    effectivePermissions,
  };
}

/**
 * Check if a user is a member of a server (no permission check).
 * Use for read-only routes that just need membership verification.
 */
export async function checkMembership(
  userId: string,
  serverId: string,
): Promise<{ isMember: boolean; memberId?: string }> {
  const member = await prisma.member.findUnique({
    where: {
      userId_serverId: { userId, serverId },
    },
    select: { id: true },
  });

  return {
    isMember: !!member,
    memberId: member?.id,
  };
}
