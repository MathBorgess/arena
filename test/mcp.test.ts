import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Arena } from '../src/arena.js';
import { createMcpHttpHandler, createMcpServer } from '../src/mcp.js';

test('a scoped MCP client discovers editorial tools and resumes its persisted exploration', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-mcp-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const server = createMcpServer(arena, credentials.agent_token, { workspace_id: credentials.workspace_id });
  const client = new Client({ name: 'fixture-agent', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); arena.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.connect(a);
  await client.connect(b);
  const { tools } = await client.listTools();
  assert.ok(tools.some(tool => tool.name === 'arena.open_artifact'));
  assert.ok(tools.some(tool => tool.name === 'arena.record_interaction'));
  assert.ok(tools.every(tool => tool.name.startsWith('arena.')));
  const created = await client.callTool({ name: 'arena.create_exploration', arguments: {
    title: 'Uma pergunta fictícia', objective: 'Explorar antes de escrever', idempotency_key: 'start'
  } });
  assert.equal(created.isError, undefined);
  const ids = created.structuredContent as Record<string, string>;
  const context = await client.callTool({ name: 'arena.read_context', arguments: { branch_id: ids.branch_id } });
  assert.equal(context.isError, undefined);
  assert.equal((context.structuredContent as any).revision.id, ids.revision_id);
  assert.equal((context.structuredContent as any).exploration.title, 'Uma pergunta fictícia');
  assert.deepEqual(JSON.parse((context.content as any)[0].text), context.structuredContent);
  const proposal = await client.callTool({ name: 'arena.submit_proposal', arguments: {
    branch_id: ids.branch_id, base_revision_id: ids.revision_id, expected_revision: ids.revision_id,
    idempotency_key: 'declared-session', changes: { theme: 'Aprender com perguntas' },
    rationale: 'Uma proposta fictícia', source_ids: [],
    session_metadata: { provider: 'sdk-fixture', client_name: 'fictional-handoff', client_version: '1.0.0' }
  } });
  assert.equal(proposal.isError, undefined);
  const resumed = await client.callTool({ name: 'arena.read_context', arguments: { branch_id: ids.branch_id } });
  assert.ok((resumed.structuredContent as any).sessions.some((session: any) => session.id === (proposal.structuredContent as any).session_id));
});

test('loopback HTTP MCP requires an agent bearer token and preserves the same domain behavior across requests', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-mcp-http-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const handler = createMcpHttpHandler(arena, { workspace_id: credentials.workspace_id });
  const http = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as any).port;
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const client = new Client({ name: 'reference-http-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await new Promise<void>(resolve => http.close(() => resolve()));
    arena.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.equal((await fetch(url, { method: 'POST' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${credentials.owner_token}` } })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: {
    authorization: `Bearer ${credentials.agent_token}`, origin: 'https://untrusted.invalid'
  } })).status, 403);
  const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(url, { method: 'POST', headers: {
      authorization: `Bearer ${credentials.agent_token}`, host: `untrusted.invalid:${port}`
    } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(wrongHostStatus, 403);
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: {
    headers: { authorization: `Bearer ${credentials.agent_token}` }
  } }));
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'arena.submit_proposal'));
  const created = await client.callTool({ name: 'arena.create_exploration', arguments: {
    idempotency_key: 'http-start', title: 'Ideia HTTP fictícia', objective: 'Continuar por outro transporte'
  } });
  const context = await client.callTool({ name: 'arena.read_context', arguments: {
    branch_id: (created.structuredContent as any).branch_id
  } });
  assert.equal((context.structuredContent as any).exploration.title, 'Ideia HTTP fictícia');
});

test('an artifact-capable client discovers a self-contained UI resource without receiving a human capability', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-mcp-ui-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const htmlPath = join(directory, 'fixture.html');
  writeFileSync(htmlPath, '<!doctype html><html lang="pt-BR"><body>Artefato fictício</body></html>');
  const server = createMcpServer(arena, credentials.agent_token, { workspace_id: credentials.workspace_id, ui_html_path: htmlPath });
  const client = new Client({ name: 'reference-app-host', version: '1.0.0' }, {
    capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); arena.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.connect(a); await client.connect(b);
  const { tools } = await client.listTools();
  const open = tools.find(tool => tool.name === 'arena.open_artifact');
  assert.equal((open?._meta?.ui as any)?.resourceUri, 'ui://arena/artifact/v1.html');
  const created = await client.callTool({ name: 'arena.create_exploration', arguments: {
    idempotency_key: 'app-exploration', title: 'Artefato fictício', objective: 'Ver a revisão exata'
  } });
  const artifact = await client.callTool({ name: 'arena.open_artifact', arguments: {
    branch_id: (created.structuredContent as any).branch_id, revision_id: (created.structuredContent as any).revision_id
  } });
  assert.equal((artifact.structuredContent as any).presentation.ui_support, 'advertised');
  assert.equal((artifact.structuredContent as any).presentation.human_actions_require_authentication, true);
  const resource = await client.readResource({ uri: 'ui://arena/artifact/v1.html' });
  assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match((resource.contents[0] as any).text, /Artefato fictício/);
  assert.equal(JSON.stringify(resource).includes(credentials.owner_token), false);
  assert.throws(() => createMcpServer(arena, credentials.owner_token), { code: 'ACCESS_DENIED' });
  assert.equal((await client.callTool({ name: 'human.decide_proposal', arguments: {} })).isError, true);
  const forged = await client.callTool({ name: 'arena.list_work', arguments: { role: 'human' } });
  assert.equal(forged.isError, true);
  assert.equal((forged.structuredContent as any).error.code, 'INVALID_INPUT');
  assert.equal((forged.structuredContent as any).error.retryable, false);
});

test('embedded passage context stays attributed to the scoped agent and a forged human origin does not accept content', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-mcp-events-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.owner, {
    ...scope, idempotency_key: 'start', title: 'Texto fictício', objective: 'Revisar um trecho'
  });
  const edited = arena.execute('human.edit_branch', credentials.owner, {
    ...scope, idempotency_key: 'accepted-text', branch_id: created.branch_id, expected_revision: created.revision_id,
    changes: { text: 'Uma pergunta abre possibilidades.' }, source_ids: [], reason: 'Texto fictício aprovado pela autora.'
  });
  const server = createMcpServer(arena, credentials.agent_token, { workspace_id: credentials.workspace_id,
    viewer_url: 'http://127.0.0.1:8787/?discard=old' });
  const client = new Client({ name: 'sdk-widget-channel', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); arena.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.connect(a); await client.connect(b);
  const result = await client.callTool({ name: 'arena.record_interaction', arguments: {
    idempotency_key: 'selection', branch_id: created.branch_id, revision_id: edited.revision_id,
    expected_revision: edited.revision_id, type: 'selection', dimension: 'text',
    selection: { start: 0, end: 12, text: 'Uma pergunta' }, ui_origin: 'authenticated_human_channel'
  } });
  assert.equal(result.isError, undefined);
  const events = await client.callTool({ name: 'arena.read_events', arguments: { branch_id: created.branch_id } });
  const selection = (events.structuredContent as any).events.find((event: any) => event.id === (result.structuredContent as any).event_id);
  assert.equal(selection.author.kind, 'agent');
  assert.equal(selection.ui_origin, 'unverified');
  const next = await client.callTool({ name: 'arena.record_interaction', arguments: {
    idempotency_key: 'comment-after-checkpoint', branch_id: created.branch_id, revision_id: edited.revision_id,
    expected_revision: edited.revision_id, type: 'comment', dimension: 'text', comment: 'Revisar a abertura fictícia.'
  } });
  const incremental = await client.callTool({ name: 'arena.read_events', arguments: {
    branch_id: created.branch_id, since_cursor: (events.structuredContent as any).event_cursor
  } });
  assert.equal(incremental.isError, undefined);
  assert.deepEqual((incremental.structuredContent as any).events.map((event: any) => event.id), [(next.structuredContent as any).event_id]);
  const artifact = await client.callTool({ name: 'arena.open_artifact', arguments: { branch_id: created.branch_id } });
  assert.equal((artifact.structuredContent as any).revision.id, edited.revision_id);
  assert.equal((artifact.structuredContent as any).presentation.ui_support, 'not_advertised');
  const viewer = new URL((artifact.structuredContent as any).presentation.viewer_url);
  assert.equal(viewer.searchParams.get('branch_id'), created.branch_id);
  assert.equal(viewer.searchParams.get('revision_id'), null);
  assert.equal(viewer.searchParams.has('discard'), false);
  const unavailable = await client.callTool({ name: 'arena.read_context', arguments: { branch_id: 'unavailable-branch' } });
  assert.equal(unavailable.isError, true);
  assert.equal((unavailable.structuredContent as any).error.code, 'NOT_FOUND');
  assert.equal(typeof (unavailable.structuredContent as any).error.next_step, 'string');
});

test('revoked workspace access ends established MCP reads and HTTP requests immediately', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-mcp-revoke-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const options = { workspace_id: credentials.workspace_id };
  const server = createMcpServer(arena, credentials.agent_token, options);
  const client = new Client({ name: 'sdk-revocation-fixture', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const handler = createMcpHttpHandler(arena, options);
  const http = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const url = new URL(`http://127.0.0.1:${(http.address() as any).port}/mcp`);
  t.after(async () => { await client.close(); await server.close();
    await new Promise<void>(resolve => http.close(() => resolve())); arena.close(); rmSync(directory, { recursive: true, force: true }); });
  await server.connect(a); await client.connect(b);
  assert.equal((await client.callTool({ name: 'arena.list_work', arguments: {} })).isError, undefined);
  arena.execute('human.revoke_member', credentials.owner, { workspace_id: credentials.workspace_id,
    idempotency_key: 'revoke-sdk-agent', member_id: credentials.agent.id, expected_revision: 1, reason: 'Fim do piloto fictício.' });
  const denied = await client.callTool({ name: 'arena.list_work', arguments: {} });
  assert.equal(denied.isError, true);
  assert.equal((denied.structuredContent as any).error.code, 'ACCESS_DENIED');
  await assert.rejects(client.readResource({ uri: 'ui://arena/artifact/v1.html' }));
  assert.equal((await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${credentials.agent_token}` } })).status, 401);
});
