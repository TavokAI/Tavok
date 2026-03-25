/**
 * Interactive wizard for scaffolding a new Tavok agent project.
 * Uses @inquirer/prompts for terminal UI.
 */

import { input, select } from "@inquirer/prompts";
import { templates } from "./templates/index";
import type { Template } from "./templates/index";

/** Result returned by the wizard. */
export interface WizardResult {
  projectName: string;
  templateId: string;
  agentName: string;
}

interface FrameworkChoice {
  name: string;
  value: string;
  description?: string;
}

type SeparatorLike = { type: "separator"; separator: string };

function buildChoices(): Array<FrameworkChoice | SeparatorLike> {
  const popular: FrameworkChoice[] = [];
  const other: FrameworkChoice[] = [];
  const custom: FrameworkChoice[] = [];

  for (const [id, tpl] of Object.entries(templates)) {
    const choice: FrameworkChoice = {
      name: tpl.name,
      value: id,
      description: `${tpl.connectionMethod}`,
    };

    if (tpl.category === "popular") popular.push(choice);
    else if (tpl.category === "other") other.push(choice);
    else custom.push(choice);
  }

  const choices: Array<FrameworkChoice | SeparatorLike> = [];

  if (popular.length > 0) {
    choices.push({ type: "separator", separator: "── Popular Frameworks ──" });
    choices.push(...popular);
  }
  if (other.length > 0) {
    choices.push({ type: "separator", separator: "── Other Frameworks ──" });
    choices.push(...other);
  }
  if (custom.length > 0) {
    choices.push({ type: "separator", separator: "── Custom ──" });
    choices.push(...custom);
  }

  return choices;
}

/**
 * Run the interactive wizard and return the user's selections.
 */
export async function runWizard(): Promise<WizardResult> {
  console.log("\n  Welcome to the Tavok Agent CLI!\n");

  const projectName = await input({
    message: "Project name:",
    default: "my-tavok-agent",
    validate: (val: string) => {
      if (!val.trim()) return "Project name cannot be empty";
      if (/[^a-zA-Z0-9_\-.]/.test(val)) return "Use only alphanumeric, dash, dot, or underscore";
      return true;
    },
  });

  const choices = buildChoices();

  // @inquirer/prompts select expects { name, value } for choices and
  // { separator } for separators. We convert our format.
  const selectChoices = choices.map((c) => {
    if ("type" in c && c.type === "separator") {
      return { type: "separator" as const, separator: c.separator };
    }
    return c as FrameworkChoice;
  });

  const templateId = await select<string>({
    message: "Choose a framework or template:",
    choices: selectChoices,
    pageSize: 20,
  });

  const agentName = await input({
    message: "Agent display name:",
    default: projectName,
    validate: (val: string) => {
      if (!val.trim()) return "Agent name cannot be empty";
      return true;
    },
  });

  return { projectName, templateId, agentName };
}
