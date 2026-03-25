import type { Template } from "./index";

export const openclawTemplate: Template = {
  id: "openclaw",
  name: "OpenClaw",
  category: "popular",
  connectionMethod: "WEBSOCKET",
  dependencies: {},
  devDependencies: {},
  envVars: {
    OPENCLAW_API_KEY: "Your OpenClaw API key (when available)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using OpenClaw.
 *
 * OpenClaw SDK integration is a placeholder — update this file once
 * the OpenClaw client library is available.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   OPENCLAW_API_KEY    — your OpenClaw API key
 */

import { Agent } from "@tavok/sdk";

const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    // TODO: Replace with OpenClaw SDK call when available.
    // Example:
    //   import { OpenClaw } from "openclaw";
    //   const client = new OpenClaw({ apiKey: process.env.OPENCLAW_API_KEY });
    //   const stream = await client.generate({ prompt: msg.content, stream: true });
    //   for await (const chunk of stream) {
    //     await ctx.token(chunk.text);
    //   }

    await ctx.token("OpenClaw integration coming soon. Edit src/index.ts to add your logic.");
    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
