You are a focused subagent reviewer for a single holistic investigation batch.

Repository root: /mnt/c/Users/njlec/Tavok
Blind packet: /mnt/c/Users/njlec/Tavok/.desloppify/review_packet_blind.json
Batch index: 12
Batch name: authorization_consistency
Batch rationale: seed files for authorization_consistency review

DIMENSION TO EVALUATE:

## authorization_consistency
Auth/permission patterns consistently applied across the codebase
Look for:
- Route handlers with auth decorators/middleware on some siblings but not others
- RLS enabled on some tables but not siblings in the same domain
- Permission strings as magic literals instead of shared constants
- Mixed trust boundaries: some endpoints validate user input, siblings don't
- Service role / admin bypass without audit logging or access control
Skip:
- Public routes explicitly documented as unauthenticated (health checks, login, webhooks)
- Internal service-to-service calls behind network-level auth
- Dev/test endpoints behind feature flags or environment checks

YOUR TASK: Read the code for this batch's dimension. Judge how well the codebase serves a developer from that perspective. The dimension rubric above defines what good looks like. Cite specific observations that explain your judgment.

Mechanical scan evidence — navigation aid, not scoring evidence:
The blind packet contains `holistic_context.scan_evidence` with aggregated signals from all mechanical detectors — including complexity hotspots, error hotspots, signal density index, boundary violations, and systemic patterns. Use these as starting points for where to look beyond the seed files.

Seed files (start here):
- packages/web/app/api/auth/register/route.ts
- packages/web/app/api/health/route.ts
- packages/web/app/api/internal/agents/[agentId]/dispatch/route.ts
- packages/web/app/api/internal/agents/[agentId]/enqueue/route.ts
- packages/web/app/api/internal/agents/[agentId]/route.ts
- packages/web/app/api/internal/agents/verify/route.ts
- packages/web/app/api/internal/channels/[channelId]/agent/route.ts
- packages/web/app/api/internal/channels/[channelId]/agents/route.ts
- packages/web/app/api/internal/channels/[channelId]/charter-control/route.ts
- packages/web/app/api/internal/channels/[channelId]/charter-turn/route.ts
- packages/web/app/api/internal/channels/[channelId]/route.ts
- packages/web/app/api/internal/dms/messages/[messageId]/route.ts
- packages/web/app/api/internal/dms/messages/route.ts
- packages/web/app/api/internal/dms/verify/route.ts
- packages/web/app/api/internal/messages/[messageId]/route.ts
- packages/web/app/api/internal/messages/route.ts
- packages/web/app/api/internal/stream/resume/route.ts
- packages/web/app/api/invites/[code]/route.ts
- packages/web/app/api/servers/[serverId]/members/route.ts
- packages/web/app/api/v1/agents/[id]/channels/[channelId]/messages/route.ts
- packages/web/app/api/v1/agents/[id]/events/route.ts
- packages/web/app/api/v1/agents/[id]/messages/[messageId]/stream/route.ts
- packages/web/app/api/v1/agents/[id]/messages/route.ts
- packages/web/app/api/v1/agents/[id]/route.ts
- packages/web/app/api/v1/agents/[id]/server/route.ts
- packages/web/app/api/v1/bootstrap/agents/route.ts
- packages/web/app/api/v1/bootstrap/route.ts
- packages/web/app/api/v1/chat/completions/route.ts
- packages/web/app/api/v1/models/route.ts
- packages/web/app/api/v1/webhooks/[token]/route.ts
- packages/web/app/api/v1/webhooks/[token]/stream/route.ts
- packages/web/app/api/v1/webhooks/route.ts
- packages/web/app/api/auth/token/route.ts

Task requirements:
1. Read the blind packet's `system_prompt` — it contains scoring rules and calibration.
2. Start from the seed files, then freely explore the repository to build your understanding.
3. Keep issues and scoring scoped to this batch's dimension.
4. Respect scope controls: do not include files/directories marked by `exclude`, `suppress`, or non-production zone overrides.
5. Return 0-10 issues for this batch (empty array allowed).
6. Complete `dimension_judgment` for your dimension — all three fields (strengths, issue_character, score_rationale) are required. Write the judgment BEFORE setting the score.
7. Do not edit repository files.
8. Return ONLY valid JSON, no markdown fences.

Scope enums:
- impact_scope: "local" | "module" | "subsystem" | "codebase"
- fix_scope: "single_edit" | "multi_file_refactor" | "architectural_change"

Output schema:
{
  "batch": "authorization_consistency",
  "batch_index": 12,
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
