# HiveChat — AI-Native Self-Hostable Chat Platform

## What Is This

HiveChat is an open-source, self-hostable chat platform that looks and feels like Discord but is purpose-built for AI. The killer feature is native token streaming — when an AI agent responds in a channel, tokens flow in smoothly word-by-word like Claude.ai or ChatGPT, not hacked together with message edits hitting rate limits like every Discord bot.

Three types of people use HiveChat:

1. **AI builders** running agent pipelines who need a place to watch agents work, interact with them, and let agents ask humans for clarification. They're currently hacking together Discord bots or staring at terminal logs.

2. **Discord refugees** who want a self-hosted alternative after the ID verification fiasco and data breaches. They want familiar UI, channels, roles, and sovereignty over their data. The AI stuff is a bonus they discover later.

3. **Community builders** who want AI in their community — a coding bootcamp with an AI tutor, a company with an internal AI assistant, a creator community with an AI moderator. They want to plug in a bot and have it work.

All three groups need the same thing on day one: a chat interface that feels instantly familiar to any Discord user, with the moment of magic being when they see an AI agent streaming a response in real time.

HiveChat is the front-end interface for HiveDeck, an AI agent marketplace. Agents from HiveDeck will eventually be first-class participants that users can browse and install directly into their servers.

## Tech Stack

Three languages, three jobs, zero overlap.

### TypeScript (Next.js) — The Product Layer
- Next.js 14+ with App Router
- React with server and client components
- Tailwind CSS + shadcn/ui for the UI
- Prisma ORM for database operations
- NextAuth.js for authentication
- Zod for input validation
- pnpm as package manager with workspace support for the monorepo

### Elixir/Phoenix — The Real-Time Gateway
- Manages every WebSocket connection via Phoenix Channels
- Presence tracking with CRDTs (online/offline/away/DND)
- Typing indicators
- Message routing and fan-out to connected clients
- OTP supervision trees — if one connection crashes, only that process restarts, gateway never goes down
- Runs on the BEAM VM — the same technology Discord and WhatsApp use for exactly this purpose
- **Transport only** — relays data, tracks presence, never makes orchestration decisions (DEC-0019)

### Go — The LLM Streaming Proxy & Orchestrator
- Sits between AI agents and the Elixir gateway
- Opens SSE connections to LLM APIs (Claude, OpenAI, Ollama, OpenRouter, any OpenAI-compatible endpoint)
- Receives tokens from LLM providers
- Pushes tokens through to the Elixir gateway which fans them out to clients
- One goroutine per active stream, thousands running simultaneously, minimal memory
- Handles bot/agent configuration, system prompts, model selection
- **The orchestration brain** — owns all agent decision-making: which agent runs, charter evaluation, tool execution, checkpoint/resume (DEC-0019)
- Provider abstraction with transport strategies: each provider can use different transports (HTTP SSE, WebSocket, gRPC) behind a common interface (DEC-0024)

### Infrastructure
- PostgreSQL for persistent data
- Redis for pub/sub between services and caching
- Docker + docker-compose for self-hosting
- Caddy for automatic HTTPS (optional)

## Architecture

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
│ • Auth           │   │ • WebSocket mgmt    │
│ • REST API       │   │ • Presence (CRDTs)  │
│ • Server render  │   │ • Typing indicators │
│ • DB via Prisma  │   │ • Message fan-out   │
│                  │   │ • Session tracking  │
└────────┬─────────┘   └──────┬──────────────┘
         │                     │
         │    ┌────────────────┤
         │    │                │
         ▼    ▼                ▼
┌──────────────────┐   ┌─────────────────────┐
│   PostgreSQL     │   │    Go Proxy         │
│                  │   │   (Orchestrator)    │
│ • Users          │   │                     │
│ • Servers        │   │ • LLM API calls     │
│ • Channels       │   │ • SSE streaming     │
│ • Messages       │   │ • Token fan-out     │
│ • Bots           │   │ • Bot config        │
│ • Roles          │   │ • Rate limiting     │
└──────────────────┘   │ • Provider routing  │
                       │ • Orchestration     │
                       │ • Tool execution    │
                       └─────────────────────┘
```

### Message Flow — Standard Message
```
User types message in browser
→ WebSocket sends to Elixir Gateway
→ Gateway calls Next.js API to persist to PostgreSQL
→ Gateway broadcasts to all connected clients in that channel
→ Clients render the message
```

### Message Flow — AI Streaming Response
```
User sends message in channel with AI agent
→ WebSocket sends to Elixir Gateway
→ Gateway persists message via Next.js API
→ Gateway broadcasts user message to clients
→ Gateway notifies Go Proxy that an AI response is needed
→ Go Proxy reads bot config (model, system prompt, API key)
→ Go Proxy opens SSE stream to configured LLM API
→ Go Proxy receives tokens one by one
→ Go Proxy pushes each token to Elixir Gateway
→ Gateway fans out each token to all connected clients
→ Clients render tokens as they arrive (smooth streaming)
→ On completion, Go Proxy sends final message to Next.js API for persistence
```

## Data Models

### Core Models
```
User {
  id: uuid
  email: string (unique)
  username: string (unique)
  displayName: string
  avatarUrl: string?
  status: "online" | "offline" | "away" | "dnd"
  createdAt: timestamp
}

Server {
  id: uuid
  name: string
  iconUrl: string?
  ownerId: uuid → User
  createdAt: timestamp
}

Channel {
  id: uuid
  serverId: uuid → Server
  name: string
  topic: string?
  type: "text" | "announcement"
  position: int
  defaultBotId: uuid? → Bot (optional AI agent for this channel)
  createdAt: timestamp
}

Message {
  id: uuid
  channelId: uuid → Channel
  authorId: uuid → User or Bot
  content: string
  type: "standard" | "streaming" | "system"
  streamingStatus: "active" | "complete" | "error" | null
  createdAt: timestamp
  updatedAt: timestamp
}

Role {
  id: uuid
  serverId: uuid → Server
  name: string
  color: string?
  permissions: bigint
  position: int
}

Member {
  userId: uuid → User
  serverId: uuid → Server
  nickname: string?
  roleIds: uuid[] → Role
  joinedAt: timestamp
}
```

### AI/Bot Models
```
Bot {
  id: uuid
  name: string
  avatarUrl: string?
  serverId: uuid → Server
  llmProvider: string ("anthropic" | "openai" | "ollama" | "openrouter" | "custom")
  llmModel: string ("claude-sonnet-4-20250514" | "gpt-4" | "llama3" | etc.)
  apiEndpoint: string
  apiKey: string (encrypted at rest)
  systemPrompt: text
  temperature: float (default 0.7)
  maxTokens: int (default 4096)
  isActive: boolean
  triggerMode: "always" | "mention" | "keyword"
  createdAt: timestamp
}
```

## MVP Feature Set — Build In This Order

### Phase 1: Foundation
- Project structure with all three services
- Docker-compose that starts everything with one command
- PostgreSQL schema via Prisma migrations
- User registration and login (email/password)
- Basic Next.js app shell with Discord-like layout

### Phase 2: Core Chat
- Create and join servers
- Create text channels within servers
- Elixir gateway accepts WebSocket connections
- Real-time messaging through the gateway
- Message persistence to PostgreSQL
- Message history with scroll-back
- User presence (online/offline)

### Phase 3: Token Streaming (The Differentiator)
- Bot/agent account creation with LLM configuration
- Go proxy service with SSE streaming to LLM APIs
- New "streaming" message type
- Frontend renders tokens as they arrive with smooth animation
- Visual indicator for active vs complete streams
- Support for any OpenAI-compatible API endpoint
- Channel-level default bot assignment
- Mention-triggered bot responses

### Phase 4: Polish
- Server roles and basic permissions (Owner, Admin, Moderator, Member)
- @mentions and notifications
- Emoji reactions
- Markdown rendering with syntax-highlighted code blocks
- Member list sidebar
- Dark theme (default and only theme for MVP)
- File/image uploads (basic)
- Server invite links

### Phase 5: Self-Hosting Story
- Single `docker-compose up` deployment
- Comprehensive .env.example with every configuration option
- Caddy reverse proxy option for automatic HTTPS
- Clear README with setup instructions for non-technical users
- Data export/import
- Admin dashboard for instance management

## What NOT To Build Yet
- Voice channels or video calls
- Screen sharing
- End-to-end encryption
- Federation between instances
- Native mobile apps (responsive web is fine)
- Threads (channels only for MVP)
- Custom emoji or stickers
- Server discovery / public server listing
- HiveDeck marketplace integration (comes after the platform is stable)

## Project Structure
```
hivechat/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── README.md
├── CLAUDE.md
│
├── packages/
│   ├── web/                    # Next.js frontend + API (TypeScript)
│   │   ├── app/                # App router pages
│   │   │   ├── (auth)/         # Login, register
│   │   │   ├── (app)/          # Main app layout
│   │   │   │   ├── servers/
│   │   │   │   └── channels/
│   │   │   └── api/            # API routes
│   │   ├── components/
│   │   │   ├── chat/           # Message list, input, streaming message
│   │   │   ├── sidebar/        # Server list, channel list, member list
│   │   │   ├── modals/         # Create server, bot config, settings
│   │   │   └── ui/             # shadcn/ui base components
│   │   ├── lib/
│   │   │   ├── auth/           # NextAuth config
│   │   │   ├── db/             # Prisma client
│   │   │   ├── websocket/      # Client-side WS connection
│   │   │   └── utils/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                 # Shared TypeScript types
│       ├── types/
│       │   ├── message.ts
│       │   ├── user.ts
│       │   ├── server.ts
│       │   ├── channel.ts
│       │   └── bot.ts
│       └── package.json
│
├── gateway/                    # Elixir/Phoenix real-time gateway
│   ├── lib/
│   │   ├── hive_gateway/       # Core modules (channels, presence, auth, watchdog)
│   │   └── hive_gateway_web/   # Phoenix endpoint, socket, channels
│   ├── config/                 # Environment configs
│   ├── test/                   # ExUnit tests
│   ├── mix.exs                 # Dependencies
│   └── Dockerfile
│
├── streaming/                  # Go LLM streaming proxy
│   ├── cmd/
│   │   └── proxy/
│   │       └── main.go         # Entry point
│   ├── internal/
│   │   ├── provider/           # LLM provider implementations
│   │   │   ├── anthropic.go
│   │   │   ├── openai.go       # Works for OpenAI-compatible (Ollama, OpenRouter)
│   │   │   └── provider.go     # Provider interface
│   │   ├── stream/
│   │   │   ├── manager.go      # Manages active streams
│   │   │   └── handler.go      # SSE parsing and token extraction
│   │   ├── gateway/
│   │   │   └── client.go       # Communicates with Elixir gateway
│   │   └── config/
│   │       └── bot.go          # Bot configuration loading
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── prisma/
│   └── schema.prisma           # Database schema
│
└── scripts/
    ├── setup.sh                # First-time setup helper
    └── seed.sh                 # Seed database with demo data
```

## Communication Between Services

Services communicate over internal Docker network:

- **Next.js ↔ PostgreSQL**: Prisma (TCP port 5432)
- **Next.js ↔ Elixir Gateway**: HTTP internal API for message persistence callbacks (internal port 4000)
- **Elixir Gateway ↔ Clients**: WebSocket via Phoenix Channels (exposed port 4001)
- **Elixir Gateway ↔ Go Proxy**: gRPC or HTTP (internal port 4002)
- **Go Proxy ↔ LLM APIs**: HTTPS outbound
- **All services ↔ Redis**: pub/sub and caching (internal port 6379)

## Code Style and Conventions

### TypeScript
- Functional components with hooks, no class components
- Server components where appropriate in Next.js
- Prisma for all database operations
- Zod for all input validation
- Consistent error handling with typed error responses
- Use pnpm with workspace support for the monorepo

### Elixir
- Phoenix Channels for WebSocket handling with presence tracking
- Standard OTP patterns: GenServer, Supervisor, Application
- One process per WebSocket connection
- Phoenix.Presence with CRDTs for distributed presence
- Comprehensive supervision trees — let it crash philosophy

### Go
- Standard library where possible, minimal dependencies
- Interfaces for LLM providers (easy to add new ones)
- Context-based cancellation for streaming
- Structured logging with slog
- Graceful shutdown handling

### General
- Environment variables for ALL configuration
- Docker-first development workflow
- Every service has its own Dockerfile
- docker-compose.yml wires everything together
- README assumes the reader is non-technical

## Development Approach

I am not a programmer. I describe what I want in plain English. Please:

- Explain decisions before making them when there are meaningful tradeoffs
- Build incrementally — get something running, then improve
- Always make sure docker-compose up works after each major change
- Test as you go — don't build 500 lines then debug
- When something breaks, explain what went wrong simply
- Keep each service as small and focused as possible
- Write clear comments explaining WHY, not just WHAT
- Prioritize working software over perfect software

## Docker Compose Structure

The docker-compose.yml should define these services:
- **web**: Next.js app (exposed on port 3000)
- **gateway**: Elixir gateway (WebSocket exposed on port 4001)
- **streaming**: Go proxy (internal only)
- **db**: PostgreSQL 16
- **redis**: Redis 7
- **caddy**: Reverse proxy (optional, for production HTTPS)

All services on a shared internal Docker network. Only web (3000) and gateway (4001) exposed to the host. In production, Caddy sits in front and handles HTTPS for both.

## License

License: AGPL-3.0 — free to use, modify, and self-host. If you run a modified version as a service, you must publish your changes.

## Long-Term Vision

Phase 1: Ship V0 — A working self-hostable chat platform with native AI token streaming. ✅ COMPLETE.

Phase 2: Ship V1 — Agent Thinking Timeline, multi-stream, provider abstraction, MCP-compatible tools. The features that make this not-Discord.

Phase 3: Build the community. Open source launch (HN, r/selfhosted), contributors, iterate on feedback. Dev-first audience.

Phase 4: Monetization. Open Core model:
- **Free forever**: Chat platform, agent creation, streaming, basic swarms, self-hosting, BYOK
- **Pro tier**: Observability dashboard, code interpreter, agent template gallery, advanced RAG, voice rooms
- **Team/Enterprise**: Managed hosting, SSO, audit logs, priority support
- **Marketplace**: Agent templates and tools sold by community creators (15-20% cut)

Phase 5: HiveDeck integration. Users browse and install AI agents from the HiveDeck marketplace directly into their servers. Agents come pre-configured with system prompts, tools, and personalities.

The open-source platform is free forever. The ecosystem around it is the business.
