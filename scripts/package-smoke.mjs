import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const smokeRoot = mkdtempSync(path.join(tmpdir(), "tavok-package-smoke-"));
const npm = "npm";
const npx = "npx";

const createdTarballs = [];

try {
  const cliPackageDir = path.join(repoRoot, "packages", "cli");
  const sdkPackageDir = path.join(repoRoot, "packages", "sdk");
  const cliPackage = readJson(path.join(cliPackageDir, "package.json"));
  const sdkPackage = readJson(path.join(sdkPackageDir, "package.json"));

  const cliCacheRoot = path.join(smokeRoot, ".tavok-cli-cache");
  const cliBinaryPath = path.join(
    cliCacheRoot,
    trimVersionPrefix(cliPackage.version),
    process.platform === "win32" ? "tavok.exe" : "tavok",
  );

  mkdirSync(path.dirname(cliBinaryPath), { recursive: true });
  run(
    "go",
    [
      "build",
      "-trimpath",
      "-ldflags",
      `-s -w -X main.version=${cliPackage.version}`,
      "-o",
      cliBinaryPath,
      "./cmd/tavok",
    ],
    { cwd: path.join(repoRoot, "cli") },
  );

  const cliTarball = npmPack(cliPackageDir);
  const sdkTarball = npmPack(sdkPackageDir);
  createdTarballs.push(cliTarball, sdkTarball);

  run(npm, ["init", "-y", "--loglevel=error"], { cwd: smokeRoot });
  run(
    npm,
    [
      "install",
      "--loglevel=error",
      "--no-audit",
      "--no-fund",
      cliTarball,
      sdkTarball,
    ],
    {
      cwd: smokeRoot,
    },
  );

  const cliVersion = capture(
    npx,
    ["--loglevel=error", "--no-install", "tavok", "version"],
    {
      cwd: smokeRoot,
      env: { TAVOK_CLI_CACHE_DIR: cliCacheRoot },
    },
  ).trim();

  if (cliVersion !== cliPackage.version) {
    throw new Error(
      `Expected tavok CLI version ${cliPackage.version}, got ${cliVersion}`,
    );
  }

  const sdkSmoke = `
    const sdk = await import("@tavok/sdk");
    const required = ["Agent", "SDK_VERSION"];
    for (const key of required) {
      if (!(key in sdk)) throw new Error("Missing SDK export: " + key);
    }
    if (sdk.SDK_VERSION !== ${JSON.stringify(sdkPackage.version)}) {
      throw new Error("Expected SDK_VERSION ${sdkPackage.version}, got " + sdk.SDK_VERSION);
    }
    console.log("SDK package smoke passed:", sdk.SDK_VERSION);
  `;

  run(process.execPath, ["--input-type=module", "-e", sdkSmoke], {
    cwd: smokeRoot,
  });

  console.log("Package smoke passed.");
} finally {
  for (const tarball of createdTarballs) {
    rmSync(tarball, { force: true });
  }
  rmSync(smokeRoot, { recursive: true, force: true });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function npmPack(cwd) {
  const stdout = capture(npm, ["pack", "--json"], {
    cwd,
    env: { npm_config_loglevel: "silent" },
  });
  const jsonStart = stdout.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`npm pack did not return JSON for ${cwd}:\n${stdout}`);
  }

  const packOutput = JSON.parse(stdout.slice(jsonStart));
  const filename = packOutput[0]?.filename;
  if (!filename) {
    throw new Error(`npm pack did not report a tarball filename for ${cwd}`);
  }

  return path.join(cwd, filename);
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  const spawn = spawnCommand(command, args);
  const result = spawnSync(spawn.command, spawn.args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: false,
    stdio: "inherit",
  });

  assertSuccess(command, args, result);
}

function capture(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  const spawn = spawnCommand(command, args);
  const result = spawnSync(spawn.command, spawn.args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  assertSuccess(command, args, result);
  return result.stdout;
}

function assertSuccess(command, args, result) {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}`,
    );
  }
}

function trimVersionPrefix(version) {
  return version.replace(/^v/, "");
}

function spawnCommand(command, args) {
  if (process.platform === "win32" && (command === npm || command === npx)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/c", [command, ...args.map(quoteCmdArg)].join(" ")],
    };
  }

  return { command, args };
}

function quoteCmdArg(value) {
  const stringValue = String(value);
  if (stringValue === "") {
    return '""';
  }

  if (!/[ \t"&<>|^]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, "$1$1")}"`;
}
