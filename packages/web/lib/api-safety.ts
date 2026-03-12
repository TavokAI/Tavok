export function canMutateServerScopedResource(
  routeServerId: string,
  targetServerId: string,
): boolean {
  return routeServerId === targetServerId;
}

export function isJsonObjectBody(
  value: unknown,
): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function getRedisHealthStatus(
  redisUrl: string | undefined,
  probeRedisHealth: (url: string) => Promise<boolean>,
): Promise<"ok" | "unhealthy"> {
  if (!redisUrl) {
    return "unhealthy";
  }

  try {
    const redisHealthy = await probeRedisHealth(redisUrl);
    return redisHealthy ? "ok" : "unhealthy";
  } catch {
    return "unhealthy";
  }
}

export function serializeSequence(sequence: bigint): string {
  return sequence.toString();
}

export function parseNonNegativeSequence(
  sequence: string | number | bigint,
): bigint | null {
  if (
    typeof sequence !== "string" &&
    typeof sequence !== "number" &&
    typeof sequence !== "bigint"
  ) {
    return null;
  }

  if (typeof sequence === "string" && sequence.trim() === "") {
    return null;
  }

  try {
    const parsed = BigInt(
      typeof sequence === "string" ? sequence.trim() : sequence,
    );
    return parsed >= BigInt(0) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Compare two sequence strings as BigInts.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSequences(a: string, b: string): number {
  const aBigInt = BigInt(a);
  const bBigInt = BigInt(b);
  if (aBigInt === bBigInt) return 0;
  return aBigInt > bBigInt ? 1 : -1;
}

export function buildMonotonicLastSequenceUpdate(
  channelId: string,
  sequenceBigInt: bigint,
) {
  return {
    where: {
      id: channelId,
      lastSequence: { lt: sequenceBigInt },
    },
    data: { lastSequence: sequenceBigInt },
  };
}
