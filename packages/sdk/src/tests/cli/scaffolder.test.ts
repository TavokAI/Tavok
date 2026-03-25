import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scaffold } from "../../cli/scaffolder";
import { templates } from "../../cli/templates/index";

describe("scaffolder", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tavok-scaffold-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory with all expected files", async () => {
    const template = templates["openai"];
    await scaffold({
      projectName: "test-agent",
      agentName: "TestBot",
      template,
    });

    const projectDir = path.join(tmpDir, "test-agent");
    expect(fs.existsSync(projectDir)).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "src", "index.ts"))).toBe(true);
  });

  it("package.json has correct dependencies for openai template", async () => {
    const template = templates["openai"];
    await scaffold({
      projectName: "test-openai",
      agentName: "GPTBot",
      template,
    });

    const pkgPath = path.join(tmpDir, "test-openai", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.name).toBe("test-openai");
    expect(pkg.dependencies["@tavok/sdk"]).toBeDefined();
    expect(pkg.dependencies["openai"]).toBeDefined();
    expect(pkg.devDependencies["typescript"]).toBeDefined();
    expect(pkg.devDependencies["ts-node"]).toBeDefined();
  });

  it("package.json has correct dependencies for langchain template", async () => {
    const template = templates["langchain"];
    await scaffold({
      projectName: "test-langchain",
      agentName: "LCBot",
      template,
    });

    const pkgPath = path.join(tmpDir, "test-langchain", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.dependencies["langchain"]).toBeDefined();
    expect(pkg.dependencies["@langchain/openai"]).toBeDefined();
    expect(pkg.dependencies["express"]).toBeDefined();
    expect(pkg.devDependencies["@types/express"]).toBeDefined();
  });

  it(".env.example has correct vars for openai template", async () => {
    const template = templates["openai"];
    await scaffold({
      projectName: "test-env",
      agentName: "EnvBot",
      template,
    });

    const envPath = path.join(tmpDir, "test-env", ".env.example");
    const envContent = fs.readFileSync(envPath, "utf-8");

    expect(envContent).toContain("TAVOK_AGENT_API_KEY");
    expect(envContent).toContain("OPENAI_API_KEY");
    expect(envContent).toContain("TAVOK_URL");
    expect(envContent).toContain("TAVOK_GATEWAY_URL");
  });

  it(".env.example has correct vars for anthropic template", async () => {
    const template = templates["anthropic"];
    await scaffold({
      projectName: "test-env-anth",
      agentName: "ClaudeBot",
      template,
    });

    const envPath = path.join(tmpDir, "test-env-anth", ".env.example");
    const envContent = fs.readFileSync(envPath, "utf-8");

    expect(envContent).toContain("ANTHROPIC_API_KEY");
  });

  it("src/index.ts contains the agent code with correct name", async () => {
    const template = templates["openai"];
    await scaffold({
      projectName: "test-source",
      agentName: "MyAgent",
      template,
    });

    const srcPath = path.join(tmpDir, "test-source", "src", "index.ts");
    const source = fs.readFileSync(srcPath, "utf-8");

    expect(source).toContain('import { Agent } from "@tavok/sdk"');
    expect(source).toContain('"MyAgent"');
    expect(source).toContain("agent.onMention");
    expect(source).toContain("agent.run()");
  });

  it("throws if directory already exists", async () => {
    const template = templates["openai"];
    fs.mkdirSync(path.join(tmpDir, "existing-dir"));

    await expect(
      scaffold({
        projectName: "existing-dir",
        agentName: "Bot",
        template,
      }),
    ).rejects.toThrow("already exists");
  });

  it("tsconfig.json has correct settings", async () => {
    const template = templates["custom-ws"];
    await scaffold({
      projectName: "test-tsconfig",
      agentName: "TSBot",
      template,
    });

    const tscPath = path.join(tmpDir, "test-tsconfig", "tsconfig.json");
    const tsconfig = JSON.parse(fs.readFileSync(tscPath, "utf-8"));

    expect(tsconfig.compilerOptions.target).toBe("ES2022");
    expect(tsconfig.compilerOptions.module).toBe("CommonJS");
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("scaffolds every template without errors", async () => {
    let i = 0;
    for (const [id, template] of Object.entries(templates)) {
      await scaffold({
        projectName: `test-all-${i++}`,
        agentName: "Bot",
        template,
      });

      const srcPath = path.join(tmpDir, `test-all-${i - 1}`, "src", "index.ts");
      expect(fs.existsSync(srcPath)).toBe(true);

      const source = fs.readFileSync(srcPath, "utf-8");
      expect(source.length).toBeGreaterThan(50);
    }
  });
});
