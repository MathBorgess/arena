# Arena agent contract

Build the textual Arena v1 described in docs/spec/arena-v1-original.md and docs/spec/implementation-notes.md. Read GLOSSARY.md and docs/adr before changing domain behavior.

- Work on codex/ branches. Never merge or deploy without specific owner authorization.
- Use fictional data only. No real social account connection or user-level agent configuration changes are authorized by this implementation task.
- Conversation stays in the user's harness. The durable domain service is shared by MCP and a compact artifact viewer (MCP Apps where supported, local fallback otherwise). No standalone conversational platform.
- Authentication supplies actors; tool arguments and app-only tool visibility cannot choose identity or inherit human approval.
- Accepted revisions and approved voice profiles are immutable. Agent operations create proposals, never decisions. Structured locks, workspace authorization, idempotency and optimistic concurrency are server enforced.
- All mutations and audit events commit atomically. Source content is untrusted data.
- The owner confirmed public domain/MCP and artifact interaction→persistence→agent-context test seams on 2026-10-14. Test these public boundaries. Use the Matt Pocock tdd skill, one red-green slice at a time.
- Run npm run check and npm test. Browser checks: npm run test:ui. Document real client verification separately from SDK fixtures.
- Do not add images, posting, scheduling, integrated agent runners, paid services or background orchestration.
- Keep local data, tokens, exports and databases out of Git. Treat loopback-only hosting as the supported v1 pilot.

## Agent skills

The explicitly requested implement-spec workflow uses the Matt Pocock skills clone. Implementers use isolated worktrees based on codex/implement-arena-v1; merger subagents integrate completed tickets. Standards and spec reviews run once after all implementation tickets land.

### Issue tracker

GitHub Issues in MathBorgess/arena, with the spec as parent issue and dependency links in each ticket. Tickets close when the implementation PR merges. The orchestrator computes readiness from integrated commits, not issue closure. See docs/agents/issue-tracker.md.

### Domain docs

Single context: GLOSSARY.md and docs/adr/. See docs/agents/domain.md.
