You are a focused subagent reviewer for a single holistic investigation batch.

Repository root: /mnt/c/Users/njlec/Tavok
Blind packet: /mnt/c/Users/njlec/Tavok/.desloppify/review_packet_blind.json
Batch index: 17
Batch name: design_coherence
Batch rationale: seed files for design_coherence review

DIMENSION TO EVALUATE:

## design_coherence
Are structural design decisions sound — functions focused, abstractions earned, patterns consistent?
Look for:
- Functions doing too many things — multiple distinct responsibilities in one body
- Parameter lists that should be config/context objects — many related params passed together
- Files accumulating issues across many dimensions — likely mixing unrelated concerns
- Deep nesting that could be flattened with early returns or extraction
- Repeated structural patterns that should be data-driven
Skip:
- Functions that are long but have a single coherent responsibility
- Parameter lists where grouping would obscure meaning — do NOT recommend config/context objects or dependency injection wrappers just to reduce parameter count; only group when the grouping has independent semantic meaning
- Files that are large because their domain is genuinely complex, not because they mix concerns
- Nesting that is inherent to the problem (e.g., recursive tree processing)
- Do NOT recommend extracting callable parameters or injecting dependencies for 'testability' — direct function calls are simpler and preferred unless there is a concrete decoupling need

YOUR TASK: Read the code for this batch's dimension. Judge how well the codebase serves a developer from that perspective. The dimension rubric above defines what good looks like. Cite specific observations that explain your judgment.

Mechanical scan evidence — navigation aid, not scoring evidence:
The blind packet contains `holistic_context.scan_evidence` with aggregated signals from all mechanical detectors — including complexity hotspots, error hotspots, signal density index, boundary violations, and systemic patterns. Use these as starting points for where to look beyond the seed files.

Seed files (start here):
- packages/web/lib/hooks/use-channel.ts
- packages/web/components/chat/message-input.tsx
- packages/web/components/workspace/chat-panel.tsx
- packages/web/components/providers/chat-provider.tsx
- packages/web/components/user/profile-settings-modal.tsx
- packages/web/components/modals/role-management-modal.tsx
- packages/web/components/modals/channel-settings-modal.tsx
- packages/web/components/server-settings/roles-section.tsx
- packages/web/components/server-settings/channels-section.tsx
- packages/web/components/modals/agent/byok-form.tsx
- packages/web/lib/auth.ts
- packages/web/lib/agent-factory.ts
- packages/web/components/modals/manage-agents-modal.tsx
- packages/web/lib/hooks/use-dm-channel.ts
- packages/web/components/layout/left-panel.tsx
- packages/web/components/layout/channel-sidebar.tsx
- packages/web/e2e/global-setup.ts
- packages/web/e2e/mock-mcp-server.ts
- .claude/skills/systematic-debugging/condition-based-waiting-example.ts
- .openhands/skills/systematic-debugging/condition-based-waiting-example.ts
- .pi/skills/systematic-debugging/condition-based-waiting-example.ts
- packages/cli/src/index.ts
- packages/cli/src/runner.ts
- packages/web/app/(app)/dms/[dmId]/page.tsx
- packages/web/app/(app)/layout.tsx
- packages/web/app/(app)/servers/[serverId]/channels/[channelId]/page.tsx
- packages/web/app/(auth)/login/page.tsx
- packages/web/app/(auth)/register/page.tsx
- packages/web/app/api/auth/register/route.ts
- packages/web/app/api/auth/token/route.ts
- packages/web/app/api/dms/[dmId]/messages/[messageId]/reactions/route.ts
- packages/web/app/api/dms/[dmId]/messages/route.ts
- packages/web/app/api/health/route.ts
- packages/web/app/api/internal/agents/[agentId]/dispatch/route.ts
- packages/web/app/api/internal/agents/[agentId]/enqueue/route.ts
- packages/web/app/api/internal/agents/[agentId]/route.ts
- packages/web/app/api/internal/channels/[channelId]/agent/route.ts
- packages/web/app/api/internal/channels/[channelId]/agents/route.ts
- packages/web/app/api/internal/channels/[channelId]/charter-control/route.ts
- packages/web/app/api/internal/channels/[channelId]/charter-turn/route.ts
- packages/web/app/api/internal/channels/[channelId]/route.ts
- packages/web/app/api/internal/dms/messages/[messageId]/route.ts
- packages/web/app/api/internal/messages/[messageId]/route.ts
- packages/web/app/api/internal/messages/route.ts
- packages/web/app/api/invites/[code]/accept/route.ts
- packages/web/app/api/invites/[code]/route.ts
- packages/web/app/api/messages/[messageId]/reactions/route.ts
- packages/web/app/api/servers/[serverId]/agents/[agentId]/route.ts
- packages/web/app/api/servers/[serverId]/agents/route.ts
- packages/web/app/api/servers/[serverId]/channels/[channelId]/charter/route.ts
- packages/web/app/api/servers/[serverId]/channels/[channelId]/read/route.ts
- packages/web/app/api/servers/[serverId]/channels/[channelId]/route.ts
- packages/web/app/api/servers/[serverId]/channels/reorder/route.ts
- packages/web/app/api/servers/[serverId]/channels/route.ts
- packages/web/app/api/servers/[serverId]/invites/[inviteId]/route.ts
- packages/web/app/api/servers/[serverId]/invites/route.ts
- packages/web/app/api/servers/[serverId]/members/[memberId]/roles/route.ts
- packages/web/app/api/servers/[serverId]/members/[memberId]/route.ts
- packages/web/app/api/servers/[serverId]/members/route.ts
- packages/web/app/api/servers/[serverId]/permissions/route.ts
- packages/web/app/api/servers/[serverId]/roles/[roleId]/route.ts
- packages/web/app/api/servers/[serverId]/roles/route.ts
- packages/web/app/api/uploads/route.ts
- packages/web/app/api/users/me/route.ts
- packages/web/app/api/v1/agents/[id]/events/route.ts
- packages/web/app/api/v1/agents/[id]/messages/[messageId]/stream/route.ts
- packages/web/app/api/v1/agents/[id]/messages/route.ts
- packages/web/app/api/v1/bootstrap/route.ts
- packages/web/app/api/v1/chat/completions/route.ts
- packages/web/app/api/v1/models/route.ts
- packages/web/app/api/v1/webhooks/[token]/route.ts
- packages/web/app/api/v1/webhooks/[token]/stream/route.ts
- packages/web/app/api/v1/webhooks/route.ts
- packages/web/app/invite/[code]/page.tsx
- packages/web/app/layout.tsx
- packages/web/components/chat/MessageMetadata.tsx
- packages/web/components/chat/channel-header.tsx
- packages/web/components/chat/chat-area.tsx
- packages/web/components/chat/message-list.tsx
- packages/web/components/chat/reaction-bar.tsx
- packages/web/components/chat/rewind-slider.tsx
- packages/web/components/chat/streaming-message.tsx
- packages/web/components/chat/typed-messages/ToolResultCard.tsx
- packages/web/components/layout/bottom-bar.tsx
- packages/web/components/layout/member-list.tsx
- packages/web/components/layout/right-panel.tsx
- packages/web/components/layout/server-sidebar.tsx
- packages/web/components/layout/top-bar.tsx
- packages/web/components/modals/agent/agent-list.tsx
- packages/web/components/modals/agent/webhook-forms.tsx
- packages/web/components/modals/create-channel-modal.tsx
- packages/web/components/modals/create-server-modal.tsx
- packages/web/components/modals/delete-message-modal.tsx
- packages/web/components/modals/invite-modal.tsx
- packages/web/components/providers/theme-provider.tsx
- packages/web/components/providers/workspace-provider.tsx

Mechanical concern signals — navigation aid, not scoring evidence:
Confirm or refute each with your own code reading. Report only confirmed defects.
  - [design_concern] .claude/skills/systematic-debugging/condition-based-waiting-example.ts
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (158 LOC): zero importers, not an entry point
  - [design_concern] .openhands/skills/systematic-debugging/condition-based-waiting-example.ts
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (158 LOC): zero importers, not an entry point
  - [design_concern] .pi/skills/systematic-debugging/condition-based-waiting-example.ts
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (158 LOC): zero importers, not an entry point
  - [design_concern] packages/cli/src/index.ts
    summary: Design signals from smells
    question: Review the flagged patterns — are they design problems that need addressing, or acceptable given the file's role?
    evidence: Flagged by: smells
    evidence: [smells] 11x console.error without throw/return
  - [design_concern] packages/cli/src/runner.ts
    summary: Design signals from smells
    question: Review the flagged patterns — are they design problems that need addressing, or acceptable given the file's role?
    evidence: Flagged by: smells
    evidence: [smells] 1x Async functions without await
  - [design_concern] packages/web/app/(app)/dms/[dmId]/page.tsx
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (70 LOC): zero importers, not an entry point
  - [design_concern] packages/web/app/(app)/layout.tsx
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (33 LOC): zero importers, not an entry point
  - [design_concern] packages/web/app/(app)/servers/[serverId]/channels/[channelId]/page.tsx
    summary: Design signals from orphaned
    question: Is this file truly dead, or is it used via a non-import mechanism (dynamic import, CLI entry point, plugin)?
    evidence: Flagged by: orphaned
    evidence: [orphaned] Orphaned file (30 LOC): zero importers, not an entry point
  - (+4 more concern signals)

Task requirements:
1. Read the blind packet's `system_prompt` — it contains scoring rules and calibration.
2. Start from the seed files, then freely explore the repository to build your understanding.
3. Keep issues and scoring scoped to this batch's dimension.
4. Respect scope controls: do not include files/directories marked by `exclude`, `suppress`, or non-production zone overrides.
5. Return 0-10 issues for this batch (empty array allowed).
6. For design_coherence, use evidence from `holistic_context.scan_evidence.signal_density` — files where multiple mechanical detectors fired. Investigate what design change would address multiple signals simultaneously. Check `scan_evidence.complexity_hotspots` for files with high responsibility cluster counts.
7. Workflow integrity checks: when reviewing orchestration/queue/review flows,
8. xplicitly look for loop-prone patterns and blind spots:
9. - repeated stale/reopen churn without clear exit criteria or gating,
10. - packet/batch data being generated but dropped before prompt execution,
11. - ranking/triage logic that can starve target-improving work,
12. - reruns happening before existing open review work is drained.
13. If found, propose concrete guardrails and where to implement them.
14. Complete `dimension_judgment` for your dimension — all three fields (strengths, issue_character, score_rationale) are required. Write the judgment BEFORE setting the score.
15. Do not edit repository files.
16. Return ONLY valid JSON, no markdown fences.

Scope enums:
- impact_scope: "local" | "module" | "subsystem" | "codebase"
- fix_scope: "single_edit" | "multi_file_refactor" | "architectural_change"

Output schema:
{
  "batch": "design_coherence",
  "batch_index": 17,
  "assessments": {"<dimension>": <0-100 with one decimal place>},
  "dimension_notes": {
    "<dimension>": {
      "evidence": ["specific code observations"],
      "impact_scope": "local|module|subsystem|codebase",
      "fix_scope": "single_edit|multi_file_refactor|architectural_change",
      "confidence": "high|medium|low",
      "issues_preventing_higher_score": "required when score >85.0",
      "sub_axes": {"abstraction_leverage": 0-100, "indirection_cost": 0-100, "interface_honesty": 0-100, "delegation_density": 0-100, "definition_directness": 0-100, "type_discipline": 0-100}  // required for abstraction_fitness when evidence supports it; all one decimal place
    }
  },
  "dimension_judgment": {
    "<dimension>": {
      "strengths": ["0-5 specific things the codebase does well from this dimension's perspective"],
      "issue_character": "one sentence characterizing the nature/pattern of issues from this dimension's perspective",
      "score_rationale": "2-3 sentences explaining the score from this dimension's perspective, referencing global anchors"
    }  // required for every assessed dimension; do not omit
  },
  "issues": [{
    "dimension": "<dimension>",
    "identifier": "short_id",
    "summary": "one-line defect summary",
    "related_files": ["relative/path.py"],
    "evidence": ["specific code observation"],
    "suggestion": "concrete fix recommendation",
    "confidence": "high|medium|low",
    "impact_scope": "local|module|subsystem|codebase",
    "fix_scope": "single_edit|multi_file_refactor|architectural_change",
    "root_cause_cluster": "optional_cluster_name_when_supported_by_history"
  }],
  "retrospective": {
    "root_causes": ["optional: concise root-cause hypotheses"],
    "likely_symptoms": ["optional: identifiers that look symptom-level"],
    "possible_false_positives": ["optional: prior concept keys likely mis-scoped"]
  }
}
