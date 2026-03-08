import { existsSync } from "node:fs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * Tests for the checkout detection pre-flight in index.ts.
 * We invoke the built CLI entry point as a subprocess to test the
 * actual exit behavior (exit code + stderr output).
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

describe("tavok init checkout detection", () => {
  it("fails with clear error when docker-compose.yml is missing", () => {
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runCli(["init", "--domain", "localhost"], tmpDir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "docker-compose.yml not found in the current directory",
      );
      expect(result.stderr).toContain("git clone");
      expect(result.stderr).toContain("cd Tavok");
      expect(result.stderr).toContain("./scripts/setup.sh --domain localhost");
      expect(result.stderr).toContain("docker compose up -d");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes the user-specified domain in the error guidance", () => {
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const result = runCli(
        ["init", "--domain", "chat.example.com"],
        tmpDir,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "./scripts/setup.sh --domain chat.example.com",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not show checkout error when docker-compose.yml exists", () => {
    const tmpDir = path.join(os.tmpdir(), `tavok-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "docker-compose.yml"), "services: {}");

    try {
      const result = runCli(["init", "--domain", "localhost"], tmpDir);

      // It will fail for another reason (no Go binary downloaded),
      // but NOT because of the checkout detection
      expect(result.stderr).not.toContain(
        "docker-compose.yml not found",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
