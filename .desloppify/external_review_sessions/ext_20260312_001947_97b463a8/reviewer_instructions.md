# External Blind Review Session

Session id: ext_20260312_001947_97b463a8
Session token: 8912569bf30be5e7be41a91632bb2843
Blind packet: /mnt/c/Users/njlec/Tavok/.desloppify/review_packet_blind.json
Template output: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260312_001947_97b463a8/review_result.template.json
Claude launch prompt: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260312_001947_97b463a8/claude_launch_prompt.md
Expected reviewer output: /mnt/c/Users/njlec/Tavok/.desloppify/external_review_sessions/ext_20260312_001947_97b463a8/review_result.json

Happy path:
1. Open the Claude launch prompt file and paste it into a context-isolated subagent task.
2. Reviewer writes JSON output to the expected reviewer output path.
3. Submit with the printed --external-submit command.

Reviewer output requirements:
1. Return JSON with top-level keys: session, assessments, issues.
2. session.id must be `ext_20260312_001947_97b463a8`.
3. session.token must be `8912569bf30be5e7be41a91632bb2843`.
4. Include issues with required schema fields (dimension/identifier/summary/related_files/evidence/suggestion/confidence).
5. Use the blind packet only (no score targets or prior context).
