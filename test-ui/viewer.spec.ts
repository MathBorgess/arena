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
    await text.focus(); await text.press('Home');
    for (let index = 0; index < 4; index++) await text.press('ArrowRight');
    for (let index = 0; index < 5; index++) await text.press('Shift+ArrowRight');
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

test('artifact drawers create a locked branch, compare exact revisions and borrow a difference as a pending suggestion', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Duas direções', objective: 'Comparar caminhos', idempotency_key: 'create' });
  arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { theme: 'Aprender', text: 'O caminho inicial.' }, source_ids: [], reason: 'Base fictícia', idempotency_key: 'edit' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`);
    await page.getByLabel('Credencial humana').fill(credentials.owner_token); await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Travas e dependências', { exact: true }).click();
    await page.getByLabel('Travar Tema').check(); await page.getByLabel('Motivo das travas').fill('Preservar o tema aprovado.');
    await page.getByRole('button', { name: 'Salvar travas' }).click(); await expect(page.getByText('Travas atualizadas.')).toBeVisible();
    await page.getByText('Ramificações e comparação', { exact: true }).click();
    await page.getByLabel('Nome da ramificação').fill('Alternativa'); await page.getByRole('button', { name: 'Criar ramificação' }).click();
    await expect(page.getByText('Ramificação criada a partir da revisão apresentada.')).toBeVisible();
    const work = arena.execute('arena.list_work', credentials.agent, scope); const fork = work.explorations[0].branches.find((branch: any) => branch.name === 'Alternativa');
    expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: fork.id }).revision.locks.theme).toBe('Aprender');
    await page.getByLabel('Texto do artefato').fill('Um segundo caminho.'); await page.getByLabel('Motivo da edição').fill('Testar outra abertura.');
    await page.getByRole('button', { name: 'Salvar revisão' }).click(); await expect(page.getByText('Nova revisão salva.')).toBeVisible();
    await page.getByText('Ramificações e comparação', { exact: true }).click(); await page.getByLabel('Comparar com').selectOption(created.branch_id);
    await page.getByRole('button', { name: 'Comparar revisões' }).click();
    await expect(page.getByText('O caminho inicial.', { exact: true })).toBeVisible(); await expect(page.getByText('Um segundo caminho.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Trazer como proposta' }).click(); await expect(page.getByText('Diferenças trazidas como proposta pendente.')).toBeVisible();
    const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: fork.id });
    expect(context.revision.fields.text).toBe('Um segundo caminho.'); expect(context.proposals[0].changes.text).toBe('O caminho inicial.');
  } finally { await viewer.close(); arena.close(); }
});

test('source import previews selected CSV text safely, reusable voice and portable exports stay inside artifact drawers', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Referências fictícias', objective: 'Conservar origem', idempotency_key: 'create' });
  arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Texto aprovado para levar.' }, source_ids: [], reason: 'Base fictícia', idempotency_key: 'edit' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`); await page.getByLabel('Credencial humana').fill(credentials.owner_token); await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Fontes e origem', { exact: true }).click();
    await page.getByLabel('Arquivo JSON ou CSV').setInputFiles({ name: 'ficticio.csv', mimeType: 'text/csv', buffer: Buffer.from('text,author\n"Primeiro, exemplo",Fictício\n"<img src=x onerror=alert(1)>",Outro') });
    await expect(page.getByText('Primeiro, exemplo', { exact: true })).toBeVisible();
    await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
    await expect(page.locator('img')).toHaveCount(0);
    await page.getByLabel('Importar texto 2').uncheck();
    await page.getByLabel('Origem da importação').fill('Arquivo fictício fornecido pela autora'); await page.getByLabel('Direitos de uso').fill('Autorizado para uso editorial');
    await page.getByLabel('Escopo de uso').fill('editorial'); await page.getByLabel('Cobertura').fill('Amostra fictícia de dois textos');
    await page.getByRole('button', { name: 'Importar selecionados' }).click(); await expect(page.getByText('1 fonte(s) importada(s).')).toBeVisible();
    const sources = arena.execute('human.list_sources', credentials.owner, scope).sources; expect(sources).toHaveLength(1);
    expect(arena.execute('arena.read_source', credentials.agent, { ...scope, source_id: sources[0].id }).content).toBe('Primeiro, exemplo');
    await page.getByText('Voz reutilizável', { exact: true }).click(); await page.getByLabel('Nome do perfil de voz').fill('Voz fictícia');
    await page.getByLabel('Conteúdo do perfil (JSON)').fill(JSON.stringify({ identity: 'Autora fictícia', objectives: ['Explicar'], tone: 'Direto', vocabulary: [], positive_examples: [], negative_examples: [], rules: ['Sem slogans'] }));
    await page.getByRole('button', { name: 'Criar perfil aprovado' }).click(); await expect(page.getByText('Perfil de voz criado; versões anteriores permanecem fixas.')).toBeVisible();
    expect(arena.execute('arena.list_profiles', credentials.agent, scope).profiles[0].name).toBe('Voz fictícia');
    await page.getByText('Exportar artefato', { exact: true }).click(); await page.getByRole('button', { name: 'Preparar JSON' }).click();
    await expect(page.getByLabel('Exportação preparada')).toHaveValue(/format_version/);
    const json = await page.getByLabel('Exportação preparada').inputValue(); expect(JSON.parse(json).revision.fields.text).toBe('Texto aprovado para levar.'); expect(json.includes(credentials.owner_token)).toBe(false);
    await page.getByRole('button', { name: 'Preparar texto' }).click(); await expect(page.getByLabel('Exportação preparada')).toHaveValue('Texto aprovado para levar.');
    await page.getByText('Compatibilidade do harness', { exact: true }).click(); await page.getByRole('button', { name: 'Consultar capacidades' }).click();
    await expect(page.getByText(/Verificação de clientes reais/)).toBeVisible();
  } finally { await viewer.close(); arena.close(); }
});

test('refresh preserves unsaved text and historical revision selection cannot overwrite a newer human head', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Revisões exatas', objective: 'Preservar rascunhos', idempotency_key: 'create' });
  const base = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Texto inicial.' }, source_ids: [], reason: 'Base fictícia', idempotency_key: 'edit' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`); await page.getByLabel('Credencial humana').fill(credentials.owner_token); await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByLabel('Texto do artefato').fill('Meu rascunho ainda não salvo.');
    const advanced = arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: base.revision_id, changes: { text: 'Outra revisão já aceita.' }, source_ids: [], reason: 'Concorrência fictícia', idempotency_key: 'advance' });
    await page.getByRole('button', { name: 'Atualizar artefato' }).click(); await expect(page.getByLabel('Texto do artefato')).toHaveValue('Meu rascunho ainda não salvo.');
    await page.getByLabel('Motivo da edição').fill('Rascunho local'); await page.getByRole('button', { name: 'Salvar revisão' }).click();
    await expect(page.getByRole('status')).toContainText('A ramificação avançou'); expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.fields.text).toBe('Outra revisão já aceita.');
    await page.getByRole('button', { name: 'Descartar edição e atualizar' }).click(); await expect(page.getByLabel('Texto do artefato')).toHaveValue('Outra revisão já aceita.');
    await page.getByLabel('Revisão exibida').selectOption(base.revision_id); await expect(page.getByLabel('Texto do artefato')).toHaveValue('Texto inicial.');
    await expect(page.getByText('Revisão histórica; decisões e edições exigem a revisão atual.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar revisão' })).toBeDisabled();
    await page.getByLabel('Revisão exibida').selectOption(advanced.revision_id); await expect(page.getByLabel('Texto do artefato')).toHaveValue('Outra revisão já aceita.');
    await page.screenshot({ path: '/tmp/arena-viewer-stale-preview.png', fullPage: true });
  } finally { await viewer.close(); arena.close(); }
});

test('human sees the exact voice proposal before approval and an existing branch keeps its pinned voice', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const profile = arena.execute('human.create_profile', credentials.owner, { ...scope, name: 'Voz original', content: { identity: 'Fictícia', objectives: [], tone: 'Direto', vocabulary: [], positive_examples: [], negative_examples: [], rules: [] }, source_ids: [], idempotency_key: 'profile' });
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Voz fixada', objective: 'Revisar sem atualizar em silêncio', profile_revision_id: profile.profile_revision_id, idempotency_key: 'create' });
  const proposal = arena.execute('arena.propose_profile_change', credentials.agent, { ...scope, profile_revision_id: profile.profile_revision_id, expected_revision: profile.profile_revision_id, changes: { tone: 'Direto e gentil' }, evidence_source_ids: [], rationale: 'Experimento explícito de tom', idempotency_key: 'voice-proposal' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`); await page.getByLabel('Credencial humana').fill(credentials.owner_token); await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Voz reutilizável', { exact: true }).click(); await page.getByRole('button', { name: 'Consultar perfis de voz' }).click();
    await expect(page.getByText('Experimento explícito de tom', { exact: true })).toBeVisible();
    await expect(page.getByText('Direto e gentil', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aprovar versão apresentada da voz' }).click(); await expect(page.getByText('Nova versão de voz aprovada; esta ramificação mantém a voz fixada.')).toBeVisible();
    const profiles = arena.execute('arena.list_profiles', credentials.agent, scope); expect(profiles.proposals.find((item: any) => item.id === proposal.proposal_id).status).toBe('accepted'); expect(profiles.profiles[0].revisions).toHaveLength(2);
    const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }); expect(context.profile.id).toBe(profile.profile_revision_id); expect(context.profile.content.tone).toBe('Direto');
  } finally { await viewer.close(); arena.close(); }
});

test('revoking a reference clears controlled artifact previews and refuses a stale approved-text export', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const source = arena.execute('human.import_sources', credentials.owner, { ...scope, format: 'json', content: JSON.stringify([{ text: 'Referência autorizada fictícia.' }]), origin: 'Arquivo fictício', rights: 'Autorizado', usage_scope: 'editorial', coverage: 'Uma amostra', idempotency_key: 'source' }).source_ids[0];
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Referência revogável', objective: 'Respeitar autorização', idempotency_key: 'create' });
  arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Texto derivado da fonte fictícia.' }, source_ids: [source], reason: 'Derivação fictícia', idempotency_key: 'edit' });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    await page.goto(`${viewer.url}/?branch_id=${created.branch_id}`); await page.getByLabel('Credencial humana').fill(credentials.owner_token); await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Exportar artefato', { exact: true }).click(); await page.getByRole('button', { name: 'Preparar JSON' }).click(); await expect(page.getByLabel('Exportação preparada')).toHaveValue(/Texto derivado/);
    await page.getByText('Fontes e origem', { exact: true }).click(); await page.getByRole('button', { name: 'Consultar fontes' }).click(); await page.getByLabel(`Motivo para fonte ${source.slice(0, 8)}`).fill('Permissão revogada.');
    await page.getByRole('button', { name: 'Revogar acesso' }).click(); await expect(page.getByText('Acesso à fonte revogado.')).toBeVisible();
    await expect(page.getByLabel('Texto do artefato')).toHaveValue('', { timeout: 1000 });
    await page.getByText('Exportar artefato', { exact: true }).click(); await expect(page.getByLabel('Exportação preparada')).toHaveValue('');
    await page.getByRole('button', { name: 'Preparar texto' }).click(); await expect(page.getByRole('status')).toContainText(/revisão|dependências|fonte/i);
    expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.artifacts.text.needs_review).toBe(true);
  } finally { await viewer.close(); arena.close(); }
});
