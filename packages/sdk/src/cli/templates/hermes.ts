import type { Template } from "./index";

export const hermesTemplate: Template = {
  id: "hermes",
  name: "Hermes (NousResearch)",
  category: "popular",
  connectionMethod: "WEBSOCKET",
  dependencies: {
    openai: "^4.50.0",
  },
  devDependencies: {},
  envVars: {
    HERMES_API_BASE: "Hermes-compatible API base URL (e.g. http://localhost:8080/v1)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using Hermes (NousResearch) via OpenAI-compatible API.
 *
 * Hermes models expose an OpenAI-compatible endpoint. Point HERMES_API_BASE
 * at your local or remote Hermes server.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   HERMES_API_BASE     — base URL for the Hermes API (e.g. http://localhost:8080/v1)
 */

import { Agent } from "@tavok/sdk";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.HERMES_API_BASE || "http://localhost:8080/v1",
  apiKey: "not-needed", // Local models typically don't require an API key
});

const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    const stream = await openai.chat.completions.create({
      model: "NousResearch/Hermes-3-Llama-3.1-8B",
      messages: [{ role: "user", content: msg.content }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) await ctx.token(text);
    }

    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
