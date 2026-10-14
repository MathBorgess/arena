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
