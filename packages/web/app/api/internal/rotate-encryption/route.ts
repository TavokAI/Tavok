import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateInternalSecret,
  unauthorizedResponse,
} from "@/lib/internal-auth";
import { encrypt, decrypt, needsReEncryption } from "@/lib/encryption";

/**
 * POST /api/internal/rotate-encryption
 *
 * Re-encrypts all BYOK agent API keys with the current ENCRYPTION_KEY.
 * Use after rotating the encryption key:
 *   1. Move old ENCRYPTION_KEY to ENCRYPTION_KEYS_PREV
 *   2. Set new ENCRYPTION_KEY
 *   3. Restart services
 *   4. Call this endpoint
 *   5. Remove ENCRYPTION_KEYS_PREV
 *
 * Requires x-internal-secret header.
 * See docs/RUNBOOKS.md for full rotation procedure.
 */
export async function POST(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return unauthorizedResponse();
  }

  // Find all agents with encrypted API keys
  const agents = await prisma.agent.findMany({
    where: {
      apiKeyEncrypted: { not: "" },
    },
    select: {
      id: true,
      name: true,
      apiKeyEncrypted: true,
    },
  });

  let reEncrypted = 0;
  let alreadyCurrent = 0;
  let failed = 0;
  const errors: Array<{ agentId: string; agentName: string; error: string }> =
    [];

  for (const agent of agents) {
    if (!agent.apiKeyEncrypted) continue;

    // Skip if already using current format and key
    if (!needsReEncryption(agent.apiKeyEncrypted)) {
      // Still try decrypt to verify the key works
      try {
        decrypt(agent.apiKeyEncrypted);
        alreadyCurrent++;
        continue;
      } catch {
        // Current format but can't decrypt — fall through to re-encrypt attempt
      }
    }

    try {
      // Decrypt with fallback key chain
      const plaintext = decrypt(agent.apiKeyEncrypted);

      // Re-encrypt with current key (produces v1 format)
      const newCiphertext = encrypt(plaintext);

      await prisma.agent.update({
        where: { id: agent.id },
        data: { apiKeyEncrypted: newCiphertext },
      });

      reEncrypted++;
    } catch (err) {
      failed++;
      errors.push({
        agentId: agent.id,
        agentName: agent.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    total: agents.length,
    reEncrypted,
    alreadyCurrent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
