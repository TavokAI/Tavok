import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { detectInstallTarget } from "./install-target";
import { ensureBinary, runBinary } from "./runner";

function checkDocker(): void {
  let dockerOK = true;

  try {
    execSync("docker --version", { stdio: "ignore" });
  } catch {
    dockerOK = false;
    console.error("⚠ Docker not found.");
    if (process.platform === "darwin") {
      console.error("  Install: brew install --cask docker");
      console.error(
        "      or: https://docs.docker.com/desktop/install/mac-install/",
      );
    } else if (process.platform === "win32") {
      console.error(
        "  Install: https://docs.docker.com/desktop/install/windows-install/",
      );
    } else {
      console.error("  Install: https://docs.docker.com/engine/install/");
    }
    console.error("");
  }

  if (dockerOK) {
    try {
      execSync("docker compose version", { stdio: "ignore" });
    } catch {
      console.error("⚠ docker compose (v2) not found.");
      console.error(
        "  Docker Compose v2 ships with Docker Desktop and recent Docker Engine.",
      );
      console.error("  See: https://docs.docker.com/compose/install/");
      console.error("");
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Pre-flight: if running "init", check Docker availability
  if (args[0] === "init") {
    checkDocker();
    // Note: docker-compose.yml check removed — the Go binary now embeds it
    // and writes it to the current directory during init.
  }

  const packageVersion = readPackageVersion();
  const target = detectInstallTarget(process.platform, process.arch);
  const binaryPath = await ensureBinary(packageVersion, target);
  const exitCode = await runBinary(binaryPath, args);
  process.exitCode = exitCode;
}

function readPackageVersion(): string {
  const packagePath = path.resolve(__dirname, "../package.json");
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      version: string;
    };
    return packageJson.version;
  } catch {
    throw new Error(`Failed to read package version from ${packagePath}`);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`tavok: ${message}`);
  process.exitCode = 1;
});
