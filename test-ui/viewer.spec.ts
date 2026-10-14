import { test, expect } from '@playwright/test';
import { Arena } from '../src/arena.js';
import { startHttpServer } from '../src/http.js';

test('human opens an exploration, reviews a proposal and accepts only the presented dimension', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(viewer.url);
    await page.getByLabel('Credencial humana').fill(credentials.owner_token);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByLabel('Título da exploração').fill('Uma pergunta aberta');
    await page.getByLabel('Objetivo').fill('Explorar o próximo texto');
    await page.getByRole('button', { name: 'Criar exploração' }).click();
    await expect(page.getByRole('heading', { name: 'Uma pergunta aberta' })).toBeVisible();
    const created = arena.execute('arena.list_work', credentials.agent, { workspace_id: credentials.workspace_id }).explorations[0].branches[0];
    arena.execute('arena.submit_proposal', credentials.agent, { workspace_id: credentials.workspace_id, branch_id: created.id, expected_revision: created.current_revision_id, base_revision_id: created.current_revision_id, changes: { theme: 'Aprender em público', text: 'Um rascunho ainda aberto.' }, rationale: 'Experimentar um caminho', source_ids: [], idempotency_key: 'proposal' });
    await page.getByRole('button', { name: 'Atualizar artefato' }).click();
    await page.getByLabel('Aceitar Texto').uncheck();
    await page.getByRole('button', { name: 'Aceitar selecionadas' }).click();
    await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('Aprender em público');
    await expect(page.getByLabel('Texto do artefato')).toHaveValue('');
    const context = arena.execute('arena.read_context', credentials.agent, { workspace_id: credentials.workspace_id, branch_id: created.id });
    expect(context.decisions[0].selected_dimensions).toEqual(['theme']);
    expect(context.proposals.find((proposal: any) => proposal.status === 'pending').changes.text).toBe('Um rascunho ainda aberto.');
    await expect(page.getByRole('textbox', { name: /mensagem|conversa|chat/i })).toHaveCount(0);
  } finally { await viewer.close(); arena.close(); }
});

test('selected passage comment is persisted with exact revision and is available in the agent context before a human edit', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Texto para comentar', objective: 'Revisar o trecho', idempotency_key: 'create' });
  const proposed = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, base_revision_id: created.revision_id, changes: { text: 'Uma ideia abre uma conversa.' }, rationale: 'Texto fictício', source_ids: [], idempotency_key: 'proposal' });
  const accepted = arena.execute('human.decide_proposal', credentials.owner, { ...scope, proposal_id: proposed.proposal_id, expected_revision: created.revision_id, expected_head_revision: created.revision_id, presented_version: proposed.version, decision: 'accepted', idempotency_key: 'accept' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`);
    await page.getByLabel('Credencial humana').fill(credentials.owner_token);
    await page.getByRole('button', { name: 'Entrar' }).click();
    const text = page.getByLabel('Texto do artefato');
    await text.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(4, 9); node.dispatchEvent(new Event('select', { bubbles: true })); });
    await expect(page.getByText('Trecho selecionado: ideia', { exact: true })).toBeVisible();
    await page.getByLabel('Comentário sobre o trecho').fill('Mais direto, por favor.');
    await page.getByRole('button', { name: 'Registrar comentário' }).click();
    await expect(page.getByText('Comentário registrado; disponível para o agente pelo MCP.')).toBeVisible();
    const events = arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events;
    const comment = events.find((event: any) => event.type === 'comment');
    expect(comment.selection).toEqual({ start: 4, end: 9, text: 'ideia' });
    expect(comment.revision_id).toBe(accepted.revision_id);
    expect(comment.author).toEqual(credentials.owner);
    expect(comment.comment).toBe('Mais direto, por favor.');
    await text.fill('Uma ideia inicia uma conversa.');
    await page.getByLabel('Motivo da edição').fill('Ajuste humano de precisão.');
    await page.getByRole('button', { name: 'Salvar revisão' }).click();
    await expect(page.getByText('Nova revisão salva.')).toBeVisible();
    const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
    expect(context.revision.fields.text).toBe('Uma ideia inicia uma conversa.');
    expect(context.revision.id).not.toBe(accepted.revision_id);
    expect(context.events.some((event: any) => event.id === comment.id)).toBe(true);
  } finally { await viewer.close(); arena.close(); }
});
