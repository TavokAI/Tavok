# External Blind Review Session

Session id: ext_20260311_184902_79daa087
Session token: a3b8ef42a66327e944420e8bcff87f3e
Blind packet: /mnt/c/Users/njlec/Tavok/.desloppify/review_packet_blind.json
Template output: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260311_184902_79daa087/review_result.template.json
Claude launch prompt: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260311_184902_79daa087/claude_launch_prompt.md
Expected reviewer output: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260311_184902_79daa087/review_result.json

Happy path:
1. Open the Claude launch prompt file and paste it into a context-isolated subagent task.
2. Reviewer writes JSON output to the expected reviewer output path.
3. Submit with the printed --external-submit command.

Reviewer output requirements:
1. Return JSON with top-level keys: session, assessments, issues.
2. session.id must be `ext_20260311_184902_79daa087`.
3. session.token must be `a3b8ef42a66327e944420e8bcff87f3e`.
4. Include issues with required schema fields (dimension/identifier/summary/related_files/evidence/suggestion/confidence).
5. Use the blind packet only (no score targets or prior context).
