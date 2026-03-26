/**
 * AES-256-GCM encryption for agent API keys.
 *
 * Ciphertext format (v1): v1:iv:authTag:encrypted (all hex-encoded)
 * Legacy format:          iv:authTag:encrypted (no version prefix)
 *
 * Key: ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
 * Previous keys: ENCRYPTION_KEYS_PREV (comma-separated 64-char hex keys)
 *
 * See docs/DECISIONS.md DEC-0013 (original), DEC-0073 (key versioning).
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is standard for GCM
const CURRENT_VERSION = "v1";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set to 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Returns the current key + any previous keys for fallback decryption.
 * Previous keys come from ENCRYPTION_KEYS_PREV (comma-separated hex strings).
 */
function getAllKeys(): Buffer[] {
  const keys: Buffer[] = [getKey()];
  const prev = process.env.ENCRYPTION_KEYS_PREV;
  if (prev) {
    for (const hex of prev.split(",")) {
      const trimmed = hex.trim();
      if (trimmed.length === 64) {
        keys.push(Buffer.from(trimmed, "hex"));
      }
    }
  }
  return keys;
}

/**
 * Encrypt a plaintext string with the current key.
 * Returns: "v1:iv:authTag:ciphertext" (versioned, hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${CURRENT_VERSION}:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Try to decrypt with a specific key. Returns null on failure instead of throwing.
 */
function tryDecryptWithKey(
  key: Buffer,
  ivHex: string,
  authTagHex: string,
  encryptedHex: string,
): string | null {
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Decrypt a ciphertext string.
 * Supports both versioned format ("v1:iv:authTag:data") and legacy ("iv:authTag:data").
 * Tries current key first, then falls back to previous keys.
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");

  let ivHex: string;
  let authTagHex: string;
  let encryptedHex: string;

  if (parts.length === 4 && parts[0] === CURRENT_VERSION) {
    // Versioned format: v1:iv:authTag:data
    [, ivHex, authTagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    // Legacy format: iv:authTag:data
    [ivHex, authTagHex, encryptedHex] = parts;
  } else {
    throw new Error(
      "Invalid ciphertext format — expected v1:iv:authTag:data or iv:authTag:data",
    );
  }

  // Try all available keys (current first, then previous)
  const keys = getAllKeys();
  for (const key of keys) {
    const result = tryDecryptWithKey(key, ivHex, authTagHex, encryptedHex);
    if (result !== null) return result;
  }

  throw new Error(
    "Decryption failed with all available keys — the encryption key may have been rotated without ENCRYPTION_KEYS_PREV",
  );
}

/**
 * Returns true if the ciphertext uses legacy format or an old version
 * and should be re-encrypted with the current key.
 */
export function needsReEncryption(ciphertext: string): boolean {
  const parts = ciphertext.split(":");
  // Legacy format (3 parts) needs re-encryption
  if (parts.length === 3) return true;
  // Future: if version !== CURRENT_VERSION, needs re-encryption
  if (parts.length === 4 && parts[0] !== CURRENT_VERSION) return true;
  return false;
}
