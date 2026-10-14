# Shared API contract

`new Arena(databasePath)` (export from `src/arena.ts`) owns migrations, durable SQLite state and synchronous transactions. `arena.bootstrap({workspace_name, owner_name})` returns `BootstrapResult` once per new database; repeated init refuses to reset credentials. `arena.authenticate(token)` looks up a hashed token and returns the persisted actor. `arena.execute(operation, actor, input)` is the shared public boundary; all references, memberships and permissions are checked here. `close()` closes SQLite. `src/contracts.ts` is transport vocabulary, not domain state.

All requests use snake_case JSON. Every mutation takes `workspace_id` and `idempotency_key`; an existing aggregate additionally takes `expected_revision` (branch current revision, profile base revision, source revision or member revision). Human approval additionally takes `expected_head_revision` and `presented_version` (proposal.version). Response fields below are fixed for independently developed transports. Unknown fields such as actor/kind/role must never grant permissions.

## Agent operations

- `arena.list_work`: workspace_id, optional query/cursor/limit. Returns `{explorations:[{id,title,objective,branches:[{id,name,current_revision_id,profile_revision_id}]}],next_cursor}`. Query matches related title/objective/dimensions; opaque cursor pins the results snapshot.
- `arena.read_context`: branch_id, optional revision_id/cursor/limit. Returns `{format_version:1,workspace_id,exploration:{id,title,objective},branch:{id,name,origin_branch_id,origin_revision_id,current_revision_id,profile_revision_id},revision:{id,fields,locks,artifacts,profile_revision_id},profile,proposals,decisions,feedback,sources,open_questions,next_action,next_cursor}`. Revision IDs stay fixed during pagination. Source content only through read_source; revoked content must not leak through proposals, decisions, artifact text, historic snapshots or exports.
- `arena.read_source`: source_id, offset/limit. Returns `{id,revision,content,origin,author,date,rights,usage_scope,coverage,next_offset}`; only active, permitted sources can be read.
- `arena.create_exploration`: title, objective, optional profile_revision_id. Returns `{exploration_id,branch_id,revision_id}` with empty fields and independent initial branch.
- `arena.create_branch`: source_branch_id, source_revision_id, expected_revision (=source head), name, vary_dimensions, optional locks. Returns `{branch_id,revision_id}`; inherits the pinned profile, locks and accepted artifacts, stores exact origin. Variation does not itself alter accepted content.
- `arena.submit_proposal`: branch_id, base_revision_id, expected_revision (=head), changes object mapping dimensions to text, dependencies object mapping changed dimension to upstream dimension array (absent means conservative), rationale, source_ids, optional warnings. Returns `{proposal_id,version,status:'pending'}`. All source IDs and dependency names are checked; no client-supplied actor.
- `arena.add_feedback`: branch_id, target_id (branch/proposal), revision_id, expected_revision, text, type (`critique`/`question`/`comment`). Returns `{feedback_id}`; never approves.
- `arena.compare_branches`: left_branch_id,left_revision_id,right_branch_id,right_revision_id, optional criteria. Returns `{left,right,common_base,differences:[{dimension,left,right}],locks,needs_review,criteria}` deterministically.
- `arena.propose_profile_change`: profile_revision_id, expected_revision (=profile_revision_id), changes, evidence_source_ids, rationale. Returns `{proposal_id,version,status}` without changing voice.
- `arena.export_context`: branch_id, revision_id. Returns `{package: <read_context plus relevant rejections and source metadata>,markdown,checksum}`. Validates current permissions; historical package is data, not authorization.
- `arena.get_operation`: workspace_id,idempotency_key. Returns `{found,result?}` scoped to authenticated actor.
- `arena.list_profiles`: workspace_id. Returns `{profiles:[{id,name,current_revision_id,revisions:[{id,version,content}]}]}`.

## Human operations

- `human.create_profile`: name, content `{identity,objectives,tone,vocabulary,positive_examples,negative_examples,rules}`, source_ids. Returns `{profile_id,profile_revision_id}`; initial human-authored approved immutable version.
- `human.decide_proposal`: proposal_id, expected_revision and expected_head_revision (=branch head), presented_version, decision (`accepted`/`rejected`/`deferred`/`superseded`), optional comment, optional selected_dimensions. Returns `{decision_id,revision_id?,proposal_id,derived_proposal_id?}`. Partial acceptance creates and accepts a derived proposal with chosen subset; records origin and retains unselected suggestion.
- `human.edit_branch`: branch_id,expected_revision,changes,dependencies,source_ids,reason. Returns `{revision_id}`. Cannot silently break locks.
- `human.set_locks`: branch_id,expected_revision,locks (dimension→current value),reason. Returns `{revision_id}`. Explicit human action can remove existing locks.
- `human.approve_profile`: proposal_id,presented_version,expected_revision (=current voice head),comment. Returns `{profile_revision_id,decision_id}`. Old branches stay pinned.
- `human.import_sources`: format (`json`/`csv`), content (file text), origin,rights,usage_scope,coverage. JSON is an array of `{text,origin?,author?,date?,rights?,usage_scope?,coverage?}`. CSV has a `text` column and optional same metadata columns. Returns `{source_ids,integration}`. No scraping, no native API claim.
- `human.list_sources`: workspace_id. Returns `{sources:[{id,revision,status,origin,author,date,rights,usage_scope,coverage}]}`; no contents.
- `human.revoke_source` / `human.remove_source`: source_id,expected_revision,reason. Returns `{source_id,status,revision}`. Revocation blocks reads/export and marks derived artifacts; removal erases original and controlled source-derived text while retaining minimal audit metadata. It cannot retract externally exported copies.
- `human.invite_member`: name,kind (`human`/`agent`),role (`editor`/`reviewer`), expected_revision (=workspace membership revision). Returns `{actor,token,member_revision,workspace_revision}`. Owner-only; credentials displayed once by CLI/UI, never in context or logs. Agent-kind cannot approve.
- `human.revoke_member`: member_id,expected_revision (=member revision),reason. Returns `{member_id,revision}`; owner-only; authenticate/use after revocation fails.
- `human.integration_status`: workspace_id. Returns `{integrations:[{provider,account,state,capabilities,scopes,last_verified,limitations,pagination,costs,unavailable_reason}]}`. Social native APIs unavailable; export importer accurately reports tested export path; native client configured/authenticated/read verified/operation tested remain distinct and never inferred from SDK fixtures.
- `human.record_verification`: provider (`codex`/`claude`),expected_revision (adapter record revision),stage,evidence. Returns adapter status. Explicit owner attestation only, never automatic provider claim.
- `human.review_artifacts`: branch_id,expected_revision,dimensions,reason. Returns `{revision_id}`; explicit reuse after invalidation, checks source permissions.
- `human.export_text`: branch_id,revision_id. Returns `{text,status:'exported',revision_id}`; refuses unreviewed artifacts. Does not publish. No approved text inferred from pending proposals.

## State semantics

`revision.fields` maps all dimensions to strings. `revision.locks` maps locked dimensions to exact values. `revision.artifacts` maps present dimension to `{content,dependencies,source_ids,needs_review,input_revision_id,author}`. Changes invalidate existing transitive dependents; unknown dependency edges invalidate conservatively. Voice qualitative rules return warnings, never assert perfect fidelity. Provenance is recorded for each accepted content artifact. Decisions and feedback have authenticated author and timestamp. Text gets revised through explicit decisions; export status is a separate event, publication is absent.

Cross-workspace or unauthorized IDs return NOT_FOUND without revealing existence. Idempotency lookup requires current authorization and returns only sanitized prior responses; do not retain/replay invite tokens. All mutations and audit records commit in one SQLite transaction. Same actor/key/target/arguments replay the result; changed arguments return IDEMPOTENCY_CONFLICT. Concurrent proposals may coexist; acceptance requires unchanged presented base/head and returns REVISION_CONFLICT without losing proposals.

## Transport

HTTP binds `127.0.0.1` only. `/api/login` takes `{token}`, authenticates a human and sets an HttpOnly SameSite=Strict cookie; state-changing requests check exact loopback Origin; no tokens in URLs. `/api/call` takes `{operation,input}` and passes the authenticated actor; `/api/session` returns `{actor,workspace_id}` with no credentials; `/api/logout` removes the session. Domain serialization uses ArenaError.toJSON(). Static files are served from web/ with CSP.

MCP stdio exposes only agentOperations using SDK tool input schemas and connects with an independently provisioned agent token from an ignored, permissions-restricted credential file. It authenticates and rechecks workspace authorization on every request. Tool content gives structured result or structured actionable error; stdout contains protocol only. No human operation is registered. Configure native clients explicitly using examples in docs/mcp-clients.md; no changes to the user's client configurations during development.
