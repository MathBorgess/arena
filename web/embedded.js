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
    if (!app.getHostCapabilities()?.updateModelContext?.text) return 'Este host não oferece atualização de contexto; o agente pode reler os eventos pelo MCP.';
    try { await app.updateModelContext({ structuredContent: context, content: [{ type: 'text', text: `Arena: ${JSON.stringify(context)}. Contexto do artefato, sem aceite humano.` }] }); }
    catch { return 'O host recusou a atualização de contexto; o agente pode reler os eventos pelo MCP.'; }
  },
  async requestReview(context) {
    if (!app.getHostCapabilities()?.message?.text) return 'Pedido persistido. Este host não permite solicitar outra resposta; peça a revisão na conversa.';
    try { await app.sendMessage({ role: 'user', content: [{ type: 'text', text: `Revise o trecho registrado na Arena. Releia a revisão atual e os eventos antes de propor: ${JSON.stringify(context)}` }] }); }
    catch { return 'Pedido persistido. O host recusou a mensagem; peça a revisão na conversa.'; }
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
