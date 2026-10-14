# Especificação recebida: Arena v1 textual

Transcrição técnica do documento fornecido pelo proprietário; nomes pessoais e marca de piloto substituídos por identificadores genéricos para a documentação pública. As decisões desta execução estão em `implementation-notes.md`.

SHA-256 do DOCX: `2f40e2d24e1541b59e861440df8b90fc8709bbaf689d0117594c67c0074c4e39`

Arena especificação da primeira versão em texto

Preparação para uma futura sessão Codex • 14 de outubro de 2026

A Arena é um espaço para desenvolver ideias junto com a IA, experimentar caminhos e chegar a textos consistentes. O humano acompanha propostas, critica e escolhe; os agentes trabalham sobre um contexto externo que continua disponível depois que a conversa termina.

Esta versão prepara a implementação. O escopo confirmado é texto escrito, com imagens como extensão futura. A marca do piloto, o repositório de implementação e as redes prioritárias continuam em aberto. As escolhas técnicas abaixo são defaults propostos, sujeitos às decisões indicadas no final.

Problem Statement

Hoje, refinar um nicho, um tema e um post em conversas separadas torna difícil experimentar alternativas sem perder o que já funcionou. Uma mudança de tema pode descaracterizar a voz; uma nova conversa pode esquecer por que uma opção foi descartada. O texto final sozinho não conserva o processo que levou a ele.

O autor quer explorar variações em qualquer etapa, mantendo as partes escolhidas do seu estilo e entendendo o impacto da mudança nas etapas seguintes. Quer trabalhar com seus agentes Codex e Claude já usados no dia a dia e aproveitar seu conteúdo nas redes, mediante integrações e permissões verificadas.

Solution

Criar um quadro privado de trabalho com discussão, decisões, versões e ramificações. A unidade central é uma exploração editorial, que pode começar antes de existir um post. Nicho, público, tema, tese, ângulo, estrutura e texto são dimensões editáveis; a interface não exige uma sequência rígida para começar.

O fluxo principal é: conversar → registrar proposta → comparar → criticar → escolher ou ramificar → continuar. A IA pode sugerir alternativas e mostrar versões derivadas. A seleção humana determina o que passa a ser aceito; propostas e rejeições permanecem identificadas.

A interface mostra artefatos intermediários, justificativas curtas, fontes e consequências das escolhas. “Passo a passo” significa decisões observáveis, sem depender de expor raciocínio privado do modelo.

Cada ramificação conserva sua origem, a versão de voz utilizada, os campos travados e as diferenças em relação à base. Um post pode voltar a qualquer etapa sem apagar o caminho anterior.

O estado canônico vive fora do chat. Um novo agente recebe um pacote de contexto verificável e continua sem importar a conversa inteira.

A primeira entrega termina em texto revisado e exportável. Aprovar um texto não publica nem agenda nada.

Referência de produto

O Otto já documenta perfil de voz, memória editável e conexão MCP com agentes. A proposta da Arena enfatiza o processo de exploração, suas ramificações e decisões. Isso é uma escolha de produto, não uma alegação de exclusividade ou de ausência dessas funções no concorrente. [1]

User Stories

1. Como autor, quero começar com uma dúvida ou ideia incompleta, para explorar antes de escrever um post.

2. Como autor, quero discutir continuamente com a IA, para refinar o que realmente quero dizer.

3. Como autor, quero criticar uma proposta e ver uma revisão localizada, para manter direção sobre o trabalho.

4. Como autor, quero ver as fontes e justificativas de cada alternativa, para avaliar sua sustentação.

5. Como autor, quero ramificar nicho, público, tema, tese, ângulo, estrutura ou texto, para experimentar em qualquer etapa.

6. Como autor, quero definir o que muda e o que fica travado, para comparar variações controladas.

7. Como autor, quero manter uma versão específica da minha voz, para reconhecer meu estilo em temas diferentes.

8. Como autor, quero ver quais textos ficaram desatualizados após uma mudança, para revisar seus efeitos.

9. Como autor, quero comparar o mesmo estágio de duas ramificações, para escolher com critérios claros.

10. Como autor, quero aproveitar uma parte de outra opção, para recombinar ideias sem substituir tudo.

11. Como autor, quero conservar versões anteriores, para recuperar um caminho sem perder o atual.

12. Como autor, quero registrar por que aceitei ou rejeitei algo, para evitar repetir discussões.

13. Como autor, quero separar decisões deste post de regras permanentes, para não transformar uma exceção em minha voz.

14. Como autor, quero revisar propostas de atualização do perfil de voz, para controlar o que a Arena aprende.

15. Como autor, quero iniciar novos posts a partir de decisões e referências aprovadas, para manter continuidade.

16. Como autor, quero ver ideias anteriores relacionadas, para evitar repetição involuntária e aproveitar conexões úteis.

17. Como autor, quero usar meus agentes Codex e Claude, para manter minhas ferramentas de trabalho.

18. Como autor, quero trocar de agente com contexto externo suficiente, para continuar sem copiar todo o chat.

19. Como colaborador autorizado, quero identificar quem propôs e quem decidiu, para trabalhar sem confundir autoria.

20. Como colaborador, quero preservar edições concorrentes, para não perder o trabalho de outra pessoa ou agente.

21. Como autor, quero importar exemplos permitidos das minhas redes, para fundamentar o perfil de voz em textos reais.

22. Como autor, quero saber o que cada integração consegue acessar, para não depender de uma conexão presumida.

23. Como autor, quero remover fontes e revogar acesso, para controlar meus dados e seu uso posterior.

24. Como autor, quero exportar o contexto e as versões, para conservar o trabalho independentemente do provedor.

25. Como autor, quero distinguir texto revisado, exportado e publicado, para não confundir preparo com distribuição.

26. Como responsável pelo produto, quero reservar extensão para imagens, para evoluir depois sem ampliar a primeira versão.

Implementation Decisions

1 Arquitetura e unidades do domínio

Default proposto: interface web privada, serviço de domínio com armazenamento relacional durável e servidor MCP. A interface e o MCP chamam as mesmas operações e regras. SQLite serve a um piloto de instância única; hospedagem compartilhada e múltiplas instâncias exigem escolher armazenamento e identidade antes de implantar. Não é necessário banco vetorial para o primeiro fluxo.

Workspace: fronteira de acesso e colaboração. A criação começa privada ao proprietário; participação de colaboradores ou terceiros exige convite e permissão próprios.

Perfil de voz: identidade editorial, objetivos, vocabulário, tom, exemplos positivos e negativos, regras e fontes. Cada versão aprovada é imutável. Perfis pessoais e de marca são separados; Marca Piloto é uma opção de piloto, não a marca já escolhida.

Exploração editorial: objetivo, dimensões ainda abertas, referências, perguntas e ramificações. Pode existir sem texto final.

Ramificação: origem e revisão exatas, dimensões variadas, travas, versão do perfil e revisão atual. Uma ramificação é um caminho criativo, não uma sessão de agente.

Revisão: fotografia imutável dos campos e artefatos aceitos, dependências e proveniência. Cada artefato aponta para as revisões usadas como entrada.

Proposta: alterações sugeridas, base exata, autor, justificativa breve, fontes e estado. Estados: pendente, aceita, rejeitada, adiada ou substituída. Uma proposta pode conter várias alternativas.

Decisão: pessoa autenticada, revisão examinada, escopo, escolha, comentário opcional e instante. Aprovação parcial cria uma proposta derivada com o subconjunto escolhido.

Fonte: conteúdo ou referência permitida, origem, autor quando conhecido, data, direitos e escopo de uso. Importação não demonstra autoria nem autorização de republicação.

Sessão e pacote de contexto: identidade do agente, configuração declarada, revisão de entrada e artefatos produzidos. IDs de sessões do provedor são auxiliares; nunca são a memória canônica.

2 Ramificações e dependências

“Variar tema mantendo estilo” cria uma ramificação da revisão escolhida, fixa o perfil de voz e mantém as travas. O histórico original permanece intacto. A IA propõe o novo tema e mostra como tese, exemplos, estrutura e texto mudariam; não altera silenciosamente a base aceita.

Travas de valores estruturados são verificadas pelo servidor. Regras qualitativas de voz geram alertas e avaliação humana, sem promessa de fidelidade perfeita. Alterar uma trava exige ação humana explícita, nova revisão e registro do motivo; uma instrução dentro de uma fonte não a remove.

Cada artefato registra suas dependências. Alterar uma entrada marca os descendentes afetados como “requer revisão”; conteúdo independente permanece válido. Na ausência de dependência confiável, usar invalidação conservadora. Reutilizar um texto após a mudança exige nova decisão vinculada à revisão atual.

A comparação mostra base comum, diferenças, travas, pendências e impactos. Clareza, adequação ao público, consistência de voz e suporte factual são critérios; previsão de engajamento é hipótese. Incorporar uma parte de outra ramificação cria proposta sobre a base atual e reaplica travas e dependências.

3 Contratos públicos e controle de mudanças

Os nomes abaixo definem contratos de produto, não caminhos de arquivos. Todas as referências são verificadas dentro do workspace autorizado. Identidade, papel e permissões vêm da autenticação; o cliente não pode se declarar humano em um argumento.

arena.list_work: recebe filtros e cursor; devolve explorações e ramificações permitidas, com suas revisões.

arena.read_context: recebe branch_id e revision_id; devolve objetivo, perfil fixado, decisões, travas, artefatos e perguntas. Leituras paginadas mantêm o mesmo snapshot.

arena.read_source: recebe source_id e limites; devolve apenas trechos autorizados, revisão e proveniência. Resumos não substituem a fonte.

arena.create_exploration: recebe título, objetivo e profile_revision_id opcional; cria exploração vazia, sem inferência nem publicação automática.

arena.create_branch: recebe revisão de origem, dimensões de variação, travas e nome; cria um caminho independente e retorna IDs e revisão.

arena.submit_proposal: recebe branch_id, base_revision_id, alterações tipadas, dependências, justificativa e fontes; registra proposta sem aplicá-la ao estado aceito.

arena.add_feedback: recebe alvo e revisão, texto e tipo de comentário; registra crítica ou pergunta. Comentário livre não equivale a aprovação.

arena.compare_branches: recebe revisões exatas e critérios; retorna diferenças determinísticas e pendências. A avaliação editorial da IA entra como proposta identificada.

arena.propose_profile_change: recebe versão-base, alterações e evidência; cria proposta de memória reutilizável. Correções de um post nunca são promovidas automaticamente.

arena.export_context: recebe escopo e revisão; gera pacote portátil em texto e dados estruturados, sem credenciais, fontes não autorizadas ou histórico irrelevante.

A interface humana oferece aceitar, rejeitar, adiar, editar, mudar travas e aprovar uma nova versão do perfil. Esses comandos têm autorização distinta das ferramentas de agentes. Aceitar exige proposal_id, expected_head_revision e o identificador da versão apresentada; o servidor deriva o ator autenticado e aplica a transação. Edição direta cria nova revisão com autoria e diferenças. Nenhum token delegado ao agente recebe aprovação humana por herança.

4 Concorrência idempotência e erros

Toda mutação recebe idempotency_key e, ao modificar um agregado existente, expected_revision. Mesma chave, mesmo ator, mesmo alvo e mesmos argumentos devolvem o resultado anterior; argumentos diferentes retornam IDEMPOTENCY_CONFLICT. Atualização e evento de auditoria confirmam juntos na mesma transação.

Dois agentes podem produzir propostas em paralelo. O primeiro aceite avança a revisão; o segundo não pode sobrescrever. REVISION_CONFLICT retorna a base e a revisão atual para comparar e reapresentar. A proposta original permanece acessível. O servidor nunca faz reconciliação editorial silenciosa.

Erros usam código, mensagem acionável, retryable, referências permitidas e próximo passo: INVALID_INPUT, ACCESS_DENIED, NOT_FOUND, REVISION_CONFLICT, LOCK_VIOLATION, STALE_DEPENDENCY, CAPABILITY_UNAVAILABLE, SOURCE_UNAVAILABLE, RATE_LIMITED e IDEMPOTENCY_CONFLICT. Não revelar a existência de recursos sem acesso.

Timeout após escrita tem resultado incerto: consultar a operação pela chave antes de repetir. Retentativas transitórias respeitam limites e espera progressiva. Falha de agente conserva trabalho já persistido; não representa aceite, perda da ramificação nem execução exatamente uma vez.

5 Agentes nativos e redes sociais

Na primeira versão, o usuário abre o agente Codex ou Claude que já utiliza e pede trabalho sobre uma ramificação. O cliente configurado consulta a Arena pelo MCP e submete propostas. A configuração inclui apenas o acesso necessário ao workspace. A conexão real deve ser testada em cada cliente; disponibilidade de ferramenta no catálogo não prova conexão ou permissão.

MCP oferece acesso a ferramentas e contexto; ele não acorda qualquer agente existente nem importa automaticamente históricos do ChatGPT ou Claude. Um botão para iniciar, dirigir ou retomar execução dentro da Arena é extensão posterior. Codex App Server e Claude Agent SDK são candidatos, com autenticação, configuração, isolamento e custo verificados separadamente. Assinatura do chat não deve ser tratada como API incluída. [2][3]

Cada adaptador informa: provedor e conta, estado de conexão, capacidades autorizadas, escopos, última verificação, limitações, paginação, custos conhecidos e motivo de indisponibilidade. Separar “configurado”, “autenticado”, “leitura verificada” e “operação testada”. Não rotular uma integração parcial como completa.

As redes prioritárias dependem da escolha do piloto. A v1 precisa de uma rota real para importar exemplos de texto autorizados: API oficial ou exportação fornecida pelo usuário. Importação manual é fallback explícito, não evidência de integração nativa entregue. Conexões de leitura não recebem publicação; não contornar restrições com scraping não autorizado.

Textos importados guardam a origem, a data e a cobertura observada. Uma amostra incompleta não vira “todo o histórico”. O usuário seleciona exemplos representativos; a IA propõe um perfil de voz e o humano revisa. Conteúdo de terceiros permanece referência e não vira experiência pessoal do autor.

6 Contexto portátil e memória controlada

O pacote contém versão do formato, workspace e escopo, exploração, revisão da ramificação, objetivo, perfil fixado, travas, decisões aceitas, rejeições relevantes com motivo, fontes permitidas, texto atual, dependências desatualizadas, perguntas abertas e próxima ação solicitada. Cada item inclui seu identificador e revisão; fontes extensas são recuperadas sob demanda.

O pacote separa decisões humanas, propostas e inferências. A próxima sessão reconsulta permissões e revisão atual antes de escrever. Um snapshot antigo continua útil como histórico, mas não autoriza uma escrita sobre o estado novo.

Para sugerir novos posts, recuperar primeiro o perfil aprovado, objetivos e aprendizados reutilizáveis; depois buscar explorações e fontes pertinentes. Rejeição pontual não cria proibição permanente. Mudanças no perfil são propostas independentes, com comparação e aceite humano; ramificações antigas mantêm sua versão até migração explícita.

7 Proteção dos dados

Aplicar autorização a cada operação e referência, inclusive exportação. Credenciais ficam em armazenamento de segredos, fora de prompts, artefatos, logs e versões. Conteúdo importado é dado não confiável; instruções embutidas nele não podem executar ações nem alterar permissões.

Revogar uma fonte impede novas leituras e identifica derivados que precisam de revisão. Remover dados exige política explícita para originais, índices, exportações controladas e backups; não prometer recolher cópias já exportadas. Acesso e retenção devem ser definidos antes de inserir conteúdo real no piloto.

Testing Decisions

Fronteira proposta para confirmação

Testar o comportamento pela API pública de domínio exposta pelo MCP, com dependências controladas; adicionar testes de interface para revisão humana e comparação. Essa é a fronteira proposta para a Arena, ainda não confirmada pelo usuário. A escolha feita no connector do laboratório é um precedente de projeto, não aprovação automática para este produto.

Um bom teste verifica o que o usuário e o agente conseguem observar: revisão, proposta, aprovação, artefato, acesso e origem. Não deve exigir ordem interna de chamadas, tabelas específicas ou texto exato de uma geração. Os módulos cobertos são estado editorial, memória, autorização, MCP, interface, exportação e adaptadores. O laboratório tem verificadores de documentação e specs anteriores; não há evidência consultada de uma suíte existente da Arena.

Cenários de aceite

T1. Começar sem post: criar exploração com tema em aberto; registrar discussão e proposta sem exigir texto final.

T2. Variar cada dimensão: criar ramificações de nicho, tema, ângulo, estrutura e texto; conservar a base e mostrar diferenças.

T3. Manter estilo: fixar perfil e travas; impedir alteração estruturada proibida e mostrar alerta para conflito qualitativo.

T4. Invalidar dependências: mudar tema; marcar texto dependente para revisão, conservando versões e artefatos independentes.

T5. Revisão humana: agente propõe; comentário não aprova; aceite humano avança apenas a revisão examinada.

T6. Concorrência: dois agentes propõem sobre a mesma base; o segundo aceite após mudança retorna conflito sem perder conteúdo.

T7. Repetição e queda: repetir a mesma chave, perder a resposta e reiniciar; nenhuma proposta ou decisão é duplicada.

T8. Memória: corrigir um post sem alterar o perfil; aprovar nova voz sem migrar automaticamente ramificações antigas.

T9. Acesso: revogar membro ou fonte; bloquear nova leitura e exportação por referências antigas, sem vazamento entre workspaces.

T10. Integração parcial: credencial expirada, API limitada ou rede não suportada resulta em estado explícito, sem inventar histórico.

T11. Portabilidade: exportar e reabrir o pacote preserva decisões, revisões, proveniência e lacunas; nenhuma credencial é incluída.

T12. Fontes adversariais: instruções em conteúdo importado não alteram travas, aprovações, conexões ou permissões.

T13. Texto apenas: não existe fluxo de geração de imagem, upload de mídia para produção, agendamento ou publicação na v1.

Piloto que comprova o valor central

Escolher uma marca e uma pequena amostra autorizada de escrita. Aceitar uma versão A; ramificar B mudando tema ou nicho e mantendo estilo. O Codex propõe alterações em B. Encerrar essa conversa e abrir o Claude com o pacote e as fontes permitidas. Pedir crítica e revisão, comparar A e B e aceitar trechos selecionados.

O piloto passa quando ambos os clientes participam de verdade, sem transferência integral do chat, perda de decisões, alteração silenciosa de travas ou aprovação herdada. Uma fixture prova regras; não prova compatibilidade do provedor. A qualidade editorial é julgada pelos humanos e registrada separadamente dos testes técnicos.

Out of Scope

Gerar, editar ou analisar imagens e vídeos; produzir carrosséis visuais ou integrar um estúdio de mídia. A extensão futura reutiliza revisões e dependências, com contrato próprio.

Publicar ou agendar posts, operar comentários, enviar mensagens ou otimizar automaticamente por engajamento.

Acionar agentes em segundo plano, criar um orquestrador multiagente ou assumir acesso a conversas privadas dos provedores.

Treinar modelos, sincronizar toda a memória pessoal ou importar todo o histórico social sem seleção e permissão.

Nesta preparação: iniciar sessão Codex, implementar, instalar dependências, conectar contas, criar issue ou PR e implantar serviços.

Further Notes

Decisões antes da execução

Confirmar a fronteira de testes proposta; escolher marca do piloto e repositório; definir contas e redes prioritárias; decidir piloto local privado ou colaboração hospedada; autorizar as conexões necessárias. Até lá, usar dados fictícios e manter integrações como requisitos não verificados.

A estrutura segue a skill to-spec original. Sua etapa de publicar no tracker foi adiada para respeitar o pedido de preparar antes de iniciar Codex. O laboratório usa GitHub Issues, mas a Arena ainda não teve repositório confirmado. [4][5]

Sequência de implementação proposta

1. Confirmar decisões e inspecionar o ambiente escolhido. Registrar módulos existentes, regras do repositório e teste de aceitação inicial.

2. Entregar o fluxo completo mínimo com dados fictícios: exploração, ramificação, proposta, revisão humana e comparação persistidas.

3. Fechar concorrência, travas, dependências, memória versionada, exportação e testes adversariais.

4. Conectar os dois clientes MCP e executar a passagem Codex → Claude. Depois validar a importação social autorizada selecionada.

5. Rodar o piloto real, registrar falhas e revisar o produto. Só então avaliar runner integrado e extensão de imagens.

Prompt para a futura sessão Codex

Implemente a primeira versão textual da Arena conforme esta especificação, depois que eu confirmar ambiente, repositório e decisões pendentes. Leia os contratos do repositório e preserve trabalho existente. Comece pelo fluxo de exploração, ramificação, proposta, decisão humana e comparação, com persistência externa e testes pela fronteira pública acordada. Use dados fictícios até haver autorização para fontes reais. Preserve os clientes Codex e Claude como agentes nativos conectados por MCP; não substitua essa exigência por um chat próprio. Trate perfil de voz, decisões de post, revisões e permissões separadamente. Não acrescente imagens, publicação, runner autônomo ou novas despesas. Valide concorrência, retomada e transferência entre agentes. Ao concluir cada etapa, mostre evidência observável, limitações e decisões necessárias. Não faça merge nem implantação sem autorização específica.

Fontes

[1] Otto, produto e capacidades declaradas: https://otto.doti.gg/

[2] Codex App Server: https://learn.chatgpt.com/docs/app-server

[3] Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview

[4] Skill to-spec original: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md

[5] Contrato do laboratório: https://github.com/MathBorgess/wemathai-lab/blob/main/AGENTS.md
