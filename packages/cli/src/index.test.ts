import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

import { describe, expect, it } from "vitest";

const CLI_ENTRY = path.resolve(__dirname, "../bin/tavok.js");
const DIST_ENTRY = path.resolve(__dirname, "../dist/index.js");

function runNodeScript(
  scriptPath: string,
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [scriptPath, ...args], {
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
  it("exports runCli from the built dist entry", async () => {
    const cli = await import(pathToFileURL(DIST_ENTRY).href);

    expect(typeof cli.runCli).toBe("function");
  });

  it("invokes runCli from the wrapper and forwards argv", () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "tavok-cli-wrapper-"));
    const fixtureBinDir = path.join(tmpDir, "bin");
    const fixtureDistDir = path.join(tmpDir, "dist");
    const fixtureEntry = path.join(fixtureBinDir, "tavok.js");

    try {
      mkdirSync(fixtureBinDir, { recursive: true });
      mkdirSync(fixtureDistDir, { recursive: true });
      writeFileSync(fixtureEntry, readFileSync(CLI_ENTRY, "utf8"), "utf8");
      writeFileSync(
        path.join(fixtureDistDir, "index.js"),
        [
          "exports.runCli = async function runCli() {",
          "  process.stdout.write(JSON.stringify(process.argv.slice(2)));",
          "};",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = runNodeScript(fixtureEntry, ["help", "--json"], tmpDir);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe('["help","--json"]');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
