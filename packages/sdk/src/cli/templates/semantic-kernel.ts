import type { Template } from "./index";

export const semanticKernelTemplate: Template = {
  id: "semantic-kernel",
  name: "Semantic Kernel",
  category: "other",
  connectionMethod: "REST_POLL",
  dependencies: {},
  devDependencies: {},
  envVars: {
    SK_API_URL: "URL of your Semantic Kernel backend (e.g. http://localhost:5000)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using REST polling for Semantic Kernel integration.
 *
 * This agent polls Tavok for new messages and forwards them to a
 * Semantic Kernel backend. Customize the endpoint and payload to match
 * your Semantic Kernel setup (typically a .NET or Python service).
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   SK_API_URL          — URL of your Semantic Kernel backend
 */

import { RestAgent } from "@tavok/sdk";

const SK_URL = process.env.SK_API_URL || "http://localhost:5000";

const agent = new RestAgent({
  name: "${agentName}",
  pollIntervalMs: 2000,
});

agent.onMessage(async (msg) => {
  const stream = agent.stream(msg.channelId);
  await stream.start();

  try {
    // Forward to your Semantic Kernel backend
    const response = await fetch(\`\${SK_URL}/invoke\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: msg.content,
        // Add kernel function name, plugins, etc. as needed
      }),
    });

    const result = await response.json() as { output?: string };
    const output = result.output || "No response from Semantic Kernel";

    await stream.append(output);
    await stream.finish();
  } catch (err) {
    await stream.error(String(err));
  }
});

agent.run();
`,
};
