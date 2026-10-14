import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { Arena } from '../src/arena.js';
import { startHttpServer } from '../src/http.js';
import { createMcpServer } from '../src/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

async function referenceHost(page: any, url: string, context: any, arena: Arena, credentials: any, capabilities: any = { serverTools: {}, updateModelContext: { text: {} }, message: { text: {} } }, hooks: { afterReadEvents?: () => Promise<void> } = {}) {
  const server = createMcpServer(arena, credentials.agent_token, { workspace_id: credentials.workspace_id });
  const client = new Client({ name: 'reference-widget-client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  const updates: any[] = []; const messages: any[] = []; const requests: string[] = [];
  await page.exposeFunction('fixtureCall', async (name: string, input: any) => {
    requests.push(name);
    expect(input.workspace_id).toBe(credentials.workspace_id);
    const result = await client.callTool({ name, arguments: input });
    if (name === 'arena.read_events') await hooks.afterReadEvents?.();
    return result;
  });
  await page.exposeFunction('fixtureContext', (input: any) => { updates.push(input); return {}; });
  await page.exposeFunction('fixtureMessage', (input: any) => { messages.push(input); return {}; });
  const host = await build({ stdin: { contents: `import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const frame=document.querySelector('iframe');
const bridge=new AppBridge(null,{name:'Arena SDK reference host',version:'1.0.0'},${JSON.stringify(capabilities)});
bridge.oncalltool=({name,arguments:input})=>window.fixtureCall(name,input);
bridge.onupdatemodelcontext=input=>window.fixtureContext(input);
bridge.onmessage=input=>window.fixtureMessage(input);
bridge.oninitialized=()=>bridge.sendToolResult(${JSON.stringify({ structuredContent: context, content: [{ type: 'text', text: 'Artefato fictício' }] })});
await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));
frame.srcdoc=${JSON.stringify(await readFile('dist/artifact-ui.html', 'utf8'))};`, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  await page.route(`${url}/fixture`, (route: any) => route.fulfill({ contentType: 'text/html', body: `<iframe title="Artefato Arena" style="width:100%;height:1100px;border:0"></iframe><script type="module">${host.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>` }));
  await page.goto(`${url}/fixture`);
  return { updates, messages, requests, frame: page.frameLocator('iframe'), close: async () => { await client.close(); await server.close(); } };
}

test('native selection is automatically persisted through MCP and updates SDK host context without any message or workflow controls', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Proposta fictícia', objective: 'Selecionar no harness', idempotency_key: 'create' });
  const proposal = arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, base_revision_id: created.revision_id, changes: { text: 'Uma ideia abre uma conversa.' }, source_ids: [], rationale: 'Proposta fictícia', idempotency_key: 'proposal' });
  const context = arena.execute('arena.open_artifact', credentials.agent, { ...scope, branch_id: created.branch_id });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 }); let host;
  try {
    let localRequests = 0; page.on('request', request => { if (request.url().includes('/api/')) localRequests++; });
    host = await referenceHost(page, viewer.url, context, arena, credentials);
    const text = host.frame.getByRole('textbox', { name: 'Texto da proposta' }); await expect(text).toHaveValue('Uma ideia abre uma conversa.'); await expect(host.frame.getByRole('button')).toHaveCount(0);
    await text.dblclick({ position: { x: 65, y: 20 } }); await expect.poll(() => host!.updates.length).toBe(1);
    expect(host.updates[0].structuredContent).toMatchObject({ branch_id: created.branch_id, revision_id: created.revision_id, proposal_id: proposal.proposal_id, presented_version: 1, selection: { start: 4, end: 9, text: 'ideia' }, author: credentials.agent, ui_origin: 'unverified' });
    expect(host.updates[0].structuredContent.event_cursor).toEqual(expect.any(String)); expect(host.messages).toHaveLength(0); expect(localRequests).toBe(0);
    await text.click({ position: { x: 8, y: 20 } }); await expect.poll(() => host!.updates.at(-1)?.structuredContent.action).toBe('selection_clear'); expect(host.updates.at(-1).structuredContent.selection).toBeNull(); expect(host.messages).toHaveLength(0);
    expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.fields.text).toBe('');
  } finally { await host?.close(); await viewer.close(); arena.close(); }
});


test('restriction updates automatically clear embedded proposal text and the latest model-context selection', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' }); const scope = { workspace_id: credentials.workspace_id };
  const source = arena.execute('human.import_sources', credentials.owner, { ...scope, format: 'json', content: JSON.stringify([{ text: 'Referência fictícia.' }]), origin: 'Arquivo fictício', rights: 'Autorizado', usage_scope: 'editorial', coverage: 'Amostra', idempotency_key: 'source' }).source_ids[0];
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Proposta revogável', objective: 'Limpar contexto controlado', idempotency_key: 'create' });
  arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, base_revision_id: created.revision_id, changes: { text: 'Uma ideia usa a referência.' }, source_ids: [source], rationale: 'Proposta fictícia', idempotency_key: 'proposal' });
  const context = arena.execute('arena.open_artifact', credentials.agent, { ...scope, branch_id: created.branch_id });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 }); let host;
  try {
    host = await referenceHost(page, viewer.url, context, arena, credentials);
    const text = host.frame.getByRole('textbox', { name: 'Texto da proposta' }); await expect(text).toHaveValue('Uma ideia usa a referência.'); await text.dblclick({ position: { x: 65, y: 20 } }); await expect.poll(() => host!.updates.length).toBe(1);
    arena.execute('human.revoke_source', credentials.owner, { ...scope, source_id: source, expected_revision: 1, reason: 'Restrição fictícia', idempotency_key: 'revoke' });
    await expect(text).toHaveValue(''); await expect.poll(() => host!.updates.at(-1)?.structuredContent.action).toBe('selection_clear');
    expect(host.updates.at(-1).structuredContent.selection).toBeNull(); expect(JSON.stringify(host.updates.at(-1)).includes('ideia')).toBe(false); expect(host.messages).toHaveLength(0);
  } finally { await host?.close(); await viewer.close(); arena.close(); }
});


test('an event read finishing after revocation never restores a restricted selection to model context', async ({ page }) => {
  const arena = new Arena(':memory:'); const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const source = arena.execute('human.import_sources', credentials.owner, { ...scope, format: 'json', content: JSON.stringify([{ text: 'Referência fictícia.' }]), origin: 'Arquivo fictício', rights: 'Autorizado', usage_scope: 'Arena', coverage: 'Amostra', idempotency_key: 'source' }).source_ids[0];
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Proposta fictícia', objective: 'Reavaliar seleção', idempotency_key: 'create' });
  arena.execute('arena.submit_proposal', credentials.agent, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, base_revision_id: created.revision_id, changes: { text: 'Uma ideia usa a referência.' }, source_ids: [source], rationale: 'Proposta fictícia', idempotency_key: 'proposal' });
  const context = arena.execute('arena.open_artifact', credentials.agent, { ...scope, branch_id: created.branch_id });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let eventReadStarted = false;
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 }); let host;
  try {
    host = await referenceHost(page, viewer.url, context, arena, credentials, undefined,
      { afterReadEvents: async () => { eventReadStarted = true; await held; } });
    const text = host.frame.getByRole('textbox', { name: 'Texto da proposta' });
    await expect(text).toHaveValue('Uma ideia usa a referência.'); await text.dblclick({ position: { x: 65, y: 20 } });
    await expect.poll(() => eventReadStarted).toBe(true);
    arena.execute('human.revoke_source', credentials.owner, { ...scope, source_id: source, expected_revision: 1, reason: 'Retirar permissão', idempotency_key: 'revoke' });
    await expect(text).toHaveValue(''); const afterRevocation = host.updates.length;
    release();
    await expect.poll(() => host!.updates.some(update => update.structuredContent.action === 'selection_clear')).toBe(true);
    expect(host.updates.slice(afterRevocation).every(update => update.structuredContent.selection === null)).toBe(true);
    expect(host.updates.some(update => update.structuredContent.selection?.text === 'ideia')).toBe(false);
    expect(host.messages).toHaveLength(0);
  } finally { release(); await host?.close(); await viewer.close(); arena.close(); }
});
