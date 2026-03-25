import type { Template } from "./index";

export const customWsTemplate: Template = {
  id: "custom-ws",
  name: "Custom WebSocket",
  category: "custom",
  connectionMethod: "WEBSOCKET",
  dependencies: {},
  devDependencies: {},
  envVars: {},
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok WebSocket agent.
 *
 * Connects to Tavok over WebSocket and streams responses token-by-token.
 * Replace the handler body with your own LLM or logic.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 */

import { Agent } from "@tavok/sdk";

const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    // TODO: Replace with your LLM call or custom logic
    const words = "Hello from ${agentName}! Edit src/index.ts to add your own logic.".split(" ");
    for (const word of words) {
      await ctx.token(word + " ");
    }

    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
