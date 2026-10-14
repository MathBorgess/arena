import { test, expect } from '@playwright/test';
import { Arena } from '../src/arena.js';
import { startHttpServer } from '../src/http.js';

function fixture() {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Artefato fictício', objective: 'Selecionar na conversa', idempotency_key: 'create' });
  const base = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Texto aceito anterior.' }, source_ids: [], reason: 'Base fictícia', idempotency_key: 'base' });
  const proposal = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: base.revision_id, base_revision_id: base.revision_id, changes: { text: 'Uma ideia abre uma conversa.' }, source_ids: [], rationale: 'Proposta fictícia', idempotency_key: 'proposal' });
  return { arena, credentials, scope, created, base, proposal };
}
async function login(page: any, url: string, token: string) { await page.goto(url); await page.getByLabel('Credencial humana').fill(token); await page.getByRole('button', { name: 'Entrar' }).click(); }

test('viewer shows only readonly current proposal and automatically persists native cursor selection and clearing', async ({ page }) => {
  const f = fixture(); const viewer = await startHttpServer({ arena: f.arena, workspace_id: f.credentials.workspace_id, port: 0 });
  try {
    await login(page, `${viewer.url}/?branch_id=${f.created.branch_id}`, f.credentials.owner_token);
    const text = page.getByRole('textbox', { name: 'Texto da proposta' }); await expect(text).toHaveValue('Uma ideia abre uma conversa.');
    await expect(page.getByRole('button')).toHaveCount(0); await expect(page.locator('select,details,input')).toHaveCount(0);
    await expect(text).toHaveAttribute('readonly', ''); await text.dblclick({ position: { x: 65, y: 20 } });
    expect(await text.evaluate((node: HTMLTextAreaElement) => ({ start: node.selectionStart, end: node.selectionEnd, text: node.value.slice(node.selectionStart, node.selectionEnd) }))).toEqual({ start: 4, end: 9, text: 'ideia' });
    const events = () => f.arena.execute('arena.read_events', f.credentials.agent, { ...f.scope, branch_id: f.created.branch_id }).events;
    await expect.poll(() => events().filter((event: any) => event.type === 'selection').length).toBe(1);
    const selection = events().at(-1); expect(selection.selection).toEqual({ start: 4, end: 9, text: 'ideia' }); expect(selection.proposal_id).toBe(f.proposal.proposal_id); expect(selection.presented_version).toBe(1); expect(selection.revision_id).toBe(f.base.revision_id); expect(selection.author).toEqual(f.credentials.owner);
    await text.click({ position: { x: 8, y: 20 } }); await expect.poll(() => events().at(-1).type).toBe('selection_clear'); expect(events().at(-1).selection).toBeNull();
    expect(f.arena.execute('arena.read_context', f.credentials.agent, { ...f.scope, branch_id: f.created.branch_id }).revision.fields.text).toBe('Texto aceito anterior.');
  } finally { await viewer.close(); f.arena.close(); }
});

test('current proposal refresh preserves an unchanged cursor selection and clears it when a new proposal arrives', async ({ page }) => {
  const f = fixture(); const viewer = await startHttpServer({ arena: f.arena, workspace_id: f.credentials.workspace_id, port: 0 });
  try {
    await login(page, `${viewer.url}/?branch_id=${f.created.branch_id}`, f.credentials.owner_token);
    const text = page.getByRole('textbox', { name: 'Texto da proposta' }); await expect(text).toHaveValue('Uma ideia abre uma conversa.'); await text.dblclick({ position: { x: 65, y: 20 } });
    const events = () => f.arena.execute('arena.read_events', f.credentials.agent, { ...f.scope, branch_id: f.created.branch_id }).events;
    await expect.poll(() => events().at(-1).type).toBe('selection');
    await page.waitForResponse(response => response.url().endsWith('/api/call') && response.request().postDataJSON()?.operation === 'arena.open_artifact');
    expect(await text.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('ideia');
    const next = f.arena.execute('arena.submit_proposal', f.credentials.agent, { ...f.scope, branch_id: f.created.branch_id, expected_revision: f.base.revision_id, base_revision_id: f.base.revision_id, changes: { text: 'Uma pergunta dá início ao próximo texto.' }, source_ids: [], rationale: 'Outra proposta fictícia', idempotency_key: 'next' });
    await expect(text).toHaveValue('Uma pergunta dá início ao próximo texto.'); await expect.poll(() => events().at(-1).type).toBe('selection_clear'); expect(events().at(-1).proposal_id).toBe(next.proposal_id);
    await page.goto(`${viewer.url}/?branch_id=${f.created.branch_id}&proposal_id=${f.proposal.proposal_id}&presented_version=1`); await expect(page.getByRole('textbox', { name: 'Texto da proposta' })).toHaveValue('Uma ideia abre uma conversa.');
  } finally { await viewer.close(); f.arena.close(); }
});

test('explicit historical URL keeps its exact accepted revision and polling removes restricted text and selection', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' }); const scope = { workspace_id: credentials.workspace_id };
  const source = arena.execute('human.import_sources', credentials.owner, { ...scope, format: 'json', content: JSON.stringify([{ text: 'Referência fictícia.' }]), origin: 'Arquivo fictício', rights: 'Autorizado', usage_scope: 'editorial', coverage: 'Amostra', idempotency_key: 'source' }).source_ids[0];
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Histórico fictício', objective: 'Respeitar restrições atuais', idempotency_key: 'create' });
  const historical = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Uma ideia derivada da referência.' }, dependencies: { text: [] }, source_ids: [source], reason: 'Base fictícia', idempotency_key: 'historical' });
  const current = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: historical.revision_id, changes: { text: 'Texto atual independente.' }, dependencies: { text: [] }, source_ids: [], reason: 'Outra direção fictícia', idempotency_key: 'current' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await login(page, `${viewer.url}/?branch_id=${created.branch_id}&revision_id=${historical.revision_id}`, credentials.owner_token);
    const text = page.getByRole('textbox', { name: 'Texto da proposta' }); await expect(text).toHaveValue('Uma ideia derivada da referência.'); await text.dblclick({ position: { x: 65, y: 20 } });
    const events = () => arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events;
    await expect.poll(() => events().at(-1).type).toBe('selection'); expect(events().at(-1).revision_id).toBe(historical.revision_id);
    arena.execute('human.remove_source', credentials.owner, { ...scope, source_id: source, expected_revision: 1, reason: 'Permissão retirada', idempotency_key: 'remove' });
    await expect(text).toHaveValue(''); await expect.poll(() => events().at(-1).type).toBe('selection_clear'); expect(events().at(-1).selection).toBeNull();
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id, revision_id: current.revision_id }).revision.fields.text).toBe('Texto atual independente.');
  } finally { await viewer.close(); arena.close(); }
});
