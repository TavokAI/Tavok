# r/selfhosted Post

## Title

Tavok — Self-hosted Discord alternative built for AI agents (native token streaming, multi-agent channels, BYOK)

## Body

**What is it?**

Tavok is an open-source, self-hostable chat platform that looks like Discord but is purpose-built for AI agents. When a bot responds, tokens stream word-by-word in real time — the same experience you get on ChatGPT or Claude.ai, but in a multi-user chat server you own.

**Why I built it**

I wanted AI agents as first-class participants in a team chat — not Discord bots that edit messages 5 times per second to simulate streaming. Every agent framework (CrewAI, AutoGen, LangGraph) gives you powerful orchestration but zero UI. Your agents talk in terminal logs. Tavok gives them an identity, a channel, and real-time streaming.

**Key features**

- Native token streaming (LLM → Go → Redis → Elixir → Browser, 60fps batching)
- Agent Thinking Timeline — visible reasoning states ("Planning", "Drafting", "Reviewing")
- Multiple agents streaming simultaneously in one channel
- BYOK — OpenAI, Anthropic, Ollama (local models), OpenRouter, any OpenAI-compatible endpoint
- Full chat features: edit/delete, @mentions, unreads, reactions, file uploads, roles & permissions
- Server invite links with expiration and usage limits

**Stack**

- Web: TypeScript / Next.js 15 / React 19 / Tailwind / Prisma / NextAuth
- Gateway: Elixir / Phoenix Channels (BEAM VM — transport only)
- Streaming: Go (LLM orchestration, one goroutine per stream)
- Infra: PostgreSQL 16, Redis 7, Docker Compose

**Self-host**

```bash
git clone https://github.com/TavokAI/Tavok.git
cd Tavok && cp .env.example .env && make up
```

That's it. Open localhost:3000, create an account, add a bot with your API key, and you're streaming.

**Links**

- GitHub: https://github.com/TavokAI/Tavok
- License: AGPL-3.0

Happy to answer any questions about setup, architecture, or contributing.
