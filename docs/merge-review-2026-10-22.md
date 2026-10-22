# Merge review — 2026-10-22

The owner requested technical corrections and validated draft merges on 2026-10-22.

A delayed initial `arena.open_artifact` response exposed an editable blank notepad before its persistence context existed. Input during that interval was ignored. A new browser test failed on the unfixed implementation; the notepad now remains read-only until a writable artifact arrives, and clearing the context restores read-only state.

Validation on codex-backend (Linux, Node 24): type checks passed, 50 domain/HTTP/MCP tests passed, and 14 Playwright browser tests passed. The browser suite includes the delayed-load regression, concurrent typing/save, remote edits, selection, revocation, and embedded model context. Data and credentials were fictional fixtures. No real editorial approval was recorded.

This validates code and fixture behavior. Real owner typing and production DNA use in the native client remain unverified; merging does not imply owner UX acceptance, editorial acceptance, deployment, or global installation.
