import type { Template } from "./index";

export const openaiTemplate: Template = {
  id: "openai",
  name: "OpenAI (GPT-4, GPT-4o)",
  category: "popular",
  connectionMethod: "WEBSOCKET",
  dependencies: {
    openai: "^4.50.0",
  },
  devDependencies: {},
  envVars: {
    OPENAI_API_KEY: "Your OpenAI API key",
  },
  sourceCode: (agentName: string) => `/**
 * Tavok agent using OpenAI GPT-4o with streaming.
 *
 * Environment variables:
 *   TAVOK_AGENT_API_KEY — your Tavok agent API key
 *   OPENAI_API_KEY      — your OpenAI API key
 */

import { Agent } from "@tavok/sdk";
import OpenAI from "openai";

const openai = new OpenAI();
const agent = new Agent({ name: "${agentName}" });

agent.onMention(async (msg) => {
  const ctx = agent.stream(msg.channelId, { replyTo: msg.id });
  await ctx.start();

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: msg.content }],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) await ctx.token(text);
    }

    await ctx.finish();
  } catch (err) {
    await ctx.error(String(err));
  }
});

agent.run();
`,
};
