import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Arena } from '../src/arena.js';

function fixture() {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Bloco fictício', owner_name: 'Autora fictícia' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope,
    title: 'Brincar com texto', objective: 'Testar criação', idempotency_key: 'start' });
  const proposal = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id,
    expected_revision: created.revision_id, base_revision_id: created.revision_id,
    changes: { text: 'Uma ideia abre uma conversa.' }, source_ids: [], rationale: 'Ficção', idempotency_key: 'first' });
  return { arena, credentials, scope, created, proposal };
}

test('editing the notepad appends an exact pending patch, preserves its origin and refuses a competing stale edit', () => {
  const f = fixture();
  try {
    const input = { ...f.scope, branch_id: f.created.branch_id, expected_revision: f.created.revision_id,
      artifact_id: f.proposal.proposal_id, presented_version: 1, patch: { start: 4, end: 9, text: 'briga' }, idempotency_key: 'edit' };
    const saved = f.arena.execute('arena.patch_artifact', f.credentials.agent, input);
    const current = f.arena.execute('arena.open_artifact', f.credentials.agent, { ...f.scope, branch_id: f.created.branch_id });
    assert.equal(current.artifact.text, 'Uma briga abre uma conversa.');
    assert.equal(current.proposals.find((p: any) => p.id === saved.artifact.proposal_id).origin_proposal_id, f.proposal.proposal_id);
    assert.equal(current.revision.fields.text, '');
    assert.deepEqual(current.decisions, []);
    assert.equal(saved.artifact.text, undefined, 'a patch response does not resend the complete text');
    assert.deepEqual(saved.patch, { start: 4, end: 9, text: 'briga' });
    assert.deepEqual(f.arena.execute('arena.patch_artifact', f.credentials.agent, input), saved);
    assert.throws(() => f.arena.execute('arena.patch_artifact', f.credentials.agent,
      { ...input, idempotency_key: 'competing' }), { code: 'REVISION_CONFLICT' });
    assert.equal(current.events.at(-1).type, 'text_edit');
    assert.equal(current.events.at(-1).selection, null);
  } finally { f.arena.close(); }
});

test('accepting the current notepad keeps the approved text visible instead of resurrecting an older pending alternative', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const saved = f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...scope,
      expected_revision: f.created.revision_id, artifact_id: f.proposal.proposal_id, presented_version: 1,
      patch: { start: 4, end: 9, text: 'briga' }, idempotency_key: 'before-approval' });
    f.arena.execute('human.decide_proposal', f.credentials.owner, { ...f.scope, proposal_id: saved.artifact.proposal_id,
      presented_version: 1, expected_revision: f.created.revision_id, expected_head_revision: f.created.revision_id,
      decision: 'accepted', idempotency_key: 'approve' });
    const next = f.arena.execute('arena.open_artifact', f.credentials.agent, scope);
    assert.equal(next.artifact.kind, 'accepted'); assert.equal(next.artifact.text, 'Uma briga abre uma conversa.');
    assert.equal(next.proposals.find((p: any) => p.id === f.proposal.proposal_id).status, 'pending');
  } finally { f.arena.close(); }
});

test('manual editing preserves the text dependency on its audience after approval', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const base = f.arena.execute('human.edit_branch', f.credentials.owner, { ...scope, expected_revision: f.created.revision_id,
      changes: { audience: 'Iniciantes', text: 'Um texto para iniciantes.' }, dependencies: { audience: [], text: ['audience'] },
      source_ids: [], reason: 'Base fictícia', idempotency_key: 'dependent-base' });
    const saved = f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...scope,
      expected_revision: base.revision_id, artifact_id: base.revision_id, presented_version: 0,
      patch: { start: 0, end: 2, text: 'Outro' }, idempotency_key: 'dependent-edit' });
    const accepted = f.arena.execute('human.decide_proposal', f.credentials.owner, { ...f.scope, proposal_id: saved.artifact.proposal_id,
      presented_version: 1, expected_revision: base.revision_id, expected_head_revision: base.revision_id,
      decision: 'accepted', idempotency_key: 'dependent-approval' });
    f.arena.execute('human.edit_branch', f.credentials.owner, { ...scope, expected_revision: accepted.revision_id,
      changes: { audience: 'Especialistas' }, dependencies: { audience: [] }, source_ids: [], reason: 'Outra entrada', idempotency_key: 'audience' });
    const current = f.arena.execute('arena.read_context', f.credentials.agent, scope);
    assert.equal(current.revision.artifacts.text.needs_review, true);
    assert.deepEqual(current.revision.artifacts.text.dependencies, ['audience']);
  } finally { f.arena.close(); }
});

test('one context sync preloads the current work and later returns only new patches and interaction context', () => {
  const f = fixture();
  try {
    const input = { ...f.scope, branch_id: f.created.branch_id };
    const first = f.arena.execute('arena.sync_context', f.credentials.agent, input);
    assert.equal(first.mode, 'full');
    assert.equal(first.state.artifact.text, 'Uma ideia abre uma conversa.');
    const unchanged = f.arena.execute('arena.sync_context', f.credentials.agent, { ...input, sync_cursor: first.sync_cursor });
    assert.equal(unchanged.mode, 'delta');
    assert.equal(unchanged.sync_cursor, first.sync_cursor, 'unchanged polling reuses the existing checkpoint');
    assert.equal(unchanged.artifact, null);
    assert.equal(unchanged.context, undefined);
    assert.deepEqual(unchanged.events, []);
    const written = f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...input,
      expected_revision: f.created.revision_id, artifact_id: f.proposal.proposal_id, presented_version: 1,
      sync_cursor: unchanged.sync_cursor, patch: { start: 4, end: 9, text: 'briga' }, idempotency_key: 'change' });
    assert.equal(written.sync.mode, 'delta');
    const afterWrite = f.arena.execute('arena.sync_context', f.credentials.agent, { ...input, sync_cursor: written.sync.sync_cursor });
    assert.equal(afterWrite.artifact, null, 'the mutation checkpoint prevents applying its patch twice');
    assert.deepEqual(afterWrite.events, []);
    const delta = f.arena.execute('arena.sync_context', f.credentials.agent, { ...input, sync_cursor: unchanged.sync_cursor });
    assert.equal(delta.mode, 'delta');
    const patch = delta.artifact.patch;
    assert.equal(first.state.artifact.text.slice(0, patch.start) + patch.text + first.state.artifact.text.slice(patch.end), 'Uma briga abre uma conversa.');
    assert.ok(patch.text.length < first.state.artifact.text.length);
    assert.equal(delta.artifact.after.text, undefined);
    assert.equal(delta.events.at(-1).type, 'text_edit');
    assert.equal(delta.selection, null);
    assert.throws(() => f.arena.execute('arena.sync_context', f.credentials.owner,
      { ...input, sync_cursor: first.sync_cursor }), { code: 'NOT_FOUND' });
  } finally { f.arena.close(); }
});

test('expired sync checkpoints recover through a fresh sanitized preload instead of losing the work', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const first = f.arena.execute('arena.sync_context', f.credentials.agent, scope);
    let cursor = first.sync_cursor;
    for (let i = 0; i < 65; i++) {
      f.arena.execute('arena.add_feedback', f.credentials.agent, { ...scope, target_id: f.created.branch_id,
        revision_id: f.created.revision_id, expected_revision: f.created.revision_id,
        type: 'comment', text: `Nuance fictícia ${i}`, idempotency_key: `nuance-${i}` });
      cursor = f.arena.execute('arena.sync_context', f.credentials.agent, { ...scope, sync_cursor: cursor }).sync_cursor;
    }
    const resumed = f.arena.execute('arena.sync_context', f.credentials.agent, { ...scope, sync_cursor: first.sync_cursor });
    assert.equal(resumed.mode, 'full'); assert.equal(resumed.reset, true);
    assert.equal(resumed.state.artifact.text, 'Uma ideia abre uma conversa.');
    assert.equal(resumed.state.context.feedback.at(-1).text, 'Nuance fictícia 64');
  } finally { f.arena.close(); }
});

test('the production DNA is an editable draft shared by sync without approving a global voice or the text', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const dna = f.arena.execute('arena.open_artifact', f.credentials.agent, { ...scope, surface: 'dna' }).artifact;
    assert.equal(dna.surface, 'dna');
    assert.match(dna.text, /Público/);
    const saved = f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...scope, surface: 'dna',
      expected_revision: f.created.revision_id, artifact_id: dna.dna_id, presented_version: dna.dna_version,
      patch: { start: 0, end: dna.text.length, text: '## Voz\nBruta, irônica.\n## Público\nIniciantes curiosos.\n## Nuances\nProvocar sem humilhar.' }, idempotency_key: 'dna' });
    const next = f.arena.execute('arena.sync_context', f.credentials.agent, scope);
    assert.equal(next.state.dna.dna_id, saved.artifact.dna_id);
    assert.match(next.state.dna.text, /Bruta, irônica/);
    assert.equal(next.state.artifact.text, 'Uma ideia abre uma conversa.');
    assert.equal(next.state.context.profile, null);
    assert.deepEqual(next.state.context.decisions, []);
  } finally { f.arena.close(); }
});

test('a variation can carry the current pending text and DNA while preserving the original and approved base', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const dna = f.arena.execute('arena.open_artifact', f.credentials.agent, { ...scope, surface: 'dna' }).artifact;
    f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...scope, surface: 'dna', expected_revision: f.created.revision_id,
      artifact_id: dna.dna_id, presented_version: 0, patch: { start: 0, end: dna.text.length, text: 'Voz irônica confirmada.' }, idempotency_key: 'dna-variation' });
    const variant = f.arena.execute('arena.create_branch', f.credentials.agent, { ...f.scope, source_branch_id: f.created.branch_id,
      source_revision_id: f.created.revision_id, expected_revision: f.created.revision_id,
      include_current_draft: true, name: 'Outra abertura', vary_dimensions: ['text'], idempotency_key: 'variant' });
    const next = f.arena.execute('arena.sync_context', f.credentials.agent, { ...f.scope, branch_id: variant.branch_id }).state;
    assert.equal(next.artifact.text, 'Uma ideia abre uma conversa.');
    assert.equal(next.dna.text, 'Voz irônica confirmada.');
    assert.equal(next.context.revision.fields.text, ''); assert.deepEqual(next.context.decisions, []);
    assert.equal(f.arena.execute('arena.open_artifact', f.credentials.agent, scope).artifact.proposal_id, f.proposal.proposal_id);
  } finally { f.arena.close(); }
});

test('revocation resets a cached notepad and redacts its patches, DNA, selections and retries', () => {
  const f = fixture();
  try {
    const scope = { ...f.scope, branch_id: f.created.branch_id };
    const source = f.arena.execute('human.import_sources', f.credentials.owner, { ...f.scope,
      format: 'json', content: JSON.stringify([{ text: 'Referência ficcional confidencial.' }]), origin: 'Fixture',
      rights: 'Autorizado', usage_scope: 'editorial', coverage: 'Ficção', idempotency_key: 'source' }).source_ids[0];
    const proposal = f.arena.execute('arena.submit_proposal', f.credentials.agent, { ...scope,
      expected_revision: f.created.revision_id, base_revision_id: f.created.revision_id,
      changes: { text: 'Texto ficcional derivado.' }, source_ids: [source], rationale: 'Teste', idempotency_key: 'derived' });
    const edit = { ...scope, expected_revision: f.created.revision_id, artifact_id: proposal.proposal_id,
      presented_version: 1, patch: { start: 0, end: 5, text: 'SEGREDO' }, idempotency_key: 'secret-edit' };
    f.arena.execute('arena.patch_artifact', f.credentials.agent, edit);
    const dna = f.arena.execute('arena.open_artifact', f.credentials.agent, { ...scope, surface: 'dna' }).artifact;
    f.arena.execute('arena.patch_artifact', f.credentials.agent, { ...scope, surface: 'dna',
      expected_revision: f.created.revision_id, artifact_id: dna.dna_id, presented_version: dna.dna_version,
      patch: { start: 0, end: dna.text.length, text: 'DNA_RESTRITO' }, idempotency_key: 'source-dna' });
    const first = f.arena.execute('arena.sync_context', f.credentials.agent, scope);
    f.arena.execute('human.revoke_source', f.credentials.owner, { ...f.scope, source_id: source,
      expected_revision: 1, reason: 'Ficção revogada', idempotency_key: 'revoke' });
    const after = f.arena.execute('arena.sync_context', f.credentials.agent, { ...scope, sync_cursor: first.sync_cursor });
    assert.equal(after.mode, 'full'); assert.equal(after.reset, true);
    assert.equal(after.state.artifact.text, ''); assert.equal(after.state.selection, null);
    assert.equal(after.state.dna.text, '');
    assert.equal(JSON.stringify(after).includes('DNA_RESTRITO'), false);
    assert.equal(JSON.stringify(after).includes('SEGREDO'), false);
    assert.equal(JSON.stringify(f.arena.execute('arena.patch_artifact', f.credentials.agent, edit)).includes('SEGREDO'), false);
  } finally { f.arena.close(); }
});
