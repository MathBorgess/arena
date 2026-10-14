const element = (tag, attributes = {}) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name in node) node[name] = value; else node.setAttribute(name, value);
  }
  return node;
};
const identity = artifact => JSON.stringify([artifact.branch_id, artifact.revision_id, artifact.proposal_id ?? null, artifact.presented_version ?? null, artifact.text, artifact.redacted ?? false]);

/** A read-only text surface. Every editorial request stays in the harness. */
export function mountArena({ call, onContext, mode = 'local', root = document.getElementById('arena') }) {
  const text = element('textarea', { readOnly: true, spellcheck: false, 'aria-label': 'Texto da proposta', placeholder: 'O agente ainda não registrou um texto.' });
  const status = element('p', { role: 'status', hidden: true, 'aria-live': 'polite' });
  root.replaceChildren(text, status);
  let current, parameters, lastSelection = null, lastSeen = 'null', timer, applying = false, stopped = false;
  let sequence = Promise.resolve();
  const announce = message => { status.textContent = message ?? ''; status.hidden = !message; };
  async function contextSnapshot(snapshot) { if (onContext) await onContext(snapshot); }
  async function record(artifact, selection) {
    const input = { branch_id: artifact.branch_id, revision_id: artifact.revision_id, expected_revision: artifact.current_revision_id,
      ...(artifact.proposal_id ? { proposal_id: artifact.proposal_id, presented_version: artifact.presented_version } : {}),
      type: selection ? 'selection' : 'selection_clear', dimension: 'text', selection, idempotency_key: crypto.randomUUID() };
    try {
      const result = await call(mode === 'embedded' ? 'arena.record_interaction' : 'human.record_artifact_interaction', input);
      if (!current || identity(current.artifact) !== identity(artifact)) return;
      let event, eventCursor;
      if (onContext) {
        let cursor;
        do { const page = await call('arena.read_events', { branch_id: artifact.branch_id, limit: 100, ...(cursor ? { cursor } : {}) });
          event = page.events.find(item => item.id === result.event_id); eventCursor = page.event_cursor; cursor = page.next_cursor;
        } while (!event && cursor);
      }
      await contextSnapshot({ branch_id: artifact.branch_id, revision_id: artifact.revision_id,
        ...(artifact.proposal_id ? { proposal_id: artifact.proposal_id, presented_version: artifact.presented_version } : {}),
        selection, action: input.type, event_id: result.event_id, ...(eventCursor ? { event_cursor: eventCursor } : {}),
        ...(event ? { author: event.author, ui_origin: event.ui_origin } : {}) });
      announce();
    } catch (error) {
      // Do not leave a failed or restricted passage as active model context.
      await contextSnapshot({ branch_id: artifact.branch_id, revision_id: artifact.revision_id, selection: null, action: 'selection_clear', persisted: false });
      announce(error.message ?? 'Não foi possível registrar a seleção.');
      if (['ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE'].includes(error.code)) clear();
    }
  }
  function enqueue(artifact, selection) { sequence = sequence.then(() => record(artifact, selection)).catch(error => announce(error.message)); }
  function selectionChanged() {
    if (applying || !current || current.artifact.redacted) return;
    const selection = text.selectionStart === text.selectionEnd ? null : {
      start: text.selectionStart, end: text.selectionEnd, text: text.value.slice(text.selectionStart, text.selectionEnd)
    };
    const signature = JSON.stringify(selection); if (signature === lastSeen) return;
    lastSeen = signature; lastSelection = selection; clearTimeout(timer);
    const artifact = { ...current.artifact };
    timer = setTimeout(() => enqueue(artifact, selection), 120);
  }
  for (const event of ['select', 'mouseup', 'keyup']) text.addEventListener(event, selectionChanged);
  function clear() {
    const previous = current?.artifact; clearTimeout(timer); current = undefined; applying = true;
    text.value = ''; text.setSelectionRange(0, 0); lastSelection = null; lastSeen = 'null'; applying = false;
    if (previous) void contextSnapshot({ branch_id: previous.branch_id, revision_id: previous.revision_id, selection: null, action: 'selection_clear', persisted: false }).catch(() => {});
  }
  async function show(context, input) {
    if (!context.artifact) throw new Error('O servidor não forneceu o texto exato do artefato.');
    const previous = current?.artifact; const changed = !previous || identity(previous) !== identity(context.artifact);
    const hadSelection = lastSelection !== null;
    current = context;
    parameters = input ?? (context.presentation?.follow_current === false ? {
      branch_id: context.artifact.branch_id,
      ...(context.artifact.proposal_id ? { proposal_id: context.artifact.proposal_id, presented_version: context.artifact.presented_version } : { revision_id: context.artifact.revision_id })
    } : { branch_id: context.artifact.branch_id });
    if (changed) {
      const scroll = text.scrollTop; const pagePosition = window.scrollY;
      clearTimeout(timer); applying = true; text.value = context.artifact.text; text.setSelectionRange(0, 0);
      text.style.height = 'auto'; text.style.height = `${Math.max(320, text.scrollHeight)}px`;
      text.scrollTop = scroll; if (previous) window.scrollTo(window.scrollX, pagePosition);
      text.placeholder = context.artifact.redacted ? '' : 'O agente ainda não registrou um texto.';
      lastSelection = null; lastSeen = 'null'; applying = false;
      if (hadSelection) enqueue({ ...context.artifact }, null);
    }
    announce();
  }
  async function refresh() {
    if (!parameters || stopped) return;
    try { await show(await call('arena.open_artifact', parameters), parameters); }
    catch (error) { clear(); announce(error.message ?? 'Artefato indisponível.'); }
  }
  const poll = setInterval(() => { if (!document.hidden && !stopped) void refresh(); }, 1500);
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(poll); clearTimeout(timer); }, { once: true });
  return { show, refresh, clear, announce };
}

if (document.body.dataset.channel === 'local') {
  async function call(operation, input) {
    const response = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, input }) });
    const result = await response.json(); if (!response.ok) { const error = new Error(result.message); error.code = result.code; throw error; } return result;
  }
  async function ready() {
    const viewer = mountArena({ call }); const query = new URL(location.href).searchParams;
    const branch_id = query.get('branch_id');
    if (!branch_id) { viewer.announce('Abra o artefato pela conversa com o agente.'); return; }
    const input = { branch_id, ...(query.has('revision_id') ? { revision_id: query.get('revision_id') } : {}),
      ...(query.has('proposal_id') ? { proposal_id: query.get('proposal_id') } : {}),
      ...(query.has('presented_version') ? { presented_version: Number(query.get('presented_version')) } : {}) };
    try { await viewer.show(await call('arena.open_artifact', input), input); }
    catch (error) { viewer.clear(); viewer.announce(error.message); }
  }
  const session = await fetch('/api/session');
  if (session.ok) await ready();
  else {
    const form = element('form'); const label = element('label', { textContent: 'Credencial humana' });
    const token = element('input', { type: 'password', required: true, autocomplete: 'off' }); label.append(token);
    const submit = element('button', { type: 'submit', textContent: 'Entrar' }); const status = element('p', { role: 'status' });
    form.append(label, submit, status); document.getElementById('arena').replaceChildren(form);
    form.addEventListener('submit', async event => { event.preventDefault(); const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.value }) }); token.value = ''; if (!response.ok) { status.textContent = (await response.json()).message; return; } await ready(); });
  }
}
