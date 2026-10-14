import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { Arena } from '../src/arena.js';
import { startHttpServer } from '../src/http.js';

test('local viewer authenticates a human independently and can resume an exploration without exposing credentials', async () => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    assert.equal((await fetch(`${viewer.url}/api/session`)).status, 401);
    const agent = await fetch(`${viewer.url}/api/login`, { method: 'POST', headers: { Origin: viewer.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: credentials.agent_token }) });
    assert.equal(agent.status, 403);
    const login = await fetch(`${viewer.url}/api/login`, { method: 'POST', headers: { Origin: viewer.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: credentials.owner_token }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal(cookie.includes(credentials.owner_token), false);
    assert.equal(JSON.stringify(await login.json()).includes(credentials.owner_token), false);
    const headers = { Origin: viewer.url, Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' };
    const created = await fetch(`${viewer.url}/api/call`, { method: 'POST', headers, body: JSON.stringify({ operation: 'arena.create_exploration', input: { title: 'Uma pergunta', objective: 'Pensar antes de publicar', idempotency_key: 'create' } }) });
    assert.equal(created.status, 200);
    const result = await created.json();
    const resumed = await fetch(`${viewer.url}/api/call`, { method: 'POST', headers, body: JSON.stringify({ operation: 'arena.read_context', input: { branch_id: result.branch_id } }) });
    assert.equal((await resumed.json()).exploration.title, 'Uma pergunta');
    const session = await fetch(`${viewer.url}/api/session`, { headers });
    assert.deepEqual(await session.json(), { actor: credentials.owner, workspace_id: credentials.workspace_id });
  } finally { await viewer.close(); arena.close(); }
});

test('local human operations reject cross-site requests, forged identity, oversized bodies and logout reuse', async () => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    const post = (path: string, body: any, headers = {}) => fetch(`${viewer.url}${path}`, { method: 'POST', headers: { Origin: viewer.url, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post('/api/login', { token: credentials.owner_token }, { Origin: 'https://malicioso.example' })).status, 403);
    const invalidHost = await new Promise<number>(resolve => { const request = httpRequest(viewer.url, { headers: { Host: 'malicioso.example' } }, response => { response.resume(); resolve(response.statusCode!); }); request.end(); });
    assert.equal(invalidHost, 403);
    const login = await post('/api/login', { token: credentials.owner_token });
    const Cookie = login.headers.get('set-cookie')!.split(';')[0];
    const request = { operation: 'arena.create_exploration', input: { title: 'Teste', objective: 'Sem efeitos cross-site', idempotency_key: 'create', actor: credentials.agent } };
    assert.equal((await post('/api/call', request, { Cookie, Origin: 'https://malicioso.example' })).status, 403);
    assert.equal((await post('/api/call', { ...request, input: { ...request.input, workspace_id: 'foreign' } }, { Cookie })).status, 403);
    const oversized = await post('/api/call', { ...request, input: { ...request.input, title: 'x'.repeat(1024 * 1024) } }, { Cookie });
    assert.equal(oversized.status, 400);
    assert.equal((await post('/api/logout', {}, { Cookie })).status, 200);
    assert.equal((await post('/api/call', request, { Cookie })).status, 401);
    assert.equal(arena.execute('arena.list_work', credentials.agent, { workspace_id: credentials.workspace_id }).explorations.length, 0);
    const page = await fetch(viewer.url);
    assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal(page.headers.get('access-control-allow-origin'), null);
  } finally { await viewer.close(); arena.close(); }
});
