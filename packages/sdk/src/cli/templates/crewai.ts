import type { Template } from "./index";

export const crewaiTemplate: Template = {
  id: "crewai",
  name: "CrewAI",
  category: "popular",
  connectionMethod: "WEBHOOK",
  dependencies: {
    express: "^4.21.0",
  },
  devDependencies: {
    "@types/express": "^4.17.21",
  },
  envVars: {
    CREWAI_API_URL: "URL of your CrewAI backend (e.g. http://localhost:8000)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent bridging to a CrewAI crew via webhook.
 *
 * This Express server receives webhook events from Tavok and forwards
 * them to your CrewAI backend. Customize the crew endpoint and payload
 * to match your CrewAI setup.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   CREWAI_API_URL      — URL of your CrewAI backend
 */

import { WebhookHandler } from "@tavok/sdk";
import express from "express";

const app = express();
app.use(express.json());

const handler = new WebhookHandler({
  agentName: "${agentName}",
});

const CREWAI_URL = process.env.CREWAI_API_URL || "http://localhost:8000";

app.post("/webhook", async (req, res) => {
  try {
    const event = handler.verify(req.body);
    const callbackUrl = event.callbackUrl;

    // Acknowledge the webhook immediately
    res.status(200).json({ status: "accepted" });

    // Forward to CrewAI backend
    const crewResponse = await fetch(\`\${CREWAI_URL}/kickoff\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: event.triggerMessage.content,
        context: event.contextMessages,
      }),
    });

    const result = await crewResponse.json() as { output?: string };

    // Send the crew's output back to Tavok
    if (callbackUrl) {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "complete",
          content: result.output || "No output from crew",
        }),
      });
    }
  } catch (err) {
    console.error("Webhook error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`${agentName} CrewAI webhook listening on port \${PORT}\`);
});
`,
};
