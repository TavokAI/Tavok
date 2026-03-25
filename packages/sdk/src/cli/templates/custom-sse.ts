import type { Template } from "./index";

export const customSseTemplate: Template = {
  id: "custom-sse",
  name: "Custom SSE",
  category: "custom",
  connectionMethod: "SSE",
  dependencies: {},
  devDependencies: {},
  envVars: {},
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok SSE (Server-Sent Events) agent.
 *
 * Connects to Tavok via SSE for receiving messages and responds
 * through the REST API. Use this when WebSocket is not available
 * but you still want real-time message delivery.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 */

import { SseAgent } from "@tavok/sdk";

const agent = new SseAgent({
  name: "${agentName}",
});

agent.onMessage(async (msg) => {
  const stream = agent.stream(msg.channelId);
  await stream.start();

  try {
    // TODO: Replace with your own logic or LLM call
    await stream.append("Hello from ${agentName}! Edit src/index.ts to add your own logic.");
    await stream.finish();
  } catch (err) {
    await stream.error(String(err));
  }
});

agent.run();
`,
};
