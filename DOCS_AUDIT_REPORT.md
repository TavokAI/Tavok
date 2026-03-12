# Tavok Documentation Audit Report

**Date**: 2026-03-12
**Method**: Code-first audit — read all service implementations, then compared against every doc file.

---

## Executive Summary

Tavok's documentation is **well-structured and mostly accurate** for platform features, SDK quickstart, and Docker setup. However, there is a **systemic positioning mismatch**: the docs repeatedly claim "Go owns orchestration" and that the Elixir Gateway is "pure transport," but the code tells a different story. The Go proxy is a **stream lifecycle manager** (LLM API proxying, tool execution, token batching), not an agent orchestrator. Meanwhile, the Elixir Gateway contains **significant agent decision logic** (trigger evaluation, connection method dispatch, multi-agent routing) that the docs explicitly deny. Additionally, the Python SDK is **dramatically underdocumented** — roughly half its public API surface is missing from the README.

---

## Critical Fixes (Positioning)

These affect how developers understand what Tavok is and where to put new code.

### A1. README comparison table — "Orchestration: Yes"

- **File**: `README.md` line 123
- **What it says**: Tavok row shows `Orchestration: **Yes**` alongside CrewAI/AutoGen/LangGraph
- **What the code does**: Tavok does NOT orchestrate in the same sense as those frameworks. It has no task chains, workflow DAGs, agent-to-agent message routing, or pipeline coordination. The Go proxy manages LLM stream lifecycle (open SSE connection, batch tokens, execute tools, enforce charter turns). That's stream management, not agent orchestration.
- **Why it matters**: A developer comparing Tavok to LangGraph on "orchestration" will expect task routing, agent selection, and workflow graphs. They'll be confused when they find none of that.
- **Suggested fix**: Replace the "Orchestration" column with something accurate like "Agent Coordination" or "Multi-Agent" and change the Tavok value to "Charter/Swarm" or "Turn-based". Alternatively, rename it to "Stream Orchestration" and note that CrewAI/LangGraph do *task* orchestration while Tavok does *stream* orchestration.

### A2. ARCHITECTURE.md — Go proxy labeled "THE BRAIN" with "All agent decisions"

- **File**: `docs/ARCHITECTURE.md` lines 40-46
- **What it says**:
  ```
  │    Go Proxy         │
  │   (ORCHESTRATOR)    │
  │                     │
  │ • Orchestration      │ ◄── THE BRAIN
  │ • Provider routing   │     All agent decisions
  │ • Transport strategies│    Charter/swarm logic
  │ • Tool execution     │     Stream management
  │ • MCP client         │
  ```
- **What the code does**: The Go proxy receives a `StreamRequest` with a pre-selected `agentId` from Redis. It never decides which agent runs next — that decision is made in the Elixir Gateway (trigger evaluation) or Next.js (charter turn state). "All agent decisions" is false. "Transport strategies" doesn't exist in the code — the proxy has no transport strategy logic.
- **Suggested fix**:
  ```
  │    Go Proxy            │
  │   (STREAM MANAGER)     │
  │                        │
  │ • LLM API streaming    │ ◄── STREAM LIFECYCLE
  │ • Provider routing     │     Token management
  │ • Token batching       │     Tool execution loop
  │ • Tool execution       │     Charter turn enforcement
  │ • Charter enforcement  │
  ```

### A3. ARCHITECTURE.md — "Go Proxy decides: which agent runs next"

- **File**: `docs/ARCHITECTURE.md` line 61
- **What it says**: "Go Proxy decides: which agent runs next, charter rule evaluation, step sequencing, tool execution, retry logic."
- **What the code does**:
  - "which agent runs next" — **FALSE**. The Gateway evaluates trigger conditions (ALWAYS vs MENTION) per agent and dispatches to the appropriate connection method. The Go proxy only receives requests for a specific agent.
  - "step sequencing" — **FALSE**. No step sequencing code exists in the Go proxy. The only "sequence" is the tool execution loop (LLM → tool → LLM), which is a standard LLM tool-use pattern, not workflow step sequencing.
  - "retry logic" — **MISLEADING**. No retries on LLM API 4xx errors (explicitly documented in PROTOCOL.md). Retry only exists for the message finalization PUT to Next.js.
  - "charter rule evaluation" — **PARTIALLY TRUE**. Go enforces charter turn order, but the turn state is owned by Next.js (atomic PUT endpoint). Go calls Next.js to claim a turn; it doesn't evaluate rules independently.
  - "tool execution" — **TRUE**.
- **Suggested fix**: "Go Proxy manages: LLM stream lifecycle, provider routing, tool execution loops, charter turn enforcement (via Next.js), token batching and delivery."

### A4. ARCHITECTURE.md — Gateway claimed as "No orchestration logic / No agent decisions"

- **File**: `docs/ARCHITECTURE.md` lines 26-28
- **What it says**:
  ```
  │ • WebSocket mgmt    │ ◄── TRANSPORT ONLY
  │ • Presence (CRDTs)  │     No orchestration logic
  │ • Message fan-out   │     No agent decisions
  ```
- **What the code does**: The Gateway contains substantial agent decision logic:
  1. **Agent trigger evaluation** (`room_channel.ex` ~line 963-1018): Evaluates `triggerMode` (ALWAYS vs MENTION) for every agent in a channel
  2. **Connection method dispatch**: Routes to Go proxy (BYOK), webhook endpoint, REST poll queue, or no-op (WEBSOCKET SDK) based on `connectionMethod`
  3. **Multi-agent trigger evaluation**: Loads all agents for a channel and evaluates each independently
  4. **Context building for BYOK agents**: Fetches last 20 messages, filters by type, builds LLM context
  5. **Agent stream message creation**: Generates ULIDs, creates placeholder STREAMING messages
  6. **Charter delivery**: Sends charter text to agents on channel join
- **Suggested fix**: Remove "TRANSPORT ONLY / No orchestration logic / No agent decisions" annotations. Replace with: "TRANSPORT + DISPATCH — Agent trigger evaluation, connection routing, stream relay"

### A5. DECISIONS.md DEC-0019 — Overstated boundary

- **File**: `docs/DECISIONS.md` lines 259-264
- **What it says**: "Go Proxy is the orchestrator. All agent decision-making lives in Go: which agent runs next, charter rule evaluation, step sequencing, tool execution, retry logic, checkpoint/resume. Elixir Gateway is pure transport: WebSocket connections, presence, typing indicators, message fan-out. Elixir never makes an orchestration decision."
- **What the code does**: The actual boundary is: **Go owns LLM stream lifecycle. Elixir owns connection dispatch and real-time transport. Next.js owns state and turn arbitration.** Elixir makes agent trigger decisions per DEC-0043. "Step sequencing" and "which agent runs next" don't exist in Go.
- **Suggested fix**: Revise DEC-0019 to reflect the actual boundary, or add a DEC-0064 that clarifies the evolved reality. The decision log is append-only, so adding a correction entry may be more appropriate than editing the original.

### A6. README.md — "Agents do their own reasoning; Tavok handles the transport"

- **File**: `README.md` line 5
- **What it says**: "Agents do their own reasoning; Tavok handles the transport."
- **What the code does**: For BYOK agents, the Go proxy executes tools (current_time, web_search) on the agent's behalf. Tool execution is more than "transport." For SDK/Webhook agents, the statement is accurate — those agents do their own LLM calls and tool execution.
- **Suggested fix**: "Agents do their own reasoning; Tavok handles streaming and collaboration. For BYOK agents, Tavok also manages LLM calls and tool execution."

### A7. All "orchestration" mentions in service tables

These files describe the Go proxy's role as "orchestration" in port/service tables:

| File | Line | Text |
|------|------|------|
| `README.md` | 170 | "LLM streaming, token parsing, orchestration" |
| `README.md` | 172 | "Go owns orchestration. Elixir owns transport." |
| `README.md` | 433 | "Go owns orchestration. Elixir owns transport." |
| `docs/ARCHITECTURE.md` | 74 | "LLM streaming, provider routing, orchestration, tool execution" |
| `docs/INSTALL.md` | 57 | "LLM streaming, orchestration" |
| `docs/INSTALL.md` | 382 | "LLM streaming, orchestration (internal)" |
| `docs/PROTOCOL.md` | 1680 | "enforced by the Go orchestrator" |
| `CLAUDE.md` | 13 | "Go (orchestrator — LLM streaming, agent decisions, tool execution)" |
| `CLAUDE.md` | 19 | "Go owns orchestration. Elixir owns transport." |
| `CLAUDE.md` | 74 | "Go = orchestration. Elixir = transport." |
| `AGENTS.md` | 13 | "Go (orchestrator — LLM streaming, agent decisions, tool execution)" |
| `AGENTS.md` | 19 | "Go owns orchestration. Elixir owns transport." |
| `AGENTS.md` | 74 | "Go = orchestration. Elixir = transport." |

**Suggested fix**: Replace "orchestration" with "stream management" or "LLM streaming" in service descriptions. In CLAUDE.md/AGENTS.md, replace "orchestrator" with "stream manager" and remove "agent decisions" (Go doesn't make agent decisions).

---

## Stale/Inaccurate Content

### B1. ARCHITECTURE.md — "MCP client" claim

- **File**: `docs/ARCHITECTURE.md` line 46
- **What it says**: Go proxy has "MCP client"
- **What the code does**: The tool interface (`streaming/internal/tools/tool.go`) uses JSON Schema definitions that are *compatible with* MCP's format (the doc.go comment says "MCP-compatible tool definitions"), but there is no actual MCP protocol implementation — no MCP transport, no MCP server connections, no `tools/list` or `tools/call` RPC. It's a local tool registry with a `Tool` interface.
- **Suggested fix**: Replace "MCP client" with "Tool execution (MCP-compatible interface)" or just "Tool execution"

### B2. ARCHITECTURE.md — "Transport strategies" in Go proxy

- **File**: `docs/ARCHITECTURE.md` line 44
- **What it says**: Go proxy handles "Transport strategies"
- **What the code does**: No transport strategy logic exists in the Go proxy. Connection method dispatch (WEBSOCKET, WEBHOOK, REST_POLL, etc.) lives in the Elixir Gateway. The Go proxy only communicates via Redis pub/sub.
- **Suggested fix**: Remove "Transport strategies" from the Go proxy box. If referring to the connection method dispatch, move it to the Gateway description.

### B3. ARCHITECTURE.md — Feature list claims "MCP-compatible tool interface"

- **File**: `docs/ARCHITECTURE.md` line ~108
- **What it says**: "MCP-compatible tool interface" listed under shipped features
- **What the code does**: The interface *definition format* is MCP-compatible (JSON Schema), but this isn't an MCP integration — you can't connect MCP servers to it. This is accurate but potentially misleading to someone expecting MCP server support.
- **Suggested fix**: Clarify as "Tool execution with MCP-compatible schema format (not a full MCP client)"

### B4. README.md line 155 — Go proxy diagram label "(Orchestrator)"

- **File**: `README.md` line 155
- **What it says**: ASCII diagram labels Go proxy as `(Orchestrator)`
- **Suggested fix**: Replace with `(Stream Manager)` to match what the code does.

---

## Undocumented Features

### C1. Python SDK — Major undocumented surface area

The README documents roughly 50% of the SDK's public API. Missing from docs:

**Entire classes**:
- `RestAgent` — Full REST polling agent for serverless environments (Lambda, cron). Has `poll()`, `send()`, `start_stream()` methods.
- `RestStream` — REST-based streaming with `token()`, `thinking()`, `complete()`, `error()`.
- `WebhookHandler` — Webhook signature verification with `verify_signature()`, `parse()`, `verify_and_parse()`, `verify_and_parse_async()`.
- `WebhookEvent` dataclass with `type`, `channel_id`, `trigger_message`, `context_messages`, `callback_url`.

**StreamContext methods** (partially documented):
- `tool_result(call_id, result, error_msg, duration_ms)` — documented `tool_call()` but not `tool_result()`
- `artifact(title, content, artifact_type)` — structured artifact messages
- `finish(metadata={...})` — metadata parameter not documented

**Event handlers**:
- `@agent.on_stream_start` — fires when any agent starts streaming
- `@agent.on_stream_complete` — fires when stream finishes
- `@agent.on_stream_error` — fires on stream errors

**Utility functions**:
- `discover_credentials(name)` — load credentials from `.tavok-agents.json`
- `update_agent(base_url, agent_id, api_key, ...)` — update agent configuration
- `deregister_agent(base_url, agent_id, api_key)` — remove agent registration

**Features**:
- Reply-to support: `agent.stream(channel_id, reply_to=msg.id)`
- Long-polling: `agent.poll(channel_id, wait=30)` for REST agents
- SSE event stream: `/api/v1/agents/{id}/events` endpoint
- Credential auto-discovery from `.tavok-agents.json` and env vars

### C2. Go Proxy — Undocumented operational details

- **Token batching**: Max 10 tokens per batch, 50ms flush interval (affects streaming latency)
- **Concurrency cap**: Semaphore limits to 32 concurrent streams (default)
- **Thinking phase management**: Publishes "Thinking", "Writing", "Using tools" phase transitions
- **Token history with checkpoints**: Records token boundaries for stream rewind UI
- **Message finalization retry**: 3 retries with backoff for PUT to Next.js

### C3. Gateway — Undocumented endpoints and features

- `POST /api/internal/broadcast` — Allows Next.js to broadcast events to channels (used for webhook/SSE agent responses)
- `DELETE /api/cache` — Cache invalidation endpoint for testing
- **ETS-based configuration caching** — Agent configs and channel membership cached to avoid per-message HTTP calls
- **Stream watchdog** — Fallback recovery that emits synthetic terminal events if Redis pub/sub drops messages

### C4. Next.js — Agent API routes not fully documented

Several v1 agent API routes exist but aren't in the README SDK section:
- `PATCH /api/v1/agents/{id}` — Agent self-update (displayName, avatarUrl, capabilities, etc.)
- `DELETE /api/v1/agents/{id}` — Agent deregistration
- `GET /api/v1/agents/{id}/events` — SSE event stream
- `POST /api/internal/agents/{agentId}/dispatch` — Webhook dispatch
- `POST /api/internal/agents/{agentId}/enqueue` — REST poll queue

---

## Code Example Issues

### D1. README quickstart — Two setup paths, unclear which is primary

- **File**: `README.md` lines 39-46 and 104-110
- **Issue**: The quick start (line 39) uses `./scripts/setup.sh --domain localhost`, while the CLI section (line 106) shows `tavok init --domain chat.example.com`. Line 110 says "The recommended flow for most users is `./scripts/setup.sh`". Both paths exist, but a new user may be confused about which to use.
- **Suggested fix**: Pick one primary path for the quickstart and mention the other as an alternative.

### D2. README SDK examples — Accurate but incomplete

- **File**: `README.md` lines 216-250
- **Issue**: The documented examples (`Agent()`, `@on_mention`, `@on_message`, `send()`, `stream()`, `token()`, `status()`, `code()`, `tool_call()`) all match the actual SDK source. However, they only cover the WebSocket connection method. REST polling, webhook, and SSE patterns are completely absent.
- **Suggested fix**: Add at minimum a `RestAgent` example and a `WebhookHandler` example, since these represent different deployment patterns (serverless, external integrations).

### D3. Docker commands — Accurate

- `docker compose up -d`, `make up`, `make health`, etc. all verified as working. Port numbers (5555, 4001, 4002) are correct. Environment variables in INSTALL.md match what `setup.sh` generates.

---

## Recommended Changes

Prioritized from most impactful to least:

### Priority 1: Fix the positioning narrative

1. **Redefine the boundary accurately** across all files. The actual boundary is:
   - **Go**: LLM stream lifecycle (API calls, token batching, tool execution, charter turn enforcement)
   - **Elixir**: Real-time transport + agent trigger dispatch (WebSocket, presence, trigger evaluation, connection method routing)
   - **Next.js**: State, auth, API, turn arbitration

2. **Replace "orchestration/orchestrator"** with "stream management/stream manager" in all service descriptions (13 occurrences across 7 files listed in A7).

3. **Fix the comparison table** — Either rename the "Orchestration" column or change Tavok's value to accurately reflect what it does.

4. **Update CLAUDE.md and AGENTS.md** — These guide AI assistants working on the code. Inaccurate boundary descriptions here cause AI to put code in the wrong service.

### Priority 2: Fix inaccurate claims

5. **Remove "which agent runs next"** from Go proxy descriptions (ARCHITECTURE.md, DECISIONS.md).
6. **Remove "Transport strategies"** from Go proxy (ARCHITECTURE.md line 44).
7. **Change "MCP client" to "Tool execution"** (ARCHITECTURE.md line 46).
8. **Remove "No agent decisions"** from Gateway description (ARCHITECTURE.md line 28).
9. **Add DEC-0064** (or similar) acknowledging the evolved boundary — Gateway now has trigger dispatch logic per DEC-0043.

### Priority 3: Document undocumented features

10. **Add SDK documentation** for `RestAgent`, `WebhookHandler`, event handlers, utility functions. This is ~50% of the SDK surface area that's missing.
11. **Add operational parameters** for Go proxy (batch size, concurrency limit, retry behavior).
12. **Document Gateway internal endpoints** in PROTOCOL.md.

### Priority 4: Polish

13. **Unify quickstart path** — pick `setup.sh` or `tavok init` as the primary flow.
14. **Add connection method examples** to README — at least REST polling and webhook patterns.
