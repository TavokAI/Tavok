import type { Template } from "./index";

export const langchainTemplate: Template = {
  id: "langchain",
  name: "LangChain / LangGraph",
  category: "popular",
  connectionMethod: "WEBHOOK",
  dependencies: {
    langchain: "^0.3.0",
    "@langchain/openai": "^0.3.0",
    express: "^4.21.0",
  },
  devDependencies: {
    "@types/express": "^4.17.21",
  },
  envVars: {
    OPENAI_API_KEY: "Your OpenAI API key (used by LangChain)",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using LangChain via webhook.
 *
 * Runs an Express server that receives webhook events from Tavok,
 * processes them through a LangChain chain, and streams the response back.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   OPENAI_API_KEY      — your OpenAI API key (used by LangChain)
 */

import { WebhookHandler } from "@tavok/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "langchain/schema";
import express from "express";

const app = express();
app.use(express.json());

const handler = new WebhookHandler({
  agentName: "${agentName}",
});

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  streaming: true,
});

app.post("/webhook", async (req, res) => {
  try {
    const event = handler.verify(req.body);

    // Use the callback URL to stream tokens back to Tavok
    const callbackUrl = event.callbackUrl;
    if (!callbackUrl) {
      res.status(200).json({ status: "ok" });
      return;
    }

    // Acknowledge the webhook immediately
    res.status(200).json({ status: "accepted" });

    // Process with LangChain and stream back
    const messages = [new HumanMessage(event.triggerMessage.content)];

    const stream = await llm.stream(messages);
    const tokens: string[] = [];
    for await (const chunk of stream) {
      const text = typeof chunk.content === "string" ? chunk.content : "";
      if (text) {
        tokens.push(text);
        // Post token to callback URL
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "token", token: text }),
        });
      }
    }

    // Signal completion
    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete", content: tokens.join("") }),
    });
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
