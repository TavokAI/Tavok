import type { Template } from "./index";

export const customOpenaiTemplate: Template = {
  id: "custom-openai",
  name: "Custom OpenAI-Compatible",
  category: "custom",
  connectionMethod: "OPENAI_COMPAT",
  dependencies: {},
  devDependencies: {},
  envVars: {
    OPENAI_COMPAT_BASE_URL: "Base URL for the OpenAI-compatible API",
    OPENAI_COMPAT_API_KEY: "API key for the OpenAI-compatible API (if required)",
    OPENAI_COMPAT_MODEL: "Model name to use",
  },
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok OpenAI-compatible agent.
 *
 * Uses the OpenAICompatAgent to connect to any service that exposes
 * an OpenAI-compatible chat completions endpoint (vLLM, LM Studio,
 * Together AI, Anyscale, etc.).
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY     — your Tavok agent API key
 *   OPENAI_COMPAT_BASE_URL  — base URL for the OpenAI-compatible API
 *   OPENAI_COMPAT_API_KEY   — API key (if required by the provider)
 *   OPENAI_COMPAT_MODEL     — model name to use
 */

import { OpenAICompatAgent } from "@tavok/sdk";

const agent = new OpenAICompatAgent({
  name: "${agentName}",
  baseUrl: process.env.OPENAI_COMPAT_BASE_URL || "http://localhost:8080/v1",
  apiKey: process.env.OPENAI_COMPAT_API_KEY || "not-needed",
  model: process.env.OPENAI_COMPAT_MODEL || "default",
});

agent.onMessage(async (msg) => {
  // OpenAICompatAgent handles streaming automatically.
  // Customize the system prompt or message formatting here.
  await agent.generateAndStream(msg, {
    systemPrompt: "You are a helpful assistant named ${agentName}.",
  });
});

agent.run();
`,
};
