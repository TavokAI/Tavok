/**
 * Phoenix Channel V2 WebSocket client for Tavok.
 *
 * Speaks the Phoenix Channel V2 wire protocol — 5-element JSON arrays:
 *
 *     [joinRef, ref, topic, event, payload]
 *
 * Handles connection, heartbeat, channel join/leave, reconnection with
 * exponential backoff, and event routing.
 */

import WebSocket from "ws";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Phoenix heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 25_000;

/** Default reply timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Reconnect backoff: base delay (ms). */
const RECONNECT_BASE_MS = 1_000;

/** Reconnect backoff: maximum delay (ms). */
const RECONNECT_MAX_MS = 30_000;

/** Reconnect backoff: multiplicative factor. */
const RECONNECT_FACTOR = 2;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** A Phoenix V2 wire message: [joinRef, ref, topic, event, payload]. */
type PhoenixMessage = [
  string | null, // joinRef
  string,        // ref
  string,        // topic
  string,        // event
  Record<string, unknown>, // payload
];

/** Handler for channel events. */
type EventHandler = (
  topic: string,
  payload: Record<string, unknown>,
) => void | Promise<void>;

/** Pending reply tracker. */
interface PendingReply {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Info stored per joined channel for auto-rejoin. */
interface ChannelInfo {
  joinRef: string;
  payload: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// PhoenixSocket
// --------------------------------------------------------------------------

export class PhoenixSocket {
  private readonly _baseUrl: string;
  private readonly _params: Record<string, string>;

  private _ws: WebSocket | null = null;
  private _refCounter = 0;
  private _pendingReplies = new Map<string, PendingReply>();
  private _channels = new Map<string, ChannelInfo>();
  private _handlers = new Map<string, Set<EventHandler>>();

  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectDelay = RECONNECT_BASE_MS;
  private _closed = false;
  private _connected = false;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(url: string, params?: Record<string, string>) {
    this._baseUrl = url;
    this._params = { vsn: "2.0.0", ...params };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Whether the socket is currently connected. */
  get connected(): boolean {
    return (
      this._connected &&
      this._ws !== null &&
      this._ws.readyState === WebSocket.OPEN
    );
  }

  /**
   * Open the WebSocket connection.
   *
   * Resolves once the underlying socket is open and heartbeat is running.
   */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this._buildUrl();
      const ws = new WebSocket(url);

      ws.on("open", () => {
        this._ws = ws;
        this._connected = true;
        this._closed = false;
        this._reconnectDelay = RECONNECT_BASE_MS;
        this._startHeartbeat();
        resolve();
      });

      ws.on("message", (data: WebSocket.Data) => {
        this._handleMessage(data);
      });

      ws.on("close", () => {
        this._connected = false;
        this._stopHeartbeat();
        if (!this._closed) {
          this._scheduleReconnect();
        }
      });

      ws.on("error", (err: Error) => {
        // If we haven't connected yet, reject the connect() promise.
        if (!this._connected) {
          reject(err);
        }
      });
    });
  }

  /**
   * Gracefully close the WebSocket connection.
   *
   * Cancels heartbeat, reconnect timers, and rejects any pending replies.
   */
  disconnect(): Promise<void> {
    this._closed = true;
    this._connected = false;
    this._stopHeartbeat();

    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Reject all pending replies
    for (const [ref, pending] of this._pendingReplies) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Socket disconnected"));
      this._pendingReplies.delete(ref);
    }

    return new Promise<void>((resolve) => {
      if (this._ws) {
        const ws = this._ws;
        this._ws = null;

        // Resolve once the close event fires or immediately if already closed
        if (
          ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING
        ) {
          resolve();
        } else {
          ws.once("close", () => resolve());
          ws.close();
        }
      } else {
        resolve();
      }
    });
  }

  /**
   * Join a Phoenix channel.
   *
   * @param topic   Channel topic, e.g. `"room:01HXY..."`.
   * @param payload Optional join payload.
   * @param opts    Options — `timeout` in ms (default 10 000).
   * @returns       The join reply payload.
   * @throws        If the server rejects the join.
   */
  async join(
    topic: string,
    payload?: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<Record<string, unknown>> {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
    const ref = this._nextRef();
    const joinPayload = payload ?? {};
    const msg: PhoenixMessage = [null, ref, topic, "phx_join", joinPayload];

    const reply = await this._sendAndWait(msg, ref, timeout);

    const status = reply.status as string | undefined;
    if (status !== "ok") {
      const response = reply.response as Record<string, unknown> | undefined;
      const reason = (response?.reason as string) ?? "unknown";
      throw new Error(`Failed to join ${topic}: ${reason}`);
    }

    // Store channel for auto-rejoin on reconnect
    this._channels.set(topic, { joinRef: ref, payload: joinPayload });

    return reply;
  }

  /**
   * Leave a Phoenix channel.
   */
  async leave(topic: string): Promise<void> {
    if (!this._channels.has(topic)) return;

    try {
      await this.push(topic, "phx_leave");
    } catch {
      // Ignore errors during leave
    }
    this._channels.delete(topic);
  }

  /**
   * Send an event to a channel and wait for the reply.
   *
   * @param topic   Channel topic.
   * @param event   Event name.
   * @param payload Event payload.
   * @param opts    Options — `timeout` in ms (default 10 000).
   * @returns       The reply payload.
   */
  async push(
    topic: string,
    event: string,
    payload?: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<Record<string, unknown>> {
    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
    const ref = this._nextRef();
    const joinRef = this._channels.get(topic)?.joinRef ?? null;
    const msg: PhoenixMessage = [joinRef, ref, topic, event, payload ?? {}];

    return this._sendAndWait(msg, ref, timeout);
  }

  /**
   * Send an event without waiting for a reply.
   */
  async pushNoReply(
    topic: string,
    event: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const ref = this._nextRef();
    const joinRef = this._channels.get(topic)?.joinRef ?? null;
    const msg: PhoenixMessage = [joinRef, ref, topic, event, payload ?? {}];
    this._sendRaw(msg);
  }

  /**
   * Register a handler for a specific event.
   */
  on(event: string, handler: EventHandler): void {
    let handlers = this._handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this._handlers.set(event, handlers);
    }
    handlers.add(handler);
  }

  /**
   * Remove event handler(s). If no handler given, removes all for the event.
   */
  off(event: string, handler?: Function): void {
    if (!handler) {
      this._handlers.delete(event);
      return;
    }
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this._handlers.delete(event);
      }
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /** Build the full WebSocket URL with query params. */
  private _buildUrl(): string {
    const sep = this._baseUrl.includes("?") ? "&" : "?";
    const qs = Object.entries(this._params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${this._baseUrl}${sep}${qs}`;
  }

  /** Return the next monotonically increasing ref as a string. */
  private _nextRef(): string {
    this._refCounter += 1;
    return String(this._refCounter);
  }

  /** Send a raw Phoenix V2 message over the WebSocket. */
  private _sendRaw(msg: PhoenixMessage): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this._ws.send(JSON.stringify(msg));
  }

  /**
   * Send a message and wait for the correlated `phx_reply`.
   */
  private _sendAndWait(
    msg: PhoenixMessage,
    ref: string,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingReplies.delete(ref);
        reject(new Error(`Reply timeout for ref ${ref}`));
      }, timeout);

      this._pendingReplies.set(ref, { resolve, reject, timer });

      try {
        this._sendRaw(msg);
      } catch (err) {
        clearTimeout(timer);
        this._pendingReplies.delete(ref);
        reject(err);
      }
    });
  }

  /** Process an incoming WebSocket message. */
  private _handleMessage(data: WebSocket.Data): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return; // Non-JSON — ignore
    }

    if (!Array.isArray(parsed) || parsed.length < 5) {
      return; // Not a Phoenix V2 message
    }

    const [, ref, topic, event, payload] = parsed as [
      string | null,
      string | null,
      string,
      string,
      Record<string, unknown>,
    ];

    // Route replies to pending futures
    if (event === "phx_reply" && ref && this._pendingReplies.has(ref)) {
      const pending = this._pendingReplies.get(ref)!;
      this._pendingReplies.delete(ref);
      clearTimeout(pending.timer);
      pending.resolve(payload);
      return;
    }

    // Dispatch broadcast events to handlers
    this._dispatch(event, topic, payload);
  }

  /** Dispatch an event to registered handlers. */
  private _dispatch(
    event: string,
    topic: string,
    payload: Record<string, unknown>,
  ): void {
    const handlers = this._handlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        const result = handler(topic, payload);
        // If the handler returns a promise, catch unhandled rejections
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {
            // Swallow handler errors
          });
        }
      } catch {
        // Swallow handler errors
      }
    }
  }

  // ------------------------------------------------------------------
  // Heartbeat
  // ------------------------------------------------------------------

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this.connected) return;

      this.push("phoenix", "heartbeat").catch(() => {
        // Heartbeat failure — the close handler will trigger reconnect
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Prevent the timer from blocking Node process exit
    if (this._heartbeatTimer && typeof this._heartbeatTimer.unref === "function") {
      this._heartbeatTimer.unref();
    }
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Reconnection
  // ------------------------------------------------------------------

  private _scheduleReconnect(): void {
    if (this._closed) return;

    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(
      this._reconnectDelay * RECONNECT_FACTOR,
      RECONNECT_MAX_MS,
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._attemptReconnect();
    }, delay);

    // Prevent blocking Node exit
    if (this._reconnectTimer && typeof this._reconnectTimer.unref === "function") {
      this._reconnectTimer.unref();
    }
  }

  private _attemptReconnect(): void {
    if (this._closed) return;

    const url = this._buildUrl();
    const ws = new WebSocket(url);

    ws.on("open", () => {
      this._ws = ws;
      this._connected = true;
      this._reconnectDelay = RECONNECT_BASE_MS;
      this._startHeartbeat();

      // Rejoin all previously joined channels
      for (const [topic, info] of this._channels) {
        const ref = this._nextRef();
        const msg: PhoenixMessage = [null, ref, topic, "phx_join", info.payload];
        try {
          this._sendRaw(msg);
          // Update the joinRef
          info.joinRef = ref;
        } catch {
          // Will be retried on next reconnect
        }
      }
    });

    ws.on("message", (data: WebSocket.Data) => {
      this._handleMessage(data);
    });

    ws.on("close", () => {
      this._connected = false;
      this._stopHeartbeat();
      if (!this._closed) {
        this._scheduleReconnect();
      }
    });

    ws.on("error", () => {
      // Error during reconnect — the close event will schedule another attempt
    });
  }
}
