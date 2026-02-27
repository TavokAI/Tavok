# ARCHITECTURE-TARGET.md — V1 Target Architecture

> This describes the full V1 architecture. Compare with `docs/ARCHITECTURE-CURRENT.md` to see the gap.
> For the prioritized build order, see `docs/ROADMAP.md`.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTS                           │
│              (Browser / PWA)                         │
└──────────┬──────────────────────┬───────────────────┘
           │ HTTPS                │ WebSocket
           ▼                     ▼
┌──────────────────┐   ┌─────────────────────┐
│   Next.js App    │   │   Elixir Gateway    │
│   (TypeScript)   │   │   (Phoenix/BEAM)    │
│                  │   │                     │
│ • Auth (JWT)     │   │ • WebSocket mgmt    │ ◄── TRANSPORT ONLY
│ • REST API       │   │ • Presence (CRDTs)  │     No orchestration logic
│ • DB via Prisma  │   │ • Message fan-out   │     No agent decisions
│ • Roles/Perms    │   │ • Stream relay      │
│ • Settings UI    │   │ • Watchdog          │
└────────┬─────────┘   └──────┬──────────────┘
         │                     │
         │        gRPC/Protobuf│ (upgrade from JSON)
         │    ┌────────────────┤
         │    │                │
         ▼    ▼                ▼
┌──────────────────┐   ┌─────────────────────┐
│   PostgreSQL     │   │    Go Proxy         │
│   + pgvector     │   │   (ORCHESTRATOR)    │
│   + Redis        │   │                     │
│                  │   │ • Orchestration      │ ◄── THE BRAIN
│ • All persistent │   │ • Provider routing   │     All agent decisions
│   data           │   │ • Transport strategies│    Swarm/charter logic
│ • Vector memory  │   │ • Tool execution     │     Checkpoint/resume
│ • Pub/sub        │   │ • MCP client         │
│ • Sequences      │   │ • Stream management  │
└──────────────────┘   └──────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              ┌──────────┐ ┌──────┐ ┌──────────┐
              │ OpenAI   │ │Anthr.│ │ Ollama/  │
              │ (SSE)    │ │(SSE) │ │ Local    │
              │ (WebSocket)│       │ │ (gRPC)   │
              └──────────┘ └──────┘ └──────────┘
                  Transport Strategies
```

### Key Architectural Boundary (DEC-0019)

**Go owns orchestration. Elixir owns transport.**

- **Go Proxy** decides: which agent runs next, charter rule evaluation, step sequencing, tool execution, retry logic, checkpoint/resume. It is the brain.
- **Elixir Gateway** moves: bytes, presence updates, typing indicators. It never makes an orchestration decision. It receives signals and relays data.

This prevents split-brain as multi-agent flows grow in complexity.

---

## V1 Feature Targets

### Must-Have (Launch)

- Agent Thinking Timeline — visible reasoning states pushed through WebSocket
- Multi-stream — multiple agents streaming simultaneously per channel
- Provider abstraction with transport strategies in Go
- Message edit/delete
- @Mentions with autocomplete (also triggers agents)
- BYOK for all major providers (OpenAI, Anthropic, Ollama, OpenRouter, Bedrock)

### Needed ASAP (Post-Launch)

- Channel Charter / Swarm Modes
- MCP server hosting (Go acts as MCP client for external tools)
- gRPC/Protobuf upgrade for Go ↔ Elixir internal comms
- Stream rewind/replay
- Agent checkpoints + resume
- Direct messages, file uploads, message search

### Paid Tier

- Observability dashboard (token costs, traces)
- Sandboxed code interpreter
- Agent template gallery
- pgvector semantic memory
- GitHub RAG sync
- Managed hosting

---

## Internal Communication (Target)

### Phase 1: JSON Schema contracts (V1 launch)
- Define cross-service contracts as JSON Schema (language-agnostic)
- Validate in TypeScript (ajv), Go (gojsonschema), Elixir (ex_json_schema)
- Store schemas in `packages/shared/schemas/`

### Phase 2: gRPC/Protobuf for hot path (post-launch)
- Define `.proto` files for Go ↔ Elixir token streaming path
- Keep JSON for Web ↔ Gateway (lower throughput, less critical)
- `.proto` files replace the corresponding PROTOCOL.md sections as machine-enforceable contracts

### Migration path
JSON Schema now → Protobuf on the hot path later → Full gRPC if load demands it.

---

## Provider Abstraction Layer (Go)

```
┌─────────────────────────────────┐
│         Provider Interface      │
│                                 │
│  Stream(config, messages) →     │
│    channel of TokenEvent        │
├─────────────────────────────────┤
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │ OpenAI   │  │ Anthropic│    │
│  │ Strategy │  │ Strategy │    │
│  │ (SSE)    │  │ (SSE)    │    │
│  └──────────┘  └──────────┘    │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │ Ollama   │  │ Bedrock  │    │
│  │ Strategy │  │ Strategy │    │
│  │ (SSE)    │  │ (HTTP)   │    │
│  └──────────┘  └──────────┘    │
│                                 │
│  ┌──────────┐                   │
│  │ OpenAI   │                   │
│  │ Realtime │                   │
│  │ (WebSocket)                  │
│  └──────────┘                   │
└─────────────────────────────────┘
```

Each provider abstraction has TWO concerns:
1. **API format** — how to structure the request payload (OpenAI format vs Anthropic format)
2. **Transport** — how tokens arrive (HTTP SSE, WebSocket, gRPC)

The rest of the system sees only `TokenEvent` — it never knows which provider or transport delivered it.

---

## Tool Interface (MCP-Compatible)

The Go proxy's tool interface follows MCP patterns from day one:

```json
// tools/list — enumerate available tools
{
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web",
      "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } }
    }
  ]
}

// tools/call — execute a tool
{
  "name": "web_search",
  "arguments": { "query": "Elixir vs Go for real-time" }
}
```

This makes MCP server hosting a natural extension — not a retrofit.

---

## Memory Architecture (Target)

```
┌─────────────────────────────────┐
│       Memory Interface          │
│  store(key, embedding, metadata)│
│  recall(query, k) → results     │
│  forget(key)                    │
├─────────────────────────────────┤
│                                 │
│  ┌──────────────┐               │
│  │   pgvector   │  ◄── Default  │
│  │  (Postgres)  │     One DB    │
│  └──────────────┘     One backup│
│                                 │
│  ┌──────────────┐               │
│  │   Qdrant     │  ◄── Optional │
│  │  (separate)  │     adapter   │
│  └──────────────┘               │
└─────────────────────────────────┘
```

Default: pgvector in existing PostgreSQL. Abstract interface allows swapping to Qdrant or Pinecone for paid tier without changing application code.

---

## What NOT to Build

See `docs/HiveChat.md` "What NOT To Build Yet" section, plus:

- LangChain/CrewAI as a dependency (we ARE the runtime)
- Python anywhere in the stack
- LiteLLM proxy (our Go proxy IS the provider-agnostic layer)
- Separate vector database for V1 (pgvector in Postgres)
- ACP protocol support (too early-stage, wait for adoption)
