import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * Tests for the npm wrapper CLI entry point (index.ts).
 * We invoke the built CLI as a subprocess to test actual exit behavior.
 */
const CLI_ENTRY = path.resolve(__dirname, "../bin/tavok.js");

function runCli(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_ENTRY, ...args], {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      status: number;
      stdout: string;
      stderr: string;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

describe("tavok CLI npm wrapper", () => {
  it("exits non-zero when the Go binary is unavailable", () => {
    // The npm wrapper downloads a platform-specific Go binary from
    // GitHub Releases. In test/CI the binary won't exist, so we
    // expect a clean failure with a download error.
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runCli(["init", "--domain", "localhost"], tmpDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("tavok:");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("no longer requires docker-compose.yml in the working directory", () => {
    // The Go binary now embeds docker-compose.yml via go:embed,
    // so the npm wrapper should NOT check for it.
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runCli(["init", "--domain", "localhost"], tmpDir);

      // Will fail (no Go binary), but NOT because of docker-compose.yml
      expect(result.stderr).not.toContain("docker-compose.yml not found");
      expect(result.stderr).not.toContain("git clone");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not fail on checkout detection when docker-compose.yml exists", () => {
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "docker-compose.yml"), "services: {}");

    try {
      const result = runCli(["init", "--domain", "localhost"], tmpDir);

      // Will fail for another reason (no Go binary), but NOT
      // because of any checkout detection
      expect(result.stderr).not.toContain("docker-compose.yml not found");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
