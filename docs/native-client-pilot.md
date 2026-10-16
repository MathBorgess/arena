# Piloto nos clientes nativos

Estado inicial: **não executado nos clientes reais**. O piloto exige os clientes autenticados do proprietário. A implementação não iniciou modelos, alterou configurações pessoais ou consumiu assinatura/API. Qualidade editorial é julgada por humanos, separadamente dos testes técnicos.

## Evidência técnica e de cliente real

| Evidência | O que permite afirmar | O que permanece pendente |
| --- | --- | --- |
| Build, tipos e domínio com SQLite/dados fictícios | Os cenários cobertos respeitam contratos, revisões e permissões no commit testado. | Qualidade editorial; conta; versão real do host. |
| Cliente MCP SDK em memória, stdio ou HTTP | Descoberta, schemas e operações no protocolo testado. | Participação nativa de Codex/ChatGPT. |
| CLI em subprocesso com credenciais fictícias locais | Canal humano separado, CAS, retry, recuperação e recusa de credencial agente. | Instrução humana real na conversa e shell disponível naquela superfície. |
| Playwright no viewer local/host de referência | Texto, seleção nativa e persistência nos cenários cobertos. | Renderização MCP Apps no cliente real e julgamento humano. |
| Documentação de instalação/configuração | Pacote preparado conforme fontes consultadas. | Plugin realmente instalado e autorizado no cliente. |
| Atestado do proprietário com IDs/instantes reais | A etapa identificada foi observada naquele cliente. | Etapas posteriores e disponibilidade permanente. |
| Importação JSON/CSV fictícia | Formato e cobertura da rota de arquivo testada. | Export real completo; conexão API social. |

Registre apenas evidência executada: commit, versões dos clientes, IDs, instante e falhas. Nunca guarde tokens ou logs integrais privados. Separe `configurado`, `autenticado`, `leitura verificada`, `operação testada` e `renderização observada`. Sessões persistidas com metadados de cliente são `declared`; não comprovam provedor real. `human.record_verification`, quando registrado separadamente pelo proprietário, é atestado explícito da etapa observada; o canal editorial `call` não o fabrica.

## Roteiro manual Codex → ChatGPT

Antes do merge, use a branch `codex/implement-arena-v1`, pois `main` contém somente bootstrap. Consulte [a configuração dos clientes](mcp-clients.md) e [a política de dados](data-policy.md). O viewer deve conter apenas o texto atual e seleção pelo cursor; setup de autenticação é permitido, fluxo editorial não acontece por botões.

1. Escolha uma marca fictícia ou pequena amostra real autorizada. Defina objetivo, direitos, escopo e cobertura parcial das fontes. Separe textos próprios de referências/re-shares. Inicialize serviço/base privada na máquina escolhida.
2. Provisione identidades Arena separadas para Codex e ChatGPT, ambas agente, e instale/configure os clientes por ação do proprietário. Guarde credenciais fora do Git. Não suponha que a máquina remota de desenvolvimento compartilha localhost, paths ou credenciais com os clientes.
3. No Codex real, confirme a conexão Arena em `/mcp` e selecione a skill em `/skills` → Arena, ou use `$arena iniciar <objetivo>`. Confira descoberta e leitura via MCP. Peça `voz` e aprove uma versão concreta pela conversa com shell local autorizado. Anote `profile_revision_id`; iniciar pode deixar tema/texto em aberto.
4. Peça uma proposta A, veja o texto atual no viewer e instrua `aceitar <proposta>, versão <N>` na conversa. O CLI lê a credencial humana de forma privada e usa proposta/versão/head exatos. Confira proposta, decisão e nova revisão; o MCP não aceita automaticamente. Se a superfície não tiver o canal humano independente, pare essa etapa com a proposta pendente.
5. Peça `ramificar variando <dimensão>` a partir da revisão aceita A, mantendo voz e uma dimensão travada. Anote origem, ramificação B, revisão e travas. Use `comparar A com B` na conversa; avalie clareza, público, voz e sustentação factual. Previsão de engajamento permanece hipótese.
6. Selecione um trecho do texto de B pelo cursor. Confira o evento com offsets UTF16, revisão-base e proposta/versão exibidas. Selecionar não envia mensagem nem inicia agente. Envie `$arena revisar o trecho selecionado para…` e confira proposta pendente contextualizada; uma seleção vazia deve limpar o trecho anterior. Crítica/pedido não altera o estado aceito.
7. Peça `exportar contexto da revisão <ID>`, guarde o pacote no destino escolhido e anote checksum/lacunas. Encerre a conversa Codex. No ChatGPT real, confirme conexão na superfície correspondente e invoque `@Arena`/seletor quando disponível. Leia o mesmo contexto externo e permissões atuais antes de propor; não transfira o chat inteiro. Confira histórico, decisões, voz e travas.
8. Observe a renderização embutida se o host suportar MCP Apps; caso contrário use o fallback local e registre renderização não observada. Faça seleção e envie a revisão na conversa. Registre autoria ChatGPT agente e proposta pendente. ChatGPT somente MCP não aceita sem outro canal humano independente; ChatGPT Work com shell local autorizado pode usar o mesmo CLI privado. Não trate a identidade do widget como humana.
9. Instrua aceitar/rejeitar uma versão concreta na conversa pelo canal humano disponível. Para aceite parcial de texto, apresente primeiro proposta derivada do trecho; para dimensões use seleção explícita. Em conflito, compare/reapresente antes de nova decisão; preserve a alternativa. Corrigir um post não aprova voz nova nem migra ramificações antigas.
10. Mude uma entrada e confirme invalidação dos artefatos dependentes. Revise ou autorize reutilização concreta na conversa. Exporte o texto aceito revisado e o contexto, reabra numa sessão nova e confira os mesmos IDs, fontes, lacunas e permissões atuais. Registre “exportado”, sem publicação/agendamento.
11. Se necessário, revogue uma fonte fictícia e confira bloqueio de leitura/conteúdo derivado. Execute remoção só conforme política e instrução explícita. Preencha etapas observadas/falhas; só marque a passagem real como concluída quando ambos os clientes executaram operações e o humano confirmou preservação do contexto. Falta de um cliente/canal humano deixa o resultado parcial ou não verificado.

## Registro mínimo

```text
Commit: <hash>
Workspace/exploração: <IDs>
Marca/amostra/cobertura/direitos: <declarados pelo proprietário>
Voz fixada: <profile_revision_id>
A / B e origem: <branch_ids e revision_ids>
Codex: <versão; superfície; etapas; instante; proposal_id>
ChatGPT: <versão; superfície; etapas; instante; proposal_id>
Viewer: <local/embutido; renderização observada; evento de seleção>
Canal humano: <shell local independente / indisponível>
Decisão: <decision_id; proposta/versão apresentada; novo head>
Exportação: <revision_id; checksum; lacunas>
Resultado técnico: <comandos e cenários realmente executados>
Resultado real: <não executado / parcial / concluído / falhou>
Julgamento editorial humano: <critérios e conclusão>
Limitações/próxima ação: <concretas; sem credenciais>
```
