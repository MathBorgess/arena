# 0001: Local textual pilot

Status: accepted for implementation under the owner's instruction to implement the supplied spec.

Use Node.js 24, TypeScript, durable SQLite (node:sqlite), one domain service and an MCP server. ADR 0002 replaces the original standalone web-interface choice with a compact artifact viewer and harness-native conversation. A loopback HTTP viewer is a compatibility fallback. Separate processes use SQLite transactions, WAL, a busy timeout and optimistic revision checks. No model API calls or subscriptions are needed: existing native clients submit proposals through MCP.

The supported pilot is one local machine and fictional content. Shared hosted collaboration, actual brands, real provider sessions and official social APIs require later account and access decisions. The v1 imports user-provided authorized text exports through an explicit export adapter; it never claims a native social connection.

Keep accepted revisions and voice versions immutable. Human acceptance requires an authenticated human channel, the head revision and the exact presented proposal version. ADR 0003 routes conversational human decisions through a separate local CLI, while the viewer only supplies text and selection. Agent credentials are separately provisioned and never inherit approval privileges.
