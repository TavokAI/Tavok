/**
 * Tavok TypeScript SDK — build AI agents for Tavok in minutes.
 *
 * @example
 * ```typescript
 * import { Agent } from "@tavok/sdk";
 *
 * const agent = new Agent({ name: "my-agent" });
 *
 * agent.onMention(async (msg) => {
 *   const ctx = agent.stream(msg.channelId);
 *   await ctx.start();
 *   await ctx.token("Hello! I'm an agent.");
 *   await ctx.finish();
 * });
 *
 * agent.run();
 * ```
 *
 * @packageDocumentation
 */

// Version
export const SDK_VERSION = "0.3.0";

// Core WebSocket agent
export { Agent } from "./agent";
export type { AgentOptions, MessageHandler } from "./agent";

// Streaming
export { StreamContext } from "./stream";

// Phoenix Channel transport
export { PhoenixSocket } from "./phoenix";

// REST polling
export { RestAgent, RestStream } from "./rest";

// Webhook verification
export { WebhookHandler, WebhookVerificationError } from "./webhook";

// SSE agent
export { SseAgent } from "./sse";

// OpenAI-compatible client
export { OpenAICompatAgent } from "./openai-compat";

// Inbound webhook client
export { InboundWebhookClient } from "./inbound-webhook";

// Configuration discovery
export { TavokConfig } from "./config";

// Credential discovery
export { discoverCredentials, updateAgent, deregisterAgent } from "./auth";

// Types
export {
  AuthorType,
  MessageType,
  StreamStatus,
  messageFromPayload,
  streamTokenFromPayload,
  streamStartFromPayload,
  streamCompleteFromPayload,
  streamErrorFromPayload,
} from "./types";

export type {
  Message,
  StreamToken,
  StreamStart,
  StreamComplete,
  StreamError,
  PollMessage,
  WebhookEvent,
  AgentCredentials,
  TavokConfigData,
} from "./types";
