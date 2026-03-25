/**
 * Template registry — maps template IDs to their configuration.
 */

import { openaiTemplate } from "./openai";
import { anthropicTemplate } from "./anthropic";
import { openclawTemplate } from "./openclaw";
import { langchainTemplate } from "./langchain";
import { crewaiTemplate } from "./crewai";
import { hermesTemplate } from "./hermes";
import { ollamaTemplate } from "./ollama";
import { autogenTemplate } from "./autogen";
import { semanticKernelTemplate } from "./semantic-kernel";
import { customWsTemplate } from "./custom-ws";
import { customRestTemplate } from "./custom-rest";
import { customWebhookTemplate } from "./custom-webhook";
import { customInboundTemplate } from "./custom-inbound";
import { customSseTemplate } from "./custom-sse";
import { customOpenaiTemplate } from "./custom-openai";

/** Describes a scaffolding template for a specific framework. */
export interface Template {
  id: string;
  name: string;
  category: "popular" | "other" | "custom";
  connectionMethod: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  envVars: Record<string, string>;
  sourceCode: (agentName: string) => string;
}

/** All available templates, keyed by template ID. */
export const templates: Record<string, Template> = {
  openai: openaiTemplate,
  anthropic: anthropicTemplate,
  openclaw: openclawTemplate,
  langchain: langchainTemplate,
  crewai: crewaiTemplate,
  hermes: hermesTemplate,
  ollama: ollamaTemplate,
  autogen: autogenTemplate,
  "semantic-kernel": semanticKernelTemplate,
  "custom-ws": customWsTemplate,
  "custom-rest": customRestTemplate,
  "custom-webhook": customWebhookTemplate,
  "custom-inbound": customInboundTemplate,
  "custom-sse": customSseTemplate,
  "custom-openai": customOpenaiTemplate,
};
