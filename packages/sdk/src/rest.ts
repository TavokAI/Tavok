/**
 * Tavok SDK REST Client — poll-based agent connectivity.
 *
 * For agents using the REST_POLL connection method. Provides a simple
 * client that polls for messages and sends responses without maintaining a
 * persistent WebSocket connection.
 *
 * Ideal for serverless environments (AWS Lambda, Cloud Functions), cron jobs,
 * and systems that cannot hold long-lived connections.
 *
 * Ported from the Python SDK (`sdk/python/tavok/rest.py`).
 *
 * @example
 * ```typescript
 * import { RestAgent } from "@tavok/sdk/rest";
 *
 * const agent = new RestAgent({
 *   apiKey: "sk-tvk-...",
 *   agentId: "01HXY...",
 * });
 *
 * const messages = await agent.poll({ wait: 10, ack: true });
 * for (const msg of messages) {
 *   await agent.send(msg.channelId, `Echo: ${msg.content}`);
 * }
 *
 * agent.close();
 * ```
 */

import type { PollMessage } from "./types";

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = "http://localhost:5555";

// ---------------------------------------------------------------------------
// RestStream
// ---------------------------------------------------------------------------

/**
 * Handle for streaming tokens via REST.
 *
 * Returned by {@link RestAgent.startStream}. Call {@link token} to send
 * tokens, then {@link complete} to finalize.
 */
export class RestStream {
  private readonly _apiUrl: string;
  private readonly _apiKey: string;
  private readonly _agentId: string;
  private readonly _messageId: string;
  private readonly _streamUrl: string;
  private _tokenOffset = 0;
  private readonly _contentParts: string[] = [];

  constructor(
    apiUrl: string,
    apiKey: string,
    agentId: string,
    messageId: string,
    streamUrl?: string,
  ) {
    this._apiUrl = apiUrl;
    this._apiKey = apiKey;
    this._agentId = agentId;
    this._messageId = messageId;
    this._streamUrl =
      streamUrl ??
      `${apiUrl}/api/v1/agents/${agentId}/messages/${messageId}/stream`;
  }

  /** The streaming message ID. */
  get messageId(): string {
    return this._messageId;
  }

  /**
   * Send a streaming token.
   *
   * @param text - The token text to send.
   */
  async token(text: string): Promise<void> {
    const resp = await fetch(this._streamUrl, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        tokens: [text],
        done: false,
        tokenOffset: this._tokenOffset,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Stream token failed: ${resp.status} ${resp.statusText}`);
    }
    this._contentParts.push(text);
    await this._updateTokenOffset(resp, this._tokenOffset + 1);
  }

  /**
   * Send a thinking/status update.
   *
   * @param phase - The thinking phase name (e.g. "Searching", "Processing").
   * @param detail - Optional detail text.
   */
  async thinking(phase: string, detail?: string): Promise<void> {
    const thinking: Record<string, unknown> = { phase };
    if (detail !== undefined) {
      thinking.detail = detail;
    }
    const resp = await fetch(this._streamUrl, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ thinking }),
    });
    if (!resp.ok) {
      throw new Error(`Stream thinking failed: ${resp.status} ${resp.statusText}`);
    }
  }

  /**
   * Finalize the stream.
   *
   * @param finalContent - The complete response text.
   * @param metadata - Optional metadata dict (model, tokensIn, tokensOut, etc.).
   */
  async complete(
    finalContent?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      tokens: [],
      done: true,
      finalContent: finalContent ?? this._contentParts.join(""),
    };
    if (metadata !== undefined) {
      payload.metadata = metadata;
    }
    const resp = await fetch(this._streamUrl, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`Stream complete failed: ${resp.status} ${resp.statusText}`);
    }
  }

  /**
   * Signal a stream error.
   *
   * @param errorMsg - The error description.
   * @param partialContent - Any partial content generated before the error.
   */
  async error(errorMsg: string, partialContent?: string): Promise<void> {
    const payload: Record<string, unknown> = { error: errorMsg };
    if (partialContent !== undefined) {
      payload.finalContent = partialContent;
    }
    const resp = await fetch(this._streamUrl, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`Stream error failed: ${resp.status} ${resp.statusText}`);
    }
  }

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async _updateTokenOffset(resp: Response, fallback: number): Promise<void> {
    try {
      const data = (await resp.json()) as { nextTokenOffset?: unknown };
      this._tokenOffset =
        typeof data.nextTokenOffset === "number"
          ? data.nextTokenOffset
          : fallback;
    } catch {
      this._tokenOffset = fallback;
    }
  }
}

// ---------------------------------------------------------------------------
// RestAgent
// ---------------------------------------------------------------------------

/** Options for creating a {@link RestAgent}. */
export interface RestAgentOptions {
  /** Tavok web server URL. Defaults to `http://localhost:5555`. */
  apiUrl?: string;
  /** Agent API key (`sk-tvk-...`). */
  apiKey: string;
  /** Agent ULID. */
  agentId: string;
}

/** Options for {@link RestAgent.poll}. */
export interface PollOptions {
  /** Optional channel filter. */
  channelId?: string;
  /** Max messages to return (default 50, max 100). */
  limit?: number;
  /** If true, mark messages as delivered. Defaults to true. */
  ack?: boolean;
  /** Long-polling timeout in seconds (0-30). */
  wait?: number;
}

/**
 * REST-based agent client for Tavok.
 *
 * Uses HTTP polling to receive messages and REST to send responses.
 * No persistent connection required — ideal for serverless environments.
 */
export class RestAgent {
  private readonly _apiUrl: string;
  private readonly _apiKey: string;
  private readonly _agentId: string;
  private _closed = false;

  constructor(opts: RestAgentOptions) {
    this._apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this._apiKey = opts.apiKey;
    this._agentId = opts.agentId;
  }

  /**
   * Poll for new messages.
   *
   * @returns List of {@link PollMessage} objects.
   */
  async poll(opts?: PollOptions): Promise<PollMessage[]> {
    this._ensureOpen();

    const params = new URLSearchParams();
    params.set("limit", String(opts?.limit ?? 50));
    params.set("ack", opts?.ack === false ? "false" : "true");

    if (opts?.wait !== undefined && opts.wait > 0) {
      params.set("wait", String(Math.min(opts.wait, 30)));
    }
    if (opts?.channelId) {
      params.set("channel_id", opts.channelId);
    }

    const url = `${this._apiUrl}/api/v1/agents/${this._agentId}/messages?${params.toString()}`;
    const resp = await fetch(url, { headers: this._headers() });

    if (!resp.ok) {
      throw new Error(`Poll failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as { messages?: Record<string, unknown>[] };
    const messages = data.messages ?? [];
    return messages as unknown as PollMessage[];
  }

  /**
   * Send a simple (non-streaming) message.
   *
   * @param channelId - Target channel ULID.
   * @param content - Message text.
   * @returns Response object with messageId and sequence.
   */
  async send(
    channelId: string,
    content: string,
  ): Promise<Record<string, unknown>> {
    this._ensureOpen();

    const url = `${this._apiUrl}/api/v1/agents/${this._agentId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ channelId, content }),
    });

    if (!resp.ok) {
      throw new Error(`Send failed: ${resp.status} ${resp.statusText}`);
    }

    return (await resp.json()) as Record<string, unknown>;
  }

  /**
   * Start a streaming response.
   *
   * @param channelId - Target channel ULID.
   * @returns {@link RestStream} handle for sending tokens.
   */
  async startStream(channelId: string): Promise<RestStream> {
    this._ensureOpen();

    const url = `${this._apiUrl}/api/v1/agents/${this._agentId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ channelId, streaming: true }),
    });

    if (!resp.ok) {
      throw new Error(`Start stream failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as {
      messageId: string;
      streamUrl?: string;
    };
    return new RestStream(
      this._apiUrl,
      this._apiKey,
      this._agentId,
      data.messageId,
      data.streamUrl,
    );
  }

  /** Close the agent (marks as closed; no persistent resources to free). */
  close(): void {
    this._closed = true;
  }

  private _ensureOpen(): void {
    if (this._closed) {
      throw new Error("RestAgent is closed");
    }
  }

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
