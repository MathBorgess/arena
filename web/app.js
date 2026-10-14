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

export function mountArena({ root = document.getElementById('arena'), call, mode = 'local', onContext, requestReview, openHuman, logout }) {
  const state = { context: null, work: [], selection: null, status: '', error: false, busy: false };
  const shell = el('div', { class: 'shell' }); root.replaceChildren(shell);
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const announce = (text, error = false) => { state.status = text; state.error = error; status.textContent = text; status.className = `status${error ? ' error' : ''}`; };
  const run = async (action) => { if (state.busy) return; state.busy = true; try { await action(); } catch (error) { announce(error.message ?? 'Não foi possível concluir a ação.', true); } finally { state.busy = false; } };
  const mutate = (operation, input) => call(operation, { ...input, idempotency_key: key() });
  async function load(branch, revision) {
    state.context = await call('arena.read_context', { branch_id: branch, ...(revision ? { revision_id: revision } : {}) });
    state.selection = null; render();
  }
  async function refresh() {
    const result = await call('arena.list_work', {}); state.work = result.explorations;
    if (state.context) await load(state.context.branch.id); else render();
  }
  function render() {
    const top = el('header', { class: 'topbar' }, el('span', { class: 'brand', text: 'ARENA' }), el('span', { class: 'muted', text: mode === 'embedded' ? 'Artefato no seu agente' : 'Revisão humana local' }), el('div', { class: 'actions' }, button('Atualizar artefato', () => run(refresh)), logout ? button('Sair', logout, 'quiet') : null));
    shell.replaceChildren(top, status); announce(state.status, state.error);
    if (!state.context) {
      shell.append(el('section', { class: 'empty' }, el('p', { class: 'eyebrow', text: 'Uma ideia ainda aberta' }), el('h1', { text: 'O que vamos explorar?' }), el('p', { class: 'muted', text: 'Mantenha a conversa no seu agente. Acompanhe e revise o artefato por aqui.' })));
      for (const exploration of state.work) for (const branch of exploration.branches) shell.append(button(`${exploration.title} · ${branch.name}`, () => run(() => load(branch.id))));
      const title = el('input', { required: true }), objective = el('textarea', { required: true, rows: 3 });
      const form = el('form', { onSubmit: event => { event.preventDefault(); run(async () => { const created = await mutate('arena.create_exploration', { title: title.value, objective: objective.value }); await refresh(); await load(created.branch_id); announce('Exploração criada.'); }); } }, field('Título da exploração', title), field('Objetivo', objective), el('button', { type: 'submit', class: 'primary', text: 'Criar exploração' }));
      shell.append(el('section', { class: 'create' }, form)); return;
    }
    const context = state.context;
    const branches = el('select', { 'aria-label': 'Ramificação', onChange: event => run(() => load(event.target.value)) });
    for (const exploration of state.work) for (const branch of exploration.branches) branches.append(el('option', { value: branch.id, text: `${exploration.title} · ${branch.name}`, selected: branch.id === context.branch.id }));
    shell.append(el('p', { class: 'eyebrow', text: context.exploration.objective }), el('h1', { text: context.exploration.title }), el('div', { class: 'branchline' }, branches, el('span', { class: 'badge', text: `Revisão ${context.revision.id.slice(0, 8)}` })));
    const text = el('textarea', { class: 'text-stage', 'aria-label': 'Texto do artefato', value: context.revision.fields.text, placeholder: 'O texto ganha forma aqui…', spellcheck: true });
    const stage = el('section', { class: 'stage', 'aria-label': 'Artefato' }, field('Texto', text));
    const dimensions = el('details', {}, el('summary', { text: 'Direção editorial' }));
    const grid = el('div', { class: 'dimensions' });
    for (const [dimension, label] of Object.entries(labels)) if (dimension !== 'text') grid.append(field(label, el('textarea', { rows: 2, value: context.revision.fields[dimension], 'data-dimension': dimension })));
    dimensions.append(grid); stage.append(dimensions);
    if (mode === 'embedded') stage.append(button('Propor edição', () => run(async () => {
      const changes = {}; if (text.value !== context.revision.fields.text) changes.text = text.value;
      grid.querySelectorAll('[data-dimension]').forEach(input => { if (input.value !== context.revision.fields[input.dataset.dimension]) changes[input.dataset.dimension] = input.value; });
      if (!Object.keys(changes).length) return announce('Nenhuma alteração para propor.');
      const proposed = await mutate('arena.submit_proposal', { branch_id: context.branch.id, expected_revision: context.branch.current_revision_id, base_revision_id: context.revision.id, changes, rationale: 'Edição sugerida no visualizador do artefato.', source_ids: [] });
      await onContext?.({ branch_id: context.branch.id, revision_id: context.revision.id, proposal_id: proposed.proposal_id, action: 'proposed_edit' });
      await load(context.branch.id); announce('Edição enviada como proposta pendente.');
    }), 'primary'));

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
    shell.append(el('div', { class: 'workspace' }, stage, panel));
  }
  return { refresh, async show(context) { state.context = context; render(); }, announce, get context() { return state.context; } };
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
