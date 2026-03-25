import type { Template } from "./index";

export const customWebhookTemplate: Template = {
  id: "custom-webhook",
  name: "Custom Webhook",
  category: "custom",
  connectionMethod: "WEBHOOK",
  dependencies: {
    express: "^4.21.0",
  },
  devDependencies: {
    "@types/express": "^4.17.21",
  },
  envVars: {},
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok webhook agent.
 *
 * Runs an Express server that receives webhook events from Tavok.
 * Tavok sends a POST request when the agent is triggered, and this
 * handler responds via the callback URL.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 */

import { WebhookHandler } from "@tavok/sdk";
import express from "express";

const app = express();
app.use(express.json());

const handler = new WebhookHandler({
  agentName: "${agentName}",
});

app.post("/webhook", async (req, res) => {
  try {
    const event = handler.verify(req.body);
    const callbackUrl = event.callbackUrl;

    // Acknowledge the webhook
    res.status(200).json({ status: "accepted" });

    if (callbackUrl) {
      // TODO: Replace with your own logic
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "complete",
          content: "Hello from ${agentName}! Edit src/index.ts to add your own logic.",
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
  console.log(\`${agentName} webhook listening on port \${PORT}\`);
});
`,
};
