/**
 * Scaffolder — creates the agent project directory and files.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Template } from "./templates/index";

/** Options passed to the scaffold function. */
export interface ScaffoldOptions {
  projectName: string;
  agentName: string;
  template: Template;
}

/**
 * Scaffold a new Tavok agent project.
 *
 * Creates a directory with package.json, tsconfig.json, .env.example,
 * .gitignore, and src/index.ts based on the chosen template.
 */
export async function scaffold(opts: ScaffoldOptions): Promise<void> {
  const { projectName, agentName, template } = opts;
  const dir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dir)) {
    throw new Error(`Directory "${projectName}" already exists`);
  }

  // Create directories
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  // package.json
  const pkg = {
    name: projectName,
    version: "0.1.0",
    private: true,
    scripts: {
      start: "ts-node src/index.ts",
      build: "tsc",
      dev: "ts-node --watch src/index.ts",
    },
    dependencies: {
      "@tavok/sdk": "^0.3.0",
      ...template.dependencies,
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      typescript: "^5.4.0",
      "ts-node": "^10.9.0",
      ...template.devDependencies,
    },
  };
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022"],
      module: "CommonJS",
      moduleResolution: "Node",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src/**/*.ts"],
  };
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2) + "\n",
  );

  // .env.example
  const envLines: string[] = [
    "# Tavok agent credentials",
    "TAVOK_URL=http://localhost:5555",
    "TAVOK_GATEWAY_URL=ws://localhost:4001/socket",
    "TAVOK_AGENT_API_KEY=your-agent-api-key",
    "",
  ];

  for (const [key, desc] of Object.entries(template.envVars)) {
    envLines.push(`# ${desc}`);
    envLines.push(`${key}=`);
  }
  envLines.push("");
  fs.writeFileSync(path.join(dir, ".env.example"), envLines.join("\n"));

  // .gitignore
  const gitignore = [
    "node_modules/",
    "dist/",
    ".env",
    "*.js",
    "*.d.ts",
    "*.js.map",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), gitignore);

  // src/index.ts — generated from the template
  const sourceCode = template.sourceCode(agentName);
  fs.writeFileSync(path.join(dir, "src", "index.ts"), sourceCode);

  console.log(`\n  Project scaffolded at ./${projectName}`);
  console.log(`  Template: ${template.name} (${template.connectionMethod})`);
  console.log(`  Agent: ${agentName}`);
  console.log("\n  Next steps:\n");
}
