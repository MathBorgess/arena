# Arena agent contract

Build the textual Arena v1 described in docs/spec/arena-v1-original.md and docs/spec/implementation-notes.md. Read GLOSSARY.md and docs/adr before changing domain behavior.

- Work on codex/ branches. Never merge or deploy without specific owner authorization.
- Use fictional data only. No real social account connection or user-level agent configuration changes are authorized by this implementation task.
- Conversation stays in the user's harness. The durable domain service is shared by MCP and a compact artifact viewer (MCP Apps where supported, local fallback otherwise). No standalone conversational platform.
- Latest owner direction: the viewer displays only the current proposal text, read-only, with native cursor selection. No editing, comments, review buttons, drawers, navigation or workflow controls. Selection automatically persists exact proposal/version context; requests and workflow commands belong in the harness conversation and skill commands. Human decisions use a separate local CLI channel when the harness can run commands; MCP agent credentials never inherit that authorization.
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

<!-- mathai-repo-operations:start -->
## Resource cleanup and review

Existing repository-specific retention, immutable-evidence and review/check requirements remain in force. This section does not override longer retention or stricter preservation rules.

Before cleanup, inspect `git status --short`, `git worktree list`, tracked files, ignored/untracked files and active processes. Read this repository's build configuration and `.gitignore` to identify reproducible outputs. Produce a bounded dry-run list with paths, ownership, active-use checks and a recovery plan; remove only confirmed inactive regenerable residue. A directory being ignored does not make it disposable. Never use broad `git clean`, forced worktree removal or recursive deletion across projects.

Stop only temporary processes created by the current task after they are no longer needed. Keep ordinary operational logs for five days, except evidence needed for an open issue. Preserve sources, credentials, local/ignored work and all experiment/evaluation records awaiting human assessment. Age alone does not authorize deletion of projects or conversations. Use the owning application's archive/recovery mechanism for managed worktrees. Report measured cleanup results and unresolved items in short bullets.

### Code Review Rules

Focus on correctness, data loss, security, permission expansion, costs and broken external contracts. State the concrete trigger and consequence of a finding. Put formatting and deterministic checks in CI. Missing required evidence is unverified, not success. Preserve repository-specific human approval and merge rules; this section grants no new merge authority. Report useful architectural decisions separately from blocking risks, in plain language.

<!-- mathai-repo-operations:end -->
