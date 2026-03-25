import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketServer, WebSocket as WsWebSocket } from "ws";
import { PhoenixSocket } from "../phoenix";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Find a free port by binding to 0 and closing. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = require("net").createServer();
    srv.listen(0, () => {
      const port = srv.address()!.port as number;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Small async delay. */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse an incoming Phoenix V2 message from the mock server.
 * Returns [joinRef, ref, topic, event, payload].
 */
function parseMsg(data: WsWebSocket.Data): [string | null, string, string, string, Record<string, unknown>] {
  return JSON.parse(String(data));
}

/**
 * Send a Phoenix V2 reply from the mock server.
 */
function sendReply(
  ws: WsWebSocket,
  joinRef: string | null,
  ref: string,
  topic: string,
  payload: Record<string, unknown>,
): void {
  ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", payload]));
}

/**
 * Send a broadcast event from the mock server.
 */
function sendBroadcast(
  ws: WsWebSocket,
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  ws.send(JSON.stringify([null, null, topic, event, payload]));
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("PhoenixSocket", () => {
  let wss: WebSocketServer;
  let port: number;
  let socket: PhoenixSocket;

  beforeEach(async () => {
    port = await getFreePort();
    wss = new WebSocketServer({ port });
  });

  afterEach(async () => {
    // Disconnect the client if still connected
    try {
      await socket?.disconnect();
    } catch {
      // ignore
    }

    // Close the mock server
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  // ------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------

  it("should connect and disconnect", async () => {
    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`, {
      api_key: "sk-test",
    });

    expect(socket.connected).toBe(false);
    await socket.connect();
    expect(socket.connected).toBe(true);

    await socket.disconnect();
    expect(socket.connected).toBe(false);
  });

  it("should construct URL with query params including vsn=2.0.0", async () => {
    let receivedUrl = "";
    wss.close();

    // Create a server that captures the upgrade request URL
    await new Promise<void>((resolve) => {
      wss = new WebSocketServer({ port });
      wss.on("connection", (_ws, req) => {
        receivedUrl = req.url ?? "";
      });
      wss.on("listening", resolve);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`, {
      api_key: "sk-abc",
    });

    await socket.connect();
    // Wait a tick for the server to receive the connection
    await delay(50);

    expect(receivedUrl).toContain("vsn=2.0.0");
    expect(receivedUrl).toContain("api_key=sk-abc");
  });

  // ------------------------------------------------------------------
  // V2 wire format
  // ------------------------------------------------------------------

  it("should encode messages as 5-element JSON arrays", async () => {
    const received: string[] = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        received.push(String(data));
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await socket.pushNoReply("room:123", "my_event", { text: "hello" });
    await delay(50);

    expect(received.length).toBe(1);
    const msg = JSON.parse(received[0]);
    expect(Array.isArray(msg)).toBe(true);
    expect(msg).toHaveLength(5);

    // [joinRef, ref, topic, event, payload]
    const [joinRef, ref, topic, event, payload] = msg;
    expect(joinRef).toBeNull(); // not joined yet
    expect(typeof ref).toBe("string");
    expect(topic).toBe("room:123");
    expect(event).toBe("my_event");
    expect(payload).toEqual({ text: "hello" });
  });

  it("should decode incoming 5-element JSON arrays", async () => {
    const events: Array<{ topic: string; payload: Record<string, unknown> }> = [];

    wss.on("connection", (ws) => {
      // Send a broadcast after a small delay
      setTimeout(() => {
        sendBroadcast(ws, "room:123", "new_msg", { body: "hi" });
      }, 50);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    socket.on("new_msg", (topic, payload) => {
      events.push({ topic, payload });
    });

    await socket.connect();
    await delay(150);

    expect(events).toHaveLength(1);
    expect(events[0].topic).toBe("room:123");
    expect(events[0].payload).toEqual({ body: "hi" });
  });

  // ------------------------------------------------------------------
  // Push with reply correlation
  // ------------------------------------------------------------------

  it("should correlate push replies by ref", async () => {
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [joinRef, ref, topic, event, payload] = parseMsg(data);
        if (event === "echo") {
          sendReply(ws, joinRef, ref, topic, {
            status: "ok",
            response: { echoed: payload },
          });
        }
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    const reply = await socket.push("room:123", "echo", { val: 42 });

    expect(reply.status).toBe("ok");
    expect(reply.response).toEqual({ echoed: { val: 42 } });
  });

  it("should timeout if no reply comes", async () => {
    wss.on("connection", () => {
      // Server never replies
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await expect(
      socket.push("room:123", "noop", {}, { timeout: 200 }),
    ).rejects.toThrow("Reply timeout");
  });

  // ------------------------------------------------------------------
  // pushNoReply
  // ------------------------------------------------------------------

  it("should send pushNoReply without waiting", async () => {
    const received: unknown[] = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        received.push(parseMsg(data));
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await socket.pushNoReply("room:abc", "fire_and_forget", { data: true });
    await delay(50);

    expect(received).toHaveLength(1);
    const [, , topic, event, payload] = received[0] as [
      string | null,
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(topic).toBe("room:abc");
    expect(event).toBe("fire_and_forget");
    expect(payload).toEqual({ data: true });
  });

  // ------------------------------------------------------------------
  // Join / Leave
  // ------------------------------------------------------------------

  it("should join a channel and store joinRef", async () => {
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [joinRef, ref, topic, event] = parseMsg(data);
        if (event === "phx_join") {
          sendReply(ws, joinRef, ref, topic, {
            status: "ok",
            response: {},
          });
        }
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    const reply = await socket.join("room:test", { user: "alice" });
    expect(reply.status).toBe("ok");

    // Subsequent pushes should include the joinRef
    const pushPromises: Promise<Record<string, unknown>>[] = [];
    const serverMessages: unknown[] = [];

    // Reconnect the handler to capture subsequent messages
    wss.clients.forEach((ws) => {
      ws.on("message", (data) => {
        const parsed = parseMsg(data);
        serverMessages.push(parsed);
        const [joinRef, ref, topic] = parsed;
        // Reply to any further push
        sendReply(ws, joinRef, ref, topic, { status: "ok", response: {} });
      });
    });

    await socket.push("room:test", "some_event", { x: 1 });
    await delay(50);

    // The joinRef field should be set (not null)
    const lastMsg = serverMessages[serverMessages.length - 1] as [
      string | null,
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(lastMsg[0]).not.toBeNull();
    expect(typeof lastMsg[0]).toBe("string");
  });

  it("should reject join when server returns error", async () => {
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [joinRef, ref, topic, event] = parseMsg(data);
        if (event === "phx_join") {
          sendReply(ws, joinRef, ref, topic, {
            status: "error",
            response: { reason: "unauthorized" },
          });
        }
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await expect(socket.join("room:secret")).rejects.toThrow("unauthorized");
  });

  it("should leave a channel", async () => {
    const events: string[] = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [joinRef, ref, topic, event] = parseMsg(data);
        events.push(event);
        // Reply ok to everything
        sendReply(ws, joinRef, ref, topic, {
          status: "ok",
          response: {},
        });
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await socket.join("room:temp");
    await socket.leave("room:temp");
    await delay(50);

    expect(events).toContain("phx_join");
    expect(events).toContain("phx_leave");
  });

  // ------------------------------------------------------------------
  // Heartbeat
  // ------------------------------------------------------------------

  it("should send heartbeats on the phoenix topic", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const heartbeats: unknown[] = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [joinRef, ref, topic, event] = parseMsg(data);
        if (event === "heartbeat" && topic === "phoenix") {
          heartbeats.push(parseMsg(data));
          sendReply(ws, joinRef, ref, topic, {
            status: "ok",
            response: {},
          });
        }
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    // Advance past one heartbeat interval
    await vi.advanceTimersByTimeAsync(26_000);
    await delay(100);

    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    const [, , topic, event] = heartbeats[0] as [
      string | null,
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(topic).toBe("phoenix");
    expect(event).toBe("heartbeat");

    vi.useRealTimers();
  });

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  it("should register and dispatch event handlers", async () => {
    const results: Array<{ topic: string; payload: Record<string, unknown> }> = [];

    wss.on("connection", (ws) => {
      setTimeout(() => {
        sendBroadcast(ws, "room:a", "my_event", { n: 1 });
        sendBroadcast(ws, "room:b", "my_event", { n: 2 });
        sendBroadcast(ws, "room:a", "other_event", { n: 3 });
      }, 50);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);

    socket.on("my_event", (topic, payload) => {
      results.push({ topic, payload });
    });

    await socket.connect();
    await delay(200);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ topic: "room:a", payload: { n: 1 } });
    expect(results[1]).toEqual({ topic: "room:b", payload: { n: 2 } });
  });

  it("should support multiple handlers for the same event", async () => {
    let count = 0;

    wss.on("connection", (ws) => {
      setTimeout(() => {
        sendBroadcast(ws, "room:x", "ping", {});
      }, 50);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);

    socket.on("ping", () => { count += 1; });
    socket.on("ping", () => { count += 10; });

    await socket.connect();
    await delay(150);

    expect(count).toBe(11);
  });

  it("should remove a specific handler with off()", async () => {
    const calls: string[] = [];

    const handlerA = () => { calls.push("A"); };
    const handlerB = () => { calls.push("B"); };

    wss.on("connection", (ws) => {
      setTimeout(() => {
        sendBroadcast(ws, "t", "ev", {});
      }, 50);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    socket.on("ev", handlerA);
    socket.on("ev", handlerB);
    socket.off("ev", handlerA);

    await socket.connect();
    await delay(150);

    expect(calls).toEqual(["B"]);
  });

  it("should remove all handlers for an event with off()", async () => {
    let called = false;

    wss.on("connection", (ws) => {
      setTimeout(() => {
        sendBroadcast(ws, "t", "ev", {});
      }, 50);
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    socket.on("ev", () => { called = true; });
    socket.off("ev");

    await socket.connect();
    await delay(150);

    expect(called).toBe(false);
  });

  // ------------------------------------------------------------------
  // Reconnection
  // ------------------------------------------------------------------

  it("should reconnect when the server closes the connection", async () => {
    let connectionCount = 0;

    wss.on("connection", (ws) => {
      connectionCount += 1;

      if (connectionCount === 1) {
        // Close the first connection after a short delay
        setTimeout(() => ws.close(), 100);
      }
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    expect(connectionCount).toBe(1);

    // Wait for reconnect (base delay is 1s + some buffer)
    await delay(2000);

    expect(connectionCount).toBeGreaterThanOrEqual(2);
    expect(socket.connected).toBe(true);
  });

  it("should not reconnect after explicit disconnect", async () => {
    let connectionCount = 0;

    wss.on("connection", () => {
      connectionCount += 1;
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();
    await socket.disconnect();

    await delay(2000);

    expect(connectionCount).toBe(1);
  });

  it("should rejoin channels on reconnect", async () => {
    let connectionCount = 0;
    const joinedTopics: string[] = [];

    wss.on("connection", (ws) => {
      connectionCount += 1;

      ws.on("message", (data) => {
        const [joinRef, ref, topic, event] = parseMsg(data);
        if (event === "phx_join") {
          joinedTopics.push(topic);
          sendReply(ws, joinRef, ref, topic, {
            status: "ok",
            response: {},
          });
        }
      });

      if (connectionCount === 1) {
        // Close first connection after client has joined
        setTimeout(() => ws.close(), 300);
      }
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await socket.join("room:persist");

    // Wait for reconnect and auto-rejoin
    await delay(2000);

    // Should have joined at least twice: initial + rejoin
    const roomJoins = joinedTopics.filter((t) => t === "room:persist");
    expect(roomJoins.length).toBeGreaterThanOrEqual(2);
  });

  // ------------------------------------------------------------------
  // Ref counter
  // ------------------------------------------------------------------

  it("should use monotonically increasing string refs", async () => {
    const refs: string[] = [];

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const [, ref] = parseMsg(data);
        refs.push(ref);
      });
    });

    socket = new PhoenixSocket(`ws://127.0.0.1:${port}/socket/websocket`);
    await socket.connect();

    await socket.pushNoReply("t", "a");
    await socket.pushNoReply("t", "b");
    await socket.pushNoReply("t", "c");
    await delay(50);

    expect(refs).toHaveLength(3);
    const nums = refs.map(Number);
    expect(nums[1]).toBeGreaterThan(nums[0]);
    expect(nums[2]).toBeGreaterThan(nums[1]);
  });
});
