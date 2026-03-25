/**
 * Tavok SDK SSE (Server-Sent Events) agent.
 *
 * Receives events via SSE stream, sends messages via REST.
 * This is a TypeScript-only connection method (not in the Python SDK).
 */

import type { PollMessage } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler invoked for each message received over the SSE stream. */
export type SseMessageHandler = (msg: PollMessage) => void | Promise<void>;

/** Options for constructing an {@link SseAgent}. */
export interface SseAgentOptions {
  /** Base URL of the Tavok API. Defaults to `http://localhost:5555`. */
  apiUrl?: string;
  /** API key for Bearer authentication. */
  apiKey: string;
  /** The agent's unique ID. */
  agentId: string;
  /** Channel IDs to subscribe to. If omitted, subscribes to all assigned channels. */
  channelIds?: string[];
}

// ---------------------------------------------------------------------------
// SseAgent
// ---------------------------------------------------------------------------

/**
 * An agent that receives channel events over Server-Sent Events and sends
 * messages via the REST API.
 *
 * @example
 * ```typescript
 * const agent = new SseAgent({
 *   apiKey: "ak_...",
 *   agentId: "agent-001",
 *   channelIds: ["ch-abc"],
 * });
 *
 * agent.onMessage(async (msg) => {
 *   console.log(msg.content);
 * });
 *
 * await agent.connect();
 * ```
 */
export class SseAgent {
  private readonly _apiUrl: string;
  private readonly _apiKey: string;
  private readonly _agentId: string;
  private readonly _channelIds: string[];
  private readonly _handlers: SseMessageHandler[] = [];
  private _abortController: AbortController | null = null;

  constructor(opts: SseAgentOptions) {
    this._apiUrl = (opts.apiUrl ?? "http://localhost:5555").replace(/\/+$/, "");
    this._apiKey = opts.apiKey;
    this._agentId = opts.agentId;
    this._channelIds = opts.channelIds ?? [];
  }

  // ---- Registration -------------------------------------------------------

  /**
   * Register a handler that is called for every inbound message event.
   * Multiple handlers may be registered; they are called in order.
   *
   * @returns `this` for fluent chaining.
   */
  onMessage(handler: SseMessageHandler): this {
    this._handlers.push(handler);
    return this;
  }

  // ---- Connection ---------------------------------------------------------

  /**
   * Open the SSE connection.
   *
   * Sends a GET request with `Accept: text/event-stream` and begins
   * consuming the response body as a stream of server-sent events.
   */
  async connect(): Promise<void> {
    this._abortController = new AbortController();

    let url = `${this._apiUrl}/api/v1/agents/${this._agentId}/events`;
    if (this._channelIds.length > 0) {
      url += `?channel_ids=${this._channelIds.join(",")}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${this._apiKey}`,
      },
      signal: this._abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connect failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("SSE response has no body");
    }

    // Consume the stream in the background — don't await
    this._consumeStream(response.body).catch(() => {
      // Swallow errors from abort — they are expected on disconnect
    });
  }

  /**
   * Close the SSE connection by aborting the underlying fetch.
   */
  disconnect(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  // ---- Sending ------------------------------------------------------------

  /**
   * Send a message to a channel via the REST API.
   *
   * @param channelId - Target channel ID.
   * @param content - Message text.
   * @returns The server's JSON response.
   */
  async send(channelId: string, content: string): Promise<Record<string, unknown>> {
    const url = `${this._apiUrl}/api/v1/agents/${this._agentId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({ channelId, content }),
    });

    if (!response.ok) {
      throw new Error(`Send failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  // ---- Internal -----------------------------------------------------------

  /**
   * Read from the SSE body stream and dispatch parsed events to handlers.
   */
  private async _consumeStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split("\n\n");
        // Last part may be incomplete — keep it in the buffer
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          await this._processEvent(part);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse a single SSE event block and dispatch to handlers.
   */
  private async _processEvent(raw: string): Promise<void> {
    const lines = raw.split("\n");
    let data = "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        // Spec: "data:" followed by optional space then payload
        data += line.slice(line[5] === " " ? 6 : 5);
      }
    }

    if (!data) return;

    let parsed: PollMessage;
    try {
      parsed = JSON.parse(data) as PollMessage;
    } catch {
      // Skip malformed events
      return;
    }

    for (const handler of this._handlers) {
      await handler(parsed);
    }
  }
}
