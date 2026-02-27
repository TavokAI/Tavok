# ARCHITECTURE-CURRENT.md — As-Built Reality

> Updated after each structural change. If something conflicts with HiveChat.md, this document reflects what actually exists.

**Last updated**: 2026-02-27 (V0 complete)

---

## Current State

V0 is complete. All core chat, streaming, and collaboration features are implemented and break-tested. The platform supports real-time messaging, AI token streaming, roles & permissions, and server invites across the full three-service architecture.

### Services

| Service | Language | Port | Status |
|---------|----------|------|--------|
| Web (Next.js) | TypeScript | 3000 | Fully operational — auth, API, UI, database |
| Gateway (Phoenix) | Elixir | 4001 | Fully operational — WebSocket, presence, streaming relay, watchdog |
| Streaming Proxy | Go | 4002 (internal) | Fully operational — LLM streaming, provider routing, retry logic |
| PostgreSQL | - | 5432 | Running, all migrations applied |
| Redis | - | 6379 | Running — pub/sub, sequence counters |

### What Works

**Authentication & Users**
- User registration with email/password
- JWT-based auth (NextAuth v4, CredentialsProvider)
- JWT shared with Gateway for WebSocket auth (no round-trip)
- 24h token expiry with automatic refresh

**Servers & Channels**
- Server CRUD with owner management
- Channel CRUD within servers
- Channel-level default bot assignment

**Real-Time Messaging**
- Phoenix Channels WebSocket transport
- Persist-first message pipeline (Gateway → Web API → PostgreSQL → broadcast)
- Cursor pagination for message history
- Reconnection sync with sequence-based gap detection (Redis INCR)
- Typing indicators with 3s cooldown

**Presence**
- Phoenix.Presence with CRDTs for distributed tracking
- Online/offline status in member list
- Integrated into useChannel hook

**Token Streaming**
- Full streaming lifecycle: IDLE → ACTIVE → COMPLETE | ERROR
- Go proxy with SSE parsing for OpenAI, Anthropic, and OpenAI-compatible endpoints
- Token relay: LLM → Go → Redis pub/sub → Elixir Gateway → WebSocket → Browser
- `requestAnimationFrame` batching at 60fps on client
- Placeholder message created before first token (invariant enforced)
- Monotonic token indexing for ordering
- Stream watchdog with two-layer terminal convergence (DEC-0017, DEC-0018)
- Go proxy retry with exponential backoff on finalize failure (1s/2s/4s)
- Watchdog force-termination after 5 consecutive ACTIVE checks (~225s)

**Markdown**
- GFM support (lists, tables, task lists)
- Syntax-highlighted fenced code blocks with copy button
- Progressive rendering during streaming
- Image nodes suppressed (placeholder text)

**Invite Links**
- Invite generation with optional expiration and usage limits
- Invite resolution endpoint with metadata
- Join-via-invite flow with validation
- Error states for invalid/expired/exhausted invites

**Roles & Permissions**
- 8 permission types with bitfield-based validation
- Automatic @everyone role on server creation
- Granular API endpoint protection
- Role hierarchy with position-based ordering

**Infrastructure**
- `docker-compose up` starts all 5 containers
- Health checks on all three app services
- `make health` validation
- Structured JSON logging across all services
- AES-256-GCM encryption for bot API keys at rest
- Internal API authentication via shared secret

### What Doesn't Work Yet

- No message edit/delete
- No @mentions or autocomplete
- No DMs (direct messages)
- No file/image uploads
- No message search
- No unread indicators
- No notification system
- No multi-stream (only one bot per channel trigger at a time)
- No agent thinking/reasoning state visibility
- No provider abstraction beyond basic routing (no transport strategies)
- No gRPC between services (JSON over HTTP internally)
- No vector memory (pgvector not yet integrated)
- No MCP support

---

## Project Structure

```
Hive-Chat/
├── docs/                     # All documentation
├── packages/
│   ├── web/                  # Next.js frontend + API (TypeScript)
│   └── shared/               # Shared TypeScript types (message, user, server, channel, bot)
├── gateway/                  # Elixir/Phoenix real-time gateway
│   ├── lib/                  # Application code
│   │   ├── hive_gateway/     # Core modules (channels, presence, auth, watchdog)
│   │   └── hive_gateway_web/ # Phoenix endpoint, socket, channels
│   └── test/                 # ExUnit tests
├── streaming/                # Go LLM streaming proxy
│   ├── cmd/proxy/            # Entry point
│   └── internal/             # Provider routing, SSE parsing, Redis client, HTTP client
├── prisma/                   # Database schema and migrations
├── scripts/                  # Regression and stress test harnesses
├── docker-compose.yml        # Production infrastructure
├── docker-compose.dev.yml    # Development overrides
├── Makefile                  # Developer commands
└── .env.example              # Environment template
```

---

## Known Resolved Issues

11 break-test issues discovered and resolved during V0 hardening. See `docs/KNOWN-ISSUES.md` for full details. Key resolutions include:

- Bot FK constraint fixed for streaming placeholders (BREAK-0001)
- JWT expiry validation hardened (BREAK-0002)
- Two-layer terminal convergence for streaming reliability (BREAK-0009, 0010, 0011)
- Logger formatter crash resolved (BREAK-0007)
