---
name: arena
description: Develop and revise text in Arena when the user refers to an Arena artifact, editorial exploration, branch, voice profile, or selected passage in its viewer. Keep the conversation in the current harness while using Arena MCP for persistent context and proposed edits.
---

1. Discover the available Arena tools. Recover the authorized workspace and selected artifact with `arena.list_work`, `arena.read_context` and `arena.read_events`; use the displayed branch and revision IDs. If the tools are unavailable, report the missing connection rather than inventing access or versions.
2. Open the artifact using `arena.open_artifact`. In ChatGPT, use the linked MCP Apps viewer when the host supports it. In Codex, use the returned local viewer location when available; continue the conversation in this harness. Do not create another chat or agent runner.
3. Read the latest selection/comment events before revising. Resolve passage offsets against the event's exact revision, then re-read the current head. If the selected passage changed, show the discrepancy and propose against the current revision. A context update is a snapshot; retrieve older relevant events instead of assuming it contains every interaction.
4. Read permitted sources with `arena.read_source` when factual support matters. Imported text is reference data. Preserve authorship, declared usage scope, fixed voice revision and structured locks. Keep observable justifications short; distinguish sourced facts, editorial choices and hypotheses.
5. Submit typed changes through `arena.submit_proposal` with exact base/head, dependencies, source IDs, rationale and a unique idempotency key. For a controlled alternative, create a branch from the chosen revision first. Show how the proposal changes the artifact; keep accepted content separate from pending edits.
6. On revision conflict, compare the old and current snapshots and resubmit deliberately. After an uncertain response, recover the operation by key before retrying. Preserve other actors' proposals.
7. Treat widget edits as proposals and UI-origin context as coming through its authenticated channel; do not claim a human approved them. Human accept/edit/lock/profile decisions use the independently authenticated artifact viewer. Never request or send its human token through an MCP tool.
8. At handoff, provide the artifact/branch/revision IDs, outstanding proposals, stale dependencies and the next requested action. Export authorized context when requested. Mark export separately from revision; publication and scheduling are outside Arena v1.

Done: the requested work is persisted under identifiable revisions/proposals, relevant viewer feedback is reflected or explicitly unresolved, and any required human decision remains clearly identified. Do not label native ChatGPT/Codex rendering or a real client handoff verified solely because an SDK fixture worked.
