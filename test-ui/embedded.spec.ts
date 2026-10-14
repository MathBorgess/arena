import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { Arena } from '../src/arena.js';
import { startHttpServer } from '../src/http.js';

async function referenceHost(page: any, url: string, context: any, arena: Arena, credentials: any) {
  const updates: any[] = []; const messages: any[] = []; const requests: string[] = [];
  await page.exposeFunction('fixtureCall', async (name: string, input: any) => {
    requests.push(name);
    expect(input.workspace_id).toBe(credentials.workspace_id);
    try { const result = arena.execute(name, credentials.agent, { ...input, workspace_id: credentials.workspace_id }); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; }
    catch (error: any) { return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { error: error.toJSON() } }; }
  });
  await page.exposeFunction('fixtureContext', (input: any) => { updates.push(input); return {}; });
  await page.exposeFunction('fixtureMessage', (input: any) => { messages.push(input); return {}; });
  const host = await build({ stdin: { contents: `import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const frame=document.querySelector('iframe');
const bridge=new AppBridge(null,{name:'Arena SDK reference host',version:'1.0.0'},{serverTools:{},updateModelContext:{text:{}},message:{text:{}}});
bridge.oncalltool=({name,arguments:input})=>window.fixtureCall(name,input);
bridge.onupdatemodelcontext=input=>window.fixtureContext(input);
bridge.onmessage=input=>window.fixtureMessage(input);
bridge.oninitialized=()=>bridge.sendToolResult(${JSON.stringify({ structuredContent: context, content: [{ type: 'text', text: 'Artefato fictício' }] })});
await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));
frame.srcdoc=${JSON.stringify(await readFile('dist/artifact-ui.html', 'utf8'))};`, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  await page.route(`${url}/fixture`, (route: any) => route.fulfill({ contentType: 'text/html', body: `<iframe title="Artefato Arena" style="width:100%;height:1100px;border:0"></iframe><script type="module">${host.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>` }));
  await page.goto(`${url}/fixture`);
  return { updates, messages, requests, frame: page.frameLocator('iframe') };
}

test('MCP Apps SDK host displays exact artifact and persists an edit as an agent proposal before updating model context', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const created = arena.execute('arena.create_exploration', credentials.agent, { workspace_id: credentials.workspace_id, title: 'Artefato embutido', objective: 'Revisar no harness', idempotency_key: 'create' });
  const context = arena.execute('arena.read_context', credentials.agent, { workspace_id: credentials.workspace_id, branch_id: created.branch_id });
  context.presentation = { ui_resource_uri: 'ui://arena/artifact/v1.html', ui_support: 'advertised', viewer_url: `http://127.0.0.1:8787/?branch_id=${created.branch_id}` };
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    let humanApiRequests = 0; page.on('request', request => { if (request.url().includes('/api/')) humanApiRequests++; });
    const host = await referenceHost(page, viewer.url, context, arena, credentials);
    await expect(host.frame.getByRole('heading', { name: 'Artefato embutido' })).toBeVisible();
    await host.frame.getByLabel('Texto do artefato').fill('Um texto proposto no artefato.');
    await host.frame.getByRole('button', { name: 'Propor edição' }).click();
    await expect(host.frame.getByText('Edição enviada como proposta pendente.')).toBeVisible();
    const after = arena.execute('arena.read_context', credentials.agent, { workspace_id: credentials.workspace_id, branch_id: created.branch_id });
    expect(after.revision.fields.text).toBe('');
    expect(after.proposals[0].changes.text).toBe('Um texto proposto no artefato.');
    expect(after.proposals[0].author).toEqual(credentials.agent);
    await expect.poll(() => host.updates.length).toBe(1);
    expect(host.updates[0].structuredContent.branch_id).toBe(created.branch_id);
    expect(host.messages).toHaveLength(0);
    expect(humanApiRequests).toBe(0);
    await expect(host.frame.getByRole('button', { name: 'Aceitar selecionadas' })).toHaveCount(0);
    await expect(host.frame.getByRole('button', { name: 'Abrir revisão humana' }).first()).toBeVisible();
  } finally { await viewer.close(); arena.close(); }
});

test('embedded passage actions preserve agent authorship and request another turn only on explicit review', async ({ page }) => {
  const arena = new Arena(':memory:');
  const credentials = arena.bootstrap({ workspace_name: 'Oficina fictícia', owner_name: 'Autora exemplo' });
  const scope = { workspace_id: credentials.workspace_id };
  const created = arena.execute('arena.create_exploration', credentials.agent, { ...scope, title: 'Um trecho embutido', objective: 'Registrar referência', idempotency_key: 'create' });
  arena.execute('human.edit_branch', credentials.owner, { ...scope, branch_id: created.branch_id, expected_revision: created.revision_id, changes: { text: 'Uma ideia abre uma conversa.' }, source_ids: [], reason: 'Texto fictício', idempotency_key: 'edit' });
  const context = arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id });
  const viewer = await startHttpServer({ arena, workspace_id: credentials.workspace_id, port: 0 });
  try {
    const host = await referenceHost(page, viewer.url, context, arena, credentials);
    const text = host.frame.getByLabel('Texto do artefato');
    await text.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(4, 9); node.dispatchEvent(new Event('select', { bubbles: true })); });
    expect(host.messages).toHaveLength(0); expect(host.updates).toHaveLength(0);
    await host.frame.getByLabel('Comentário sobre o trecho').fill('Rever a escolha da palavra.');
    await host.frame.getByRole('button', { name: 'Registrar comentário' }).click();
    await expect.poll(() => host.updates.length).toBe(1);
    expect(host.updates[0].structuredContent.author).toEqual(credentials.agent);
    expect(host.updates[0].structuredContent.ui_origin).toBe('unverified');
    expect(host.updates[0].structuredContent.selection).toEqual({ start: 4, end: 9, text: 'ideia' });
    expect(host.messages).toHaveLength(0);
    await host.frame.getByRole('button', { name: 'Revisar trecho' }).click();
    await expect.poll(() => host.messages.length).toBe(1);
    expect(host.messages[0].role).toBe('user');
    const events = arena.execute('arena.read_events', credentials.agent, { ...scope, branch_id: created.branch_id }).events;
    expect(events.find((event: any) => event.type === 'request_revision').author).toEqual(credentials.agent);
    expect(arena.execute('arena.read_context', credentials.agent, { ...scope, branch_id: created.branch_id }).revision.id).toBe(context.revision.id);
  } finally { await viewer.close(); arena.close(); }
});
