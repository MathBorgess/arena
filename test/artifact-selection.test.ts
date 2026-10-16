import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Arena } from '../src/arena.js';

function fixture() {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Texto atual', objective: 'Selecionar na proposta', idempotency_key: 'create' });
  const base = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Texto aceito anterior.' }, source_ids: [], reason: 'Base fictícia', idempotency_key: 'base' });
  const proposal = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, base_revision_id: base.revision_id, expected_revision: base.revision_id, changes: { text: 'Uma ideia abre uma conversa.' }, source_ids: [], rationale: 'Proposta fictícia', idempotency_key: 'proposal' });
  return { arena, credentials, scope, created, base, proposal };
}

test('current proposal text and native selection have exact proposal version and base without changing accepted text', () => {
  const { arena, credentials, scope, created, base, proposal } = fixture();
  try {
    const opened = arena.execute('arena.open_artifact', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(opened.artifact.text, 'Uma ideia abre uma conversa.');
    assert.equal(opened.artifact.proposal_id, proposal.proposal_id);
    assert.equal(opened.artifact.presented_version, 1);
    assert.equal(opened.artifact.revision_id, base.revision_id);
    const recorded = arena.execute('arena.record_interaction', credentials.agent, { ...scope, branch_id: created.branch_id, revision_id: base.revision_id, proposal_id: proposal.proposal_id, presented_version: 1, expected_revision: base.revision_id, type: 'selection', dimension: 'text', selection: { start: 4, end: 9, text: 'ideia' }, idempotency_key: 'selection' });
    const event = arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events.find((event: any) => event.id === recorded.event_id);
    assert.deepEqual(event.selection, { start: 4, end: 9, text: 'ideia' });
    assert.equal(event.proposal_id, proposal.proposal_id); assert.equal(event.presented_version, 1);
    assert.deepEqual(event.author, credentials.agent);
    assert.equal(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.fields.text, 'Texto aceito anterior.');
  } finally { arena.close(); }
});

test('MCP selects an exact pending proposal, clears its selection and keeps default fallback following current proposals', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createMcpServer } = await import('../src/mcp.js');
  const { arena, credentials, scope, created, base, proposal } = fixture();
  const server = createMcpServer(arena, credentials.agent_token, { ...scope, viewer_url: 'http://127.0.0.1:8787/' });
  const client = new Client({ name: 'proposal-selection-fixture', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    const opened = await client.callTool({ name: 'arena.open_artifact', arguments: { branch_id: created.branch_id, proposal_id: proposal.proposal_id, presented_version: 1 } });
    assert.equal(opened.isError, undefined);
    const location = new URL((opened.structuredContent as any).presentation.viewer_url);
    assert.equal(location.searchParams.get('proposal_id'), proposal.proposal_id); assert.equal(location.searchParams.get('presented_version'), '1');
    const wrong = await client.callTool({ name: 'arena.record_interaction', arguments: { branch_id: created.branch_id, revision_id: base.revision_id, expected_revision: base.revision_id, proposal_id: proposal.proposal_id, presented_version: 2, type: 'selection', dimension: 'text', selection: { start: 4, end: 9, text: 'ideia' }, idempotency_key: 'wrong-version' } });
    assert.equal((wrong.structuredContent as any).error.code, 'REVISION_CONFLICT');
    const clear = await client.callTool({ name: 'arena.record_interaction', arguments: { branch_id: created.branch_id, revision_id: base.revision_id, expected_revision: base.revision_id, proposal_id: proposal.proposal_id, presented_version: 1, type: 'selection_clear', dimension: 'text', selection: null, idempotency_key: 'clear' } });
    assert.equal(clear.isError, undefined);
    const events = arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events;
    assert.equal(events.at(-1).type, 'selection_clear'); assert.equal(events.at(-1).selection, null);
    const current = await client.callTool({ name: 'arena.open_artifact', arguments: { branch_id: created.branch_id } });
    assert.equal(new URL((current.structuredContent as any).presentation.viewer_url).searchParams.has('revision_id'), false);
  } finally { await client.close(); await server.close(); arena.close(); }
});

test('proposal selection rechecks pending version, exact base, head and current source permission', () => {
  const { arena, credentials, scope, created, base, proposal } = fixture();
  try {
    const input = { ...scope, branch_id: created.branch_id, revision_id: base.revision_id, proposal_id: proposal.proposal_id, presented_version: 1, expected_revision: base.revision_id, type: 'selection', dimension: 'text', selection: { start: 4, end: 9, text: 'ideia' }, idempotency_key: 'select' };
    assert.throws(() => arena.execute('arena.record_interaction', credentials.agent, { ...input, revision_id: created.revision_id }), { code: 'REVISION_CONFLICT' });
    assert.throws(() => arena.execute('arena.record_interaction', credentials.agent, { ...input, selection: { start: 4, end: 9, text: 'aceit' } }), { code: 'INVALID_INPUT' });
    arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: base.revision_id, changes: { text: 'Outra base aprovada.' }, dependencies: { text: [] }, source_ids: [], reason: 'Avançar a ramificação', idempotency_key: 'advance' });
    assert.throws(() => arena.execute('arena.record_interaction', credentials.agent, input), { code: 'REVISION_CONFLICT' });
    const source = arena.execute('human.import_sources', credentials.owner, { ...scope, format: 'json', content: JSON.stringify([{ text: 'Referência fictícia.' }]), origin: 'Arquivo fictício', rights: 'Autorizado', usage_scope: 'editorial', coverage: 'Uma amostra', idempotency_key: 'source' }).source_ids[0];
    const head = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.id;
    const sourced = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: head, base_revision_id: head, changes: { text: 'Uma ideia usa a referência.' }, source_ids: [source], rationale: 'Proposta referenciada', idempotency_key: 'sourced' });
    arena.execute('human.revoke_source', credentials.owner, { ...scope, source_id: source, expected_revision: 1, reason: 'Restrição fictícia', idempotency_key: 'revoke' });
    assert.equal(arena.execute('arena.open_artifact', credentials.agent, { ...scope, branch_id: created.branch_id, proposal_id: sourced.proposal_id, presented_version: 1 }).artifact.text, '');
    assert.throws(() => arena.execute('arena.record_interaction', credentials.agent, { ...input, expected_revision: head, revision_id: head, proposal_id: sourced.proposal_id }), { code: 'SOURCE_UNAVAILABLE' });
    arena.execute('arena.record_interaction', credentials.agent, { ...input, expected_revision: head, revision_id: head, proposal_id: sourced.proposal_id, type: 'selection_clear', selection: null });
    assert.equal(arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events.at(-1).selection, null);
  } finally { arena.close(); }
});
