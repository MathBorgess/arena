import { previewExport } from './parse-export.js';
const labels = { niche: 'Nicho', audience: 'Público', theme: 'Tema', thesis: 'Tese', angle: 'Ângulo', structure: 'Estrutura', text: 'Texto' };
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'checked') node.checked = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  children.flat().filter(child => child != null).forEach(child => node.append(typeof child === 'string' ? document.createTextNode(child) : child));
  return node;
};
const button = (text, action, style = '') => el('button', { type: 'button', class: style, text, onClick: action });
const field = (text, input) => el('label', {}, text, input);
const key = () => crypto.randomUUID();

export function mountArena({ root = document.getElementById('arena'), call: request, mode = 'local', onContext, requestReview, openHuman, logout }) {
  async function call(operation, input) {
    const arrays = { 'arena.list_work': ['explorations'], 'arena.read_context': ['proposals', 'decisions', 'feedback', 'events', 'sources'], 'arena.read_events': ['events'] }[operation];
    const initial = await request(operation, { ...input, ...(arrays ? { limit: 500 } : {}) });
    if (!arrays) return initial;
    while (initial.next_cursor) {
      const page = await request(operation, { ...input, limit: 500, cursor: initial.next_cursor });
      for (const name of arrays) initial[name] = [...(initial[name] ?? []), ...(page[name] ?? [])];
      initial.next_cursor = page.next_cursor;
    }
    return initial;
  }
  const state = { context: null, work: [], selection: null, status: '', error: false, busy: false, dirty: false };
  const shell = el('div', { class: 'shell' }); root.replaceChildren(shell);
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const announce = (text, error = false) => { state.status = text; state.error = error; status.textContent = text; status.className = `status${error ? ' error' : ''}`; };
  const run = async (action) => { if (state.busy) return; state.busy = true; try { await action(); } catch (error) { announce(error.message ?? 'Não foi possível concluir a ação.', true); } finally { state.busy = false; } };
  const mutate = (operation, input) => call(operation, { ...input, idempotency_key: key() });
  async function load(branch, revision) {
    state.context = await call('arena.read_context', { branch_id: branch, ...(revision ? { revision_id: revision } : {}) });
    state.selection = null; state.dirty = false; state.status = ''; state.error = false; render();
  }
  async function refresh() {
    const result = await call('arena.list_work', {}); state.work = result.explorations;
    if (state.context) {
      if (state.dirty || state.selection) return announce('Sua edição e seleção foram preservadas. Descarte a edição para carregar a revisão mais recente.');
      await load(state.context.branch.id);
    } else render();
  }
  function render() {
    const top = el('header', { class: 'topbar' }, el('span', { class: 'brand', text: 'ARENA' }), el('span', { class: 'muted', text: mode === 'embedded' ? 'Artefato no seu agente' : 'Revisão humana local' }), el('div', { class: 'actions' }, button('Atualizar artefato', () => run(refresh)), state.context ? button('Descartar edição e atualizar', () => run(() => load(state.context.branch.id)), 'quiet') : null, logout ? button('Sair', logout, 'quiet') : null));
    shell.replaceChildren(top, status); announce(state.status, state.error);
    if (!state.context) {
      shell.append(el('section', { class: 'empty' }, el('p', { class: 'eyebrow', text: 'Uma ideia ainda aberta' }), el('h1', { text: 'O que vamos explorar?' }), el('p', { class: 'muted', text: 'Mantenha a conversa no seu agente. Acompanhe e revise o artefato por aqui.' })));
      for (const exploration of state.work) for (const branch of exploration.branches) shell.append(button(`${exploration.title} · ${branch.name}`, () => run(() => load(branch.id))));
      const title = el('input', { required: true }), objective = el('textarea', { required: true, rows: 3 });
      const form = el('form', { onSubmit: event => { event.preventDefault(); run(async () => { const created = await mutate('arena.create_exploration', { title: title.value, objective: objective.value }); await refresh(); await load(created.branch_id); announce('Exploração criada.'); }); } }, field('Título da exploração', title), field('Objetivo', objective), el('button', { type: 'submit', class: 'primary', text: 'Criar exploração' }));
      shell.append(el('section', { class: 'create' }, form)); return;
    }
    const context = state.context;
    const branches = el('select', { 'aria-label': 'Ramificação', onChange: event => run(() => { if (state.dirty || state.selection) { event.target.value = state.context.branch.id; return announce('Sua edição e seleção foram preservadas. Descarte a edição antes de mudar a ramificação.'); } return load(event.target.value); }) });
    for (const exploration of state.work) for (const branch of exploration.branches) branches.append(el('option', { value: branch.id, text: `${exploration.title} · ${branch.name}`, selected: branch.id === context.branch.id }));
    const historical = context.revision.id !== context.branch.current_revision_id;
    const revisionSelect = el('select', { 'aria-label': 'Revisão exibida', onChange: event => run(() => { if (state.dirty || state.selection) { event.target.value = context.revision.id; return announce('Descarte a edição antes de mudar a revisão.'); } return load(context.branch.id, event.target.value); }) });
    const revisions = [...new Set([context.branch.current_revision_id, context.revision.id, ...(context.events ?? []).map(event => event.revision_id), ...context.decisions.flatMap(decision => [decision.examined_revision_id, decision.revision_id])].filter(Boolean))];
    revisions.forEach(id => revisionSelect.append(el('option', { value: id, selected: id === context.revision.id, text: `${id === context.branch.current_revision_id ? 'Atual' : 'Histórica'} · ${id.slice(0, 8)}` })));
    shell.append(el('p', { class: 'eyebrow', text: context.exploration.objective }), el('h1', { text: context.exploration.title }), el('div', { class: 'branchline' }, branches, revisionSelect, el('span', { class: 'badge', text: `Revisão ${context.revision.id.slice(0, 8)}` })));
    if (historical) shell.append(el('p', { class: 'notice', text: 'Revisão histórica; decisões e edições exigem a revisão atual.' }));
    const selectionPreview = el('div', { class: 'selection', hidden: true });
    const captureSelection = (input, dimension) => {
      if (input.value !== context.revision.fields[dimension]) { state.selection = null; selectionPreview.hidden = false; selectionPreview.textContent = 'Salve ou proponha a edição antes de selecionar um trecho desta revisão.'; return; }
      if (input.selectionStart === input.selectionEnd) return;
      state.selection = { dimension, start: input.selectionStart, end: input.selectionEnd, text: input.value.slice(input.selectionStart, input.selectionEnd) };
      selectionPreview.textContent = `Trecho selecionado: ${state.selection.text}`; selectionPreview.hidden = false;
    };
    const text = el('textarea', { readOnly: historical, onInput: () => { state.dirty = true; }, onSelect: event => captureSelection(event.target, 'text'), class: 'text-stage', 'aria-label': 'Texto do artefato', value: context.revision.fields.text, placeholder: 'O texto ganha forma aqui…', spellcheck: true });
    const stage = el('section', { class: 'stage', 'aria-label': 'Artefato' }, field('Texto', text));
    const dimensions = el('details', {}, el('summary', { text: 'Direção editorial' }));
    const grid = el('div', { class: 'dimensions' });
    for (const [dimension, label] of Object.entries(labels)) if (dimension !== 'text') grid.append(field(label, el('textarea', { readOnly: historical, onInput: () => { state.dirty = true; }, onSelect: event => captureSelection(event.target, dimension), rows: 2, value: context.revision.fields[dimension], 'data-dimension': dimension })));
    dimensions.append(grid); stage.append(dimensions);
    const collectChanges = () => { const changes = {}; if (text.value !== context.revision.fields.text) changes.text = text.value; grid.querySelectorAll('[data-dimension]').forEach(input => { if (input.value !== context.revision.fields[input.dataset.dimension]) changes[input.dataset.dimension] = input.value; }); return changes; };
    const comment = el('textarea', { onInput: () => { state.dirty = true; }, rows: 2, placeholder: 'O que precisa mudar neste trecho?' });
    async function record(type) {
      const { dimension = 'text', ...selection } = state.selection ?? {};
      const event = await mutate(mode === 'local' ? 'human.record_artifact_interaction' : 'arena.record_interaction', { branch_id: context.branch.id, revision_id: context.revision.id, expected_revision: context.branch.current_revision_id, type, dimension, ...(state.selection ? { selection } : {}), ...(comment.value.trim() ? { comment: comment.value } : {}) });
      const events = onContext ? await call('arena.read_events', { branch_id: context.branch.id, limit: 500 }) : null;
      const persisted = events?.events.find(item => item.id === event.event_id);
      const warning = await onContext?.({ branch_id: context.branch.id, revision_id: context.revision.id, event_id: event.event_id, event_cursor: events?.event_cursor ?? null, author: persisted?.author, ui_origin: persisted?.ui_origin, action: type, dimension, ...(state.selection ? { selection } : {}), ...(comment.value.trim() ? { comment: comment.value } : {}) });
      return warning;
    }
    stage.append(selectionPreview, field('Comentário sobre o trecho', comment), el('div', { class: 'actions' },
      button('Guardar seleção', () => run(async () => { if (!state.selection) return announce('Selecione um trecho do artefato.'); const warning = await record('selection'); announce(`Seleção registrada; disponível para o agente pelo MCP.${warning ? ` ${warning}` : ''}`); })),
      button('Registrar comentário', () => run(async () => { if (!comment.value.trim()) return announce('Escreva um comentário.'); const warning = await record('comment'); announce(`Comentário registrado; disponível para o agente pelo MCP.${warning ? ` ${warning}` : ''}`); })),
      button('Revisar trecho', () => run(async () => { if (!state.selection) return announce('Selecione um trecho do artefato.'); const warning = await record('request_revision'); if (requestReview) { const result = await requestReview({ branch_id: context.branch.id, revision_id: context.revision.id, selection: state.selection }); announce(result || `Pedido de revisão enviado ao harness.${warning ? ` ${warning}` : ''}`); } else announce('Pedido registrado. Peça ao agente que leia os eventos pelo MCP.'); }))));
    if (mode === 'local') {
      const reason = el('input', { placeholder: 'Por que esta edição?' });
      stage.append(field('Motivo da edição', reason), button('Salvar revisão', () => run(async () => {
        const changes = collectChanges(); if (!Object.keys(changes).length) return announce('Nenhuma alteração para salvar.');
        if (!reason.value.trim()) return announce('Informe o motivo da edição.');
        await mutate('human.edit_branch', { branch_id: context.branch.id, expected_revision: context.revision.id, changes, source_ids: [], reason: reason.value });
        await load(context.branch.id); announce('Nova revisão salva.');
      }), 'primary'));
    }

    if (mode === 'embedded') stage.append(button('Propor edição', () => run(async () => {
      const changes = collectChanges();
      if (!Object.keys(changes).length) return announce('Nenhuma alteração para propor.');
      const proposed = await mutate('arena.submit_proposal', { branch_id: context.branch.id, expected_revision: context.branch.current_revision_id, base_revision_id: context.revision.id, changes, rationale: 'Edição sugerida no visualizador do artefato.', source_ids: [] });
      const warning = await onContext?.({ branch_id: context.branch.id, revision_id: context.revision.id, proposal_id: proposed.proposal_id, action: 'proposed_edit' });
      await load(context.branch.id); announce(`Edição enviada como proposta pendente.${warning ? ` ${warning}` : ''}`);
    }), 'primary'));

    const locksDrawer = el('details', {}, el('summary', { text: 'Travas e dependências' }));
    const locksBody = el('div');
    const lockInputs = [];
    for (const [dimension, label] of Object.entries(labels)) {
      const lock = el('input', { type: 'checkbox', checked: Object.hasOwn(context.revision.locks, dimension), disabled: mode !== 'local' });
      const lockLabel = field(`Travar ${label}`, lock); lockLabel.className = 'check'; lockInputs.push([dimension, lock]); locksBody.append(lockLabel);
      const artifact = context.revision.artifacts[dimension];
      if (artifact?.needs_review) locksBody.append(el('p', { class: 'notice', text: `${label}: precisa de revisão das dependências.` }));
    }
    if (mode === 'local') {
      const reason = el('input');
      locksBody.append(field('Motivo das travas', reason), button('Salvar travas', () => run(async () => {
        const locks = Object.fromEntries(lockInputs.filter(([, input]) => input.checked).map(([dimension]) => [dimension, context.revision.fields[dimension]]));
        await mutate('human.set_locks', { branch_id: context.branch.id, expected_revision: context.revision.id, locks, reason: reason.value });
        await load(context.branch.id); announce('Travas atualizadas.');
      })));
      const stale = Object.entries(context.revision.artifacts).filter(([, artifact]) => artifact.needs_review).map(([dimension]) => dimension);
      if (stale.length) locksBody.append(button('Confirmar revisão das dependências', () => run(async () => {
        await mutate('human.review_artifacts', { branch_id: context.branch.id, expected_revision: context.revision.id, dimensions: stale, reason: reason.value });
        await load(context.branch.id); announce('Dependências revisadas explicitamente.');
      })));
    } else locksBody.append(el('p', { class: 'muted', text: 'Travas e aceite de dependências exigem a revisão humana local.' }));
    locksDrawer.append(locksBody); stage.append(locksDrawer);
    const branchesDrawer = el('details', {}, el('summary', { text: 'Ramificações e comparação' }));
    const branchesBody = el('div');
    const branchName = el('input');
    const vary = [];
    const varyList = el('div', { class: 'dimensions' });
    for (const [dimension, label] of Object.entries(labels)) { const input = el('input', { type: 'checkbox', checked: dimension === 'text' }); vary.push([dimension, input]); const item = field(`Variar ${label}`, input); item.className = 'check'; varyList.append(item); }
    branchesBody.append(field('Nome da ramificação', branchName), varyList, button('Criar ramificação', () => run(async () => {
      const branch = await mutate('arena.create_branch', { source_branch_id: context.branch.id, source_revision_id: context.revision.id, expected_revision: context.branch.current_revision_id, name: branchName.value, vary_dimensions: vary.filter(([, input]) => input.checked).map(([dimension]) => dimension) });
      const work = await call('arena.list_work', {}); state.work = work.explorations; await load(branch.branch_id); announce('Ramificação criada a partir da revisão apresentada.');
    })));
    const compareWith = el('select');
    for (const exploration of state.work) for (const branch of exploration.branches) if (branch.id !== context.branch.id) compareWith.append(el('option', { value: branch.id, text: `${exploration.title} · ${branch.name}` }));
    const compared = el('div');
    branchesBody.append(field('Comparar com', compareWith), button('Comparar revisões', () => run(async () => {
      if (!compareWith.value) return announce('Crie outra ramificação para comparar.');
      const other = await call('arena.read_context', { branch_id: compareWith.value });
      const comparison = await call('arena.compare_branches', { left_branch_id: context.branch.id, left_revision_id: context.revision.id, right_branch_id: other.branch.id, right_revision_id: other.revision.id });
      compared.replaceChildren(el('p', { class: 'muted', text: `Comparando ${comparison.left.revision_id.slice(0, 8)} com ${comparison.right.revision_id.slice(0, 8)} · base comum ${comparison.common_base?.id?.slice(0, 8) ?? 'ausente'}` }));
      const selected = [];
      for (const difference of comparison.differences) { const checkbox = el('input', { type: 'checkbox', checked: true }); selected.push([difference.dimension, checkbox]); const label = field(`Trazer ${labels[difference.dimension]}`, checkbox); label.className = 'check'; compared.append(label, el('div', { class: 'compare' }, el('pre', { text: difference.left || '(vazio)' }), el('pre', { text: difference.right || '(vazio)' }))); }
      if (!comparison.differences.length) compared.append(el('p', { text: 'As dimensões destas revisões são iguais.' }));
      else compared.append(button('Trazer como proposta', () => run(async () => {
        const dimensions = selected.filter(([, input]) => input.checked).map(([dimension]) => dimension);
        if (!dimensions.length) return announce('Selecione uma diferença.');
        const changes = Object.fromEntries(dimensions.map(dimension => [dimension, other.revision.fields[dimension]]));
        const source_ids = [...new Set(dimensions.flatMap(dimension => other.revision.artifacts[dimension]?.source_ids ?? []))];
        await mutate('arena.submit_proposal', { branch_id: context.branch.id, expected_revision: context.branch.current_revision_id, base_revision_id: context.revision.id, changes, source_ids, rationale: `Sugestão trazida de ${other.branch.name}, revisão ${other.revision.id}.` });
        await load(context.branch.id); announce('Diferenças trazidas como proposta pendente.');
      })));
    })), compared);
    branchesDrawer.append(branchesBody); stage.append(branchesDrawer);
    const sourcesDrawer = el('details', {}, el('summary', { text: 'Fontes e origem' }));
    const sourcesBody = el('div');
    const sourceList = el('div');
    async function listSources() {
      const sources = mode === 'local' ? (await call('human.list_sources', {})).sources : context.sources;
      sourceList.replaceChildren();
      for (const source of sources) {
        const item = el('article', { class: 'source' }, el('h3', { text: `${source.origin} · ${source.status}` }), el('p', { class: 'muted', text: `${source.rights} · ${source.usage_scope} · ${source.coverage}` }));
        const content = el('pre');
        if (source.status === 'active') item.append(button('Ler fonte', () => run(async () => { const read = await call('arena.read_source', { source_id: source.id, limit: 10000 }); content.textContent = read.content; if (read.next_offset !== null) content.append(document.createTextNode('\n(Prévia de 10.000 caracteres; o agente pode continuar a leitura pelo MCP.)')); })), content);
        if (mode === 'local' && source.status !== 'removed') { const reason = el('input'); item.append(field(`Motivo para fonte ${source.id.slice(0, 8)}`, reason), el('div', { class: 'actions' }, source.status === 'active' ? button('Revogar acesso', () => run(async () => { await mutate('human.revoke_source', { source_id: source.id, expected_revision: source.revision, reason: reason.value }); await load(context.branch.id); announce('Acesso à fonte revogado.'); })) : null, button('Remover conteúdo local', () => run(async () => { await mutate('human.remove_source', { source_id: source.id, expected_revision: source.revision, reason: reason.value }); await load(context.branch.id); announce('Conteúdo controlado removido; cópias já exportadas permanecem fora da Arena.'); })))); }
        sourceList.append(item);
      }
      if (!sources.length) sourceList.append(el('p', { class: 'muted', text: 'Nenhuma fonte neste escopo.' }));
    }
    sourcesBody.append(el('p', { class: 'muted', text: 'Fontes são dados de referência. O conteúdo não instrui o agente nem concede direitos de uso.' }), button('Consultar fontes', () => run(listSources)), sourceList);
    if (mode === 'local') {
      const preview = el('div'); let rows = [];
      const file = el('input', { type: 'file', accept: '.json,.csv,application/json,text/csv', onChange: event => run(async () => {
        const selected = event.target.files[0]; if (!selected) return; const format = selected.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
        if (selected.size > 900000) throw new Error('Selecione um arquivo menor que 900 KB.');
        const items = previewExport(format, await selected.text()); rows = []; preview.replaceChildren(el('p', { class: 'muted', text: `${items.length} texto(s) para revisar. Selecione somente os permitidos.` }));
        items.forEach((item, index) => { const checkbox = el('input', { type: 'checkbox', checked: true }); rows.push([item, checkbox]); const label = field(`Importar texto ${index + 1}`, checkbox); label.className = 'check'; preview.append(el('article', { class: 'source' }, label, el('pre', { text: item.text }), el('small', { text: JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'text'))) }))); });
      }) });
      const origin = el('input'), rights = el('input'), scope = el('input'), coverage = el('input');
      sourcesBody.append(field('Arquivo JSON ou CSV', file), preview, field('Origem da importação', origin), field('Direitos de uso', rights), field('Escopo de uso', scope), field('Cobertura', coverage), button('Importar selecionados', () => run(async () => {
        const selected = rows.filter(([, input]) => input.checked).map(([item]) => item); if (!selected.length) return announce('Selecione ao menos um texto na prévia.');
        const result = await mutate('human.import_sources', { format: 'json', content: JSON.stringify(selected), origin: origin.value, rights: rights.value, usage_scope: scope.value, coverage: coverage.value });
        file.value = ''; preview.replaceChildren(); rows = []; await listSources(); announce(`${result.source_ids.length} fonte(s) importada(s).`);
      })));
    }
    sourcesDrawer.append(sourcesBody); stage.append(sourcesDrawer);
    const voiceDrawer = el('details', {}, el('summary', { text: 'Voz reutilizável' }));
    const voiceBody = el('div', {}, el('p', { class: 'muted', text: context.profile ? `Voz fixada nesta ramificação: versão ${context.profile.version} · ${context.profile.id}` : 'Esta ramificação não tem um perfil de voz fixado.' }), context.profile ? el('pre', { text: JSON.stringify(context.profile.content, null, 2) }) : null);
    const profilesList = el('div');
    async function listProfiles() {
      const result = await call('arena.list_profiles', {}); profilesList.replaceChildren();
      for (const profile of result.profiles) {
        profilesList.append(el('h3', { text: profile.name }), el('pre', { text: JSON.stringify(profile.revisions.map(revision => ({ id: revision.id, version: revision.version, content: revision.content })), null, 2) }));
        for (const proposal of (result.proposals ?? []).filter(item => item.profile_id === profile.id && item.status === 'pending')) {
          const base = profile.revisions.find(revision => revision.id === proposal.base_revision_id);
          const card = el('article', { class: 'proposal' }, el('p', { class: 'eyebrow', text: `Proposta de voz · versão ${proposal.version} · base ${proposal.base_revision_id.slice(0, 8)}` }), el('p', { text: proposal.rationale }));
          for (const [dimension, value] of Object.entries(proposal.changes)) card.append(el('h3', { text: dimension }), el('div', { class: 'compare' }, el('pre', { text: typeof base?.content[dimension] === 'string' ? base.content[dimension] : JSON.stringify(base?.content[dimension] ?? []) }), el('pre', { text: typeof value === 'string' ? value : JSON.stringify(value) })));
          if (proposal.base_revision_id !== profile.current_revision_id) card.append(el('p', { class: 'notice', text: 'A voz avançou; peça uma proposta sobre a versão atual.' }));
          if (mode === 'local') {
            const comment = el('textarea', { rows: 2 }); const approve = button('Aprovar versão apresentada da voz', () => run(async () => {
              await mutate('human.approve_profile', { proposal_id: proposal.id, presented_version: proposal.version, expected_revision: profile.current_revision_id, comment: comment.value });
              await listProfiles(); announce('Nova versão de voz aprovada; esta ramificação mantém a voz fixada.');
            }), 'primary'); approve.disabled = proposal.base_revision_id !== profile.current_revision_id;
            card.append(field(`Comentário da decisão de voz ${proposal.id.slice(0, 8)}`, comment), approve);
          } else card.append(button('Abrir revisão humana', () => openHuman?.(context)));
          profilesList.append(card);
        }
      }
    }
    voiceBody.append(button('Consultar perfis de voz', () => run(listProfiles)), profilesList);
    if (mode === 'local') {
      const name = el('input'); const content = el('textarea', { rows: 7, placeholder: '{"identity":"","objectives":[],"tone":"","vocabulary":[],"positive_examples":[],"negative_examples":[],"rules":[]}' });
      voiceBody.append(field('Nome do perfil de voz', name), field('Conteúdo do perfil (JSON)', content), button('Criar perfil aprovado', () => run(async () => {
        let parsed; try { parsed = JSON.parse(content.value); } catch { throw new Error('Preencha o perfil em JSON válido.'); }
        await mutate('human.create_profile', { name: name.value, content: parsed, source_ids: [] }); await listProfiles(); announce('Perfil de voz criado; versões anteriores permanecem fixas.');
      })));
    }
    voiceDrawer.append(voiceBody); stage.append(voiceDrawer);
    const exportDrawer = el('details', {}, el('summary', { text: 'Exportar artefato' }));
    const prepared = el('textarea', { class: 'export', readOnly: true, 'aria-label': 'Exportação preparada' });
    const exportBody = el('div', {}, el('p', { class: 'muted', text: 'Pacote portátil inclui contexto e proveniência. Exportação de texto exige dependências revisadas.' }));
    const prepare = format => run(async () => {
      if (format === 'text') prepared.value = (await mutate('human.export_text', { branch_id: context.branch.id, revision_id: context.revision.id })).text;
      else { const result = await call('arena.export_context', { branch_id: context.branch.id, revision_id: context.revision.id }); prepared.value = format === 'json' ? JSON.stringify(result.package, null, 2) : result.markdown; }
      prepared.dataset.format = format; announce('Exportação preparada.');
    });
    exportBody.append(el('div', { class: 'actions' }, button('Preparar JSON', () => prepare('json')), button('Preparar Markdown', () => prepare('markdown')), mode === 'local' ? button('Preparar texto', () => prepare('text')) : null), prepared, button('Baixar exportação', () => { if (!prepared.value) return announce('Prepare a exportação primeiro.'); const blob = new Blob([prepared.value], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = el('a', { href: url, download: `arena-${context.revision.id}.${prepared.dataset.format === 'json' ? 'json' : prepared.dataset.format === 'markdown' ? 'md' : 'txt'}` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }));
    exportDrawer.append(exportBody); stage.append(exportDrawer);
    const compatibilityDrawer = el('details', {}, el('summary', { text: 'Compatibilidade do harness' }));
    const compatibilityBody = el('div', {}, el('p', { class: 'muted', text: 'Verificação de clientes reais permanece separada dos testes do SDK e do host de referência. Codex usa MCP e revisão local; ChatGPT exibe MCP Apps somente quando o host oferece a capacidade.' }));
    if (mode === 'local') compatibilityBody.append(button('Consultar capacidades', () => run(async () => { const result = await call('human.integration_status', {}); for (const integration of result.integrations) compatibilityBody.append(el('h3', { text: `${integration.provider}: ${integration.state}` }), el('pre', { text: JSON.stringify(integration, null, 2) })); })));
    compatibilityDrawer.append(compatibilityBody); stage.append(compatibilityDrawer);
    const panel = el('aside', { class: 'panel', 'aria-label': 'Propostas para revisão' }, el('h2', { text: 'Propostas' }));
    const proposals = context.proposals.filter(proposal => ['pending', 'deferred'].includes(proposal.status));
    if (!proposals.length) panel.append(el('p', { class: 'muted', text: 'Nenhuma proposta pendente. Continue a exploração no agente.' }));
    for (const proposal of proposals) {
      const card = el('article', { class: 'proposal' }, el('span', { class: 'eyebrow', text: `${proposal.status === 'deferred' ? 'Adiada' : 'Pendente'} · versão ${proposal.version}` }), el('p', { text: proposal.rationale }));
      const selected = [];
      for (const [dimension, value] of Object.entries(proposal.changes)) {
        const checkbox = el('input', { type: 'checkbox', checked: true }); selected.push([dimension, checkbox]);
        card.append(field(`Aceitar ${labels[dimension]}`, checkbox)); card.lastChild.className = 'check';
        card.append(el('small', { text: 'Atual' }), el('pre', { text: context.revision.fields[dimension] || '(vazio)' }), el('small', { text: 'Proposto' }), el('pre', { text: value }));
      }
      if (proposal.base_revision_id !== context.branch.current_revision_id) card.append(el('p', { class: 'notice', text: 'Base desatualizada. Peça ao agente uma nova proposta sobre a revisão atual.' }));
      if (mode === 'local') {
        const decide = decision => run(async () => { await mutate('human.decide_proposal', { proposal_id: proposal.id, presented_version: proposal.version, expected_revision: context.branch.current_revision_id, expected_head_revision: context.branch.current_revision_id, decision, ...(decision === 'accepted' ? { selected_dimensions: selected.filter(([, input]) => input.checked).map(([dimension]) => dimension) } : {}) }); await load(context.branch.id); announce('Decisão registrada.'); });
        card.append(el('div', { class: 'actions' }, button('Aceitar selecionadas', () => decide('accepted'), 'primary'), button('Rejeitar', () => decide('rejected')), button('Adiar', () => decide('deferred'))));
      } else card.append(button('Abrir revisão humana', () => openHuman?.(context)));
      panel.append(card);
    }
    if (historical) {
      for (const node of stage.querySelectorAll('button')) if (['Salvar revisão', 'Propor edição', 'Salvar travas', 'Confirmar revisão das dependências', 'Guardar seleção', 'Registrar comentário', 'Revisar trecho'].includes(node.textContent)) node.disabled = true;
      for (const node of panel.querySelectorAll('button')) if (['Aceitar selecionadas', 'Rejeitar', 'Adiar'].includes(node.textContent)) node.disabled = true;
    }
    stage.addEventListener('input', () => { state.dirty = true; });
    shell.append(el('div', { class: 'workspace' }, stage, panel));
  }
  const poll = setInterval(async () => {
    if (!state.context || state.busy || document.hidden || state.context.revision.id !== state.context.branch.current_revision_id) return;
    const branchId = state.context.branch.id;
    try {
      const updated = await call('arena.read_context', { branch_id: branchId });
      if (state.context?.branch.id !== branchId || state.busy) return;
      if (JSON.stringify(updated) === JSON.stringify(state.context)) return;
      const accessReduced = updated.sources?.some(source => source.status !== 'active' && state.context.sources?.some(previous => previous.id === source.id && previous.status === 'active')) || Object.entries(updated.revision.artifacts).some(([dimension, artifact]) => artifact.redacted && !state.context.revision.artifacts[dimension]?.redacted);
      if (accessReduced) { state.context = updated; state.dirty = false; state.selection = null; render(); announce('Uma fonte ficou indisponível. Prévia, seleção e exportações controladas foram limpas.'); return; }
      if (state.dirty || state.selection) { if (updated.revision.id !== state.context.revision.id) announce('Há uma revisão mais recente. Sua edição e seleção foram preservadas.'); return; }
      state.context = updated; render(); announce('Artefato atualizado a partir do estado persistido.');
    } catch { /* Explicit actions still show actionable errors; a background check never destroys a draft. */ }
  }, 5000);
  window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
  return { refresh, async show(context) { if (state.context && (state.dirty || state.selection)) { announce('Novo resultado recebido; sua edição e seleção foram preservadas. Descarte a edição para atualizar.'); return; } state.context = context.next_cursor ? { ...await call('arena.read_context', { branch_id: context.branch.id, revision_id: context.revision.id }), presentation: context.presentation } : context; render(); }, announce, get context() { return state.context; } };
}

if (document.body.dataset.channel === 'local') {
  const root = document.getElementById('arena');
  async function call(operation, input) {
    const response = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, input }) });
    const result = await response.json(); if (!response.ok) throw new Error(`${result.message}${result.next_step ? ` ${result.next_step}` : ''}`); return result;
  }
  async function ready() {
    const viewer = mountArena({ call, logout: async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); } });
    await viewer.refresh();
    const branch = new URL(location.href).searchParams.get('branch_id');
    if (branch) await viewer.show(await call('arena.read_context', { branch_id: branch }));
  }
  const session = await fetch('/api/session');
  if (session.ok) await ready();
  else {
    const token = el('input', { type: 'password', required: true, autocomplete: 'off' });
    const message = el('p', { role: 'status', class: 'status', 'aria-live': 'polite' });
    root.replaceChildren(el('section', { class: 'shell intro' }, el('p', { class: 'brand', text: 'ARENA' }), el('h1', { text: 'Seu texto, em perspectiva.' }), el('p', { class: 'muted', text: 'Use a credencial humana criada no setup local para revisar e decidir.' }), el('form', { onSubmit: async event => { event.preventDefault(); const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.value }) }); token.value = ''; if (!response.ok) { message.textContent = (await response.json()).message; return; } await ready(); } }, field('Credencial humana', token), el('button', { type: 'submit', class: 'primary', text: 'Entrar' }), message)));
  }
}
