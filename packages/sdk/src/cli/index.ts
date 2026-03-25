#!/usr/bin/env node
/**
 * CLI entry point for `npx @tavok/sdk init`.
 * Parses process.argv and dispatches to the wizard + scaffolder.
 */

import { runWizard } from "./wizard";
import { scaffold } from "./scaffolder";
import { templates } from "./templates/index";

const USAGE = `
Usage: tavok-sdk <command>

Commands:
  init    Scaffold a new Tavok agent project

Options:
  --help  Show this help message

Examples:
  npx @tavok/sdk init
  tavok-sdk init
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "init") {
    try {
      const result = await runWizard();
      const template = templates[result.templateId];

      if (!template) {
        console.error(`Unknown template: ${result.templateId}`);
        process.exit(1);
      }

      await scaffold({
        projectName: result.projectName,
        agentName: result.agentName,
        template,
      });

      console.log("");
      console.log(`  cd ${result.projectName}`);
      console.log("  npm install");
      console.log("  # Edit .env with your credentials");
      console.log("  npx ts-node src/index.ts");
      console.log("");
    } catch (err) {
      if ((err as Error).name === "ExitPromptError") {
        console.log("\nAborted.");
        process.exit(0);
      }
      throw err;
    }
  } else if (command === "--help" || command === "-h") {
    console.log(USAGE);
  } else {
    console.log(USAGE);
    if (command) {
      console.error(`\nUnknown command: ${command}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
