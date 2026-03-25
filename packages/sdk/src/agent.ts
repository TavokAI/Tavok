/**
 * Tavok SDK Agent — the main user-facing class.
 *
 * An Agent connects via WebSocket and responds to messages with optional
 * token streaming. Credentials are auto-discovered from `.tavok-agents.json`
 * (written by `tavok init`) or provided via environment variables.
 *
 * Ported from the Python SDK (`sdk/python/tavok/agent.py`).
 *
 * @example
 * ```typescript
 * import { Agent } from "@tavok/sdk";
 *
 * const agent = new Agent({ name: "Jack" });
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
 */

import { PhoenixSocket } from "./phoenix";
import { StreamContext } from "./stream";
import { TavokConfig } from "./config";
import { discoverCredentials } from "./auth";
import {
  type Message,
  type StreamStart,
  type StreamComplete,
  type StreamError,
  messageFromPayload,
  streamStartFromPayload,
  streamCompleteFromPayload,
  streamErrorFromPayload,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for creating an Agent. */
export interface AgentOptions {
  /** Agent display name. Used for auto-discovery from `.tavok-agents.json`. */
  name?: string;
  /** Gateway WebSocket URL (e.g. `ws://localhost:4001`). */
  url?: string;
  /** Web server URL for REST API (e.g. `http://localhost:5555`). */
  apiUrl?: string;
  /** API key. If not provided, auto-discovered by name. */
  apiKey?: string;
  /** Agent ULID. If not provided, auto-discovered by name. */
  agentId?: string;
  /** Default server ULID. */
  serverId?: string;
  /** Default channel ULIDs to join. */
  channelIds?: string[];
}

/** Handler called with a parsed Message. */
export type MessageHandler = (msg: Message) => void | Promise<void>;

/** Handler called when any agent starts streaming. */
export type StreamStartHandler = (start: StreamStart) => void | Promise<void>;

/** Handler called when any stream completes. */
export type StreamCompleteHandler = (complete: StreamComplete) => void | Promise<void>;

/** Handler called when a stream errors. */
export type StreamErrorHandler = (error: StreamError) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * A Tavok agent that connects via WebSocket and responds to messages.
 *
 * Credentials are resolved in order:
 *
 * 1. Explicit constructor arguments (`apiKey`, `agentId`)
 * 2. Environment variables (`TAVOK_API_KEY`, `TAVOK_AGENT_ID`)
 * 3. Auto-discovery from `.tavok-agents.json` (by `name`)
 * 4. `TavokConfig.discover()` for topology
 */
export class Agent {
  private readonly _gatewayUrl: string;
  private readonly _apiUrl: string;
  private readonly _name: string;
  private _apiKey: string | undefined;
  private _agentId: string | undefined;
  private readonly _defaultServerId: string | undefined;
  private readonly _defaultChannelIds: string[] | undefined;

  private _socket: PhoenixSocket | null = null;
  private readonly _joinedChannels = new Set<string>();
  private readonly _sequences = new Map<string, string>();

  // Handler lists
  private readonly _onMentionHandlers: MessageHandler[] = [];
  private readonly _onMessageHandlers: MessageHandler[] = [];
  private readonly _onStreamStartHandlers: StreamStartHandler[] = [];
  private readonly _onStreamCompleteHandlers: StreamCompleteHandler[] = [];
  private readonly _onStreamErrorHandlers: StreamErrorHandler[] = [];

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(opts?: AgentOptions) {
    const o = opts ?? {};

    // Auto-discover topology from env vars and .tavok.json
    const config = TavokConfig.discover();

    this._gatewayUrl = (o.url ?? config.gatewayUrl).replace(/\/+$/, "");
    this._apiUrl = (o.apiUrl ?? config.url).replace(/\/+$/, "");
    this._name = o.name ?? "Tavok Agent";

    // Credential resolution: explicit -> env -> file discovery
    this._apiKey = o.apiKey ?? process.env.TAVOK_API_KEY;
    this._agentId = o.agentId ?? process.env.TAVOK_AGENT_ID;

    if (!this._apiKey) {
      const creds = discoverCredentials(this._name);
      if (creds) {
        this._apiKey = creds.apiKey || undefined;
        this._agentId = this._agentId ?? (creds.id || undefined);
      }
    }

    this._defaultServerId = o.serverId ?? config.serverId ?? undefined;
    this._defaultChannelIds =
      o.channelIds ?? (config.channelId ? [config.channelId] : undefined);
  }

  // ------------------------------------------------------------------
  // Properties
  // ------------------------------------------------------------------

  /** The agent's ULID. */
  get agentId(): string | undefined {
    return this._agentId;
  }

  /** The agent's API key. */
  get apiKey(): string | undefined {
    return this._apiKey;
  }

  /** The agent's display name. */
  get name(): string {
    return this._name;
  }

  /** Whether the WebSocket connection is active. */
  get connected(): boolean {
    return this._socket !== null && this._socket.connected;
  }

  // ------------------------------------------------------------------
  // Handler registration (fluent / chainable)
  // ------------------------------------------------------------------

  /**
   * Register a handler called when the agent is @mentioned.
   *
   * Mention is detected by checking if the message content contains
   * `<@{agentId}>`.
   */
  onMention(handler: MessageHandler): this {
    this._onMentionHandlers.push(handler);
    return this;
  }

  /** Register a handler called for every incoming message. */
  onMessage(handler: MessageHandler): this {
    this._onMessageHandlers.push(handler);
    return this;
  }

  /** Register a handler called when any agent starts streaming. */
  onStreamStart(handler: StreamStartHandler): this {
    this._onStreamStartHandlers.push(handler);
    return this;
  }

  /** Register a handler called when any stream completes. */
  onStreamComplete(handler: StreamCompleteHandler): this {
    this._onStreamCompleteHandlers.push(handler);
    return this;
  }

  /** Register a handler called when a stream errors. */
  onStreamError(handler: StreamErrorHandler): this {
    this._onStreamErrorHandlers.push(handler);
    return this;
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  /**
   * Send a standard (non-streaming) message to a channel.
   *
   * @param channelId - The target channel ULID.
   * @param content   - Message text.
   * @returns Reply payload from the server.
   */
  async send(
    channelId: string,
    content: string,
  ): Promise<Record<string, unknown>> {
    if (!this._socket) {
      throw new Error("Agent not connected");
    }

    const topic = `room:${channelId}`;
    const reply = await this._socket.push(topic, "new_message", { content });
    const response = (reply.response as Record<string, unknown>) ?? reply;
    const seq = response.sequence as string | undefined;
    if (seq) {
      this._sequences.set(channelId, String(seq));
    }
    return response;
  }

  /**
   * Create a streaming context for sending tokens word-by-word.
   *
   * The caller is responsible for calling `ctx.start()` to begin the stream.
   *
   * @param channelId - The target channel ULID.
   * @param opts      - Optional `replyTo` message ID.
   * @returns A new StreamContext (not yet started).
   */
  stream(
    channelId: string,
    opts?: { replyTo?: string },
  ): StreamContext {
    if (!this._socket) {
      throw new Error("Agent not connected");
    }

    return new StreamContext(
      this._socket,
      channelId,
      this._agentId ?? "",
      this._name,
      opts?.replyTo,
    );
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Connect to the gateway and join channels.
   *
   * @param opts - Optional overrides for serverId and channelIds.
   */
  async start(opts?: {
    serverId?: string;
    channelIds?: string[];
  }): Promise<void> {
    const resolvedChannels =
      opts?.channelIds ?? this._defaultChannelIds;

    if (!this._apiKey) {
      throw new Error(
        `No API key found for agent '${this._name}'. ` +
          "Run 'tavok init' to create agent credentials in " +
          ".tavok-agents.json, set TAVOK_API_KEY env var, " +
          "or pass apiKey to Agent().",
      );
    }

    // Connect WebSocket
    const wsUrl = `${this._gatewayUrl}/socket/websocket`;
    this._socket = new PhoenixSocket(wsUrl, { api_key: this._apiKey });

    // Register internal event handlers before connecting
    this._registerEventHandlers();

    await this._socket.connect();

    // Join channels
    for (const chId of resolvedChannels ?? []) {
      await this.joinChannel(chId);
    }
  }

  /** Join a channel by its ULID. */
  async joinChannel(channelId: string): Promise<void> {
    if (!this._socket) {
      throw new Error("Agent not connected");
    }

    const topic = `room:${channelId}`;
    const payload: Record<string, unknown> = {};
    const lastSeq = this._sequences.get(channelId);
    if (lastSeq) {
      payload.lastSequence = lastSeq;
    }

    await this._socket.join(topic, payload);
    this._joinedChannels.add(channelId);
  }

  /** Leave a channel by its ULID. */
  async leaveChannel(channelId: string): Promise<void> {
    if (this._socket) {
      await this._socket.leave(`room:${channelId}`);
    }
    this._joinedChannels.delete(channelId);
  }

  /** Disconnect and clean up. */
  async stop(): Promise<void> {
    if (this._socket) {
      await this._socket.disconnect();
      this._socket = null;
    }
    this._joinedChannels.clear();
  }

  /**
   * Blocking entry point — connects and runs until SIGINT/SIGTERM.
   *
   * @param opts - Optional overrides for serverId and channelIds.
   */
  run(opts?: { serverId?: string; channelIds?: string[] }): void {
    const execute = async (): Promise<void> => {
      await this.start(opts);

      process.stderr.write(
        `Agent '${this._name}' running (id=${this._agentId}, ` +
          `gateway=${this._gatewayUrl}). Press Ctrl+C to stop.\n`,
      );

      // Wait until signal
      await new Promise<void>((resolve) => {
        const handler = (): void => {
          resolve();
        };

        process.on("SIGINT", handler);
        process.on("SIGTERM", handler);
      });

      await this.stop();
    };

    execute().catch((err: unknown) => {
      process.stderr.write(
        `Agent error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    });
  }

  // ------------------------------------------------------------------
  // Internal event routing
  // ------------------------------------------------------------------

  /** Wire up Phoenix Channel events to internal handler methods. */
  private _registerEventHandlers(): void {
    if (!this._socket) return;

    this._socket.on(
      "message_new",
      (topic: string, payload: Record<string, unknown>) => {
        this._handleMessageNew(topic, payload);
      },
    );
    this._socket.on(
      "stream_start",
      (_topic: string, payload: Record<string, unknown>) => {
        this._handleStreamStart(payload);
      },
    );
    this._socket.on(
      "stream_complete",
      (_topic: string, payload: Record<string, unknown>) => {
        this._handleStreamComplete(payload);
      },
    );
    this._socket.on(
      "stream_error",
      (_topic: string, payload: Record<string, unknown>) => {
        this._handleStreamError(payload);
      },
    );
  }

  /** Handle incoming message_new broadcasts. */
  private async _handleMessageNew(
    topic: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const msg = messageFromPayload(payload);

    // Don't react to our own messages
    if (msg.authorId === this._agentId) {
      return;
    }

    // Track sequence
    const channelId = topic.replace(/^room:/, "");
    if (msg.sequence) {
      this._sequences.set(channelId, msg.sequence);
    }

    // Dispatch to onMessage handlers
    for (const handler of this._onMessageHandlers) {
      try {
        await handler(msg);
      } catch (err) {
        // Handler exceptions are caught and logged — don't crash
        console.error("onMessage handler error:", err);
      }
    }

    // Dispatch to onMention handlers if mentioned
    if (this._agentId && msg.content.includes(`<@${this._agentId}>`)) {
      for (const handler of this._onMentionHandlers) {
        try {
          await handler(msg);
        } catch (err) {
          console.error("onMention handler error:", err);
        }
      }
    }
  }

  /** Handle stream_start broadcasts. */
  private async _handleStreamStart(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const start = streamStartFromPayload(payload);
    for (const handler of this._onStreamStartHandlers) {
      try {
        await handler(start);
      } catch (err) {
        console.error("onStreamStart handler error:", err);
      }
    }
  }

  /** Handle stream_complete broadcasts. */
  private async _handleStreamComplete(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const complete = streamCompleteFromPayload(payload);
    for (const handler of this._onStreamCompleteHandlers) {
      try {
        await handler(complete);
      } catch (err) {
        console.error("onStreamComplete handler error:", err);
      }
    }
  }

  /** Handle stream_error broadcasts. */
  private async _handleStreamError(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const error = streamErrorFromPayload(payload);
    for (const handler of this._onStreamErrorHandlers) {
      try {
        await handler(error);
      } catch (err) {
        console.error("onStreamError handler error:", err);
      }
    }
  }
}
