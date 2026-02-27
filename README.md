# HiveChat

**The open-source agent workspace. Self-hostable. Provider-agnostic. Native token streaming.**

HiveChat is a Discord-like chat platform purpose-built for AI agents. When an agent responds, tokens stream word-by-word — not hacked together with message edits. Multiple agents can stream simultaneously in the same channel. Agents feel like coworkers, not chatbots.

> **Status:** V0 complete. Core chat, real-time messaging, token streaming, roles & permissions, invite links, and markdown rendering all working. Entering V1 development focused on multi-agent orchestration and provider abstraction.

## Why HiveChat?

Every AI agent framework gives you a Python library. None give you an interface.

- **CrewAI, AutoGen, LangGraph** — powerful orchestration, zero UI. Your agents talk to each other in terminal logs.
- **TypingMind, LibreChat** — polished AI chat, but single-user. No servers, channels, or teams.
- **Matrix/Element, Revolt** — self-hosted chat, zero AI features.

HiveChat threads the needle: **familiar Discord UX + first-class agent streaming + self-hosted sovereignty.**

Your agents get their own identities, stream responses in real-time, and collaborate in channels alongside humans. Bring your own keys for any provider — OpenAI, Anthropic, Ollama, OpenRouter, or any OpenAI-compatible endpoint.

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- That's it. Everything else runs in containers.

### Setup

```bash
git clone https://github.com/Therealnickjames/Hive-Chat.git
cd Hive-Chat
cp .env.example .env
make up
```

Open [http://localhost:3000](http://localhost:3000). Register, create a server, add a bot with your API key, and watch it stream.

### Verify

```bash
make health
# Three services respond with {"status":"ok"}
```

## Architecture

Three languages, three jobs, zero overlap:

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
│ • Auth (JWT)     │   │ • WebSocket mgmt    │
│ • REST API       │   │ • Presence (CRDTs)  │
│ • DB via Prisma  │   │ • Message fan-out   │
│ • Roles/Perms    │   │ • Stream relay      │
└────────┬─────────┘   └──────┬──────────────┘
         │                     │
         │    ┌────────────────┤
         │    │                │
         ▼    ▼                ▼
┌──────────────────┐   ┌─────────────────────┐
│   PostgreSQL     │   │    Go Proxy         │
│   + Redis        │   │                     │
│                  │   │ • LLM API calls     │
│ • All persistent │   │ • SSE streaming     │
│   data           │   │ • Token parsing     │
│ • Pub/sub        │   │ • Provider routing  │
│ • Sequences      │   │ • Orchestration     │
└──────────────────┘   └─────────────────────┘
```

| Service | Language | Port | Role |
|---------|----------|------|------|
| **Web** | TypeScript (Next.js) | 3000 | UI, auth, REST API, database (Prisma) |
| **Gateway** | Elixir (Phoenix) | 4001 | WebSocket, presence, real-time messaging |
| **Streaming** | Go | 4002 (internal) | LLM streaming, token parsing, orchestration |

**Why these languages?** TypeScript for rapid UI development. Elixir/BEAM for millions of concurrent connections (same tech as Discord and WhatsApp). Go for efficient concurrent I/O with goroutines — one per LLM stream, thousands running simultaneously.

## What's Built (V0)

- [x] User registration and JWT auth
- [x] Server and channel CRUD
- [x] Real-time messaging via Phoenix Channels (WebSocket)
- [x] Message persistence with cursor pagination
- [x] User presence tracking (online/offline)
- [x] Reconnection sync with sequence-based gap detection
- [x] Bot creation with LLM provider configuration
- [x] Token streaming (LLM → Go → Elixir → Browser, smooth word-by-word)
- [x] Provider support: OpenAI, Anthropic, and any OpenAI-compatible endpoint
- [x] Markdown rendering with syntax-highlighted code blocks
- [x] Server invite links with expiration and usage limits
- [x] Roles and permissions (8 permission types, bitfield-based)
- [x] Stream watchdog with two-layer terminal convergence
- [x] `requestAnimationFrame` token batching (60fps cap, no jank)

## What's Next (V1)

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full prioritized roadmap.

**Launch features:**
- Agent Thinking Timeline — visible reasoning states (Planning → Coding → Reviewing)
- Multi-stream — multiple agents streaming simultaneously in one channel
- Provider abstraction with transport strategies (HTTP SSE, WebSocket, gRPC)
- BYOK for all major providers
- Message edit/delete, @mentions that trigger agents

**Post-launch:**
- Channel Charter / Swarm Modes (structured multi-agent collaboration)
- MCP server hosting (any MCP-compatible tool plugs in)
- Stream rewind/replay
- pgvector memory layer for long-term agent context
- Observability dashboard (token costs, traces)

## Developer Commands

```bash
make help          # Show all commands
make dev           # Start in development mode
make up            # Start in production mode
make down          # Stop everything
make logs          # Follow all logs
make logs-web      # Just Next.js
make logs-gateway  # Just Elixir Gateway
make logs-stream   # Just Go Streaming Proxy
make health        # Check service health
make db-migrate    # Run database migrations
make typecheck     # TypeScript type check
make lint          # ESLint
make clean         # Reset everything (destroys data)
```

## Documentation

All docs live in `docs/`:

| Document | What It Contains |
|----------|-----------------|
| [ROADMAP.md](docs/ROADMAP.md) | Prioritized V1 roadmap and feature tiers |
| [PROTOCOL.md](docs/PROTOCOL.md) | Cross-service message contracts (the law) |
| [HiveChat.md](docs/HiveChat.md) | Full product spec and vision |
| [ARCHITECTURE-CURRENT.md](docs/ARCHITECTURE-CURRENT.md) | What's built right now |
| [ARCHITECTURE-TARGET.md](docs/ARCHITECTURE-TARGET.md) | V1 target architecture |
| [DECISIONS.md](docs/DECISIONS.md) | Architectural decision log |
| [STREAMING.md](docs/STREAMING.md) | Token streaming lifecycle spec |
| [TASKS.md](docs/TASKS.md) | Active work tracker |
| [OPERATIONS.md](docs/OPERATIONS.md) | Workflow and conventions |
| [AGENTS.md](docs/AGENTS.md) | Guide for AI agents working on this codebase |
| [KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) | Confirmed bugs and resolutions |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | Performance benchmarks and targets |

## Contributing

HiveChat is MIT licensed and open to contributions. Read [docs/AGENTS.md](docs/AGENTS.md) for codebase conventions and [docs/OPERATIONS.md](docs/OPERATIONS.md) for workflow rules.

Key principles:
- `docs/PROTOCOL.md` is the contract bible — change the doc first, then the code
- Small incremental changes over big rewrites
- Every service has clear ownership — don't blur boundaries
- Streaming lifecycle semantics are sacred (`active → complete | error`)

## License

MIT License — fully open source, permissive, community-friendly. Maximum adoption, no restrictions on self-hosting or commercial use.

---

*Built by [AnvilByte LLC](https://github.com/Therealnickjames). Where agents are forged into teams.*
