/**
 * Tavok SDK OpenAI-compatible chat completions agent.
 *
 * Wraps Tavok's OpenAI-compatible `/api/v1/chat/completions` endpoint,
 * supporting both streaming and non-streaming modes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single chat message in the OpenAI format. */
export interface ChatMessage {
  role: string;
  content: string;
}

/** Options for a chat request. */
export interface ChatOptions {
  /** Whether to stream the response. Defaults to `false`. */
  stream?: boolean;
  /** Model override. Defaults to the channelId. */
  model?: string;
}

/** Options for constructing an {@link OpenAICompatAgent}. */
export interface OpenAICompatAgentOptions {
  /** Base URL of the Tavok API. Defaults to `http://localhost:5555`. */
  apiUrl?: string;
  /** API key for Bearer authentication. */
  apiKey: string;
  /** The agent's unique ID. */
  agentId: string;
}

// ---------------------------------------------------------------------------
// OpenAICompatAgent
// ---------------------------------------------------------------------------

/**
 * Agent that uses the OpenAI-compatible chat completions endpoint.
 *
 * @example
 * ```typescript
 * const agent = new OpenAICompatAgent({
 *   apiKey: "ak_...",
 *   agentId: "agent-001",
 * });
 *
 * // Non-streaming
 * const reply = await agent.chat("ch-abc", [{ role: "user", content: "Hi" }]);
 *
 * // Streaming
 * const stream = await agent.chat("ch-abc", messages, { stream: true });
 * for await (const chunk of stream as AsyncIterable<string>) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export class OpenAICompatAgent {
  private readonly _apiUrl: string;
  private readonly _apiKey: string;
  private readonly _agentId: string;

  constructor(opts: OpenAICompatAgentOptions) {
    this._apiUrl = (opts.apiUrl ?? "http://localhost:5555").replace(/\/+$/, "");
    this._apiKey = opts.apiKey;
    this._agentId = opts.agentId;
  }

  /**
   * Send a chat completions request.
   *
   * @param channelId - Used as the `model` field unless overridden via opts.
   * @param messages - Array of chat messages.
   * @param opts - Optional streaming and model settings.
   * @returns A string (non-streaming) or an async iterable of strings (streaming).
   */
  async chat(
    channelId: string,
    messages: ChatMessage[],
    opts?: ChatOptions,
  ): Promise<string | AsyncIterable<string>> {
    const streaming = opts?.stream ?? false;
    const model = opts?.model ?? channelId;
    const url = `${this._apiUrl}/api/v1/chat/completions`;

    const body = JSON.stringify({
      model,
      messages,
      stream: streaming,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }

    if (!streaming) {
      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return json.choices[0].message.content;
    }

    // Streaming — return an async generator that yields content deltas
    return this._streamResponse(response);
  }

  // ---- Internal -----------------------------------------------------------

  /**
   * Parse a streaming chat completions response and yield content deltas.
   */
  private async *_streamResponse(response: Response): AsyncIterable<string> {
    if (!response.body) {
      throw new Error("Streaming response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;

            const data = line.slice(line[5] === " " ? 6 : 5);
            if (data === "[DONE]") return;

            let parsed: {
              choices: Array<{ delta: { content?: string } }>;
            };
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
