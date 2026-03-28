/**
 * k6-messaging.js - Durable messaging load gate for Tavok.
 *
 * The script provisions a dedicated load-test server fixture and fans VUs out
 * across one channel per VU so it measures real messaging behavior instead of
 * colliding with the intentional per-user-per-channel limiter.
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, fail } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { setupLoadFixture } from "./lib/tavok-session.js";

const httpReqDuration = new Trend("http_req_duration_custom", true);
const wsConnectDuration = new Trend("ws_connect_duration", true);
const msgDeliveryDuration = new Trend("msg_delivery_duration", true);
const messagesSent = new Counter("messages_sent");
const messagesAcked = new Counter("messages_acked");
const wsConnectFailRate = new Rate("ws_connect_fail_rate");
const msgDeliveryFailRate = new Rate("msg_delivery_fail_rate");

const BASE_URL = __ENV.BASE_URL || "http://localhost:5555";
const WS_URL = __ENV.WS_URL || "ws://localhost:4001";
const INTERNAL_API_SECRET = __ENV.INTERNAL_API_SECRET || "";

const CREDENTIALS = {
  email: __ENV.USER_EMAIL || "demo@tavok.ai",
  password: __ENV.USER_PASSWORD || "DemoPass123!",
};

const MAX_VUS = 20;
const CHANNEL_ROTATION_FACTOR = 5;
const FIXTURE_CHANNEL_COUNT = MAX_VUS * CHANNEL_ROTATION_FACTOR;
const MESSAGES_PER_VU = 5;
const MESSAGE_INTERVAL_MS = 500;
const JOIN_WAIT_MS = 3000;
const DURABLE_WAIT_MS = 5000;

export const options = {
  stages: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 20 },
    { duration: "10s", target: 20 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration_custom: ["p(95)<2000"],
    ws_connect_duration: ["p(95)<3000"],
    msg_delivery_duration: ["p(95)<1000"],
    ws_connect_fail_rate: ["rate<0.1"],
    msg_delivery_fail_rate: ["rate<0.01"],
  },
};

export function setup() {
  if (!INTERNAL_API_SECRET) {
    fail("INTERNAL_API_SECRET is required for durable messaging verification");
  }

  return setupLoadFixture({
    baseUrl: BASE_URL,
    credentials: CREDENTIALS,
    durationMetric: httpReqDuration,
    channelCount: FIXTURE_CHANNEL_COUNT,
  });
}

export default function (data) {
  const channelId = pickChannelId(data);
  if (!channelId) {
    sleep(1);
    return;
  }

  const channelTopic = "room:" + channelId;
  const wsUrl = WS_URL + "/socket/websocket?token=" + data.jwt + "&vsn=2.0.0";

  let refCounter = 1;
  function nextRef() {
    return String(refCounter++);
  }

  const connectStart = Date.now();
  let connectSuccess = false;

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
        }
      } catch (error) {
        return;
      }
    });

    socket.on("error", function (error) {
      console.error("WebSocket error: " + error);
    });

    channelJoinRef = nextRef();
    socket.send(JSON.stringify([null, channelJoinRef, channelTopic, "phx_join", {}]));

    const joinStartedAt = Date.now();
    function afterJoin() {
      if (joinStatus === "ok") {
        for (let i = 0; i < MESSAGES_PER_VU; i += 1) {
          const ref = nextRef();
          const content =
            "k6 load test message " +
            (i + 1) +
            " from VU " +
            __VU +
            " on channel " +
            channelId +
            " at " +
            new Date().toISOString();
          const sentAt = Date.now();

          socket.send(
            JSON.stringify([
              channelJoinRef,
              ref,
              channelTopic,
              "new_message",
              { content: content },
            ])
          );
          messagesSent.add(1);

          const durableObserved = waitForDurableMessage(channelId, content, sentAt);
          if (durableObserved) {
            messagesAcked.add(1);
          }
          msgDeliveryFailRate.add(durableObserved ? 0 : 1);

          sleep(MESSAGE_INTERVAL_MS / 1000);
        }

        socket.close();
        return;
      }

      if (joinStatus !== null || Date.now() - joinStartedAt >= JOIN_WAIT_MS) {
        msgDeliveryFailRate.add(1);
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

  sleep(1);
}

function pickChannelId(data) {
  const channelIds = data.channelIds || [];
  if (channelIds.length > 0) {
    const rotationIndex = ((__ITER * MAX_VUS) + (__VU - 1)) % channelIds.length;
    return channelIds[rotationIndex];
  }

  return data.channelId || null;
}

function waitForDurableMessage(channelId, messageContent, sentAt) {
  const deadline = Date.now() + DURABLE_WAIT_MS;

  while (Date.now() < deadline) {
    const historyRes = http.get(
      BASE_URL + "/api/internal/messages?channelId=" + channelId + "&limit=100",
      {
        headers: { "x-internal-secret": INTERNAL_API_SECRET },
      }
    );

    if (historyRes.status !== 200) {
      return false;
    }

    try {
      const body = JSON.parse(historyRes.body);
      const messages = body.messages || [];

      for (let i = 0; i < messages.length; i += 1) {
        if (messages[i].content === messageContent) {
          msgDeliveryDuration.add(Date.now() - sentAt);
          return true;
        }
      }
    } catch (error) {
      return false;
    }

    sleep(0.1);
  }

  return false;
}
