# Final review resolutions

The final reviews covered `d7f083a77e1fbd35b40959bc78c0f04b980a1221…f29206546326d6b91a543b2731cc25d1f8efcad9`. Fixes started from the latter integration commit. Validation uses the owner-confirmed public domain/MCP and artifact interaction seams, fictional content and real SQLite. This records resolution of the existing reviews; no second broad review was performed.

## Standards

**5 findings: 2 documented-rule violations and 3 possible Fowler smells (heuristic judgments). Worst within Standards: P1. All five addressed.** The accepted single synchronous service and JSON persistence remain the architecture. Relevant rules: AGENTS, glossary, contracts, data policy and ADRs 0001–0003; ADR 0003 controls the text-only viewer.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| S1 P1: overlapping credentials can enter context | Scan every 43-character candidate position within allowed-character runs, using one set of stored token hashes per input scan; recursively check values and JSON keys before persistence. | `test/domain.test.ts`: embedded credentials at several offsets and arbitrary keys reject without creating a proposal. |
| S2 P1: declared metadata survives source removal | Preserve explicit Arena identifier/enum/timestamp fields; treat provider/client/external-session declarations and imported dates as free text. Apply provenance redaction to declarations and source metadata, including saved pages and replay payloads during logical removal. | `test/domain.test.ts`: revocation/removal, saved pages, exports, replays and SQLite restarts remain redacted; canonical actor/session/revision identities and integration provider enums survive. Existing adversarial actor-ID regression passes. |
| S3 possible Duplicated Code — heuristic | Proposal acceptance uses `commitRevision` for revision insertion and branch-head advancement. | Existing public acceptance, partial acceptance, CAS and rollback tests pass. |
| S4 possible Primitive Obsession — heuristic | Named core domain records make provenance and declaration fields explicit. A constrained record registry types storage reads/writes; validated dynamic wire arguments remain at the boundary. | `src/domain-records.ts`, `src/arena.ts`; TypeScript check and domain suite pass. |
| S5 possible Data Clumps — heuristic | One `ArtifactReference` projection supplies interaction input, model context and exact pinning. | Exact proposal/version selection and pinned/historical browser tests pass. |

S1 and S2 regressions failed before their fixes and passed afterward. Credentials were never printed.

## Spec

**2 findings. Worst within Spec: P1. Both addressed.** This count and priority remain separate from Standards.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| R1 P1: delayed event read restores a restricted selection to model context | Recheck current identity/redaction after asynchronous reads, discard superseded responses and use the authorized event's selection. Refresh generations prevent an older response from replacing a newer host artifact. Failed selection persistence clears the native passage and allows reselection. | `test-ui/embedded.spec.ts`: hold an SDK event response, revoke, wait for empty visible text, release; no restricted selection ever reaches model context. `test-ui/viewer.spec.ts`: stale refresh cannot replace newer host text; pinned selection can retry after a head conflict. |
| R2 P2: human edits commit unavailable inferred sources | Validate the complete inferred dependency and pinned-voice source set before constructing/committing the revision. | `test/domain.test.ts`: both forms fail with `SOURCE_UNAVAILABLE`, preserve the head, and leave no operation to replay after repeated failures. Equivalent agent proposal also rejects. |

Both reported bug regressions failed before their fixes and passed afterward. Final required validation: `npm run check`, `npm run build`, `npm test` (**42/42**), `npm run test:ui` (**8/8**). Browser tests use real public-domain/HTTP boundaries and the MCP SDK reference host; they verify text-only rendering, no workflow controls and no automatic user message. These fixtures do not establish native client verification. The real Codex → ChatGPT pilot remains pending.
