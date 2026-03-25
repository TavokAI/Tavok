import type { Template } from "./index";

export const autogenTemplate: Template = {
  id: "autogen",
  name: "AutoGen",
  category: "other",
  connectionMethod: "REST_POLL",
  dependencies: {},
  devDependencies: {},
  envVars: {
    AUTOGEN_API_URL: "URL of your AutoGen backend (e.g. http://localhost:8000)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using REST polling for AutoGen integration.
 *
 * This agent polls Tavok for new messages and forwards them to an
 * AutoGen backend. Customize the AutoGen endpoint and payload format
 * to match your AutoGen setup.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   AUTOGEN_API_URL     — URL of your AutoGen backend
 */

import { RestAgent } from "@tavok/sdk";

const AUTOGEN_URL = process.env.AUTOGEN_API_URL || "http://localhost:8000";

const agent = new RestAgent({
  name: "${agentName}",
  pollIntervalMs: 2000,
});

agent.onMessage(async (msg) => {
  const stream = agent.stream(msg.channelId);
  await stream.start();

  try {
    // Forward to your AutoGen backend
    const response = await fetch(\`\${AUTOGEN_URL}/chat\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg.content,
        context: [], // Add conversation history if needed
      }),
    });

    const result = await response.json() as { reply?: string };
    const reply = result.reply || "No response from AutoGen";

    // Send the full reply (REST polling doesn't support token-by-token streaming)
    await stream.append(reply);
    await stream.finish();
  } catch (err) {
    await stream.error(String(err));
  }
});

agent.run();
`,
};
