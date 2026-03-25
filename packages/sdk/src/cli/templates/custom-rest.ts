import type { Template } from "./index";

export const customRestTemplate: Template = {
  id: "custom-rest",
  name: "Custom REST Polling",
  category: "custom",
  connectionMethod: "REST_POLL",
  dependencies: {},
  devDependencies: {},
  envVars: {},
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok REST polling agent.
 *
 * Polls Tavok for new messages over HTTP and responds.
 * Replace the handler body with your own logic.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 */

import { RestAgent } from "@tavok/sdk";

const agent = new RestAgent({
  name: "${agentName}",
  pollIntervalMs: 2000,
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
