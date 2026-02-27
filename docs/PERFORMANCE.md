# PERFORMANCE.md — Performance Benchmarks & Targets

> Updated when real-time or streaming code changes.
> Report p95 impacts for any changes to the hot path.

---

## Targets

| Metric | Target | Current | Notes |
|---|---|---|---|
| TTFT overhead (gateway + proxy) | < 200ms | Validated (V0 break-test) | Excludes LLM provider latency |
| Token-to-screen latency | < 50ms | Validated (V0 break-test) | Go Proxy → Redis → Gateway → WebSocket → Browser |
| WebSocket connect time | < 100ms | Validated (V0 break-test) | Including JWT validation |
| Message broadcast latency | < 20ms | Validated (V0 break-test) | Gateway receive → all clients receive |
| Max concurrent WebSocket connections | 10,000+ per Gateway | Not yet load tested | Per Elixir node |
| Max concurrent LLM streams | 1,000+ per Proxy | Not yet load tested | Per Go instance |
| Memory per WebSocket connection | < 50KB | Not measured | Elixir process overhead |
| Memory per LLM stream | < 1MB | Not measured | Goroutine + token buffer |

---

## V0 Validation Summary

Break-testing (TASK-0007) validated the streaming pipeline under normal conditions:
- Token streaming flows smoothly from LLM → Go → Redis → Elixir → Browser
- `requestAnimationFrame` batching prevents UI jank at high token rates
- Two-layer terminal convergence handles infrastructure failures (Redis kill, Web kill, Gateway restart)
- Reconnection sync delivers missed messages via sequence-based gap detection

Infrastructure failure scenarios (F-02, F-05, F-06) exposed and resolved terminal state convergence issues. See `docs/KNOWN-ISSUES.md` for details.

Formal load testing (concurrent connections, concurrent streams) is scheduled for V1.

---

## V1 Performance Considerations

### Multi-Stream
When multiple agents stream simultaneously in one channel:
- Each stream adds one `requestAnimationFrame` buffer entry (Map key per messageId)
- Token batching still caps at 60fps regardless of stream count
- Gateway fan-out multiplies per active stream per connected client
- Monitor: total tokens/sec across all active streams per channel

### gRPC/Protobuf Internal Comms (Planned)
Upgrading Go ↔ Elixir hot path from JSON to Protobuf:
- Expected reduction in serialization overhead (~3-5x smaller payloads)
- HTTP/2 multiplexing reduces connection overhead
- Measure: token-to-screen latency before/after upgrade

### Provider Transport Strategies
Different transports have different latency characteristics:
- HTTP SSE: one connection per stream, reconnection on failure
- WebSocket: multiplexed, persistent, lower overhead per-stream
- Measure: TTFT per provider/transport combination

---

## How to Measure

### Stress Test Harness
`scripts/stress-harness.ps1` — simulates concurrent message sending and streaming.
`scripts/regression-harness.ps1` — validates core flows haven't regressed.

### Load Testing (V1)
*TODO: Add k6 or artillery load test configuration for:*
- Concurrent WebSocket connections ramp-up
- Concurrent LLM stream throughput
- Message broadcast latency under load
- Memory usage per connection/stream

---

## Historical Results

| Date | Test | Result | Notes |
|------|------|--------|-------|
| 2026-02-26 | V0 break-test | Pass | All CRITICAL/HIGH issues resolved. Streaming pipeline validated. |
