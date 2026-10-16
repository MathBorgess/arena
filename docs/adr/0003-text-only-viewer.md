# 0003: Texto e seleção no visualizador; fluxo na conversa

Status: accepted. Latest owner direction on 2026-10-14 supersedes the review controls in ADR 0002 and ticket 03.

The viewer has one read-only text surface: the current pending text proposal, falling back to accepted text when no pending text proposal exists. It has no editorial navigation, chat, comment input, editing, comparison, acceptance, source or voice drawers, or request buttons. Setup authentication and transient errors are allowed only when needed to open the artifact.

Native cursor selection automatically records the exact branch, base revision, proposal ID/version when applicable, UTF16 offsets and text. Empty selection clears the prior passage context. Selection alone never sends a user message or starts an agent turn. MCP Apps updates model context where supported; local fallback records events for the skill to retrieve at the next user message. New persisted proposals refresh the displayed text. Restriction changes clear controlled text and selection, including historical snapshots.

Workflow lives in conversation and skills. Start, revise the selected passage, compare, branch, accept, reject, voice, sources and export are commands interpreted by the companion skill. Use the actual skill invocation supported by the host; do not invent native slash command registration.

Human decisions remain independently authenticated. In a local shell-capable harness, the CLI reads the private owner credential itself and executes a concrete human operation after the user's explicit conversational instruction about its exact version. Never pass owner credentials through MCP, model context or arguments. Agent-only MCP clients cannot approve until an independent human channel is configured. Keep that surface limitation explicit in the native pilot.

The original domain guarantees—immutable accepted revisions, pending proposals, exact human decisions, locks, CAS, source permissions and audit—remain applicable.
