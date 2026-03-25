import type { Template } from "./index";

export const customInboundTemplate: Template = {
  id: "custom-inbound",
  name: "Custom Inbound Webhook",
  category: "custom",
  connectionMethod: "INBOUND_WEBHOOK",
  dependencies: {},
  devDependencies: {},
  envVars: {},
  sourceCode: (agentName: string) => `/**
 * Minimal Tavok inbound webhook agent.
 *
 * Uses the InboundWebhookClient to push messages into Tavok from
 * an external trigger (cron job, CI pipeline, another service, etc.).
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 */

import { InboundWebhookClient } from "@tavok/sdk";

const client = new InboundWebhookClient({
  agentName: "${agentName}",
});

async function main() {
  // TODO: Replace with your own trigger logic.
  // This example sends a single message.

  const channelId = process.env.TAVOK_CHANNEL_ID || "your-channel-id";

  await client.send(channelId, {
    content: "Hello from ${agentName}! This message was sent via inbound webhook.",
  });

  console.log("Message sent successfully.");
}

main().catch(console.error);
`,
};
