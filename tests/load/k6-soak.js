/**
 * k6-soak.js - Sustained Tavok messaging load for leak and degradation checks.
 *
 * Each VU gets a dedicated channel in a reusable load-test server so the soak
 * exercises real persistence and recovery paths without triggering the
 * intentional per-user-per-channel rate limiter.
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, fail } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { setupLoadFixture } from "./lib/tavok-session.js";

const msgLatency = new Trend("msg_delivery_latency", true);
const wsConnectTime = new Trend("ws_connect_time", true);
const errorRate = new Rate("error_rate");
const healthCheckFails = new Counter("health_check_fails");
const messagesSent = new Counter("messages_sent");

export const options = {
  stages: [
    { duration: "30s", target: 5 },
    { duration: "9m", target: 10 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    msg_delivery_latency: ["p(95)<2000"],
    ws_connect_time: ["p(95)<3000"],
    error_rate: ["rate<0.05"],
    health_check_fails: ["count<10"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:5555";
const WS_URL = __ENV.WS_URL || "ws://localhost:4001";
const GATEWAY_HEALTH_URL =
  __ENV.GATEWAY_HEALTH_URL || "http://localhost:4001/api/health";
const STREAMING_HEALTH_URL =
  __ENV.STREAMING_HEALTH_URL || "http://localhost:4002/health";
const INTERNAL_API_SECRET = __ENV.INTERNAL_API_SECRET || "";
const CREDENTIALS = {
  email: __ENV.USER_EMAIL || "demo@tavok.ai",
  password: __ENV.USER_PASSWORD || "DemoPass123!",
};

const MAX_VUS = 10;
const JOIN_WAIT_MS = 3000;
const DURABLE_WAIT_MS = 5000;

export function setup() {
  if (!INTERNAL_API_SECRET) {
    fail("INTERNAL_API_SECRET is required for durable soak verification");
  }

  return setupLoadFixture({
    baseUrl: BASE_URL,
    credentials: CREDENTIALS,
    channelCount: MAX_VUS,
  });
}

function healthCheck() {
  const checks = [
    http.get(BASE_URL + "/api/health"),
    http.get(GATEWAY_HEALTH_URL),
    http.get(STREAMING_HEALTH_URL),
  ];

  for (let i = 0; i < checks.length; i += 1) {
    if (checks[i].status !== 200) {
      healthCheckFails.add(1);
      return false;
    }
  }

  return true;
}

export default function (data) {
  const iteration = __ITER;
  const channelId = pickChannelId(data);

  if (iteration % 10 === 0) {
    healthCheck();
  }

  if (!channelId) {
    sleep(1);
    return;
  }

  const channelTopic = "room:" + channelId;
  const wsUrl = WS_URL + "/socket/websocket?token=" + data.jwt + "&vsn=2.0.0";
  const wsStart = Date.now();
  let connectSuccess = false;
  let refCounter = 1;
  let messageContent = "";
  let sendTime = 0;

  function nextRef() {
    return String(refCounter++);
  }

  const wsRes = ws.connect(wsUrl, {}, function (socket) {
    wsConnectTime.add(Date.now() - wsStart);
    connectSuccess = true;

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
        }
      } catch (error) {
        return;
      }
    });

    const joinRef = nextRef();
    const messageRef = nextRef();
    messageContent = "soak-test-" + __VU + "-" + iteration + "-" + channelId;

    channelJoinRef = joinRef;
    socket.send(JSON.stringify([null, joinRef, channelTopic, "phx_join", {}]));

    const joinStartedAt = Date.now();
    function afterJoin() {
      if (joinStatus === "ok") {
        sendTime = Date.now();
        socket.send(
          JSON.stringify([
            channelJoinRef,
            messageRef,
            channelTopic,
            "new_message",
            { content: messageContent },
          ])
        );
        messagesSent.add(1);

        sleep(1);
        socket.close();
        return;
      }

      if (joinStatus !== null || Date.now() - joinStartedAt >= JOIN_WAIT_MS) {
        socket.close();
        return;
      }

      socket.setTimeout(afterJoin, 50);
    }

    socket.setTimeout(afterJoin, 50);
  });

  check(wsRes, {
    "WebSocket connected": function (response) {
      return response && response.status === 101;
    },
  });

  const deliveryObserved =
    connectSuccess && waitForDurableMessage(channelId, messageContent, sendTime);
  errorRate.add(!deliveryObserved);
  sleep(1);
}

export function handleSummary(data) {
  const p95Latency = data.metrics.msg_delivery_latency
    ? data.metrics.msg_delivery_latency.values["p(95)"]
    : "N/A";
  const errRate = data.metrics.error_rate
    ? (data.metrics.error_rate.values.rate * 100).toFixed(1)
    : "N/A";
  const totalMsgs = data.metrics.messages_sent
    ? data.metrics.messages_sent.values.count
    : 0;
  const healthFailures = data.metrics.health_check_fails
    ? data.metrics.health_check_fails.values.count
    : 0;

  console.log("\n=== SOAK TEST SUMMARY ===");
  console.log("Duration: 10 minutes");
  console.log("Messages sent: " + totalMsgs);
  console.log("p95 delivery latency: " + p95Latency + "ms");
  console.log("Error rate: " + errRate + "%");
  console.log("Health check failures: " + healthFailures);
  console.log("========================\n");

  return {};
}

function pickChannelId(data) {
  const channelIds = data.channelIds || [];
  if (channelIds.length > 0) {
    return channelIds[(__VU - 1) % channelIds.length];
  }

  return data.channelId || null;
}

function waitForDurableMessage(channelId, messageContent, sendTime) {
  if (!messageContent) {
    return false;
  }

  const deadline = Date.now() + DURABLE_WAIT_MS;
  while (Date.now() < deadline) {
    const historyRes = http.get(
      BASE_URL + "/api/internal/messages?channelId=" + channelId + "&limit=100",
      {
        headers: { "x-internal-secret": INTERNAL_API_SECRET },
      }
    );

    if (historyRes.status === 200) {
      try {
        const body = JSON.parse(historyRes.body);
        const messages = body.messages || [];

        for (let i = 0; i < messages.length; i += 1) {
          if (messages[i].content === messageContent) {
            msgLatency.add(Date.now() - sendTime);
            return true;
          }
        }
      } catch (error) {
        return false;
      }
    } else {
      return false;
    }

    sleep(0.2);
  }

  return false;
}
