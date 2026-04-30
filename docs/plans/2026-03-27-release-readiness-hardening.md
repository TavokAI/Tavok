# Release Readiness Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the stream lifecycle races and release-gate fragility that currently block a trustworthy production release.

**Architecture:** Replace the current eventual-consistency stream lifecycle with a durable-first contract: the state owner (Next.js + PostgreSQL) must commit `ACTIVE`, `COMPLETE`, and `ERROR` transitions before transport-layer events advertise those states. Unify all stream entry points behind one lifecycle service, move Gateway BYOK startup off the hot channel process, and harden the release scripts so release evidence comes from deterministic automation instead of shell-local environment quirks.

**Tech Stack:** Next.js 15, Prisma, PostgreSQL, Elixir/Phoenix/Redix, Go streaming proxy, Docker Compose, PowerShell, bash.

---

## Non-Negotiables

- Do **not** add sleeps, polling loops, or wider timeouts to hide K-004.
- Do **not** weaken regression assertions or special-case the harness.
- Do **not** rely on `StreamWatchdog` to satisfy the primary contract.
- Do **not** keep multiple stream lifecycle implementations after the refactor.
- Do **not** leave release scripts dependent on manually exported secrets.

### Task 1: Lock the Root Cause Into Failing Tests

**Files:**

- Modify: `gateway/test/tavok_gateway_web/channels/room_channel_test.exs`
- Modify: `packages/web/lib/__tests__/stream-finalization.test.ts`
- Modify: `packages/web/lib/__tests__/webhook-stream-route.test.ts`
- Modify: `streaming/internal/stream/manager_test.go`
- Inspect: `artifacts/release-regression-harness.log`

**Step 1: Add a failing Gateway test for BYOK start ordering**

Cover the current K-004 invariant directly: for the BYOK trigger path, `stream_start` must not be broadcast until the placeholder row exists durably with `type=STREAMING` and `streamingStatus=ACTIVE`.

Run: `mix test gateway/test/tavok_gateway_web/channels/room_channel_test.exs`

Expected: FAIL against the current `room_channel.ex` implementation because it broadcasts `stream_start` before persistence completes.

**Step 2: Add a failing web test for terminal ordering**

In `packages/web/lib/__tests__/stream-finalization.test.ts`, assert that terminal completion persists `streamingStatus=COMPLETE` before any `stream_complete` event is emitted.

Run: `npx vitest run packages/web/lib/__tests__/stream-finalization.test.ts`

Expected: FAIL because `finalizeStreamCompletion()` currently broadcasts before calling `updateMessage()`.

**Step 3: Add a failing webhook/dispatch contract test**

In `packages/web/lib/__tests__/webhook-stream-route.test.ts`, assert that completion/error paths reject terminal event emission if the durable state transition fails.

Run: `npx vitest run packages/web/lib/__tests__/webhook-stream-route.test.ts`

Expected: FAIL because the terminal helper currently emits before persistence.

**Step 4: Add a failing Go test for publish-after-finalize ordering**

In `streaming/internal/stream/manager_test.go`, assert that Redis completion/error status is published only after the Web finalization call succeeds.

Run: `go test ./internal/stream -run Test.*Finalize.* -count=1`

Expected: FAIL because `manager.go` currently publishes completion status before `FinalizeMessageFull()`.

**Step 5: Commit the red test baseline**

Commit: `test: codify durable stream lifecycle ordering`

### Task 2: Introduce a Single Durable Stream Lifecycle Service in Web

**Files:**

- Create: `packages/web/lib/stream-lifecycle.ts`
- Create: `packages/web/lib/__tests__/stream-lifecycle.test.ts`
- Create: `packages/web/app/api/internal/streams/start/route.ts`
- Create: `packages/web/app/api/internal/streams/[messageId]/complete/route.ts`
- Create: `packages/web/app/api/internal/streams/[messageId]/error/route.ts`
- Modify: `packages/web/lib/internal-api-client.ts`
- Modify: `packages/web/lib/route-handlers.ts`

**Step 1: Write failing service-level tests**

Cover:

- `startStream` creates the placeholder and updates `Channel.lastSequence` in one transaction
- duplicate `startStream` is idempotent
- `completeStream` only allows `ACTIVE -> COMPLETE`
- `failStream` only allows `ACTIVE -> ERROR`
- terminal transitions return the canonical persisted message payload

Run: `npx vitest run packages/web/lib/__tests__/stream-lifecycle.test.ts`

Expected: FAIL until the service exists.

**Step 2: Implement an explicit lifecycle module**

Create `packages/web/lib/stream-lifecycle.ts` with intent-specific methods:

- `startStreamPlaceholder(...)`
- `completeStream(...)`
- `failStream(...)`

Rules:

- all transitions are transactional
- invalid transitions return `409`
- terminal transitions are idempotent for the same final state
- generic `message` persistence helpers stop owning stream semantics

**Step 3: Expose internal lifecycle endpoints**

Add dedicated internal routes instead of reusing generic message create/update calls for stream commands. These routes should return the persisted row (or canonical summary) that callers can use to broadcast safely.

**Step 4: Update the shared internal client**

In `packages/web/lib/internal-api-client.ts`, replace ad hoc `persistMessage()` / `updateMessage()` stream usage with explicit stream lifecycle calls:

- `startStreamPlaceholder()`
- `completeStream()`
- `failStream()`

**Step 5: Run focused web verification**

Run:

- `npx vitest run packages/web/lib/__tests__/stream-lifecycle.test.ts`
- `npx vitest run packages/web/lib/__tests__/route-handlers.test.ts`

Expected: PASS.

**Step 6: Commit**

Commit: `feat: add durable stream lifecycle service`

### Task 3: Refactor Gateway BYOK Startup to Persist Before Broadcast

**Files:**

- Create: `gateway/lib/tavok_gateway/stream_orchestrator.ex`
- Modify: `gateway/lib/tavok_gateway_web/channels/room_channel.ex`
- Modify: `gateway/lib/tavok_gateway/web_client.ex`
- Modify: `gateway/lib/tavok_gateway/message_persistence.ex`
- Modify: `gateway/test/tavok_gateway_web/channels/room_channel_test.exs`

**Step 1: Write the failing orchestrator test**

Assert that BYOK startup executes in this order:

1. allocate `messageId` + sequence
2. persist `ACTIVE` placeholder via Web
3. broadcast `stream_start`
4. register watchdog
5. publish Redis stream request

Run: `mix test gateway/test/tavok_gateway_web/channels/room_channel_test.exs`

Expected: FAIL before refactor.

**Step 2: Move stream startup off the channel process**

Create `TavokGateway.StreamOrchestrator` to own BYOK startup. The channel process should acknowledge the user message quickly, then the orchestrator performs the lifecycle start transaction and only broadcasts on success.

**Step 3: Remove stream placeholders from async persistence**

`TavokGateway.MessagePersistence` should no longer be used for streaming placeholders. Keep it only for message types that are intentionally eventual-consistent, or narrow its public API so stream callers cannot use it accidentally.

**Step 4: Add WebClient support for lifecycle start**

In `gateway/lib/tavok_gateway/web_client.ex`, add a dedicated call for the new `POST /api/internal/streams/start` endpoint and return the persisted payload needed for `stream_start`.

**Step 5: Run Gateway verification**

Run:

- `mix test gateway/test/tavok_gateway_web/channels/room_channel_test.exs`
- `mix test gateway/test/tavok_gateway/stream_watchdog_test.exs`

Expected: PASS.

**Step 6: Commit**

Commit: `refactor: durable-first gateway stream startup`

### Task 4: Refactor All Terminal Paths to Commit Before Emitting Events

**Files:**

- Modify: `packages/web/lib/stream-finalization.ts`
- Modify: `packages/web/app/api/internal/agents/[agentId]/dispatch/route.ts`
- Modify: `packages/web/app/api/v1/webhooks/[token]/stream/route.ts`
- Modify: `packages/web/app/api/v1/webhooks/[token]/route.ts`
- Modify: `packages/web/app/api/v1/agents/[id]/messages/route.ts`
- Modify: `streaming/internal/config/loader.go`
- Modify: `streaming/internal/config/loader_test.go`
- Modify: `streaming/internal/stream/manager.go`
- Modify: `streaming/internal/stream/manager_test.go`
- Modify: `packages/web/lib/__tests__/stream-finalization.test.ts`
- Modify: `packages/web/lib/__tests__/webhook-stream-route.test.ts`

**Step 1: Replace the helper contract**

Refactor `finalizeStreamCompletion()` so it commits the durable transition first and emits the terminal event second. Create a sibling error helper with the same rule.

**Step 2: Update webhook and dispatch routes**

All webhook/SSE/dispatch codepaths must use the same shared helper and must not call `broadcastStreamComplete` / `broadcastStreamError` ahead of persistence.

**Step 3: Update the Go proxy**

In `streaming/internal/stream/manager.go`, move Redis status publication after successful Web finalization. If finalization fails after retries:

- do not publish a false `complete`
- log the failure with enough metadata for triage
- let the watchdog recover or emit a later synthetic terminal event

**Step 4: Make loader semantics explicit**

Update `streaming/internal/config/loader.go` so its API name and tests reflect that it performs the durable commit needed before terminal transport events.

**Step 5: Run focused terminal-path verification**

Run:

- `npx vitest run packages/web/lib/__tests__/stream-finalization.test.ts`
- `npx vitest run packages/web/lib/__tests__/webhook-stream-route.test.ts`
- `go test ./internal/config ./internal/stream -count=1`

Expected: PASS.

**Step 6: Commit**

Commit: `refactor: persist terminal stream state before emit`

### Task 5: Tighten Gateway Listener and Watchdog Semantics

**Files:**

- Modify: `gateway/lib/tavok_gateway/stream_listener.ex`
- Modify: `gateway/lib/tavok_gateway/stream_watchdog.ex`
- Modify: `gateway/test/tavok_gateway/stream_listener_test.exs`
- Modify: `gateway/test/tavok_gateway/stream_watchdog_test.exs`

**Step 1: Update listener assumptions**

Document and test that `stream_complete` / `stream_error` pubsub events now represent already-committed state, not best-effort forecasts.

**Step 2: Narrow watchdog responsibility**

Keep the watchdog as a missed-event recovery mechanism only. It should recover from absent terminal events, not compensate for the primary path intentionally emitting ahead of the database.

**Step 3: Add correlation logging**

Log transition timestamps and message IDs at:

- durable start commit
- `stream_start` broadcast
- durable terminal commit
- terminal broadcast

This is for future incident forensics, not just this bug.

**Step 4: Run Gateway stream tests**

Run:

- `mix test gateway/test/tavok_gateway/stream_listener_test.exs`
- `mix test gateway/test/tavok_gateway/stream_watchdog_test.exs`

Expected: PASS.

**Step 5: Commit**

Commit: `chore: align gateway listeners with committed stream state`

### Task 6: Harden Release Scripts and Environment Loading

**Files:**

- Create: `scripts/lib/load-env.sh`
- Create: `scripts/lib/load-env.ps1`
- Create: `scripts/test-release-scripts.sh`
- Modify: `scripts/db-migrate-test.sh`
- Modify: `scripts/regression-harness.ps1`
- Modify: `docs/RELEASE-GATE.md`

**Step 1: Write a failing script smoke test**

`scripts/test-release-scripts.sh` should prove:

- `.env` is loaded automatically
- required variables are validated with clear errors
- `db-migrate-test.sh` does not require the caller to export `POSTGRES_PASSWORD`

Run: `bash scripts/test-release-scripts.sh`

Expected: FAIL before the shared loader exists.

**Step 2: Centralize env loading**

Extract `.env` parsing and required-variable validation into `scripts/lib/load-env.sh` and `scripts/lib/load-env.ps1`. Stop duplicating env parsing logic across release scripts.

**Step 3: Adopt the shared loader**

Update `scripts/db-migrate-test.sh` and `scripts/regression-harness.ps1` to source/import the shared loader and fail fast with actionable diagnostics when required config is missing.

**Step 4: Run release-script verification**

Run:

- `bash scripts/test-release-scripts.sh`
- `bash scripts/db-migrate-test.sh`
- `powershell -ExecutionPolicy Bypass -File scripts/regression-harness.ps1`

Expected: PASS.

**Step 5: Commit**

Commit: `chore: harden release scripts and env loading`

### Task 7: Update Protocol and Architecture Docs, Then Re-run the Full Gate

**Files:**

- Modify: `docs/PROTOCOL.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/RELEASE-GATE.md`

**Step 1: Update the stream contract**

Revise the protocol sections that currently allow background placeholder persistence and broadcast-before-commit behavior. New contract:

- `stream_start` is emitted only after durable `ACTIVE`
- terminal events are emitted only after durable `COMPLETE` / `ERROR`
- watchdog is a recovery path, not the primary state propagation path

**Step 2: Record the architectural decision**

Add an ADR entry in `docs/DECISIONS.md` for durable-first stream lifecycle ordering and the new division of responsibility across Web, Gateway, and Go.

**Step 3: Re-run the release gate with fresh evidence**

Run:

- `bash scripts/test-hooks.sh`
- `cd packages/cli && npx vitest run && npx tsc --noEmit -p tsconfig.json`
- `cd packages/web && npx vitest run && npm run typecheck && npm run lint`
- `cd streaming && go test ./... -v -count=1 && go vet ./...`
- `cd gateway && mix format --check-formatted && mix test`
- `bash scripts/db-migrate-test.sh`
- `powershell -ExecutionPolicy Bypass -File scripts/regression-harness.ps1`
- `curl http://localhost:5555/api/health`
- `curl http://localhost:4001/api/health`
- `curl http://localhost:4002/health`

**Step 4: Run pre-release manual gates**

Before the release tag:

- `k6 run tests/load/k6-messaging.js`
- `k6 run tests/load/k6-typing-storm.js`
- `k6 run tests/load/k6-soak.js`
- `powershell -ExecutionPolicy Bypass -File scripts/stress-harness.ps1`

**Step 5: Commit**

Commit: `docs: update release contract and verification evidence`
