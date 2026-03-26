import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, needsReEncryption } from "../encryption";
import crypto from "crypto";

// Generate valid 32-byte keys as 64 hex chars
const TEST_KEY = crypto.randomBytes(32).toString("hex");
const ALT_KEY = crypto.randomBytes(32).toString("hex");
const OLD_KEY = crypto.randomBytes(32).toString("hex");

describe("encryption", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    delete process.env.ENCRYPTION_KEYS_PREV;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEYS_PREV;
  });

  it("encrypts and decrypts a plaintext string round-trip", () => {
    const plaintext = "sk-test-api-key-12345";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("ciphertext format is v1:iv:authTag:data (four colon-separated parts)", () => {
    const ciphertext = encrypt("hello");
    const parts = ciphertext.split(":");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("v1");
    // IV, authTag, data should be valid hex
    for (const part of parts.slice(1)) {
      expect(/^[0-9a-f]+$/.test(part)).toBe(true);
    }
    // IV should be 12 bytes = 24 hex chars
    expect(parts[1].length).toBe(24);
    // Auth tag should be 16 bytes = 32 hex chars
    expect(parts[2].length).toBe(32);
  });

  it("produces unique ciphertexts for same plaintext (random IV)", () => {
    const plaintext = "same-input-different-output";
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);

    // Both should decrypt to the same plaintext
    expect(decrypt(c1)).toBe(plaintext);
    expect(decrypt(c2)).toBe(plaintext);
  });

  it("different keys produce different ciphertext that cannot cross-decrypt", () => {
    const plaintext = "cross-key-test";
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const c1 = encrypt(plaintext);

    process.env.ENCRYPTION_KEY = ALT_KEY;
    const c2 = encrypt(plaintext);

    expect(c1).not.toBe(c2);

    // Decrypting c1 with ALT_KEY should throw (no fallback keys)
    expect(() => decrypt(c1)).toThrow();
  });

  it("tampered ciphertext throws on decrypt", () => {
    const ciphertext = encrypt("sensitive-data");
    const parts = ciphertext.split(":");
    // XOR the first byte of encrypted data to guarantee change
    const firstByte = parseInt(parts[3].slice(0, 2), 16);
    const flipped = (firstByte ^ 0x01).toString(16).padStart(2, "0");
    const tampered =
      parts[0] + ":" + parts[1] + ":" + parts[2] + ":" + flipped + parts[3].slice(2);
    expect(tampered).not.toBe(ciphertext);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("tampered auth tag throws on decrypt", () => {
    const ciphertext = encrypt("auth-tag-test");
    const parts = ciphertext.split(":");
    // XOR the first byte of auth tag
    const firstByte = parseInt(parts[2].slice(0, 2), 16);
    const flipped = (firstByte ^ 0x01).toString(16).padStart(2, "0");
    const tampered =
      parts[0] + ":" + parts[1] + ":" + flipped + parts[2].slice(2) + ":" + parts[3];
    expect(tampered).not.toBe(ciphertext);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("handles empty string", () => {
    const ciphertext = encrypt("");
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe("");
  });

  it("handles long payload", () => {
    const long = "a".repeat(10000);
    const ciphertext = encrypt(long);
    expect(decrypt(ciphertext)).toBe(long);
  });

  it("handles UTF-8 characters", () => {
    const unicode = "日本語テスト 🔑 Ñoño";
    const ciphertext = encrypt(unicode);
    expect(decrypt(ciphertext)).toBe(unicode);
  });

  it("throws if ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY must be set");
  });

  it("throws if ENCRYPTION_KEY is wrong length", () => {
    process.env.ENCRYPTION_KEY = "abcd"; // too short
    expect(() => encrypt("test")).toThrow("64 hex characters");
  });

  it("throws on invalid ciphertext format (wrong number of parts)", () => {
    expect(() => decrypt("invalid")).toThrow("Invalid ciphertext format");
    expect(() => decrypt("a:b")).toThrow("Invalid ciphertext format");
    expect(() => decrypt("a:b:c:d:e")).toThrow("Invalid ciphertext format");
  });

  // --- Legacy format support ---

  it("decrypts legacy format (3-part, no version prefix)", () => {
    // Manually construct legacy format: iv:authTag:encrypted
    const key = Buffer.from(TEST_KEY, "hex");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update("legacy-data", "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const legacy = `${iv.toString("hex")}:${authTag}:${encrypted}`;

    // Should have 3 parts (legacy format)
    expect(legacy.split(":").length).toBe(3);
    expect(decrypt(legacy)).toBe("legacy-data");
  });

  // --- Key rotation with fallback ---

  it("decrypts with previous key via ENCRYPTION_KEYS_PREV", () => {
    // Encrypt with OLD_KEY
    process.env.ENCRYPTION_KEY = OLD_KEY;
    const ciphertext = encrypt("rotated-secret");

    // Switch to new key, set old key as fallback
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.ENCRYPTION_KEYS_PREV = OLD_KEY;

    // Should decrypt via fallback
    expect(decrypt(ciphertext)).toBe("rotated-secret");
  });

  it("decrypts legacy format with previous key", () => {
    // Manually construct legacy format with OLD_KEY
    const key = Buffer.from(OLD_KEY, "hex");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update("old-legacy", "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const legacy = `${iv.toString("hex")}:${authTag}:${encrypted}`;

    // Current key is different, old key in fallback
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.ENCRYPTION_KEYS_PREV = OLD_KEY;

    expect(decrypt(legacy)).toBe("old-legacy");
  });

  it("supports multiple previous keys (comma-separated)", () => {
    // Encrypt with ALT_KEY
    process.env.ENCRYPTION_KEY = ALT_KEY;
    const ciphertext = encrypt("multi-key-test");

    // Switch to new key, ALT_KEY is second in fallback list
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.ENCRYPTION_KEYS_PREV = `${OLD_KEY},${ALT_KEY}`;

    expect(decrypt(ciphertext)).toBe("multi-key-test");
  });

  it("throws when no key can decrypt", () => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
    const ciphertext = encrypt("orphaned");

    // Switch to completely different keys
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.ENCRYPTION_KEYS_PREV = ALT_KEY;

    expect(() => decrypt(ciphertext)).toThrow("all available keys");
  });

  // --- needsReEncryption ---

  it("needsReEncryption returns false for current v1 format", () => {
    const ciphertext = encrypt("current");
    expect(needsReEncryption(ciphertext)).toBe(false);
  });

  it("needsReEncryption returns true for legacy 3-part format", () => {
    // Construct legacy format
    const key = Buffer.from(TEST_KEY, "hex");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update("legacy", "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const legacy = `${iv.toString("hex")}:${authTag}:${encrypted}`;

    expect(needsReEncryption(legacy)).toBe(true);
  });
});
