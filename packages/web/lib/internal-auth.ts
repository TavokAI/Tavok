/**
 * Internal API authentication — timing-safe secret validation.
 *
 * All internal API routes (Gateway → Web, Go Proxy → Web) must use this
 * instead of simple === comparison to prevent timing side-channel attacks.
 * (ISSUE-010)
 *
 * See docs/PROTOCOL.md §3 for internal API auth contract.
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the x-internal-secret header using constant-time comparison.
 * Returns true if the secret matches, false otherwise.
 *
 * Fails closed: returns false if INTERNAL_API_SECRET env var is missing or empty.
 */
export function validateInternalSecret(request: NextRequest): boolean {
  return validateInternalSecretValue(
    request.headers.get("x-internal-secret"),
  );
}

/**
 * Validates a raw secret value using constant-time comparison.
 * Use this when you have the header value already extracted (e.g., in handler factories).
 */
export function validateInternalSecretValue(provided: string | null): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    console.error(
      "[internal-auth] INTERNAL_API_SECRET is not set — rejecting all internal API requests",
    );
    return false;
  }
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Returns a 401 Unauthorized response for failed internal auth.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Returns the internal base URL for self-calls (Web → Web internal API).
 * Reads from NEXTAUTH_URL env var with localhost fallback.
 */
export function getInternalBaseUrl(): string {
  return process.env.NEXTAUTH_URL || "http://localhost:5555";
}
