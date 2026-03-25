import type { Template } from "./index";

export const anthropicTemplate: Template = {
  id: "anthropic",
  name: "Claude / Anthropic",
  category: "popular",
  connectionMethod: "WEBSOCKET",
  dependencies: {
    "@anthropic-ai/sdk": "^0.30.0",
  },
  devDependencies: {},
  envVars: {
    ANTHROPIC_API_KEY: "Your Anthropic API key",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using Anthropic Claude with streaming.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   ANTHROPIC_API_KEY   — your Anthropic API key
 */

import { Agent } from "@tavok/sdk";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: msg.content }],
    });

    stream.on("text", async (text) => {
      await ctx.token(text);
    });

    await stream.finalMessage();
    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
