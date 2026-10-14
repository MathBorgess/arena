import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Arena } from '../src/arena.js';

const exec = promisify(execFile);
const cli = resolve('src/cli.ts');
const run = (args: string[], env?: NodeJS.ProcessEnv) => exec(process.execPath, ['--import', 'tsx', cli, ...args], {
  cwd: resolve('.'), ...(env ? { env: { ...process.env, ...env } } : {})
});

test('local setup creates restricted durable files without printing credentials or resetting an existing workspace', async t => {
  const parent = mkdtempSync(join(tmpdir(), 'arena-cli-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'private');
  const result = await run(['init', '--data-dir', directory, '--workspace-name', 'Oficina fictícia', '--owner-name', 'Autora exemplo']);
  const owner = readFileSync(join(directory, 'owner.token'), 'utf8').trim();
  const agent = readFileSync(join(directory, 'agent.token'), 'utf8').trim();
  assert.ok(owner.length >= 32 && agent.length >= 32);
  assert.notEqual(owner, agent);
  assert.equal(result.stdout.includes(owner) || result.stdout.includes(agent) || result.stderr.includes(owner), false);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const name of ['owner.token', 'agent.token', 'arena.json', 'arena.sqlite']) assert.equal(statSync(join(directory, name)).mode & 0o777, 0o600);
  const config = JSON.parse(readFileSync(join(directory, 'arena.json'), 'utf8'));
  assert.equal(config.format_version, 1);
  assert.ok(config.workspace_id);
  await assert.rejects(run(['init', '--data-dir', directory]));
  assert.equal(readFileSync(join(directory, 'owner.token'), 'utf8').trim(), owner);
});

test('serve keeps the human viewer and agent HTTP channel separate over the same durable workspace', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-serve-'));
  await run(['init', '--data-dir', directory]);
  const child = spawn(process.execPath, ['--import', 'tsx', cli, 'serve', '--data-dir', directory, '--port', '0'], {
    cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    rmSync(directory, { recursive: true, force: true });
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CLI serve did not start.')), 10_000);
    child.once('exit', () => { clearTimeout(timer); reject(new Error('CLI serve exited before listening.')); });
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/Arena local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/api/session`)).status, 401);
  const agent = readFileSync(join(directory, 'agent.token'), 'utf8').trim();
  const login = await fetch(`${url}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ token: agent }) });
  assert.equal(login.status, 403);
  const client = new Client({ name: 'sdk-http-cli-fixture', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: {
      headers: { authorization: `Bearer ${agent}` }
    } }));
    const created = await client.callTool({ name: 'arena.create_exploration', arguments: {
      idempotency_key: 'serve-fixture', title: 'Ideia fictícia local', objective: 'Comparar dois canais'
    } });
    assert.ok((created.structuredContent as any).branch_id);
  } finally { await client.close(); }
});

test('SDK stdio sessions preserve context across independent CLI processes without exposing the owner token', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-stdio-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await run(['init', '--data-dir', directory]);
  const connect = async () => {
    const client = new Client({ name: 'sdk-stdio-fixture', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', 'tsx', cli, 'mcp', '--data-dir', directory], stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr += chunk; });
    await client.connect(transport);
    return { client, stderr: () => stderr };
  };
  const first = await connect();
  const input = { title: 'Ideia fictícia transferível', objective: 'Continuar sem o chat inteiro', idempotency_key: 'portable' };
  const created = await first.client.callTool({ name: 'arena.create_exploration', arguments: input });
  assert.equal(created.isError, undefined);
  await first.client.close();
  const second = await connect();
  try {
    const recovered = await second.client.callTool({ name: 'arena.create_exploration', arguments: input });
    assert.deepEqual(recovered.structuredContent, created.structuredContent);
    const context = await second.client.callTool({ name: 'arena.read_context', arguments: {
      branch_id: (created.structuredContent as any).branch_id
    } });
    assert.equal((context.structuredContent as any).exploration.title, 'Ideia fictícia transferível');
    const owner = readFileSync(join(directory, 'owner.token'), 'utf8').trim();
    assert.equal(JSON.stringify(context).includes(owner) || first.stderr().includes(owner) || second.stderr().includes(owner), false);
  } finally { await second.client.close(); }
});

test('CLI provisions distinct named agent identities while keeping their credentials in private files', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-agents-'));
  const clients: Client[] = [];
  t.after(async () => { for (const client of clients) await client.close(); rmSync(directory, { recursive: true, force: true }); });
  await run(['init', '--data-dir', directory]);
  const codex = await run(['agent', '--name', 'codex', '--data-dir', directory]);
  const chatgpt = await run(['agent', '--name', 'chatgpt', '--data-dir', directory]);
  const codexToken = readFileSync(join(directory, 'agents', 'codex.token'), 'utf8').trim();
  const chatgptToken = readFileSync(join(directory, 'agents', 'chatgpt.token'), 'utf8').trim();
  assert.notEqual(codexToken, chatgptToken);
  assert.equal((codex.stdout + codex.stderr + chatgpt.stdout + chatgpt.stderr).includes(codexToken), false);
  assert.equal(statSync(join(directory, 'agents')).mode & 0o777, 0o700);
  assert.equal(statSync(join(directory, 'agents', 'codex.token')).mode & 0o777, 0o600);
  for (const name of ['codex', 'chatgpt']) {
    const client = new Client({ name: `sdk-fixture-${name}`, version: '1.0.0' }); clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: ['--import', 'tsx', cli, 'mcp', '--data-dir', directory, '--agent', name], stderr: 'pipe' }));
    const created = await client.callTool({ name: 'arena.create_exploration', arguments: {
      idempotency_key: 'same-key', title: `Ideia fictícia ${name}`, objective: 'Separar autoria de agentes'
    } });
    assert.equal(created.isError, undefined);
  }
  // Same key belongs to each actor, so the second client's differently titled exploration succeeds.
  const config = JSON.parse(readFileSync(join(directory, 'arena.json'), 'utf8'));
  assert.ok(config.membership_revision >= 3);
  await assert.rejects(run(['agent', '--name', 'codex', '--data-dir', directory]));
  assert.equal(readFileSync(join(directory, 'agents', 'codex.token'), 'utf8').trim(), codexToken);
});

test('stdio setup refuses a human credential file instead of inheriting approval permissions', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-human-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await run(['init', '--data-dir', directory]);
  const client = new Client({ name: 'sdk-denied-human-channel', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', 'tsx', cli, 'mcp', '--data-dir', directory], stderr: 'pipe',
    env: { PATH: process.env.PATH ?? '', ARENA_AGENT_TOKEN_FILE: join(directory, 'owner.token') } });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk; });
  try { await assert.rejects(client.connect(transport)); }
  finally { await client.close(); }
  assert.match(stderr, /ACCESS_DENIED/);
  assert.equal(stderr.includes(readFileSync(join(directory, 'owner.token'), 'utf8').trim()), false);
});

test('a conversational human command accepts the exact proposal once and preserves a conflicting alternative', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-conversation-'));
  await run(['init', '--data-dir', directory]);
  const config = JSON.parse(readFileSync(join(directory, 'arena.json'), 'utf8'));
  const ownerToken = readFileSync(join(directory, 'owner.token'), 'utf8').trim();
  const arena = new Arena(config.database_path);
  t.after(() => { arena.close(); rmSync(directory, { recursive: true, force: true }); });
  const agent = arena.authenticate(readFileSync(join(directory, 'agent.token'), 'utf8').trim());
  const scope = { workspace_id: config.workspace_id };
  const created = arena.execute('arena.create_exploration', agent, {
    ...scope, idempotency_key: 'start', title: 'Escolha fictícia', objective: 'Aceitar na conversa'
  });
  const proposal = (key: string, theme: string) => arena.execute('arena.submit_proposal', agent, {
    ...scope, idempotency_key: key, branch_id: created.branch_id, base_revision_id: created.revision_id,
    expected_revision: created.revision_id, changes: { theme }, rationale: 'Alternativa fictícia', source_ids: []
  });
  const a = proposal('a', 'Tema escolhido');
  const b = proposal('b', 'Outro tema preservado');
  const path = join(directory, 'input.json');
  const call = async (operation: string, input: object) => {
    writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
    return run(['call', '--operation', operation, '--input-file', path, '--data-dir', directory]);
  };
  const input = { idempotency_key: 'chat-accept', proposal_id: a.proposal_id, presented_version: a.version,
    expected_revision: created.revision_id, expected_head_revision: created.revision_id, decision: 'accepted' };
  const first = await call('human.decide_proposal', input);
  const accepted = JSON.parse(first.stdout);
  assert.ok(accepted.revision_id);
  assert.deepEqual(JSON.parse((await call('human.decide_proposal', input)).stdout), accepted);
  assert.deepEqual(JSON.parse((await call('arena.get_operation', { idempotency_key: 'chat-accept' })).stdout), {
    found: true, result: accepted
  });
  await assert.rejects(call('human.decide_proposal', { ...input, idempotency_key: 'chat-stale', proposal_id: b.proposal_id }),
    error => JSON.parse((error as any).stderr).error.code === 'REVISION_CONFLICT');
  const context = JSON.parse((await call('arena.read_context', { branch_id: created.branch_id })).stdout);
  assert.equal(context.revision.fields.theme, 'Tema escolhido');
  assert.equal(context.proposals.find((item: any) => item.id === b.proposal_id).status, 'pending');
  assert.equal(context.proposals.find((item: any) => item.id === b.proposal_id).changes.theme, 'Outro tema preservado');
  assert.equal(first.stdout.includes(ownerToken) || first.stderr.includes(ownerToken), false);
});

test('the editorial CLI refuses delegated agent credentials, identity arguments and credential-issuing operations', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-cli-editorial-auth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await run(['init', '--data-dir', directory]);
  const path = join(directory, 'input.json');
  const command = (operation: string) => ['call', '--operation', operation, '--input-file', path, '--data-dir', directory];
  writeFileSync(path, '{}', { mode: 0o600 });
  await assert.rejects(run(command('arena.list_work'), { ARENA_OWNER_TOKEN_FILE: join(directory, 'agent.token') }),
    error => JSON.parse((error as any).stderr).error.code === 'ACCESS_DENIED' && (error as any).stdout === '');
  await assert.rejects(run(command('human.invite_member')), error => JSON.parse((error as any).stderr).error.code === 'ACCESS_DENIED');
  await assert.rejects(run(command('human.revoke_member')), error => JSON.parse((error as any).stderr).error.code === 'ACCESS_DENIED');
  writeFileSync(path, JSON.stringify({ actor: { kind: 'human' } }));
  await assert.rejects(run(command('arena.list_work')), error => JSON.parse((error as any).stderr).error.code === 'INVALID_INPUT');
  writeFileSync(path, '{}');
  const context = await run(command('arena.list_work'));
  assert.equal(JSON.parse(context.stdout).explorations.length, 0);
});
