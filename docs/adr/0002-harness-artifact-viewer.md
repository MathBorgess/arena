# 0002: Conversation in the harness, interactive artifact through MCP

Status: accepted. Priority clients are Codex and ChatGPT; the owner explicitly confirmed MCP and artifact interaction test seams on 2026-10-14.

The user wants a quick visualization of the artifact being modified, with direct interaction that becomes context for the existing agent. Keep all conversational work in that harness. Arena owns durable artifacts, revisions, proposals and interaction events, exposed through MCP.

Package a companion skill, the MCP server and artifact viewer together where the client plugin format supports them. A plugin packages installation and workflow; it does not grant a host an interface renderer. Use the standard MCP Apps extension only when the host negotiates support. A compatible tool references a `ui://` resource; the host renders its HTML and brokers tool calls and context updates. The fallback is a compact local artifact viewer using the same domain state and operations. It has no chat, no autonomous agent runner and no hosting requirement.

## Interaction and context

- `arena.open_artifact` identifies an exact branch/revision and returns the artifact context plus viewer metadata. The tool can declare an MCP Apps UI resource in a supporting configuration; unsupported clients receive useful text/structured data and the local viewer location when available.
- A passage selection records the artifact revision, dimension, start/end offsets and selected text. Validate that offsets refer to that revision. Relevant comments, edits, branch choices and human dispositions create durable typed events with authenticated authorship.
- `arena.read_events` returns currently authorized events since an opaque cursor. The agent re-reads the current head before proposing changes. A stale revision never authorizes a write.
- In an MCP Apps host, `updateModelContext` conveys a compact snapshot: artifact ID/revision, selected passage, human action and event cursor. The host may defer it to the next user message and retain only the most recent update; durable events therefore remain the authoritative history.
- An explicit action such as “Revisar este trecho” may request a follow-up through the host's supported message API. Selecting or editing alone does not promise to wake a running or idle agent.
- Changes from agent tools refresh the visible artifact on verified host notifications or bounded refresh. No claim that every token of model output is already a persisted artifact edit.

## Identity and human decisions

Preserve separate human decision authorization. MCP Apps tool visibility `app` is a UI affordance, not sufficient proof of a human actor. The client adapter must establish an authenticated human action channel for accept/edit/lock/profile commands, or route those actions through the local authenticated viewer. Do not promote the existing delegated agent credential to a human token. No credential is exposed in model context, UI-resource metadata or an exported package.

## Compatibility evidence

Official MCP Apps documentation describes embedded UI and bidirectional communication. OpenAI's current plugin quickstart explicitly documents optional UI in ChatGPT; it does not establish identical rendering in Codex. Claude Code documents special treatment of `ui://` resources and does not thereby prove embedded rendering. Real client rendering, UI actions and context delivery must be tested in the selected host.

Sources checked 2026-10-14:

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps model-context update](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiUpdateModelContextRequest.html)
- [OpenAI MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Claude Code MCP resources](https://code.claude.com/docs/en/mcp)

This changes the presentation layer and adds artifact-interaction context. Domain guarantees in ADR 0001 and the original text-only scope remain applicable. No embedded host support or real client pilot has been verified during this architecture update.

## Priority clients and action authorization

Codex uses scoped stdio MCP plus the compact local viewer. ChatGPT uses the same operations with an MCP Apps resource, and an optional Streamable HTTP endpoint for remote client compatibility. ChatGPT desktop local MCP configuration and ChatGPT web remote plugin installation are distinct setup routes. Web requires reachable HTTPS and authentication; no tunnel, deployment, public directory publication or account configuration is performed by this implementation. Claude support is deferred.

The embedded widget may read the artifact, submit edits as pending proposals and record selection/comment context through the scoped agent channel. Its events identify that authenticated actor and UI origin without asserting verified human identity. `arena.record_interaction` cannot accept proposals, change accepted text, unlock values or approve voice. Actual human acceptance and direct accepted edits use the separately authenticated compact viewer. Never pass a human token through model-callable tool arguments.

The acceptance pilot is Codex → ChatGPT. SDK/reference-host fixtures verify protocol and UI behavior; native client execution remains separately recorded.
