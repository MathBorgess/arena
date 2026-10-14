import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Arena } from '../src/arena.js';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'arena-domain-'));
  const path = join(directory, 'arena.sqlite');
  const arena = new Arena(path);
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, {
    ...scope, idempotency_key: 'create', title: 'Uma exploração fictícia', objective: 'Avaliar alternativas'
  });
  const propose = (key: string, changes: Record<string, string>) => arena.execute('arena.submit_proposal', credentials.agent, {
    ...scope, idempotency_key: key, branch_id: created.branch_id, expected_revision: created.revision_id,
    base_revision_id: created.revision_id, changes, rationale: 'Uma alternativa observável', source_ids: []
  });
  const decide = (key: string, proposal: any, extra = {}) => arena.execute('human.decide_proposal', credentials.owner, {
    ...scope, idempotency_key: key, proposal_id: proposal.proposal_id, expected_revision: created.revision_id,
    expected_head_revision: created.revision_id, presented_version: proposal.version, decision: 'accepted', ...extra
  });
  return { arena, credentials, scope, created, propose, decide, path,
    cleanup() { arena.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('an authenticated agent can start an empty exploration and resume its exact revision after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-domain-'));
  const path = join(directory, 'arena.sqlite');
  let arena = new Arena(path);
  try {
    const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
    const agent = arena.authenticate(credentials.agent_token);
    const created = arena.execute('arena.create_exploration', agent, {
      workspace_id: credentials.workspace_id, idempotency_key: 'start-one',
      title: 'Uma pergunta aberta', objective: 'Explorar antes de escrever'
    });
    arena.close();
    arena = new Arena(path);
    assert.deepEqual(arena.authenticate(credentials.agent_token), agent);
    assert.deepEqual(arena.authenticate(credentials.owner_token), credentials.owner);
    assert.throws(() => arena.bootstrap({ workspace_name: 'Reset', owner_name: 'Outro' }), { code: 'ACCESS_DENIED' });
    const context = arena.execute('arena.read_context', agent, {
      workspace_id: credentials.workspace_id, branch_id: created.branch_id
    });
    assert.equal(context.revision.id, created.revision_id);
    assert.deepEqual(context.revision.fields, {
      niche: '', audience: '', theme: '', thesis: '', angle: '', structure: '', text: ''
    });
    assert.equal(context.profile, null);
    assert.deepEqual(context.proposals, []);
    assert.equal(arena.execute('arena.list_work', agent, {
      workspace_id: credentials.workspace_id
    }).explorations[0].title, 'Uma pergunta aberta');
  } finally {
    arena.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('retries recover the same committed proposal and decision after a process restart', () => {
  const fixture = setup();
  const { arena, credentials, scope, created } = fixture;
  let reopened: Arena | undefined;
  try {
    const input = { ...scope, idempotency_key: 'one-proposal', branch_id: created.branch_id,
      base_revision_id: created.revision_id, expected_revision: created.revision_id,
      changes: { theme: 'Aprender com tentativas' }, rationale: 'Um teste fictício', source_ids: [] };
    const proposal = arena.execute('arena.submit_proposal', credentials.agent, input);
    const decisionInput = { ...scope, idempotency_key: 'one-decision', proposal_id: proposal.proposal_id,
      expected_revision: created.revision_id, expected_head_revision: created.revision_id,
      presented_version: proposal.version, decision: 'accepted' };
    const decision = arena.execute('human.decide_proposal', credentials.owner, decisionInput);
    arena.close();
    reopened = new Arena(fixture.path);
    assert.deepEqual(reopened.execute('arena.submit_proposal', reopened.authenticate(credentials.agent_token), input), proposal);
    assert.deepEqual(reopened.execute('human.decide_proposal', reopened.authenticate(credentials.owner_token), decisionInput), decision);
    assert.deepEqual(reopened.execute('arena.get_operation', credentials.owner, { ...scope, idempotency_key: 'one-decision' }), {
      found: true, result: decision
    });
    assert.deepEqual(reopened.execute('arena.get_operation', credentials.agent, { ...scope, idempotency_key: 'one-decision' }), { found: false });
    assert.throws(() => reopened!.execute('arena.submit_proposal', credentials.agent, {
      ...input, rationale: 'Argumentos diferentes'
    }), { code: 'IDEMPOTENCY_CONFLICT' });
    const context = reopened.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(context.proposals.length, 1);
    assert.equal(context.decisions.length, 1);
  } finally {
    reopened?.close();
    if (!reopened) arena.close();
    rmSync(join(fixture.path, '..'), { recursive: true, force: true });
  }
});

test('a stale or differently presented proposal cannot overwrite accepted content or leave a partial derived proposal', () => {
  const fixture = setup();
  const { arena, credentials, scope, created, propose, decide } = fixture;
  try {
    const first = propose('first', { theme: 'Caminho escolhido' });
    const concurrent = propose('concurrent', { theme: 'Outro caminho', text: 'Rascunho preservado' });
    assert.throws(() => decide('wrong-version', first, { presented_version: 99 }), { code: 'REVISION_CONFLICT' });
    assert.equal(arena.execute('arena.get_operation', credentials.owner, { ...scope, idempotency_key: 'wrong-version' }).found, false);
    const accepted = decide('accept-first', first);
    assert.throws(() => decide('stale-head', concurrent), { code: 'REVISION_CONFLICT' });
    assert.throws(() => decide('stale-base', concurrent, {
      expected_revision: accepted.revision_id, expected_head_revision: accepted.revision_id, selected_dimensions: ['theme']
    }), { code: 'REVISION_CONFLICT' });
    const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(context.revision.fields.theme, 'Caminho escolhido');
    assert.equal(context.proposals.length, 2);
    assert.equal(context.proposals.find((proposal: any) => proposal.id === concurrent.proposal_id).status, 'pending');
    assert.equal(context.decisions.length, 1);
  } finally { fixture.cleanup(); }
});

test('foreign workspace identities and resource references reveal no private exploration', () => {
  const fixture = setup();
  const foreign = setup();
  try {
    const { arena, credentials, scope, created, propose } = fixture;
    assert.throws(() => arena.execute('arena.read_context', foreign.credentials.agent, {
      ...scope, branch_id: created.branch_id
    }), { code: 'NOT_FOUND' });
    assert.throws(() => arena.execute('arena.read_context', credentials.agent, {
      ...scope, branch_id: foreign.created.branch_id
    }), { code: 'NOT_FOUND' });
    assert.throws(() => arena.authenticate('unknown-token'), { code: 'ACCESS_DENIED' });
    assert.throws(() => propose('invalid-dimension', { publish: 'Não publicar' }), { code: 'INVALID_INPUT' });
    assert.equal(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).proposals.length, 0);
  } finally { fixture.cleanup(); foreign.cleanup(); }
});

test('a human can accept a selected dimension while the unselected suggestion remains visible', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-domain-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  try {
    const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
    const scope = { workspace_id: credentials.workspace_id };
    const created = arena.execute('arena.create_exploration', credentials.agent, {
      ...scope, idempotency_key: 'create', title: 'Duas sugestões', objective: 'Escolher apenas o tema'
    });
    const proposed = arena.execute('arena.submit_proposal', credentials.agent, {
      ...scope, idempotency_key: 'proposal', branch_id: created.branch_id,
      base_revision_id: created.revision_id, expected_revision: created.revision_id,
      changes: { theme: 'Rotina criativa', text: 'Um texto que ainda precisa de trabalho.' },
      rationale: 'Tema e rascunho para revisão', source_ids: []
    });
    const accepted = arena.execute('human.decide_proposal', credentials.owner, {
      ...scope, idempotency_key: 'partial', proposal_id: proposed.proposal_id,
      expected_revision: created.revision_id, expected_head_revision: created.revision_id,
      presented_version: proposed.version, decision: 'accepted', selected_dimensions: ['theme']
    });
    const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(context.revision.fields.theme, 'Rotina criativa');
    assert.equal(context.revision.fields.text, '');
    const original = context.proposals.find((proposal: any) => proposal.id === proposed.proposal_id);
    assert.equal(original.status, 'pending');
    assert.equal(original.changes.text, 'Um texto que ainda precisa de trabalho.');
    const derived = context.proposals.find((proposal: any) => proposal.id === accepted.derived_proposal_id);
    assert.equal(derived.origin_proposal_id, proposed.proposal_id);
    assert.equal(derived.status, 'accepted');
    assert.deepEqual(derived.changes, { theme: 'Rotina criativa' });
    assert.deepEqual(context.decisions[0].selected_dimensions, ['theme']);
    assert.equal(context.decisions[0].presented_proposal_id, proposed.proposal_id);
  } finally {
    arena.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('feedback stays separate from human acceptance and accepted content preserves the original revision', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-domain-'));
  const arena = new Arena(join(directory, 'arena.sqlite'));
  try {
    const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
    const scope = { workspace_id: credentials.workspace_id };
    const created = arena.execute('arena.create_exploration', credentials.agent, {
      ...scope, idempotency_key: 'create', title: 'Tema aberto', objective: 'Pensar em conjunto'
    });
    const proposed = arena.execute('arena.submit_proposal', credentials.agent, {
      ...scope, idempotency_key: 'proposal', branch_id: created.branch_id,
      base_revision_id: created.revision_id, expected_revision: created.revision_id,
      changes: { theme: 'Aprender em público', text: 'Um primeiro texto fictício.' },
      dependencies: { theme: [], text: ['theme'] }, rationale: 'Um caminho para explorar', source_ids: []
    });
    arena.execute('arena.add_feedback', credentials.owner, {
      ...scope, idempotency_key: 'feedback', branch_id: created.branch_id, target_id: proposed.proposal_id,
      revision_id: created.revision_id, expected_revision: created.revision_id,
      type: 'comment', text: 'Gosto da direção; ainda preciso decidir.'
    });
    const before = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(before.revision.fields.text, '');
    assert.equal(before.proposals[0].status, 'pending');
    assert.equal(before.feedback[0].author.id, credentials.owner.id);
    const decisionInput = { ...scope, idempotency_key: 'accept', proposal_id: proposed.proposal_id,
      expected_revision: created.revision_id, expected_head_revision: created.revision_id,
      presented_version: proposed.version, decision: 'accepted' };
    assert.throws(() => arena.execute('human.decide_proposal', { ...credentials.agent, kind: 'human' }, {
      ...decisionInput, actor: credentials.owner, kind: 'human', role: 'owner'
    }), { code: 'ACCESS_DENIED' });
    const accepted = arena.execute('human.decide_proposal', credentials.owner, decisionInput);
    const after = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    assert.equal(after.revision.id, accepted.revision_id);
    assert.equal(after.revision.fields.text, 'Um primeiro texto fictício.');
    assert.equal(after.proposals[0].status, 'accepted');
    assert.equal(after.decisions[0].author.id, credentials.owner.id);
    assert.equal(after.revision.artifacts.text.author.id, credentials.agent.id);
    const historic = arena.execute('arena.read_context', credentials.agent, {
      ...scope, branch_id: created.branch_id, revision_id: created.revision_id
    });
    assert.equal(historic.revision.fields.text, '');
  } finally {
    arena.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
