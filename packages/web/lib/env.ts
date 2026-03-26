import { z } from "zod";

/**
 * Server-side environment validation.
 * Fails fast at startup if required variables are missing.
 * See .env.example for all variables.
 */
const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // Auth
  NEXTAUTH_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  // Internal API
  INTERNAL_API_SECRET: z
    .string()
    .min(16, "INTERNAL_API_SECRET must be at least 16 characters"),

  // Encryption (AES-256-GCM for agent API keys — DEC-0013, DEC-0073)
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
    ),

  // Previous encryption keys for rotation fallback (DEC-0073)
  // Comma-separated 64-char hex keys. Used during key rotation so existing
  // ciphertexts can still be decrypted before re-encryption.
  ENCRYPTION_KEYS_PREV: z.string().optional(),

  // Completions timeout (DEC-0070)
  COMPLETIONS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5000)
    .max(300000)
    .default(30000)
    .optional(),

  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

/**
 * Client-side environment validation.
 * Only NEXT_PUBLIC_ variables are accessible on the client.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_GATEWAY_URL: z.string(),
});

// Validate and export server env
export const serverEnv = serverEnvSchema.parse(process.env);

// DEC-0069: NEXTAUTH_SECRET consolidated into JWT_SECRET.
// Warn if the deprecated variable is still set so operators know to clean up.
if (process.env.NEXTAUTH_SECRET) {
  console.warn(
    "[env] NEXTAUTH_SECRET is deprecated and ignored — remove it from your .env. " +
      "JWT_SECRET is now used for all services (Web + Gateway). See DEC-0069.",
  );
}

// Client env is validated lazily (only when accessed in client components)
export function getClientEnv() {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL,
  });
}
