import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectInstallTarget } from "./install-target";
import {
  computeFileHash,
  getBinaryDownloadUrl,
  getCacheBinaryPath,
  getChecksumsUrl,
  getReleaseBaseUrl,
  parseChecksums,
  verifyChecksum,
} from "./runner";

describe("runner helpers", () => {
  it("builds the default GitHub release URL from the package version", () => {
    expect(getReleaseBaseUrl("0.1.0")).toBe(
      "https://github.com/TavokAI/Tavok/releases/download/v0.1.0",
    );
  });

  it("allows overriding the release base URL", () => {
    expect(
      getReleaseBaseUrl("0.1.0", {
        TAVOK_RELEASE_BASE_URL: "https://downloads.example.com/tavok",
      }),
    ).toBe("https://downloads.example.com/tavok");
  });

  it("builds the binary download URL for the current target", () => {
    const target = detectInstallTarget("darwin", "arm64");

    expect(getBinaryDownloadUrl("0.1.0", target)).toBe(
      "https://github.com/TavokAI/Tavok/releases/download/v0.1.0/tavok-darwin-arm64",
    );
  });

  it("uses a versioned cache path", () => {
    const target = detectInstallTarget("win32", "x64");

    expect(getCacheBinaryPath("C:\\cache", "0.1.0", target)).toBe(
      path.join("C:\\cache", "0.1.0", "tavok.exe"),
    );
  });
});

describe("checksum verification", () => {
  it("builds the checksums.txt URL from the release base", () => {
    expect(getChecksumsUrl("0.1.0")).toBe(
      "https://github.com/TavokAI/Tavok/releases/download/v0.1.0/checksums.txt",
    );
  });

  it("allows overriding the checksums URL via env", () => {
    expect(
      getChecksumsUrl("0.1.0", {
        TAVOK_RELEASE_BASE_URL: "https://custom.example.com/v0.1.0",
      }),
    ).toBe("https://custom.example.com/v0.1.0/checksums.txt");
  });

  it("parses BSD-style checksums.txt with two-space separator", () => {
    // Each hash must be exactly 64 hex characters (SHA256)
    const hashA = "a".repeat(64);
    const hashB = "b".repeat(64);
    const content = [
      `${hashA}  tavok-darwin-arm64`,
      `${hashB}  tavok-linux-amd64`,
      "",
      "# comment line",
    ].join("\n");

    const checksums = parseChecksums(content);

    expect(checksums.size).toBe(2);
    expect(checksums.get("tavok-darwin-arm64")).toBe(hashA);
    expect(checksums.get("tavok-linux-amd64")).toBe(hashB);
  });

  it("ignores malformed lines in checksums.txt", () => {
    const validHash = "c".repeat(64);
    const content = [
      "not-a-valid-line",
      "short  tavok-darwin-arm64",
      `${validHash}  tavok-linux-amd64`,
    ].join("\n");

    const checksums = parseChecksums(content);

    expect(checksums.size).toBe(1);
    expect(checksums.get("tavok-linux-amd64")).toBe(validHash);
  });

  it("computes SHA256 hash of a file", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tavok-test-"));
    const tmpFile = path.join(tmpDir, "test.bin");

    try {
      writeFileSync(tmpFile, "hello world");
      const hash = await computeFileHash(tmpFile);
      // SHA256 of "hello world"
      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifyChecksum passes when hash matches", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tavok-test-"));
    const tmpFile = path.join(tmpDir, "test.bin");

    try {
      writeFileSync(tmpFile, "hello world");
      // Should not throw
      await verifyChecksum(
        tmpFile,
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifyChecksum throws on mismatch", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tavok-test-"));
    const tmpFile = path.join(tmpDir, "test.bin");

    try {
      writeFileSync(tmpFile, "hello world");
      await expect(
        verifyChecksum(
          tmpFile,
          "0000000000000000000000000000000000000000000000000000000000000000",
        ),
      ).rejects.toThrow("Checksum mismatch");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
