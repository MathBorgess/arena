const element = (tag, attributes = {}) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name in node) node[name] = value; else node.setAttribute(name, value);
  }
  return node;
};
/** @typedef {{branch_id: string, revision_id: string, proposal_id?: string, presented_version?: number}} ArtifactReference */
/** @returns {ArtifactReference} */
const artifactReference = artifact => ({ branch_id: artifact.branch_id, revision_id: artifact.revision_id,
  ...(artifact.proposal_id ? { proposal_id: artifact.proposal_id, presented_version: artifact.presented_version } : {}) });
const identity = artifact => JSON.stringify([artifactReference(artifact), artifact.dna_id, artifact.dna_version, artifact.text, artifact.redacted ?? false]);

/** A read-only text surface. Every editorial request stays in the harness. */
export function mountArena({ call, onContext, mode = 'local', root = document.getElementById('arena') }) {
  const text = element('textarea', { spellcheck: false, 'aria-label': 'Texto da proposta', placeholder: 'Escreva aqui ou peça um texto na conversa.' });
  const status = element('p', { role: 'status', hidden: true, 'aria-live': 'polite' });
  root.replaceChildren(text, status);
  let current, parameters, lastSeen = 'null', timer, saveTimer, applying = false, stopped = false;
  let sequence = Promise.resolve(), generation = 0, dirty = false, saving = false, conflicted = false;
  let syncCursor, syncState, preloaded = false;
  const announce = message => { status.textContent = message ?? ''; status.hidden = !message; };
  const contextSnapshot = async snapshot => { if (onContext) await onContext(snapshot); };
  const artifactId = artifact => artifact.dna_id ?? artifact.proposal_id ?? artifact.revision_id;
  const reference = artifact => ({ ...artifactReference(artifact), ...(artifact.surface === 'dna'
    ? { surface: 'dna', dna_id: artifact.dna_id, dna_version: artifact.dna_version } : {}) });
  const patchText = (before, patch) => before.slice(0, patch.start) + patch.text + before.slice(patch.end);
  const difference = (before, after) => {
    let start = 0, end = before.length, nextEnd = after.length;
    while (start < end && start < nextEnd && before[start] === after[start]) start++;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    return { start, end, text: after.slice(start, nextEnd) };
  };
  function consumeSync(update) {
    if (update.mode === 'full') syncState = update.state;
    else {
      if (!syncState) throw new Error('Reabra o bloco para recuperar o contexto.');
      const apply = (before, change) => {
        if (!change) return before;
        if (artifactId(before) === artifactId(change.after)) return { ...change.after, text: before.text };
        if (artifactId(before) !== change.before_artifact_id) throw new Error('A base do bloco mudou. Reabra para comparar.');
        return { ...change.after, text: patchText(before.text, change.patch) };
      };
      syncState = { ...syncState, ...(update.context ? { context: { ...syncState.context, ...update.context } } : {}),
        artifact: apply(syncState.artifact, update.artifact), dna: apply(syncState.dna, update.dna), selection: update.selection };
    }
    syncCursor = update.sync_cursor; preloaded = true;
  }
  function resize() { const scroll = text.scrollTop; text.style.height = 'auto'; text.style.height = `${Math.max(320, text.scrollHeight)}px`; text.scrollTop = scroll; }
  async function record(artifact, selection) {
    const isCurrent = () => current && !dirty && !saving && !current.artifact.redacted && identity(current.artifact) === identity(artifact);
    const input = { ...reference(artifact), expected_revision: artifact.current_revision_id,
      type: selection ? 'selection' : 'selection_clear', dimension: 'text', selection, idempotency_key: crypto.randomUUID(),
      ...(syncCursor ? { sync_cursor: syncCursor } : {}) };
    try {
      const result = await call(mode === 'embedded' ? 'arena.record_interaction' : 'human.record_artifact_interaction', input);
      if (!isCurrent()) return;
      // The authenticated write returns the committed event, avoiding a second read/page scan.
      const event = result.event;
      if (event?.redacted) { clear(); return; }
      if (result.sync) consumeSync(result.sync);
      generation++;
      await contextSnapshot({ ...reference(artifact), selection: event ? event.selection ?? null : selection,
        action: event?.type ?? input.type, event_id: result.event_id, event_cursor: result.event_cursor,
        sync_cursor: syncCursor, sync: result.sync, author: event?.author, ui_origin: event?.ui_origin });
      announce();
    } catch (error) {
      if (!current || identity(current.artifact) !== identity(artifact)) return;
      applying = true; text.setSelectionRange(0, 0); lastSeen = 'null'; applying = false;
      await contextSnapshot({ ...reference(artifact), selection: null, action: 'selection_clear', persisted: false });
      announce(error.message ?? 'Não foi possível registrar a seleção.');
      if (['ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE'].includes(error.code)) clear();
    }
  }
  function enqueue(artifact, selection) { sequence = sequence.then(() => record(artifact, selection)).catch(error => announce(error.message)); }
  function selectionChanged() {
    if (applying || !current || current.artifact.redacted || dirty || saving) return;
    const selection = text.selectionStart === text.selectionEnd ? null : {
      start: text.selectionStart, end: text.selectionEnd, text: text.value.slice(text.selectionStart, text.selectionEnd)
    };
    const signature = JSON.stringify(selection); if (signature === lastSeen) return;
    lastSeen = signature; clearTimeout(timer);
    const artifact = { ...current.artifact };
    timer = setTimeout(() => enqueue(artifact, selection), 120);
  }
  async function save() {
    if (!dirty || saving || conflicted || !current || current.artifact.redacted) return;
    clearTimeout(saveTimer); clearTimeout(timer); saving = true;
    const artifact = { ...current.artifact }, value = text.value, patch = difference(artifact.text, value);
    try {
      const result = await call(mode === 'embedded' ? 'arena.patch_artifact' : 'human.patch_artifact', {
        branch_id: artifact.branch_id, expected_revision: artifact.current_revision_id,
        artifact_id: artifactId(artifact), presented_version: artifact.dna_version ?? artifact.presented_version ?? 0,
        ...(artifact.surface === 'dna' ? { surface: 'dna' } : {}), patch, idempotency_key: crypto.randomUUID(),
        ...(syncCursor ? { sync_cursor: syncCursor } : {})
      });
      if (!current || identity(current.artifact) !== identity(artifact)) return;
      if (result.event?.redacted || result.artifact.redacted) { clear(); return; }
      if (result.sync) consumeSync(result.sync);
      generation++;
      current = { ...current, artifact: { ...result.artifact, text: value } };
      dirty = text.value !== value; lastSeen = 'null';
      await contextSnapshot({ ...reference(current.artifact), action: result.event.type, patch: result.patch,
        before_artifact_id: result.before_artifact_id, event_id: result.event_id, selection: null,
        author: result.event.author, ui_origin: result.event.ui_origin, persisted: true, sync_cursor: syncCursor, sync: result.sync });
      announce(dirty ? 'Salvando…' : null);
    } catch (error) {
      if (!current || identity(current.artifact) !== identity(artifact)) return;
      if (['ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE'].includes(error.code)) { clear(); announce(error.message); return; }
      conflicted = true;
      announce(`${error.message ?? 'Não foi possível salvar.'} Seu texto continua no bloco. Peça arena:contexto na conversa para comparar.`);
    } finally {
      saving = false;
      if (dirty && !conflicted && current) saveTimer = setTimeout(() => { void save(); }, 120);
    }
  }
  text.addEventListener('input', () => {
    if (applying || !current || current.artifact.redacted) return;
    generation++; dirty = true; lastSeen = 'null'; clearTimeout(timer); clearTimeout(saveTimer); resize();
    announce('Salvando…'); saveTimer = setTimeout(() => { void save(); }, 250);
  });
  text.addEventListener('blur', () => { void save(); });
  for (const event of ['select', 'mouseup', 'keyup']) text.addEventListener(event, selectionChanged);
  function clear() {
    generation++;
    const previous = current?.artifact; clearTimeout(timer); clearTimeout(saveTimer); current = undefined;
    dirty = false; conflicted = false; applying = true; text.value = ''; text.setSelectionRange(0, 0); lastSeen = 'null'; applying = false;
    if (previous) void contextSnapshot({ ...reference(previous), selection: null, action: 'selection_clear', persisted: false }).catch(() => {});
  }
  async function show(context, input) {
    if (!context.artifact) throw new Error('O servidor não forneceu o texto exato do artefato.');
    generation++;
    const previous = current?.artifact, changed = !previous || identity(previous) !== identity(context.artifact);
    // Restrictions clear even an unsaved local draft. Ordinary refreshes cannot overwrite typing.
    if ((dirty || saving || conflicted) && changed && !context.artifact.redacted) return;
    if (previous && previous.branch_id !== context.artifact.branch_id) { syncCursor = undefined; syncState = undefined; preloaded = false; }
    const hadSelection = lastSeen !== 'null';
    current = context;
    parameters = input ?? (context.presentation?.follow_current === false
      ? reference(context.artifact) : { branch_id: context.artifact.branch_id, ...(context.artifact.surface === 'dna' ? { surface: 'dna' } : {}) });
    if (changed) {
      const scroll = text.scrollTop, pagePosition = window.scrollY;
      clearTimeout(timer); applying = true; text.value = context.artifact.text; text.setSelectionRange(0, 0); resize();
      text.scrollTop = scroll; if (previous) window.scrollTo(window.scrollX, pagePosition);
      text.readOnly = !!context.artifact.redacted || !!parameters.revision_id || !!parameters.proposal_id;
      text.setAttribute('aria-label', context.artifact.surface === 'dna' ? 'DNA da produção' : 'Texto da proposta');
      text.placeholder = context.artifact.redacted ? '' : 'Escreva aqui ou peça um texto na conversa.';
      lastSeen = 'null'; dirty = false; conflicted = false; applying = false;
      if (hadSelection) enqueue({ ...context.artifact }, null);
    }
    if (!dirty && !conflicted) announce();
  }
  async function refresh() {
    if (!parameters || stopped) return;
    const requested = parameters, pending = ++generation;
    try {
      if (requested.revision_id || requested.proposal_id) {
        const context = await call('arena.open_artifact', requested);
        if (pending === generation && !stopped) await show(context, requested);
        return;
      }
      const update = await call('arena.sync_context', { branch_id: requested.branch_id, ...(syncCursor ? { sync_cursor: syncCursor } : {}) });
      if (pending !== generation || stopped) return;
      const needsPreload = !preloaded; consumeSync(update);
      const selected = requested.surface === 'dna' ? syncState.dna : syncState.artifact;
      await show({ ...syncState.context, artifact: selected }, requested);
      if (selected.redacted || update.reset) await contextSnapshot({ action: 'selection_clear', ...update, selection: null });
      else if (needsPreload) await contextSnapshot({ action: 'preload', ...update, selection: syncState.selection });
    } catch (error) {
      if (pending !== generation || stopped) return;
      if (['ACCESS_DENIED', 'NOT_FOUND', 'SOURCE_UNAVAILABLE'].includes(error.code)) clear();
      announce(error.message ?? 'Bloco indisponível.');
    }
  }
  const poll = setInterval(() => { if (!document.hidden && !stopped) void refresh(); }, 1500);
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(poll); clearTimeout(timer); clearTimeout(saveTimer); }, { once: true });
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
    const input = { branch_id, ...(query.get('surface') === 'dna' ? { surface: 'dna' } : {}), ...(query.has('revision_id') ? { revision_id: query.get('revision_id') } : {}),
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
