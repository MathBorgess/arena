import { App } from '@modelcontextprotocol/ext-apps';
import { mountArena } from './app.js';

const app = new App({ name: 'Arena', version: '0.1.0' }, {});
let presentation;
let workspaceId;
const viewer = mountArena({
  mode: 'embedded',
  async call(operation, input) {
    if (!app.getHostCapabilities()?.serverTools) throw new Error('O host não oferece ferramentas para o artefato. Use o visualizador local.');
    const result = await app.callServerTool({ name: operation, arguments: { ...input, workspace_id: workspaceId } });
    if (result.isError) throw new Error(result.structuredContent?.error?.message ?? 'O servidor recusou a operação.');
    if (result.structuredContent) return result.structuredContent;
    const text = result.content?.find(item => item.type === 'text');
    if (!text) throw new Error('Resposta de artefato indisponível.');
    return JSON.parse(text.text);
  },
  async onContext(context) {
    if (!app.getHostCapabilities()?.updateModelContext?.text) { viewer.announce('Ação persistida. O agente pode reler os eventos pelo MCP; este host não oferece atualização de contexto.'); return; }
    try { await app.updateModelContext({ structuredContent: context, content: [{ type: 'text', text: `Arena: ${JSON.stringify(context)}. Contexto do artefato, sem aceite humano.` }] }); }
    catch { viewer.announce('Ação persistida; o host recusou a atualização de contexto. O agente pode reler os eventos pelo MCP.', true); }
  },
  async openHuman() {
    const url = presentation?.viewer_url;
    if (!url) return viewer.announce('Visualizador humano local indisponível neste servidor. Inicie Arena na mesma máquina do navegador.');
    viewer.announce(`Revisão humana: ${url}`);
    if (app.getHostCapabilities()?.openLinks) {
      try { await app.openLink({ url }); } catch { viewer.announce(`Abra a revisão humana local: ${url}`); }
    }
  }
});
app.ontoolresult = async result => {
  if (result.isError) { viewer.announce(result.structuredContent?.error?.message ?? 'Não foi possível abrir o artefato.', true); return; }
  const context = result.structuredContent;
  if (context?.revision && context?.branch) { presentation = context.presentation; workspaceId = context.workspace_id; await viewer.show(context); }
};
app.ontoolcancelled = () => viewer.announce('A abertura do artefato foi cancelada.');
try {
  await app.connect();
  viewer.announce('Conectado ao host. Aguardando o artefato; as decisões humanas usam a revisão local.');
} catch { viewer.announce('Este host não conectou a interface MCP Apps. Use os resultados estruturados e o visualizador local.', true); }
