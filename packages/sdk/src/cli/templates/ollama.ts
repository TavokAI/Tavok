import type { Template } from "./index";

export const ollamaTemplate: Template = {
  id: "ollama",
  name: "Ollama / Local Models",
  category: "popular",
  connectionMethod: "WEBSOCKET",
  dependencies: {
    ollama: "^0.5.0",
  },
  devDependencies: {},
  envVars: {
    OLLAMA_HOST: "Ollama host URL (default: http://127.0.0.1:11434)",
    OLLAMA_MODEL: "Model name (e.g. llama3.1, mistral, codellama)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using Ollama for local model inference.
 *
 * Make sure Ollama is running locally with a model pulled:
 *   ollama pull llama3.1
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   OLLAMA_HOST         — Ollama host (default: http://127.0.0.1:11434)
 *   OLLAMA_MODEL        — model to use (default: llama3.1)
 */

import { Agent } from "@tavok/sdk";
import { Ollama } from "ollama";

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
});

const model = process.env.OLLAMA_MODEL || "llama3.1";
const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    const response = await ollama.chat({
      model,
      messages: [{ role: "user", content: msg.content }],
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.message?.content) {
        await ctx.token(chunk.message.content);
      }
    }

    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
