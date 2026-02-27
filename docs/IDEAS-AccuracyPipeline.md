# IDEAS-AccuracyPipeline.md — Agent Quality & Accuracy Pipeline

> **Status:** FUTURE — Parked until after HiveChat Phase 3
> **Owner:** Nick / AnvilByte LLC
> **Principle:** Cheap filters first, expensive judgment last. Same as QC in a machine shop.
> **Runtime home:** HiveChat's Go proxy (token stream already flows through it) + Channel Charter system

---

## The Big Picture

Every idea here is a different kind of inspection at a different point in the agent pipeline:

| When | What | Idea | Cost |
|------|------|------|------|
| Before generation | Plant test signals | Canary Assertions | Near-free |
| During generation | Catch obvious errors live | Tiered Stream Monitor | Free → cheap |
| After generation | Multiple independent reviews | Adversarial Validation | Cheap → moderate |
| Over time in session | Catch slow spec drift | Drift Detection | Cheap |
| On every claim | Trace source of facts | Provenance Chains | Near-free |
| Across runs | Catch model/environment changes | Semantic Replay Testing | Moderate |
| Full task lifecycle | Two models converge on shared goal | Persistent Convergence Sessions | Moderate → high |

Together these form a complete quality pipeline from raw stock to finished part. None require each other — each is independently useful — but they compound.

---

## Idea 1: Tiered Real-Time Stream Monitor

**Origin:** Nick
**Analogy:** Eyeball the rough cut (free) → caliper check critical dims (cheap) → CMM inspect the finished part (expensive). You don't put the CMM on every rough cut.

### Concept

While an LLM agent generates code, a monitoring layer watches the token stream in real-time and can interrupt early when it detects problems.

### Architecture

```
Token stream flowing from generating agent
    │
    ▼
Layer 1: Parser / Regex (FREE, instant)
         Catches: wrong language, syntax class errors,
         total hallucination (Python in a TypeScript file)
    │
    ▼
Layer 2: Haiku / Local Ollama model (near-free, fast)
         Catches: pattern violations (PROTOCOL.md rules),
         anti-patterns (any types, var, missing error handling)
    │
    ▼
Layer 3: Let generation complete
    │
    ▼
Layer 4: Opus / Sonnet reviews complete output (expensive, thorough)
         Catches: logic errors, spec compliance, architecture fit
```

### Economics

- Layer 1: $0 — regex/parser
- Layer 2: Fractions of a penny per check (Haiku) or $0 (local Ollama)
- Layer 4: Normal review cost, but only runs on code that passed layers 1-2
- Net: catch 60-80% of bad generations early, save on wasted tokens and regeneration

### Key Insight

You don't need a big model to catch most errors. Wrong language is a regex. Pattern violations are small-model work. Only logical correctness needs a frontier model.

### Open Questions

- Batch size for Layer 2: every logical block (function/class boundary) rather than fixed line count
- Interrupt strategy: lean toward "pause stream + emit thinking state ('Issue detected at line 30') + let human decide continue/retry" rather than auto-kill
- Can Layer 2 run on every function completion with a local model fast enough?
- Does this compose with multiple generating agents or only 1:1?

---

## Idea 2: Adversarial Validation — Multi-Model Blind Consensus

**Origin:** Nick
**Analogy:** Five machinists from the same shop inspect the same part = same blind spots. Five different shops who learned different techniques = real validation.

### Concept

After an agent generates code, fan out the output to multiple *different* LLMs (Claude, Codex, Gemini) for independent blind review. Compare verdicts with a simple consensus protocol.

Different models have different training data, different architectures, different failure modes. If they all agree the code is good, confidence is high. If they disagree, something needs human eyes.

### Why This Isn't claude-flow

claude-flow orchestrates multiple Claude agents — different roles, same brain. Same biases, same blind spots. Adversarial validation uses *different* models. Different brains, different blind spots.

### Consensus Protocol (Three Rules)

```
All models agree       →  PASS   — gate clears, pipeline continues
Majority agrees        →  WARN   — gate clears, log the dissent, flag for human
No majority            →  STOP   — halt pipeline, notify human, show side-by-side
```

Three rules. No Byzantine fault tolerance, no Raft, no distributed systems paper.

### How It Works

```
Code generation complete
    │
    ▼
Fan out to N models (parallel, independent, blind)
    │
    ├── Claude:  "Looks correct, but error handling on line 42 is weak"
    ├── Codex:   "Looks correct, well structured"
    ├── Gemini:  "Line 42 will throw unhandled exception on null input"
    │
    ▼
Consensus engine compares verdicts (pure logic, NOT an LLM)
    │
    ├── 2/3 flag line 42 → WARN, pass with flag
    ├── If 2/3 said "reject" → STOP
    ├── If 3/3 said "pass" → PASS
    │
    ▼
Result feeds into pipeline gate
```

### Key Design Decisions

- **Blind review:** Models don't see each other's responses. Prevents anchoring bias.
- **Same prompt first:** Start with identical prompts for true blind comparison. Specialized prompts (security expert, correctness expert) is V2 — changes the consensus math.
- **Structured output:** Each model returns `{verdict, confidence, line_refs[], reasoning}` — automatable, diffable, loggable.
- **Consensus engine is pure logic, not an LLM.** Adding an LLM to judge the judges reintroduces the single-brain problem.
- **Model diversity matters:** Claude + Codex + Gemini > Claude + Claude + Claude.
- **Cost tier:** Use cheap models (Haiku, Flash) first. Only escalate to expensive if cheap ones disagree.

### Nick's Interest: Claude + Codex Side-by-Side

Specific variant worth exploring early: have Claude and Codex independently generate the same feature from the same spec, then diff the outputs. Not just review — actual parallel generation. Where they converge, high confidence. Where they diverge, that's where the interesting engineering decisions live. This is the "two shops make the same part, compare tolerances" approach.

Could manifest in HiveChat as: user sends a message in a multi-agent channel, Claude bot and Codex bot both generate simultaneously (multi-stream), then a lightweight comparison agent highlights the differences. Human picks the best parts of each or flags the disagreements.

### Economics

- 3 cheap models (Haiku/Flash tier): ~$0.001-0.003 per review
- Catches bugs a single model misses
- Cheaper than one expensive model doing deep review
- Way cheaper than shipping a bug to production

### HiveChat Integration

Each model's review posts as a message in a HiveChat channel. Human sees the reviewers disagree in real-time. Approves or rejects directly in chat. This IS a Channel Charter mode — "Code Review Sprint" with blind consensus enforced by the charter.

---

## Idea 3: Drift Detection — "The Part is Walking"

**Origin:** Strategy session
**Analogy:** Thermal drift moves your zero over time in machining. Same thing happens with LLM agents over long sessions.

### The Problem

By message 40 in a channel, an agent has drifted — hallucinating functions that don't exist, forgetting charter constraints, inventing APIs. Nobody catches it because each individual message looks reasonable in isolation.

### Concept

Periodically sample the agent's output and diff it against the original spec/charter/system prompt. Not every message — every Nth message or on every tool call. A cheap model (Haiku) answers one question: "Is this response still consistent with the original instructions?"

Binary yes/no with a quote of what drifted.

### Implementation Sketch

```
Every Nth agent message (or on every tool call):
    │
    ▼
Side-channel to cheap model (Haiku / local):
    Input: original charter + current message
    Prompt: "Is this response consistent with the charter? YES/NO + quote what drifted"
    │
    ├── YES → Thinking timeline shows "Drift check: ✅ on-spec"
    ├── NO  → Thinking timeline shows "⚠️ Drift: agent referencing function not in codebase"
    │        → Optionally pause generation, notify human
```

### Why This Should Be First After the Tiered Monitor

- Cheapest to implement (one Haiku call per N messages)
- Most immediately useful in HiveChat (long channel sessions are the norm)
- Plugs directly into Channel Charter — the charter IS the spec you're diffing against
- The Go proxy already has both the charter and the token stream

---

## Idea 4: Provenance Chains — "Show Me the Receipt"

**Origin:** Strategy session
**Analogy:** Traceability in manufacturing — every material has a cert, every dimension has a measurement record.

### The Problem

When an agent says "this function exists in utils.ts" or "the API returns 200 on success," there's no way to know if that came from the context window, from tool output, or from hallucination.

### Concept

Tag every factual claim with its source: `context_window`, `tool_result`, `training_knowledge`, or `unverified`. The agent emits structured annotations alongside its tokens.

### How It Surfaces

The X-Ray observability panel (TASK-0029) shows provenance on hover:
- 🟢 Green = tool-verified (came from a tool call result)
- 🟡 Yellow = context window (was in the conversation/charter)
- 🔴 Red = unverified (model generated from training data or hallucination)

Developers can filter a response to show *only* the unverified claims. That's the trust layer: "I trust the parts that came from my codebase. Show me what the model made up."

### Implementation Challenge

This requires either:
- Post-processing with a classifier that identifies claims and traces sources (more practical)
- Model-level annotation support (not yet standard, but moving that direction with citations)

Lean toward the post-processing approach for V1 of this feature.

---

## Idea 5: Canary Assertions — "Plant a Known Wrong Thing"

**Origin:** Strategy session
**Analogy:** Calibration checks. Before you measure a real part, you measure a known standard to verify the instrument is accurate.

### Concept

Before sending context to an agent, inject a small, deliberate falsehood. Something specific and verifiable: "The database port is 9999" when it's actually 5432.

Then check: does the agent repeat the canary?

- **Repeats 9999** → reading context faithfully (good for instruction following)
- **Says 5432** → ignoring context in favor of training data (dangerous for spec compliance)
- **Says something else** → hallucinating (worst case)

### Value

Per-request confidence score on how much the agent is actually following instructions vs. freestyling. Run on a small percentage of requests as a sampling check. Cheap, surprising amount of signal.

### Implementation

- Inject canary into system prompt or context (not visible to user)
- Check agent output for canary value
- Log result as metadata on the message
- Surface in X-Ray panel as "Context adherence: HIGH/MEDIUM/LOW"
- Don't run on every request — sampling (1 in 10, configurable) is enough

### Caution

The canary must be in a domain the model has strong training data on (like well-known ports) or the test doesn't mean anything. Pick canaries where the "real" answer is common knowledge to the model.

---

## Idea 6: Semantic Replay Testing — "Run the Same Job Twice"

**Origin:** Strategy session
**Analogy:** Running the same G-code twice and checking if the parts match. When they don't, something changed in your machine.

### Concept

Periodically re-run the same prompt + context through the same model and diff the outputs. Not character-diff — semantic diff. "Did it produce functionally equivalent code?"

### What It Catches

- Model updates (provider silently updated the model)
- Temperature/sampling issues
- Context window problems (same prompt, different context length = different behavior)
- Non-determinism in critical paths where you need consistency

### Implementation Sketch

```
Original request → save prompt + context + output (already happening via stream persistence)
    │
    ▼
Background job (async, not blocking):
    Replay same prompt + context → get new output
    │
    ▼
Semantic diff engine:
    - AST comparison for code
    - Key-point extraction for prose
    - Structured output comparison for data
    │
    ├── Functionally equivalent → log, no action
    ├── Minor differences → log for analysis
    ├── Major divergence → alert: "Model behavior changed"
```

### Cost

Moderate — you're paying for a full extra generation. Run on sampling basis (1 in 50 requests) or on-demand for critical workflows. The value is catching silent model changes before they corrupt a production pipeline.

---

## Idea 7: Persistent Convergence Sessions — "Two Machinists, One Bench"

**Origin:** Nick
**Analogy:** Two machinists standing at the same bench handing the part back and forth, rather than two machinists in separate rooms with a runner carrying the part between them.

### The Problem With Current Multi-Agent

Today, every LLM interaction is one turn at a time. Send a prompt, get a response, connection closes. If you want two models to collaborate, your orchestrator (the Go proxy) plays middleman — collect Claude's response, append it to history, send the whole thing to Codex, collect that, append, send back to Claude. Every "turn" is a separate API call with full context reconstruction. That's the runner carrying the part between rooms.

### Concept

Open a persistent session where two (or more) models are both connected to a shared context bus. The session stays open until the task resolves. Go proxy acts as session host, not relay — it enforces charter rules and exit criteria but doesn't reconstruct context on every turn.

### Architecture

```
Human defines task + exit criteria in channel charter
    │
    ▼
Go Proxy (session host)
    │
    ├── Persistent connection → Claude (held open)
    ├── Persistent connection → Codex (held open)
    ├── Shared context bus (both read/write)
    ├── Charter rules (turn management, guardrails)
    ├── Exit criteria evaluator
    │
    └── Stream everything → Redis → Elixir → HiveChat channel
         (users watch the collaboration live)
```

### Why Providers Won't Build This

A persistent bidirectional session means the provider holds compute allocated to you indefinitely — memory loaded, GPU reserved, connection open. Every open session is a resource they can't sell to someone else. The abuse potential is massive — open 10,000 sessions and never close them, or use persistent connections to probe model state in ways a stateless API prevents.

Stateless request-response is a **security boundary** as much as an architecture choice. Providers *want* to forget you between calls. That's by design.

**This is exactly why the orchestration layer that simulates persistent sessions is the valuable piece.** If providers won't build it, whoever builds the convincing simulation owns the capability. That's the Go proxy.

### How Go Simulates It

Current LLM APIs don't support true persistent bidirectional sessions. Even OpenAI's WebSocket API is still request-response per generation over a persistent transport. So Go simulates the open pipe:

1. Hold connections to both providers open (reuse WebSocket where available, keep-alive HTTP otherwise)
2. Maintain the shared context bus in memory (append-only conversation state)
3. When Model A finishes a turn, immediately inject its output into Model B's next request
4. Minimize per-turn overhead: no full context reconstruction, incremental appends only
5. Fast enough relay that it *feels* like a live conversation to the models and the user

The models don't know they're in a session. Go makes it feel that way.

### Turn Management Options

| Mode | How It Works | Best For |
|------|-------------|----------|
| Strict alternating | A talks, B talks, A talks | Structured debate, code review |
| Lead + responder | A drives, B responds when addressed | Lead Agent charter mode |
| Yield-based | One talks until it yields (emits a handoff token) | Collaborative building |
| True parallel | Both generate simultaneously, merge strategy resolves conflicts | Diverge-then-converge tasks |

The Channel Charter's mode presets map directly to these.

### Exit Criteria (Layered)

"Close when finished" is the hardest part. Who decides finished? All four, as layers:

1. **Self-declaration:** One model says "done" and the other agrees (consensus)
2. **Goal convergence:** Cosine similarity between current output and charter goal exceeds threshold
3. **Third-party judge:** Cheap model (Haiku) evaluates "has the goal been met?" (adversarial pattern)
4. **Hard limits:** Max turns, max tokens, max time, max cost — always enforced as safety net

### Connection to A2A Protocol

Google's Agent2Agent protocol has structured task lifecycles (submitted → working → completed) and Agent Cards for capability discovery. This persistent session pattern is the **runtime** for that protocol. HiveChat wouldn't just visualize agent collaboration — it would be the infrastructure that makes A2A-style task delegation actually work.

### What Makes This Different From Existing Orchestrators

- **LangGraph / CrewAI:** Orchestrate same-provider agents with framework-specific state management. Tied to Python. No visualization.
- **This:** Cross-provider (Claude + Codex), infrastructure-level (Go, not Python), with live visualization in HiveChat channels. The orchestration IS the product, not a library hidden behind an API.

### Open Questions

- What's the latency floor for turn injection? If it takes 500ms between Model A finishing and Model B starting, does it feel conversational or sluggish?
- Can incremental context appends work, or do some providers require full conversation history on every call? (Anthropic currently requires full history)
- How do you handle provider-specific context window limits when the shared bus grows large? Summarization checkpoints?
- Should the session be replayable? (Yes — stream persistence + rewind already handles this)
- Cost modeling: a 20-turn session between two frontier models is ~$0.50-2.00. Acceptable for high-value tasks, needs cost guardrails for casual use.

---

## How These Compose

```
                    BEFORE          DURING         AFTER           OVER TIME       FULL TASK
                    ──────          ──────         ─────           ─────────       ─────────
                    Canary          Tiered         Adversarial     Drift           Persistent
                    Assertions      Stream         Validation      Detection       Convergence
                                    Monitor                                        Sessions
                                                   Provenance      Semantic
                                                   Chains          Replay

    Cost:           Near-free       Free→Cheap     Cheap→Mod       Cheap→Mod       Mod→High
    Blocks gen:     No              Can pause      Post-gen        Async           IS the gen
    Needs:          Go proxy        Go proxy       Multi-provider  Go proxy +      Go session
                                    + regex/       + charter       charter         host + multi-
                                    local model    system                          provider
```

All run through the Go proxy. All surface through HiveChat's thinking timeline and X-Ray panel. All are independently useful but compound into a full quality pipeline.

---

## Relationship to HiveChat Features

| Idea | HiveChat Feature It Plugs Into |
|------|-------------------------------|
| Tiered Stream Monitor | Go proxy middleware on token stream |
| Adversarial Validation | Channel Charter "Code Review Sprint" mode with multi-provider bots |
| Drift Detection | Charter compliance checking, thinking timeline |
| Provenance Chains | X-Ray observability panel (TASK-0029) |
| Canary Assertions | Go proxy pre-processing, X-Ray metadata |
| Semantic Replay | Stream persistence + background jobs |
| Persistent Convergence Sessions | Channel Charter + multi-stream + Go session host |

---

## Relationship to Other Future Projects

- **Dev Orchestrator (docs/FUTURE/orchestrator.md):** These ideas ARE pipeline gates in that system
- **ForgeLoop:** If built standalone, these become the quality layer

---

## Priority Order (When We Get Here)

1. **Tiered Stream Monitor** — highest ROI, cheapest, most immediate value
2. **Drift Detection** — cheapest to add, directly uses existing charter system
3. **Adversarial Validation (Claude + Codex variant)** — Nick's highest interest, strong differentiator
4. **Canary Assertions** — easy to implement, surprising signal
5. **Provenance Chains** — depends on X-Ray panel existing first
6. **Persistent Convergence Sessions** — depends on multi-stream + charter + provider abstraction all working first. The capstone feature.
7. **Semantic Replay** — most expensive, best for production/enterprise tier

---

*"You don't put the CMM on every rough cut."*
*"Five different shops, five different techniques, compare the parts."*
*"Providers won't build persistent sessions — that's why whoever simulates it owns the capability."*
