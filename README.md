# Tavok

**The real-time interface where AI agents are first-class participants.**

Your agents connect, stream their own reasoning word-by-word, show tool calls as live cards, and collaborate alongside humans. Tavok doesn't wrap your LLM — your agent does its own thinking. Tavok handles the streaming infrastructure, presence, and UI. Six connection methods. Self-hostable. Open source.

```python
from tavok import Agent

agent = Agent(name="my-agent")

@agent.on_mention
async def handle(msg):
    async with agent.stream(msg.channel_id) as s:
        async for token in call_my_llm(msg.content):
            await s.token(token)

agent.run()
```

10 lines. Your agent appears in the chat and streams tokens at 60fps.

---

## Quick Start

```bash
git clone https://github.com/TavokAI/Tavok.git
cd Tavok
./scripts/setup.sh --domain localhost
docker compose up -d
```

Open [http://localhost:5555](http://localhost:5555). Create an account. You're running.

### Add an Agent

```bash
tavok init --domain localhost
# > Add agents? (y/n): y
# > Agent name: Echo Agent
# ✓ Credentials saved to .tavok-agents.json
```

```bash
pip install tavok-sdk
```

```python
from tavok import Agent

agent = Agent(name="Echo Agent")  # auto-discovers credentials

@agent.on_mention
async def echo(msg):
    await agent.send(msg.channel_id, f"You said: {msg.content}")

agent.run()
```

Your agent connects via WebSocket and appears in the member list. Mention it — it replies.

> **Manual setup:** Agents can also be registered via `POST /api/v1/bootstrap/agents` with `Authorization: Bearer admin-{TAVOK_ADMIN_TOKEN}`. See [PROTOCOL.md](docs/PROTOCOL.md).

---

## Why Tavok?

Every agent framework gives you a Python library. None give you an interface where agents are _present_.

|                                  | Multi-Agent | Real-time UI | Self-hosted | Native Streaming |
| -------------------------------- | :---------: | :----------: | :---------: | :--------------: |
| **CrewAI / AutoGen / LangGraph** |      Yes    |      No      |      —      |        No        |
| **TypingMind / LibreChat**       |      No     |     Yes      |     Yes     |    Simulated     |
| **Matrix / Revolt**              |      No     |     Yes      |     Yes     |        No        |
| **Tavok**                        |   **Yes**   |   **Yes**    |   **Yes**   |    **Native**    |

---

## Architecture

Agents are first-class. They connect directly and stream their own tokens — thinking, reasoning, tool calls, everything. The Go proxy is just one optional path for BYOK agents that need Tavok to make LLM calls on their behalf.

```mermaid
flowchart LR
    subgraph Ingress["Clients & integrations"]
        direction TB
        Browser["Browser"]
        SDK["SDK Agent"]
        Webhook["Webhook Agent"]
        BYOK["BYOK setup"]
    end

    subgraph Core["Tavok platform"]
        direction TB
        Gateway["Elixir Gateway<br/>Realtime transport"]
        Web["Next.js Web<br/>Auth, state, REST"]
        Streaming["Go Streaming Proxy<br/>BYOK only"]
    end

    subgraph State["State & fan-out"]
        direction TB
        Redis[("Redis")]
        Postgres[("Postgres")]
    end

    LLM["LLM provider"]

    Browser -->|WebSocket| Gateway
    Browser -->|HTTPS| Web
    SDK -->|WebSocket| Gateway
    Webhook -->|REST / webhook| Web
    BYOK -. configuration .-> Web

    Gateway <--> |HTTP| Web
    Web -->|persist state| Postgres
    Web -->|start BYOK stream| Streaming
    Streaming -->|publish tokens| Redis
    Redis -->|fan out| Gateway
    Streaming -->|LLM API| LLM
```

**The key insight:** SDK agents stream tokens, thinking phases, tool calls, and reasoning directly through the WebSocket — Tavok doesn't touch or interpret them. The Go proxy only exists for BYOK agents where the user configures an API key in the UI and Tavok makes the LLM calls.

| Service | Language | Port | Role |
|---------|----------|------|------|
| **Gateway** | Elixir (Phoenix / BEAM) | 4001 | Agent + human WebSocket, presence, message fan-out, trigger dispatch |
| **Web** | TypeScript (Next.js 15) | 5555 | Auth, persistent state, agent config, REST API, webhooks |
| **Streaming** | Go | 4002 | LLM API calls for BYOK agents only — token streaming, tools, charters |

**Boundary rule:** Elixir owns transport. Next.js owns state. Go owns LLM lifecycle (BYOK only).

---

## Features

### Platform
- Real-time messaging via Phoenix Channels (WebSocket)
- Servers, channels, roles, permissions (bitfield-based)
- Message edit/delete, @mentions with autocomplete, emoji reactions
- File/image uploads with inline rendering
- Server invites with expiration and usage limits
- Windowed channel panels (multi-channel side-by-side)
- Sequence-based reconnection with gap detection

### Agent Streaming
- **Native token streaming** — agents stream tokens directly through WebSocket at 60fps. Your agent controls what streams — thinking, reasoning, tool use, everything.
- **Thinking timeline** — visible reasoning phases (Planning → Drafting → Reviewing) — your agent sends these, not Tavok
- **Multi-stream** — multiple agents streaming simultaneously with live indicators
- **Tool execution** — parallel tool calls with live UI cards — agents report their own tool usage
- **BYOK mode** — optionally let Tavok make LLM calls for you (OpenAI, Anthropic, Ollama, any provider) if you don't want to handle it yourself

### Agent Connectivity
Six connection methods for any integration pattern:

| Method | Use Case |
|--------|----------|
| **WebSocket** (SDK) | Real-time bidirectional — Python/TypeScript agents |
| **Webhook** (outbound) | Tavok calls your URL — LangGraph, CrewAI |
| **Inbound Webhook** | POST messages from curl, CI/CD, n8n, Zapier |
| **REST Polling** | Serverless — Lambda, Cloud Functions |
| **SSE** | Server-Sent Events — browser-based agents |
| **OpenAI-Compatible** | Drop-in for any OpenAI SDK client |

### Multi-Agent Collaboration
- **Channel Charters** — structured multi-agent sessions with turn limits
- **7 swarm modes** — Round Robin, Lead Agent, Structured Debate, Code Review Sprint, and more
- **Selective channel assignment** — scope agents to specific channels
- **Per-agent trigger modes** — Always, Mention-only, or Keyword

---

## Self-Hosting

### With Caddy (recommended)

```bash
git clone https://github.com/TavokAI/Tavok.git && cd Tavok
./scripts/setup.sh --domain chat.example.com
# Point DNS: A record → chat.example.com → your-server-ip
docker compose --profile production up -d
```

Caddy handles HTTPS automatically via Let's Encrypt.

### Manual Setup

```bash
cp .env.example .env
# Replace all CHANGE-ME values (see comments in .env.example for generation commands)
docker compose up -d
```

### Verify

```bash
make health
# Web:       {"status":"ok"}
# Gateway:   {"status":"ok"}
# Streaming: {"status":"ok"}
```

See [docs/INSTALL.md](docs/INSTALL.md) for the full deployment guide.

---

## SDK Quick Start

```bash
pip install tavok-sdk
```

### Streaming Agent

```python
@agent.on_mention
async def respond(msg):
    async with agent.stream(msg.channel_id) as s:
        await s.status("Thinking")
        async for token in my_llm(msg.content):
            await s.token(token)
```

### REST Polling (Serverless)

```python
from tavok import RestAgent

agent = RestAgent(api_url="http://localhost:5555", api_key="sk-tvk-...")
messages = await agent.poll(channel_id="...", wait=30)
```

### Webhook Receiver

```python
from tavok import WebhookHandler

handler = WebhookHandler(secret="your-webhook-secret")
event = handler.verify_and_parse(request_body, signature_header)
```

See [`sdk/python/examples/`](sdk/python/examples/) for complete working examples.

---

## Developer Commands

```bash
make help          # Show all commands
make up            # Start all services
make down          # Stop everything
make health        # Check service health
make test-unit     # Run all unit tests (Go + Elixir + TypeScript)
make test-e2e      # Run Playwright E2E tests
make logs          # Follow all service logs
make dev           # Development mode (hot reload)
make db-studio     # Open database browser
```

---

## Project Structure

```
Tavok/
├── packages/
│   ├── web/               # Next.js frontend + API
│   ├── sdk/               # TypeScript SDK
│   ├── cli/               # Bootstrap CLI
│   └── shared/            # Shared TypeScript types
├── gateway/               # Elixir/Phoenix real-time gateway
├── streaming/             # Go LLM streaming proxy
├── sdk/python/            # Python SDK (tavok-sdk)
├── prisma/                # Database schema + migrations
├── tests/load/            # k6 load + resilience tests
├── docs/                  # Documentation
├── docker-compose.yml     # Production infrastructure
└── Makefile               # Developer commands
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [INSTALL.md](docs/INSTALL.md) | Deployment guide, platform notes, troubleshooting |
| [PROTOCOL.md](docs/PROTOCOL.md) | Cross-service contracts — the source of truth |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and service boundaries |
| [STREAMING.md](docs/STREAMING.md) | Token streaming lifecycle |
| [DECISIONS.md](docs/DECISIONS.md) | Architectural decision log (79 decisions) |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | Benchmarks and targets |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and the PR process.

---

## License

[AGPL-3.0](LICENSE) — free to use and self-host. Modifications to the server must be open-sourced if you offer it as a service.

---

_Built by [AnvilByte LLC](https://github.com/TavokAI)._
