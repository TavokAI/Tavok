/**
 * k6-typing-storm.js - Typing indicator fanout stress test for Tavok.
 *
 * This script authenticates once in setup() so the load stays focused on the
 * Gateway typing path instead of repeatedly redoing NextAuth during the storm.
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { setupLoadFixture } from "./lib/tavok-session.js";

const wsConnectDuration = new Trend("ws_connect_duration", true);
const typingEventsSent = new Counter("typing_events_sent");
const typingEventsReceived = new Counter("typing_events_received");
const wsConnectFailRate = new Rate("ws_connect_fail_rate");
const healthCheckPass = new Rate("health_check_pass");

const BASE_URL = __ENV.BASE_URL || "http://localhost:5555";
const WS_URL = __ENV.WS_URL || "ws://localhost:4001";
const CREDENTIALS = {
  email: __ENV.USER_EMAIL || "demo@tavok.ai",
  password: __ENV.USER_PASSWORD || "DemoPass123!",
};

const TYPING_INTERVAL_MS = 200;
const STORM_DURATION_S = 8;
const JOIN_WAIT_MS = 3000;

export const options = {
  stages: [
    { duration: "5s", target: 10 },
    { duration: "15s", target: 50 },
    { duration: "5s", target: 50 },
    { duration: "5s", target: 0 },
  ],
  thresholds: {
    ws_connect_fail_rate: ["rate<0.1"],
    health_check_pass: ["rate>0.9"],
  },
};

export function setup() {
  return setupLoadFixture({
    baseUrl: BASE_URL,
    credentials: CREDENTIALS,
    channelCount: 1,
  });
}

export default function (data) {
  if (!data.channelId) {
    sleep(1);
    return;
  }

  const channelTopic = "room:" + data.channelId;
  const wsUrl = WS_URL + "/socket/websocket?token=" + data.jwt + "&vsn=2.0.0";
  const connectStart = Date.now();
  let connectSuccess = false;
  let refCounter = 1;

  function nextRef() {
    return String(refCounter++);
  }

  ws.connect(wsUrl, {}, function (socket) {
    wsConnectDuration.add(Date.now() - connectStart);
    connectSuccess = true;
    wsConnectFailRate.add(0);
    let channelJoinRef = null;
    let joinStatus = null;

    socket.on("message", function (rawMsg) {
      try {
        const msg = JSON.parse(rawMsg);
        if (!Array.isArray(msg) || msg.length < 5) {
          return;
        }

        const [, msgRef, , event, payload] = msg;
        if (event === "phx_reply" && msgRef === channelJoinRef) {
          joinStatus = payload && payload.status ? payload.status : "error";
          return;
        }

        if (event === "user_typing") {
          typingEventsReceived.add(1);
        }
      } catch (error) {
        return;
      }
    });

    socket.on("error", function (error) {
      console.error("WebSocket error: " + error);
    });

    const joinRef = nextRef();
    channelJoinRef = joinRef;
    socket.send(JSON.stringify([null, joinRef, channelTopic, "phx_join", {}]));

    const joinStartedAt = Date.now();
    function afterJoin() {
      if (joinStatus === "ok") {
        const stormEnd = Date.now() + STORM_DURATION_S * 1000;
        let heartbeatCounter = 0;

        while (Date.now() < stormEnd) {
          const ref = nextRef();
          socket.send(JSON.stringify([channelJoinRef, ref, channelTopic, "typing", {}]));
          typingEventsSent.add(1);

          heartbeatCounter += 1;
          if (heartbeatCounter % 25 === 0) {
            const heartbeatRef = nextRef();
            socket.send(JSON.stringify([null, heartbeatRef, "phoenix", "heartbeat", {}]));
          }

          sleep(TYPING_INTERVAL_MS / 1000);
        }

        sleep(1);
        socket.close();
        return;
      }

      if (joinStatus !== null || Date.now() - joinStartedAt >= JOIN_WAIT_MS) {
        console.error("Channel join failed for " + channelTopic + " status=" + joinStatus);
        socket.close();
        return;
      }

      socket.setTimeout(afterJoin, 50);
    }

    socket.setTimeout(afterJoin, 50);
  });

  if (!connectSuccess) {
    wsConnectFailRate.add(1);
    console.error("WebSocket connection failed");
  }

  sleep(0.5);
  const healthRes = http.get(BASE_URL + "/api/auth/csrf", { timeout: "5s" });
  const healthy = check(healthRes, {
    "Server responsive after storm": function (response) {
      return response.status === 200;
    },
  });
  healthCheckPass.add(healthy ? 1 : 0);
  sleep(0.5);
}

export function teardown() {
  const healthRes = http.get(BASE_URL + "/api/auth/csrf", { timeout: "10s" });
  const ok = check(healthRes, {
    "Server responsive after full storm (teardown)": function (response) {
      return response.status === 200;
    },
  });

  if (!ok) {
    console.error(
      "CRITICAL: Server unresponsive after typing storm - check Gateway logs for OOM or process crashes"
    );
  }

  console.log(
    "Typing storm complete. Compare typing_events_sent and typing_events_received to confirm throttling."
  );
}
