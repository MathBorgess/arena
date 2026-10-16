import { App } from '@modelcontextprotocol/ext-apps';
import { mountArena } from './app.js';

const app = new App({ name: 'Arena', version: '0.1.0' }, {});
let workspaceId;
let toolInput;
const viewer = mountArena({
  mode: 'embedded',
  async call(operation, input) {
    if (!app.getHostCapabilities()?.serverTools) throw new Error('O host não permite registrar a seleção do artefato.');
    const result = await app.callServerTool({ name: operation, arguments: { ...input, workspace_id: workspaceId } });
    if (result.isError) { const failure = result.structuredContent?.error; const error = new Error(failure?.message ?? 'Artefato indisponível.'); error.code = failure?.code; throw error; }
    if (result.structuredContent) return result.structuredContent;
    const text = result.content?.find(item => item.type === 'text'); if (!text) throw new Error('Texto do artefato indisponível.'); return JSON.parse(text.text);
  },
  async onContext(context) {
    if (!app.getHostCapabilities()?.updateModelContext?.text) return;
    await app.updateModelContext({ structuredContent: context, content: [{ type: 'text', text: `Seleção de referência da Arena: ${JSON.stringify(context)}. A seleção não solicita outra resposta nem concede aceite humano.` }] });
  }
});
app.ontoolinput = params => { toolInput = params.arguments; };
app.ontoolresult = async result => {
  if (result.isError) { viewer.clear(); viewer.announce(result.structuredContent?.error?.message ?? 'Artefato indisponível.'); return; }
  const context = result.structuredContent;
  if (context?.artifact) { workspaceId = context.workspace_id; try { await viewer.show(context, toolInput); } catch (error) { viewer.clear(); viewer.announce(error.message); } }
};
app.ontoolcancelled = () => { viewer.clear(); viewer.announce('A abertura do artefato foi cancelada.'); };
try { await app.connect(); } catch { viewer.clear(); viewer.announce('Este host não conectou o visualizador MCP Apps.'); }
