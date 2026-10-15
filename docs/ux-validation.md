# Validação de UX — piloto humano no Codex

Data local: 2026-10-14, America/Recife. **Em andamento; sem aprovação humana registrada.**

> **Direção atual após feedback humano:** bloco editável, DNA da produção e contexto incremental ([ADR 0004](adr/0004-editable-notepad.md)). O percurso somente leitura abaixo é evidência histórica do head do PR #7, não validação humana da nova interface. Testes automatizados da interface editável já passaram; o proprietário ainda precisa usá-la.

## Ambiente e revisão efetivos

- PR de implementação: [#7](https://github.com/MathBorgess/arena/pull/7), aberto, não draft, `CLEAN`, head `8584cfdfd6ba6c244f28ff809facbc1aeb9a0702`, base `main`. Estado conferido antes da preparação e novamente depois dos testes.
- Clone independente `arena-ux-pilot`, branch `codex/arena-native-ux-validation`, criado diretamente do head acima. Nenhuma alteração do checkout do vault foi tocada. Nenhuma mudança de implementação nesta etapa.
- macOS arm64, Node `24.16.0`, Codex CLI `0.162.1`, aplicativo desktop bundle `com.openai.codex`, versão `26.1007.30912`.
- Harness com execução local no Mac do proprietário. Servidor HTTP/SQLite e navegador Codex In-app Browser também nesse Mac. A página de login foi efetivamente renderizada em `http://127.0.0.1:8787`; não foi inferida alcançabilidade apenas a partir do endereço localhost.
- Base privada isolada: `~/.local/share/arena-ux-pilot-2026-10-14`, fora do Git. Nenhum token foi lido pelo modelo, impresso ou incluído em argumentos editoriais.
- Conexão nativa `mcp_servers.arena`, stdio, executável `/opt/homebrew/bin/node`, argumentos `<clone>/dist/cli.js mcp`. Ambiente: `ARENA_DATA_DIR=<base privada>`, `ARENA_AGENT_TOKEN_FILE=<base privada>/agents/codex.token`, `ARENA_VIEWER_URL=http://127.0.0.1:8787`.
- Credencial de agente nomeada `codex`, separada da credencial humana. `init` e `agent` leram/escreveram segredos somente dentro do processo CLI. O canal `call` humano ainda não executou decisão editorial.
- Skill do próprio checkout carregada e vinculada exclusivamente em `~/.agents/skills/arena`. Invocação documentada e suportada pelo Codex: `$arena <pedido>`; linguagem natural também pode selecionar a skill implicitamente. Nenhum slash command Arena foi inventado. Sugestão nativa/autocomplete ainda não observada pelo humano.
- A configuração anterior foi preservada em snapshot privado. `codex mcp add` omitiu o campo preexistente `mcp_servers.node_repl.args`; ele foi restaurado imediatamente. Comparação TOML confirmou igualdade semântica de toda a configuração anterior, retirando apenas a nova entrada Arena. Não há credenciais no registro.

## Uso nativo observado pelo agente

As ferramentas Arena apareceram dinamicamente nesta sessão real. Foram chamadas diretamente pelo harness, sem cliente SDK intermediário:

1. `arena.list_work`: workspace novo, sem explorações, revisão de membros 2.
2. `arena.list_profiles`: nenhum perfil; não foi inventada aprovação de voz.
3. `arena.create_exploration`: exploração vazia de laboratório fictício; sem texto nem decisão.
4. `arena.read_context`: leitura do objetivo e head persistidos.
5. `arena.open_artifact`: retorno do artefato vazio e URL local seguindo proposta atual.

Referências de auditoria, sob responsabilidade do agente:

- Workspace: `7111561f-5816-419c-b4d1-74df9e1f03a1`.
- Exploração: `ddae8cc8-64d4-4364-95c9-71a78dbdf2ae`.
- Ramificação: `ff331bfc-d79f-4e30-a89f-f816298b5c5b`.
- Head inicial: `18c10aae-a756-4521-ada8-9b61ef418e0e`.
- Evento inicial: `488b1863-aac3-4b7b-afbc-8bddf7703c6e`, `2026-10-15T00:25:34.989Z` (21:25:34 em Recife, 14/10).
- URL local: `http://127.0.0.1:8787/?branch_id=ff331bfc-d79f-4e30-a89f-f816298b5c5b`.

O host anunciou suporte MCP Apps, mas nenhuma aba de app embutido apareceu na inspeção. Isso não comprova renderização embutida nem sua ausência em formato inline. O percurso escolhido é MCP nativo + viewer HTTP local, cuja tela de autenticação foi observada. Login humano e leitura da proposta permanecem pendentes.

## Personalidade e autoria

O autor pediu carregar a personalidade do vault e a autoria We MathAI. A direção foi conferida nas notas vigentes do próprio autor: ironia e provocação ligadas à vida real, clareza para iniciantes, diferença entre fatos e encenação, sem resultados inventados. Post Voice foi carregada para os futuros textos fictícios. O laboratório não importa textos reais, fontes privadas ou contas sociais. A direção é contexto editorial autorizado; não equivale a aprovar um novo perfil persistente ou qualquer proposta.

Objetivo fictício proposto para a primeira tarefa: explorar uma cena em que a IA economiza tempo numa tarefa cotidiana e outra tarefa ocupa a folga. A exploração aguarda o pedido humano para produzir o primeiro texto.

## Tarefas humanas e feedback real

O proprietário realizou a primeira tarefa: pediu o primeiro texto em linguagem natural, escolhendo uma pauta própria. Ainda não há avaliação de legibilidade, esforço, clareza ou conforto atribuível ao humano. O pedido de texto não é aceite editorial.

| Etapa | Evidência humana | Estado |
| --- | --- | --- |
| Pedir primeiro texto em linguagem natural | Pedido real recebido; proposta registrada pelo MCP nativo | Realizada; feedback de facilidade ainda pendente |
| Localizar e ler proposta | Painel MCP Apps real aberto; passagem selecionada e comentada pelo autor | Parcial: uso observado, facilidade de leitura ainda sem feedback |
| Selecionar, mudar foco e pedir revisão | Seleção persistida e recebida neste chat; pedido real; nova proposta no painel | Percurso até revisão observado; decisão pendente |
| Trocar passagem e limpar seleção | Segunda passagem selecionada e revisada; limpeza intermediária persistida | Parcial: falta turno de revisão com seleção vazia |
| Feedback ambíguo, rejeição e aceite explícitos | Nenhuma decisão humana executada | Não verificada |
| Retomar em outra conversa sem histórico inteiro | Não iniciado | Não verificada |
| Feedback sobre dúvida e esforço | Autor corrigiu a direção editorial; esforço de interação ainda não perguntado | Parcial: editorial registrado, UX ainda não verificada |

A cadeia **seleção → persistência → contexto → revisão** já foi observada com o autor no painel nativo do Codex. A etapa de decisão e o feedback sobre conforto continuam pendentes. Eventos de testes não estão na base privada deste piloto.

## Verificações técnicas executadas

- `npm ci`: 107 pacotes instalados; auditoria reportou zero vulnerabilidades.
- `npm run build`: passou; recurso MCP Apps autocontido compilado.
- `npm run check`: passou.
- `npm test`: **42/42 passaram**. Incluem fronteiras públicas de domínio/MCP, credenciais humanas independentes, feedback separado de aceite, concorrência, proposta exata e fontes revogadas.
- Primeira execução de `npm run test:ui`: **8 falhas de preparação**, antes de executar os cenários, por falta do Chromium headless Playwright `1248` no Mac. Não foram classificadas como falhas funcionais.
- Correção de ambiente: `npx playwright install chromium` instalou Chromium/FFmpeg/headless shell compatíveis.
- Segunda execução de `npm run test:ui`: **8/8 passaram**, 21,5 s.
- Casos do viewer: texto somente leitura, seleção e limpeza; nova proposta preserva seleção quando o texto não muda e limpa ao mudar; revisão histórica restrita é removida; refresh atrasado não substitui artefato novo; conflito limpa seleção e permite selecionar de novo após refresh.
- Casos embutidos: ponte SDK recebe contexto sem mensagem/turno; revogação limpa texto e seleção; leitura de evento atrasada depois da revogação não restaura trecho restrito. São fixtures de host de referência, não renderização nativa observada.
- As suítes verificam ausência de aceite por seleção e rejeição de escrita com credencial de agente. Isso não substitui a tarefa humana de dizer “gostei”, rejeitar e aceitar na conversa.

## Problemas, limites e próximo passo

- Login local exige uma credencial humana privada: tela confirmada, esforço humano ainda desconhecido. O modelo não lerá, copiará ou solicitará seu conteúdo. Quando necessário, o proprietário pode consultar o arquivo local e preencher o formulário diretamente; nenhum segredo deve ser enviado ao chat.
- O carregador instalado de Impeccable não oferece o subcomando `context` descrito na skill. Não há `PRODUCT.md`/`DESIGN.md` neste checkout; o contrato e ADR 0003 guiam a avaliação. Nenhuma alteração visual foi feita como consequência dessa limitação.
- A instalação MCP tornou as ferramentas disponíveis nesta sessão; não é necessário abrir outra conversa para começar.
- Próxima tarefa humana: autenticar o visualizador local e confirmar que o texto aparece. A credencial é manipulada somente pelo proprietário no Terminal/formulário, fora do chat. Leitura, seleção e decisão serão conduzidas uma por vez nos turnos seguintes.
- Na preparação, o registro ficou local enquanto o percurso humano começava. Ao fechar a rodada técnica, foi commitado e incluído no PR draft #9, conforme atualização ao fim desta seção. Nenhum merge, deploy, publicação social ou conexão a dados reais.

### Instrução curta de retomada preparada (ainda não testada)

> Use a skill Arena do checkout `arena-ux-pilot`. Retome “Piloto fictício — a tarefa que sobrou” pelo MCP Arena: leia o head, a proposta atual e os eventos recentes; não transporte o histórico do chat nem use seleção antiga sem validar a versão. Continue a validação em `docs/ux-validation.md`, uma tarefa humana por vez. Não aceite nada sem instrução explícita sobre a proposta apresentada. O canal CLI humano e a base privada já estão configurados nesse Mac.

Essa instrução é preparação, não evidência de recuperação em outra conversa.

## Seleção e revisão nativas observadas

Depois da orientação de login do fallback, o autor abriu o **painel MCP Apps real da Arena no Codex** e selecionou uma passagem. Não há evidência de login humano no viewer HTTP: essa etapa não deve ser presumida nem exigida agora que o percurso embutido está funcionando. A instrução anterior de login era necessária apenas para o fallback e introduziu uma etapa dispensável para esta superfície; o esforço percebido ainda precisa ser perguntado ao autor.

- A aba MCP Apps `Arena MCP Arena open artifact` foi localizada pela ferramenta de navegador do Codex e inspecionada. Mostrava apenas o textbox “Texto da proposta”, `readOnly: true`.
- O modelo recebeu uma atualização de contexto nativa do app, sem pedido de resposta nem aceite, com o evento `6978538b-d5a1-415a-b4e4-14d18ac0ca5f`. Esse recebimento é observado; não é apenas fixture SDK ou metadado declarado de sessão.
- Seleção: `E você aqui, negociando com um parágrafo que parece embalagem de shampoo.`; offsets UTF16 `[311,384)`, proposta `455e9961-bc65-43bc-8b89-a9c64f334f22`, versão 1, base `18c10aae-a756-4521-ada8-9b61ef418e0e`.
- O autor voltou ao chat e instruiu: “Gosto de um estilo mais bruto e irônico, impactar o usuário e ter uma sensação de provocação, como se precisasse ter alguma atitude. Ele não negocia, ele briga com o agente, bate cabeça.” Esse é feedback editorial real e pedido de revisão; não é aceite.
- Após a mensagem, inspeção somente leitura do DOM ainda retornou exatamente `selectionStart: 311`, `selectionEnd: 384`, a mesma passagem e `scrollTop: 0`. Assim, a seleção foi preservada na volta ao chat. O método de seleção (mouse ou teclado) não foi observado.
- `arena.read_context` e `arena.read_events` nativos confirmaram o evento persistido, a versão pendente e o head antes da escrita. O agente conferiu os offsets contra o texto exato. A autoria do evento embutido é `agent`, `ui_origin: unverified`; isso não é identidade humana autenticada nem autoridade para aceitar.
- Feedback registrado em `21bf5159-883f-4cb4-b3c7-db657c505676`. Nova proposta `c73b52e0-b0be-4ba3-9fab-f97f54e59d4f`, versão 1, **pending**; substitui somente a passagem selecionada. A proposta anterior foi preservada.
- Passagem proposta: `E você aqui, brigando com o agente: “Tá uma merda. Faz de novo.” Bate cabeça, xinga o robô e espera que ele adivinhe o que você ainda nem decidiu.`
- O painel MCP Apps atualizou automaticamente para o novo texto. Inspeção depois da escrita confirmou `readOnly: true`, seleção vazia `[0,0)` e `scrollTop: 0`. Isso verifica posição no topo; preservação de leitura após rolagem continua não verificada.
- Nenhum comando humano de aceite ou rejeição foi executado. Nenhum perfil de voz foi criado ou aprovado com base nessa crítica.
- Não houve alteração de implementação; as suítes não foram repetidas por esta mudança editorial.

Próxima tarefa: selecionar outra passagem no painel atual e pedir uma mudança no chat. Depois, testar seleção vazia separadamente; não reutilizar silenciosamente o trecho anterior.

## Troca de passagem e segunda revisão real

- O autor selecionou outra passagem: `Fora dela podem estar referências, tentativas anteriores e alguém que já decidiu o que quer dizer, pra quem e o que seria um resultado bom.`
- Evento nativo `6ea87306-9fa6-47e9-b05e-4bc4ab784256`, offsets UTF16 `[494,633)`, proposta `c73b52e0-b0be-4ba3-9fab-f97f54e59d4f`, versão 1, head inicial intacto. A atualização MCP Apps chegou ao contexto desta conversa; `arena.read_events` confirmou sua persistência.
- Entre as duas passagens, os eventos mostram seleção de `robô` (`55d3257e-6cf7-48bb-b946-d76d75e5415f`) e depois `selection_clear` (`12f5194a-3c3b-42a3-9140-0b138edde545`). Não houve mensagem humana nesse intervalo; isso prova a persistência da limpeza, mas não o comportamento do agente num turno sem trecho definido.
- Pedido real: “Nessa região, quero coisas mais práticas, o que já se entende como o cotidiano de produção criativa, sem AI, e mostrar que o conhecimento vem antes de qualquer prompt, vem do know-how”. É direção editorial explícita, sem aceite.
- Depois da volta ao chat, inspeção somente leitura do DOM ainda confirmou a segunda seleção exata `[494,633)`, `readOnly: true`, `scrollTop: 0`. O agente usou a passagem atual, sem reutilizar o trecho sobre “negociar”.
- Feedback persistido: `ad32c03e-504b-4b20-af0c-8c1935d94b67`.
- Nova proposta: `e6246286-b252-4dcb-91b6-2b3760951ca3`, versão 1, **pending**; sessão `fc3e41a5-d50f-4f7d-a5af-a60f9fb88e76`. Substitui apenas a segunda passagem, conservando a mudança anterior e o restante do texto.
- Trecho novo: `Fora dela tem o trabalho de sempre: o fotógrafo escolhe onde a luz bate, o editor corta a cena que mata o ritmo, quem escreve arranca a frase bonita que não diz nada. Esse know-how vem antes do prompt. Você copia o pedido. O repertório continua sendo de quem trabalhou pra construir.`
- O painel nativo atualizou automaticamente; DOM confirmou texto novo, seleção vazia `[0,0)`, somente leitura e posição no topo preservada. Nenhuma decisão foi executada.

Próxima tarefa humana: selecionar uma passagem, desfazer a seleção com clique sem arrastar e pedir no chat “revise o trecho selecionado”. O agente deverá reconhecer a falta de trecho atual, sem alterar proposta nem resgatar silenciosamente uma seleção anterior. Essa tarefa ainda não foi executada.

## Reescrita integral por direção do autor

O autor continuou o trabalho editorial em vez de enviar o pedido de revisão com seleção vazia. Pediu modificar o texto inteiro, preservar os três parágrafos iniciais até “Ganha um emoji.” e transformar o post em relato de seu experimento: “uma Arena, uma briga com AI”, sobre experimentação criativa e brincar com agentes.

- Eventos mostram seleção parcial `6133567b-8161-4f96-a15a-590eab8a5f03`, limpeza `2b188e96-a6ad-4783-a0d6-a5fd7b215471` e seleção integral `202f3f7f-6ee3-476c-a35e-e9a4dd185887` da proposta `e6246286-b252-4dcb-91b6-2b3760951ca3`, versão 1, offsets `[0,917)`, antes desse pedido.
- O agente releu contexto e eventos e verificou a seleção integral contra a proposta correta. A instrução de alterar o texto inteiro é explícita e suficiente para propor a reescrita, sem confirmação genérica ou dependência de um trecho menor.
- Feedback persistido `6a3f3146-dd27-4425-a3fd-3438f68d5dff`; nova proposta `c35c6f70-2bd2-470b-b07a-206c3e59578c`, versão 1, **pending**, sessão `fbf7512b-bb71-4688-a118-82cd84195c37`.
- Os três parágrafos solicitados foram preservados literalmente. O restante descreve as mudanças desta conversa e convida a experimentar a interação. Nenhuma publicação foi executada.
- A inspeção do painel MCP Apps confirmou a atualização automática para a reescrita integral. Propostas anteriores permanecem preservadas; nenhuma decisão humana foi executada.
- A limpeza de seleção está novamente documentada como evento, mas **o cenário de mensagem pedindo revisão sem seleção continua não verificado**: a seleção atual era integral, e o pedido era global. Não contar a reescrita como sucesso nesse teste.

Próximo passo do facilitador: colher feedback breve sobre dúvidas ou esforço na seleção e nas solicitações antes de conduzir os testes restantes de decisão e retomada. O autor ainda não avaliou a facilidade de uso.

## Feedback humano de UX e mudança de direção

Ao ser perguntado sobre dúvida ou esforço, o proprietário pediu:

> a arena deve parecer mais um bloco de notas, eu devo conseguir escrever por cima, e as modificações que fiz manualmente devem ser contexto também.

> as interações do agente com a arena devem ser mais rápidas, com menos etapas de get context e read. Precisa-se fazer carregamento prévio do contexto, e apenas um append das mudanças do último artefato.

Também pediu comandos com prefixo `arena:...`, `arena:contexto` para inspecionar o entendimento/nuance, `arena:dna` para expor e editar bases da escrita e testar variações, apenas o bloco para copiar o texto, e aceite por “aprovado” na conversa. Feedback persistido pelo MCP nativo em `856adff5-55c6-4df9-bd4b-9ed50d3aa4d9`.

Esse relato é evidência humana de que **o percurso anterior ainda não estava confortável nem completo** para a experiência desejada. Não há nota numérica de conforto nem aprovação inventada. O proprietário alterou a exigência original de somente leitura; a direção atual está no ADR 0004 e no contrato do repositório. A frase sobre “aprovado” define o fluxo do produto; não aprova a proposta editorial atual.

### Implementação resultante

- Bloco atual editável, seleção e cópia nativas. Input salva um patch pendente após 250 ms ou saída de foco. O evento persistido chega ao contexto do agente sem mensagem nem início de turno.
- Head e artefato/versão exatos protegem concorrência. Resposta atrasada e refresh não sobrescrevem digitação não salva. Em conflito, o texto local fica visível para recuperação; não há retry com base trocada silenciosamente.
- `arena.sync_context` entrega preload uma vez e deltas depois: diferença UTF16 do texto/DNA, chaves de contexto alteradas e metadados dos eventos novos. Escritas devolvem o envelope `sync` e o checkpoint já avançado, evitando reaplicar o próprio patch.
- Seleção retorna seu evento confirmado na própria gravação; foi eliminada a leitura adicional de páginas de eventos pelo widget. Teste público confirma uma chamada de gravação e zero chamadas `read_events` para a seleção.
- `arena:dna` expõe a base editável desta produção no mesmo bloco. Direções confirmadas e hipóteses ficam identificadas; não há promoção implícita a perfil global aprovado. Variações podem levar rascunho e DNA sem aceitar texto nem modificar a origem. DNA integra o pacote de retomada.
- A skill reconhece comandos literais `arena:...` na conversa. Não há alegação de novos slash commands ou de autocomplete instalado pelo harness. Invocação explícita verificada/documentada da skill Codex continua `$arena arena:dna`.
- “Aprovado” com alvo apresentado claro aciona o canal humano CLI independente. A credencial continua fora do modelo. Feedback e edição não aceitam nada.
- Título de produto “Arena · artefato” removido e recurso solicita ausência de borda. Não se abre fallback adicional quando o bloco nativo funciona. A aba/moldura de expansão do Codex pertence ao host e **não foi removida pelo produto**.

### Correções descobertas durante os testes

- Patches de fontes revogadas inicialmente podiam reaparecer nos eventos/retries: a sanitização passou a cobrir o corpo do patch e a proveniência do resultado.
- DNA inicialmente não herdava a proveniência do rascunho de referência: a propagação foi corrigida e a revogação agora limpa texto, DNA, seleção e replays.
- O fallback após aceitar a versão mais recente podia ressuscitar uma proposta antiga ainda pendente: a escolha automática agora considera apenas propostas contra o head atual; alternativas antigas continuam preservadas para acesso explícito.
- Um checkpoint anterior à própria gravação poderia reapresentar o mesmo delta: a gravação agora devolve `sync` com checkpoint avançado. O teste de leitura seguinte exige delta vazio.
- O atalho `ControlOrMeta+Home` não posicionou o caret como suposto neste Chromium/macOS de teste. O caso de seleção por teclado passou com movimento de seta e Shift+seta. Isso é evidência automatizada, não observação de teclado humano.

### Verificação da nova revisão

Antes da revisão final, `npm run check`, `npm run build`, **48 testes Node** e **11 testes Playwright** passaram. Os cenários novos cobrem digitação/salvamento, digitação durante resposta atrasada, conflito com alternativa remota, edição do DNA, seleção por teclado, delta sem duplicação, ramificação e revogação. Não houve troca de dependências. A revisão posterior encontrou os problemas adicionais descritos abaixo; os resultados dessa rodada não são aprovação da revisão corrigida.

Esses resultados são testes públicos com dados fictícios, SQLite e/ou host SDK de referência. Não significam que o proprietário já digitou no bloco novo. O registro anterior de seleção → contexto → revisão é nativo real; o de edição manual → contexto ainda precisa de ação humana nesta revisão. Rejeição, aceite e retomada em outra conversa permanecem não verificados com o proprietário.

### Ativação e limites atuais

A base privada e todas as propostas foram preservadas. Leituras nativas confirmaram que o processo MCP ativo ainda executava a versão anterior (sem DNA). A configuração foi alterada exclusivamente na entrada Arena para solicitar recarga da nova compilação. Remover/adicionar a mesma conexão pela CLI também não trocou o processo já ligado a esta sessão. Comparação TOML confirmou configuração semanticamente idêntica, inclusive demais servidores e caminhos de credenciais. Nenhum segredo foi acessado pelo modelo. O servidor HTTP foi reiniciado no mesmo endereço com a nova compilação; isso não prova reconexão MCP nativa.

A tentativa de acessar a interface nativa do próprio Codex para reconectar foi recusada pela política da ferramenta de computador. Essa via não foi contornada. O fallback executável é reconectar somente Arena por configuração suportada ou na interface pelo proprietário; a disponibilidade final será registrada após verificação.

Próxima tarefa humana, quando o bloco novo estiver efetivamente ativo: modificar uma frase diretamente nele e voltar ao chat com `arena:contexto`, para verificar o que persistiu e qual nuance foi capturada. A implementação não está aprovada por antecipação.

### Revisão de Standards e Spec

Uma rodada de revisão separada foi executada contra `8584cfdfd6ba6c244f28ff809facbc1aeb9a0702...f6386d3`, seguindo a skill Code Review. Não é avaliação humana de UX.

**Standards:** um problema de contrato e uma preocupação de implementação. Patches apagavam as dependências editoriais do texto; passaram a preservar as dependências da proposta/artefato de origem, incluindo ramificações. Polls sem mudança gravavam snapshots integrais indefinidamente; agora reutilizam o cursor e o serviço retém até 64 checkpoints por ator/ramificação. Um checkpoint reciclado provoca preload saneado, sem perder o trabalho.

**Spec:** dois problemas concretos. Selecionar durante autosave perdia o contexto; o término do save agora captura a seleção que ainda está visível, contra a nova proposta persistida. Em conflito, o rascunho existia apenas no textarea; ele agora pode chegar ao contexto como `persisted: false`, distinto da alternativa remota. A fonte da base local é revalidada pelo servidor antes de autorizar esse compartilhamento; fonte revogada não concede esse caminho.

Os quatro achados foram reproduzidos e corrigidos com testes nas fronteiras públicas. A classificação “corrigido” indica evidência técnica, não aprovação editorial do autor.

Após as correções: **50/50 testes Node e 13/13 testes Playwright passaram**, com check/build e `git diff --check` sem falhas. A seleção durante save e a recuperação do rascunho local conflitante têm casos específicos de regressão. O DNA inicial identifica a intenção original como histórica; a skill deve consolidar sua primeira versão pelas instruções mais recentes, distinguindo confirmação e inferência.

Revisão de código corrigida: `826f102fe364668eb3845ade285149e81ea4400b`, sobre `f6386d3`. O registro documental é commit separado para que esse hash identifique o código verificado. O servidor HTTP foi reiniciado nessa compilação; a inspeção final do In-app Browser mostrou zero abas HTTP adicionais. O marcador temporário de recarga foi removido; toda configuração fora da entrada Arena continua semanticamente igual ao snapshot original.

### Medida limitada de payload

Uma fixture sintética de domínio público, em SQLite de memória, usou texto fictício de 27.900 unidades UTF16 e a substituição `ideia` → `briga`. A soma JSON de `read_context` e `read_events` foi **62.909 bytes**; o envelope incremental da escrita, **1.533 bytes** (**97,6% menor**). É medida de payload desse caso, sem alegação de latência nativa ou conforto humano. O texto longo sintético não foi colocado na base do piloto.

### Menor passo de ativação/retomada

A configuração está pronta para uma nova conversa local, que carrega os schemas e o processo stdio recompilado. A sessão atual não expôs `arena.sync_context`/`arena.patch_artifact` mesmo após recadastro exclusivo de Arena. Não encerrar ou reiniciar o aplicativo inteiro por conta própria.

Instrução curta preparada para o proprietário enviar numa **nova conversa local**:

> arena:contexto — retome “Piloto fictício — a tarefa que sobrou”. O checkout é `arena-ux-pilot`; leia `docs/ux-validation.md`, sincronize a Arena e abra somente o bloco editável atual. Mostre brevemente o contexto e as nuances capturadas e espere eu editar uma frase. Não aceite nem publique nada.

Esse passo também pode produzir evidência real de retomada sem transportar o histórico completo. Ainda não foi realizado pelo proprietário. O título histórico da exploração não substitui a pauta editorial atual, que é o post sobre experimentar a própria Arena.

Entrega para revisão: [PR draft #9](https://github.com/MathBorgess/arena/pull/9), empilhado sobre a branch do PR #7, com código e este registro. Checkout limpo e branch publicada em `codex/arena-native-ux-validation`; nenhuma alteração foi enviada à branch de implementação original. O piloto humano continua pendente nas etapas indicadas.

## Primeiro pedido humano e proposta pendente

Pedido real, recebido nesta conversa:

> Escreva um texto curto da We MathAI sobre alguém que não sabe o que pedir para a AI, não sabe como informar o que quer, como quer, e gera um texto totalmente AI Slop, e fica confuso como pessoas fazem coisas incríveis "one shot"

O autor escolheu outra pauta em relação à sugestão inicial do facilitador. Esse pedido governa a proposta atual; o objetivo inicial permanece como histórico da preparação. Não foi criado outro projeto nem descartado trabalho anterior.

- Antes de escrever, o agente releu `arena.read_context` e `arena.read_events` nativos: head inicial intacto, sem seleção, fontes ou decisões.
- `arena.submit_proposal` nativo registrou a proposta `455e9961-bc65-43bc-8b89-a9c64f334f22`, versão 1, **pending**, apenas dimensão `text`. Base/head: `18c10aae-a756-4521-ada8-9b61ef418e0e`.
- Sessão de autoria persistida: `c9a3fb5c-7944-4e7d-bbbc-9a4e4bf8338a`. Os metadados de cliente são declaração; as chamadas de ferramenta nesta conversa são a evidência de execução nativa.
- O texto usa uma cena ilustrativa e apresenta a preparação invisível dos exemplos one shot como possibilidade, sem fabricar bastidores observados.
- `arena.open_artifact` foi relido depois da escrita para confirmar a proposta exibível e a ausência de decisões. A URL sem proposta fixa acompanha a proposta atual.
- Inspeção do navegador local após a escrita ainda mostrou o formulário “Credencial humana”/“Entrar”. **Persistência da proposta confirmada; leitura humana ainda não observada.** Não há inferência de que o humano leu o texto ou de que já tentou fazer login.
- Próxima instrução: uma única tarefa de login local. O proprietário pode executar `pbcopy < ~/.local/share/arena-ux-pilot-2026-10-14/owner.token` no seu próprio Terminal e colar diretamente no formulário. O modelo não executou esse comando, não acessou clipboard e não solicitou o valor.
