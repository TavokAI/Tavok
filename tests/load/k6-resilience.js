/**
 * k6 Resilience Test — Fault Injection Scenarios (L33)
 *
 * Tests Tavok's behavior under adverse conditions:
 * 1. Rapid reconnection after WebSocket disconnect
 * 2. Message delivery during service degradation
 * 3. Graceful error handling for invalid payloads
 * 4. Rate limit enforcement and recovery
 *
 * Usage:
 *   k6 run tests/load/k6-resilience.js
 *
 * Prerequisites:
 *   - Tavok services running (make up)
 *   - Test user exists (run integration harness first or make test-e2e)
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5555";
const WS_URL = __ENV.WS_URL || "ws://localhost:4001/socket/websocket";

// Custom metrics
const errorRecoveries = new Counter("error_recoveries");
const rateLimitHits = new Counter("rate_limit_hits");
const reconnectSuccess = new Rate("reconnect_success_rate");

export const options = {
  scenarios: {
    // Scenario 1: Rapid reconnection
    reconnect_storm: {
      executor: "per-vu-iterations",
      vus: 5,
      iterations: 3,
      exec: "reconnectStorm",
      startTime: "0s",
    },
    // Scenario 2: Invalid payload handling
    invalid_payloads: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 5,
      exec: "invalidPayloads",
      startTime: "10s",
    },
    // Scenario 3: Rate limit enforcement
    rate_limit_test: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      exec: "rateLimitEnforcement",
      startTime: "20s",
    },
  },
  thresholds: {
    reconnect_success_rate: ["rate>0.8"], // 80%+ reconnections should succeed
    http_req_failed: ["rate<0.5"], // Some failures expected in resilience tests
  },
};

// Scenario 1: Connect, disconnect, reconnect rapidly
export function reconnectStorm() {
  for (let i = 0; i < 3; i++) {
    const res = ws.connect(
      `${WS_URL}?vsn=2.0.0`,
      {},
      function (socket) {
        socket.on("open", () => {
          reconnectSuccess.add(true);
          socket.close();
        });
        socket.on("error", () => {
          reconnectSuccess.add(false);
        });
        socket.setTimeout(() => socket.close(), 2000);
      }
    );

    check(res, {
      "reconnect ws status 101": (r) => r && r.status === 101,
    });

    sleep(0.5); // Brief pause between reconnections
  }
}

// Scenario 2: Send malformed data, verify graceful handling
export function invalidPayloads() {
  // Test health endpoint with invalid methods
  const healthRes = http.del(`${BASE_URL}/api/health`);
  check(healthRes, {
    "invalid method returns 405 or similar": (r) =>
      r.status === 405 || r.status === 404 || r.status === 200,
  });

  // Test API with invalid JSON
  const invalidJson = http.post(`${BASE_URL}/api/servers`, "not-valid-json", {
    headers: { "Content-Type": "application/json" },
  });
  check(invalidJson, {
    "invalid JSON returns 4xx": (r) => r.status >= 400 && r.status < 500,
  });
  errorRecoveries.add(1);

  sleep(0.2);
}

// Scenario 3: Exceed rate limits, verify enforcement and recovery
export function rateLimitEnforcement() {
  // Hit login endpoint rapidly to trigger rate limiter
  const results = [];
  for (let i = 0; i < 25; i++) {
    const res = http.post(
      `${BASE_URL}/api/auth/callback/credentials`,
      JSON.stringify({ email: "test@test.com", password: "wrong" }),
      { headers: { "Content-Type": "application/json" } }
    );
    results.push(res.status);
    if (res.status === 429) {
      rateLimitHits.add(1);
      // Verify Retry-After header
      check(res, {
        "rate limit returns Retry-After": (r) =>
          r.headers["Retry-After"] !== undefined ||
          r.headers["retry-after"] !== undefined,
      });
      break; // Rate limit hit — test passed
    }
  }

  check(null, {
    "rate limiter engaged": () => results.includes(429),
  });

  // Wait for rate limit window to expire, then verify recovery
  sleep(5);
  const recoveryRes = http.get(`${BASE_URL}/api/health`);
  check(recoveryRes, {
    "service recovered after rate limit": (r) => r.status === 200,
  });
}
