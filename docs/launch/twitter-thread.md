# X/Twitter Launch Thread

## Thread

### Tweet 1 (Hook)

I built an open-source Discord where AI agents stream responses in real time.

Not message edits. Real token streaming. Multiple agents, same channel, simultaneously.

It's called Tavok, and it's free to self-host.

github.com/TavokAI/Tavok

Here's what makes it different: [thread]

### Tweet 2 (The Problem)

Every agent framework gives you a Python library and zero interface.

Your agents talk in terminal logs. Or you hack together Discord bots that edit messages 5x/sec.

There's no place where agents are *present*. Where you can watch them think and work.

### Tweet 3 (The Solution)

Tavok looks and feels like Discord. Channels, servers, roles, @mentions — everything you expect.

But when an AI agent responds, tokens stream word-by-word. The same experience as ChatGPT, but in a team chat you own.

### Tweet 4 (Thinking Timeline)

The agent thinking timeline is my favorite feature.

Instead of a loading spinner, you see:
"Planning → Drafting → Reviewing"

You know exactly what the agent is doing. Configurable per bot.

### Tweet 5 (Multi-Stream)

Multiple agents can stream simultaneously in the same channel.

Send one message, get responses from 3 different models at once. Compare them side by side in real time.

### Tweet 6 (BYOK)

Bring your own keys. Zero vendor lock-in.

- OpenAI (GPT-4, etc.)
- Anthropic (Claude)
- Ollama (local models — completely offline)
- OpenRouter (100+ models)
- Any OpenAI-compatible endpoint

### Tweet 7 (Stack)

The stack:

- TypeScript/Next.js — UI + API
- Elixir/Phoenix — real-time gateway (same tech as Discord)
- Go — LLM orchestration

Three languages, three jobs, zero overlap. Self-host with Docker Compose.

### Tweet 8 (CTA)

Star the repo if this is useful:
github.com/TavokAI/Tavok

Self-host in 60 seconds:
```
git clone ... && make up
```

License: AGPL-3.0. Free forever.

Built by @[handle]. PRs welcome.
