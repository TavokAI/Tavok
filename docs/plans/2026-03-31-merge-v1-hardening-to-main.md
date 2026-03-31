# V1 Hardening Main Merge Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Safely land the completed hardening sprint from `feature/v1-hardening` onto `main` after clearing the current GitHub Actions failures and re-verifying the release gates.

**Architecture:** This is a merge-gate session, not a feature-build session. The last fully verified hardening code tip was `130b426`, while `main` was `2db15ae` and a direct ancestor of the feature branch at handoff time, so the desired landing is still a fast-forward merge once CI is green. Any new code changes should stay narrowly scoped to CI blockers only.

**Tech Stack:** Git, GitHub CLI, GitHub Actions, PowerShell, pnpm, Docker Compose, Next.js, Prisma, Go, Elixir/Phoenix.

---

## Current State

- Current feature branch: `feature/v1-hardening`
- Last verified hardening code tip: `130b426 fix(auth): trust localhost and update regression harness`
- Current main tip: `2db15ae Merge pull request #25 from TavokAI/codex/manual-release-gate-hardening`
- Compare count captured at handoff from `git rev-list --left-right --count main...feature/v1-hardening`: `0 22`
- `main` is currently **not protected** on GitHub
- `main` is a direct ancestor of `feature/v1-hardening`, so `git merge --ff-only feature/v1-hardening` should work once the branch is ready
- `make` is **not** installed in this environment; use direct `pnpm`, `go`, `mix`, Docker, and PowerShell commands instead
- Leave the unrelated untracked file `docs/plans/2026-03-27-release-readiness-hardening.md` alone unless the user explicitly asks about it

## Current CI Status

Latest push workflows for `feature/v1-hardening`:

- `23817985359` `CI - Unit Tests`: **failed**
- `23817985367` `Integration - Regression Harness`: **failed**

Known failure details from GitHub Actions:

- `23817985359` failed in `pnpm --filter web format:check`
- Prettier reported formatting drift in these files:
  - `packages/web/app/api/servers/[serverId]/channels/route.ts`
  - `packages/web/app/api/servers/route.ts`
  - `packages/web/app/api/v1/bootstrap/agents/route.ts`
  - `packages/web/auth.config.ts`
  - `packages/web/components/layout/sidebar-load-error-state.tsx`
  - `packages/web/components/providers/chat-provider.tsx`
  - `packages/web/lib/__tests__/file-upload.test.ts`
  - `packages/web/lib/__tests__/uploads-access.test.ts`
  - `packages/web/lib/auth.ts`
  - `packages/web/lib/hooks/useCharter.ts`
  - `packages/web/lib/hooks/useStreaming.ts`
  - `packages/web/lib/hooks/useTyping.ts`
  - `packages/web/lib/services/AgentService.ts`
  - `packages/web/lib/services/ChannelService.ts`
  - `packages/web/lib/services/MessageService.ts`
  - `packages/web/lib/stream-lifecycle.ts`
- `23817985367` failed in `scripts/regression-harness.ps1`
- The failing assertion was `K-006 trigger message accepted` in the timeout-path section around `scripts/regression-harness.ps1:1105-1132`

## Known Good Local Verification

Before the GitHub push, the branch passed these local checks:

- `packages/web`: `npx vitest run`
- `packages/web`: `npx tsc --noEmit -p tsconfig.json`
- `packages/cli`: `npx vitest run`
- `packages/cli`: `npx tsc --noEmit -p tsconfig.json`
- `cli`: `go test ./... -count=1`
- `streaming`: `go test ./... -count=1`
- `scripts/regression-harness.ps1 -StartServicesIfDown`
- service health checks for web, gateway, and streaming

Treat the current GitHub `K-006` failure as real until re-verified, but remember that the last local full run was green after the Auth.js localhost trust fix.

### Task 1: Rehydrate Context and Confirm Merge Preconditions

**Files:**

- Inspect: `docs/plans/2026-03-31-merge-v1-hardening-to-main.md`
- Inspect: `.github/workflows/ci.yml`
- Inspect: `.github/workflows/integration.yml`
- Inspect: `scripts/regression-harness.ps1`

**Step 1: Fetch the latest remote state**

Run: `git fetch origin --prune`

Expected: local refs update cleanly.

**Step 2: Check out the hardening branch**

Run: `git checkout feature/v1-hardening`

Expected: HEAD is on `feature/v1-hardening`.

**Step 3: Confirm the branch relationship is still fast-forwardable**

Run: `git rev-list --left-right --count main...feature/v1-hardening`

Expected: still `0 22`, or at minimum the left side remains `0`.

**Step 4: Confirm the latest CI state before touching code**

Run: `gh run list --branch feature/v1-hardening --limit 5`

Expected: the latest runs show the known `CI - Unit Tests` and `Integration - Regression Harness` failures unless a newer push already changed that state.

**Step 5: Confirm the worktree state**

Run: `git status --short --branch`

Expected: only the known unrelated untracked file should be present before you make changes.

### Task 2: Clear the Web Formatting Failure First

**Files:**

- Modify: `packages/web/app/api/servers/[serverId]/channels/route.ts`
- Modify: `packages/web/app/api/servers/route.ts`
- Modify: `packages/web/app/api/v1/bootstrap/agents/route.ts`
- Modify: `packages/web/auth.config.ts`
- Modify: `packages/web/components/layout/sidebar-load-error-state.tsx`
- Modify: `packages/web/components/providers/chat-provider.tsx`
- Modify: `packages/web/lib/__tests__/file-upload.test.ts`
- Modify: `packages/web/lib/__tests__/uploads-access.test.ts`
- Modify: `packages/web/lib/auth.ts`
- Modify: `packages/web/lib/hooks/useCharter.ts`
- Modify: `packages/web/lib/hooks/useStreaming.ts`
- Modify: `packages/web/lib/hooks/useTyping.ts`
- Modify: `packages/web/lib/services/AgentService.ts`
- Modify: `packages/web/lib/services/ChannelService.ts`
- Modify: `packages/web/lib/services/MessageService.ts`
- Modify: `packages/web/lib/stream-lifecycle.ts`

**Step 1: Reproduce the formatting failure locally**

Run: `pnpm --filter web format:check`

Expected: FAIL with the same file list or a subset of it.

**Step 2: Apply Prettier to the exact failing surface**

Run: `pnpm --dir packages/web exec prettier --write "app/api/servers/[serverId]/channels/route.ts" "app/api/servers/route.ts" "app/api/v1/bootstrap/agents/route.ts" "auth.config.ts" "components/layout/sidebar-load-error-state.tsx" "components/providers/chat-provider.tsx" "lib/__tests__/file-upload.test.ts" "lib/__tests__/uploads-access.test.ts" "lib/auth.ts" "lib/hooks/useCharter.ts" "lib/hooks/useStreaming.ts" "lib/hooks/useTyping.ts" "lib/services/AgentService.ts" "lib/services/ChannelService.ts" "lib/services/MessageService.ts" "lib/stream-lifecycle.ts"`

Expected: the files are rewritten without semantic changes.

**Step 3: Re-run the formatting check**

Run: `pnpm --filter web format:check`

Expected: PASS.

**Step 4: Commit only the formatting fix**

Commit: `style(web): format hardening branch files`

### Task 3: Re-run Branch CI and Triage K-006 If It Persists

**Files:**

- Inspect: `scripts/regression-harness.ps1:1105-1132`
- Inspect: `streaming/internal/stream/manager.go`
- Inspect: `streaming/internal/stream/manager_test.go`
- Inspect: `packages/web/lib/stream-lifecycle.ts`
- Inspect: `gateway/lib/tavok_gateway_web/channels/room_channel.ex`
- Modify: whichever timeout-path files are actually proven to be at fault

**Step 1: Push the formatting-only commit**

Run: `git push origin feature/v1-hardening`

Expected: GitHub Actions re-runs on the updated branch tip.

**Step 2: Watch the refreshed branch workflows**

Run: `gh run watch --exit-status`

Expected: if the integration failure was flaky, the branch may go green after the formatting fix alone.

**Step 3: If `Integration - Regression Harness` still fails, inspect the latest failing logs**

Run: `gh run list --branch feature/v1-hardening --limit 5`

Expected: capture the newest failed run id.

**Step 4: Pull the failed log for the newest regression run**

Run: `gh run view <new-regression-run-id> --log-failed`

Expected: verify whether the failure is still `K-006 trigger message accepted` or if the failure signature changed.

**Step 5: Reproduce locally before changing code**

Run: `docker compose up --build -d`

Expected: all services start.

**Step 6: Run the full regression harness locally**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/regression-harness.ps1`

Expected: either reproduce the `K-006` failure or confirm the issue is GitHub-only.

**Step 7: If K-006 reproduces, inspect service logs immediately**

Run: `docker compose logs web gateway streaming --tail 200`

Expected: identify whether the timeout-path request failed in gateway dispatch, web placeholder/finalization, or the Go streaming timeout path.

**Step 8: Make the narrowest proven fix and add or update a regression test**

Run: use the smallest relevant local test command for the touched area after implementing the fix.

Expected: the root cause is covered by an automated test, not just by the harness.

**Step 9: Commit the K-006 fix separately**

Commit: `fix(integration): stabilize timeout-path regression flow`

### Task 4: Re-run the Release Gate Locally

**Files:**

- Inspect: `packages/web/package.json`
- Inspect: `packages/cli/package.json`
- Inspect: `packages/sdk/package.json`
- Inspect: `scripts/regression-harness.ps1`

**Step 1: Re-run web verification**

Run: `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web typecheck`

Expected: PASS.

**Step 2: Re-run CLI and SDK verification**

Run: `pnpm --dir packages/cli test && pnpm --dir packages/cli typecheck && pnpm --dir packages/sdk test && pnpm --dir packages/sdk typecheck`

Expected: PASS.

**Step 3: Re-run Go verification**

Run: `cd cli; go test ./... -count=1; cd ..\\streaming; go test ./... -count=1; cd ..`

Expected: PASS.

**Step 4: Re-run the full regression harness**

Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/regression-harness.ps1`

Expected: K-001 through K-022 all PASS.

**Step 5: Re-check service health**

Run: `curl -sf http://localhost:5555/api/health && curl -sf http://localhost:4001/api/health && curl -sf http://localhost:4002/health`

Expected: all three endpoints return success.

### Task 5: Land the Branch on Main

**Files:**

- No file edits required if the branch is already green

**Step 1: Confirm the latest branch workflows are green**

Run: `gh run list --branch feature/v1-hardening --limit 5`

Expected: the latest `CI - Unit Tests` and `Integration - Regression Harness` runs are successful.

**Step 2: Update local main safely**

Run: `git checkout main && git pull --ff-only origin main`

Expected: local `main` matches `origin/main`.

**Step 3: Fast-forward main to the hardening branch**

Run: `git merge --ff-only feature/v1-hardening`

Expected: PASS with no merge commit.

**Step 4: Push main**

Run: `git push origin main`

Expected: `origin/main` advances to the hardening branch tip.

**Step 5: Watch main CI**

Run: `gh run list --branch main --limit 5`

Expected: new `main` workflow runs appear. Watch until the critical workflows complete.

**Step 6: If `main` moved or branch protection changed, do not force anything**

Run: create a PR from `feature/v1-hardening` to `main` instead of bypassing the new state.

Expected: the landing path stays safe even if repository policy changed after this handoff was written.

## Starter Prompt for the New Codex Session

```text
Read C:\Users\njlec\Tavok\docs\plans\2026-03-31-merge-v1-hardening-to-main.md and execute it.

Important starting context:
- The last fully verified hardening code tip was 130b426 on feature/v1-hardening.
- main is still 2db15ae and is a direct ancestor, so the intended landing is a fast-forward merge once the branch is green.
- The latest push to origin/feature/v1-hardening triggered GitHub Actions and both workflows are red:
  - 23817985359 CI - Unit Tests failed on pnpm --filter web format:check
  - 23817985367 Integration - Regression Harness failed at K-006 trigger message accepted in scripts/regression-harness.ps1
- Local verification was green before push, including the full regression harness after the Auth.js localhost trust fix.
- make is not installed here, so use direct pnpm/go/pwsh/docker commands.
- Do not touch the unrelated untracked file docs/plans/2026-03-27-release-readiness-hardening.md.

Your job is to clear the branch CI, re-run the local release gate, and only then fast-forward main and push origin/main. If main is no longer fast-forwardable or becomes protected, stop and use the safest alternative instead of forcing it.
```
