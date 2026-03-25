/**
 * Tavok SDK streaming context.
 *
 * Manages the streaming lifecycle for sending tokens word-by-word
 * to a Tavok channel. Ported from the Python SDK (`sdk/python/tavok/stream.py`).
 */

// ---------------------------------------------------------------------------
// PhoenixSocket interface — dependency injection, no module import
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a Phoenix Channel socket.
 *
 * The real implementation lives in the ws module; StreamContext only depends
 * on this shape so it can be tested with a simple mock.
 */
export interface PhoenixSocket {
  /** Push an event and wait for a reply. */
  push(
    topic: string,
    event: string,
    payload?: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<Record<string, unknown>>;

  /** Push an event without waiting for a reply (fire-and-forget). */
  pushNoReply(
    topic: string,
    event: string,
    payload?: Record<string, unknown>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// StreamContext
// ---------------------------------------------------------------------------

/**
 * Manages the streaming lifecycle for a single agent response.
 *
 * @example
 * ```typescript
 * const ctx = new StreamContext(socket, channelId, agentId, agentName);
 * await ctx.start();
 * await ctx.token("Hello ");
 * await ctx.token("world!");
 * await ctx.finish();
 * // ctx.content === "Hello world!"
 * ```
 */
export class StreamContext {
  private readonly _socket: PhoenixSocket;
  private readonly _channelId: string;
  private readonly _agentId: string;
  private readonly _agentName: string;
  private readonly _replyTo: string | undefined;
  private readonly _topic: string;

  private _messageId: string | undefined;
  private _tokenIndex = 0;
  private readonly _contentParts: string[] = [];
  private _started = false;

  constructor(
    socket: PhoenixSocket,
    channelId: string,
    agentId: string,
    agentName: string,
    replyTo?: string,
  ) {
    this._socket = socket;
    this._channelId = channelId;
    this._agentId = agentId;
    this._agentName = agentName;
    this._replyTo = replyTo;
    this._topic = `room:${channelId}`;
  }

  // ---- Properties --------------------------------------------------------

  /** The streaming message ID, available after {@link start}. */
  get messageId(): string | undefined {
    return this._messageId;
  }

  /** All tokens sent so far, concatenated. */
  get content(): string {
    return this._contentParts.join("");
  }

  // ---- Lifecycle ---------------------------------------------------------

  /**
   * Start the stream by pushing `stream_start`.
   *
   * Sets {@link messageId} from the server reply.
   */
  async start(): Promise<void> {
    const payload: Record<string, unknown> = {
      agentId: this._agentId,
      agentName: this._agentName,
    };
    if (this._replyTo) {
      payload.replyTo = this._replyTo;
    }

    const reply = await this._socket.push(this._topic, "stream_start", payload, { timeout: 15_000 });
    const response = (reply.response as Record<string, unknown>) ?? reply;
    this._messageId = (response.messageId as string) ?? (response.id as string) ?? "";
    this._started = true;
  }

  /**
   * Send a single token/chunk to the stream (fire-and-forget).
   *
   * @param text - The text chunk to append to the streaming message.
   */
  async token(text: string): Promise<void> {
    if (!this._started) {
      throw new Error("Stream not started — call start() first");
    }

    await this._socket.pushNoReply(this._topic, "stream_token", {
      messageId: this._messageId,
      token: text,
      index: this._tokenIndex,
    });
    this._contentParts.push(text);
    this._tokenIndex += 1;
  }

  /**
   * Send a thinking/status update.
   *
   * @param state - Phase name (e.g. "Thinking", "Searching", "Writing").
   * @param detail - Optional detail text.
   */
  async status(state: string, detail?: string): Promise<void> {
    await this._socket.pushNoReply(this._topic, "stream_thinking", {
      messageId: this._messageId,
      phase: state,
      detail: detail ?? "",
    });
  }

  /**
   * Finish the stream by pushing `stream_complete`.
   *
   * @param metadata - Optional metadata (model, tokens, latency, etc.).
   */
  async finish(metadata?: Record<string, unknown>): Promise<void> {
    const payload: Record<string, unknown> = {
      messageId: this._messageId,
      finalContent: this.content,
    };
    if (metadata) {
      payload.metadata = metadata;
    }

    await this._socket.push(this._topic, "stream_complete", payload, { timeout: 15_000 });
  }

  /**
   * Mark the stream as errored.
   *
   * @param errorMessage - Human-readable error description.
   */
  async error(errorMessage: string): Promise<void> {
    await this._socket.push(
      this._topic,
      "stream_error",
      {
        messageId: this._messageId,
        error: errorMessage,
        partialContent: this.content,
      },
      { timeout: 15_000 },
    );
  }

  // ---- Typed messages ----------------------------------------------------

  /**
   * Send a TOOL_CALL typed message during a stream.
   *
   * @param toolName - Name of the tool being called.
   * @param args - Tool arguments.
   * @param opts - Optional call ID and status.
   * @returns The callId for correlating with {@link toolResult}.
   */
  async toolCall(
    toolName: string,
    args: Record<string, unknown>,
    opts?: { callId?: string; status?: string },
  ): Promise<string> {
    const callId = opts?.callId ?? toolName;
    const status = opts?.status ?? "running";

    await this._socket.push(
      this._topic,
      "typed_message",
      {
        type: "TOOL_CALL",
        content: {
          callId,
          toolName,
          arguments: args,
          status,
        },
      },
      { timeout: 15_000 },
    );
    return callId;
  }

  /**
   * Send a TOOL_RESULT typed message during a stream.
   *
   * @param callId - The call ID from {@link toolCall}.
   * @param result - The tool result data.
   * @param opts - Optional error message and duration.
   */
  async toolResult(
    callId: string,
    result: unknown,
    opts?: { errorMsg?: string; durationMs?: number },
  ): Promise<void> {
    await this._socket.push(
      this._topic,
      "typed_message",
      {
        type: "TOOL_RESULT",
        content: {
          callId,
          result,
          error: opts?.errorMsg ?? null,
          durationMs: opts?.durationMs ?? 0,
        },
      },
      { timeout: 15_000 },
    );
  }

  /**
   * Send a CODE_BLOCK typed message during a stream.
   *
   * @param language - Programming language for syntax highlighting.
   * @param codeContent - The code content.
   * @param opts - Optional filename.
   */
  async code(
    language: string,
    codeContent: string,
    opts?: { filename?: string },
  ): Promise<void> {
    const content: Record<string, unknown> = {
      language,
      code: codeContent,
    };
    if (opts?.filename) {
      content.filename = opts.filename;
    }

    await this._socket.push(
      this._topic,
      "typed_message",
      { type: "CODE_BLOCK", content },
      { timeout: 15_000 },
    );
  }

  /**
   * Send an ARTIFACT typed message during a stream.
   *
   * @param title - Title for the artifact.
   * @param content - HTML, SVG, or file content.
   * @param type - One of "html", "svg", or "file". Defaults to "html".
   */
  async artifact(title: string, content: string, type = "html"): Promise<void> {
    await this._socket.push(
      this._topic,
      "typed_message",
      {
        type: "ARTIFACT",
        content: {
          artifactType: type,
          title,
          content,
        },
      },
      { timeout: 15_000 },
    );
  }
}
