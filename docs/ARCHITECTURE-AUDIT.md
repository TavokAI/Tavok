# Tavok Architecture Audit & Upgrade Roadmap

## Assessment Summary

The current three-service architecture (Next.js / Elixir Phoenix / Go) is already 90% aerospace-grade. Three services, three languages each chosen for their strength, clear contracts via PROTOCOL.md. Most generic "rewrite to Rust/Go" advice doesn't apply — the hard architectural decisions are already made and made well.

Below are the genuine upgrades worth pursuing for **"built to last, fastest data flow, agnostic from everything."**

---

## Upgrades Worth Making

### 1. Internal Comms: JSON → Protobuf over gRPC

**Why:** Current services talk JSON over HTTP internally. Protocol Buffers serialize to compact binary, gRPC gives HTTP/2 multiplexing, and `.proto` files become machine-enforced contracts — PROTOCOL.md taken to its logical extreme.

**Where it matters most:** The hot path — Go proxy → Elixir Gateway → clients. Every microsecond saved on serialization is a microsecond faster to the user's screen.

**Effort:** Moderate. Elixir has solid gRPC libraries, Go has first-class support. Define `.proto` files (replace parts of PROTOCOL.md with enforceable schemas), then update internal communication layer in both services.

**Priority:** High — directly impacts "fastest data flow" goal.

---

### 2. MCP Hosting as a First-Class Capability

**Why:** This is the "agnostic from everything" play. Instead of building custom integrations for every tool or agent, Tavok becomes an MCP host. Any tool that speaks Model Context Protocol can connect — standardized mounting points like NATO rail instead of proprietary brackets.

**For the target audience (AI builders):** Killer differentiator. They bring their agents, tools, and workflows. Tavok orchestrates.

**Timing:** Phase 4 or 5. Design for it now by keeping Go proxy interfaces clean enough that MCP server hosting can slot in alongside provider abstraction.

**Priority:** Medium — plan now, build later.

---

### 3. Provider Abstraction with Transport Strategies (Phase 3)

**Why:** Don't just abstract the API format (OpenAI vs Anthropic payload shapes) — abstract the transport too. Some providers use HTTP SSE, OpenAI is pushing WebSocket, local models might use gRPC. Each provider gets a transport strategy interface in Go. The rest of the system doesn't care how tokens arrive.

**This is the "fastest data flow" play.** When a provider offers a faster transport, write a new strategy. No rewiring.

**Priority:** Critical — this is Phase 3 and the core differentiator.

---

### 4. Evaluate Vercel AI SDK for Client-Side Streaming

**Why:** Tactical, not architectural. Their `useChat` and streaming hooks are battle-tested for token-by-token rendering on Next.js. Handles reconnection, partial tokens, backpressure. If it saves hand-rolling SSE parsing, take the free win. If it constrains you, skip it.

**Priority:** Low — evaluate during Phase 3 frontend work.

---

## What NOT to Rewrite

| Component | Why It Stays |
|-----------|-------------|
| **Elixir/Phoenix (Gateway)** | Best technology on the planet for WebSocket/presence. BEAM VM was built for telecom switches needing 99.9999% uptime. Nothing else comes close for concurrent real-time connections. This IS the aerospace-grade choice. |
| **Go (Streaming Proxy)** | Right tool, right job. Fast, predictable, excellent for HTTP/2 and streaming workloads. |
| **PostgreSQL + Redis** | Boring, indestructible infrastructure choices. Exactly what you want. |
| **Next.js (Web)** | Most pragmatic choice for UI + API + auth. Keep it loosely coupled through clean contracts so the frontend is swappable if ever needed. |

---

## Priority Stack

Sequenced for "do it right, do it once":

1. **Finish v0 break-testing** — now
2. **Phase 3: Go proxy provider abstraction with transport strategies** — core differentiator
3. **Upgrade internal comms to gRPC/Protobuf** — fastest data flow
4. **MCP hosting** — agnostic from everything
5. **Vector storage / semantic memory** — when agents actually need recall

---

## External Advice Evaluated & Dismissed

| Suggestion | Verdict | Reason |
|-----------|---------|--------|
| Transition backend to Rust/Go | **Already done** | Go proxy exists. Elixir/BEAM is superior to both for the real-time workload. |
| Replace Socket.io | **N/A** | Not using Socket.io. Phoenix Channels on BEAM. |
| Implement LiteLLM | **Build, don't bolt** | Adding a 4th service in Python adds operational complexity. Go proxy IS the provider-agnostic layer. Study LiteLLM patterns as reference only. |
| XState for agent workflows | **Premature** | No multi-agent orchestration yet. Revisit when needed. |
| Redis + Vector DB | **Partially done** | Redis exists. Vector DB is Phase 5+ when agents need semantic recall. |
| MCP/ACP native routing | **MCP yes, ACP wait** | MCP is mature enough to plan for. ACP is too early-stage to bet on. |

---

*Generated: February 2026*
*Context: Pre-v1 architecture review*
