# 0004: Bloco editável, DNA da produção e contexto incremental

Status: accepted by owner direction during the native Codex pilot on 2026-10-14. Supersedes the read-only and repeated context-read requirements of ADR 0003; its independently authenticated human decision channel remains in effect.

## Observed trigger

The owner selected passages and requested revisions in a real Codex MCP Apps panel. Their UX feedback asks for direct writing, captured manual changes, faster interactions, `arena:...` commands, an editable production DNA, one text block without another artifact tab, and conversational approval. This direction authorizes the change; it does not approve any editorial proposal.

## Contract

- The current text is a native editable textarea. Input autosaves a small UTF16 patch after a brief debounce or focus departure. Copy and native mouse/keyboard selection remain available. No editorial buttons, chat, navigation or extra drawers are introduced.
- Text edits append pending proposals with an exact origin; accepted revisions stay immutable. An exact artifact/version and branch head guard competing edits. A refresh cannot overwrite unsaved typing. A conflict keeps the local draft visible and asks for comparison. Restrictions clear controlled text even when it is unsaved.
- `arena.sync_context` preloads current text, DNA, selection and the compact editorial context once. An actor/branch scoped cursor returns aggregate text patches, changed context keys and new event metadata. Permission changes force a sanitized reset. Historical passages are available through the audit API but are not replayed as active selection.
- Selection persistence returns its committed event in the same write response. The block forwards updates with `updateModelContext` without sending a message or starting an agent turn. Embedded event authorship remains the authenticated agent with unverified UI origin, not human approval.
- Production DNA is a versioned editable draft, separate from approved global voice profiles: intention, identity, audience, tone, vocabulary, structure, references, know-how, constraints, confirmed nuances and agent hypotheses. It uses the same block with `surface: dna`; `arena:texto` returns to text. Source restrictions apply to DNA and its history/retries.
- The companion skill interprets literal `arena:contexto`, `arena:dna`, `arena:revisar`, `arena:variar`, `arena:aprovar` and related messages. These are conversation commands, not an assertion that a host registered new slash commands. Explicit Codex skill invocation remains `$arena arena:dna` or its skill selector.
- “Aprovado” about the displayed current version suffices to execute the independent human CLI once. “Gostei”, selection and manual edits are feedback or draft work. A statement about how approvals should work is product feedback. Agents never gain human authorization through MCP.
- Prefer the existing inline block. No additional HTTP fallback tab is opened when MCP Apps works. Request `prefersBorder: false` and remove the product's artifact title. Host tabs, expand controls and chrome remain host-controlled; the server cannot promise to remove them.

## Evidence boundary

The earlier read-only pilot remains valid historical evidence for that revision. Editable typing, incremental updates and DNA require their own tests and real owner use. A fixture or an automated edit cannot be reported as human approval of this new direction's implementation.
