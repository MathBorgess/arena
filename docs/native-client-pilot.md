# Piloto nos clientes nativos

## Evidência técnica e evidência de clientes reais

| Evidência | O que permite afirmar | O que permanece pendente |
| --- | --- | --- |
| Build, tipos e testes de domínio com dados fictícios | Os cenários cobertos respeitam contratos e estado persistido na versão do commit testado. | Qualidade editorial; acesso a conta; comportamento de uma versão real de host. |
| Cliente MCP do SDK, em memória ou stdio | Descoberta, validação de schemas e operações funcionam no protocolo testado. | Participação de Codex ou Claude nativos. |
| Playwright sobre UI humana | Fluxos cobertos de revisão, comparação e autorização se comportam como observado. | Julgamento humano de voz e clareza; compatibilidade com conta de provedor. |
| Comando/help local e configuração de exemplo | O formato de instalação foi consultado; a documentação está pronta. | Servidor instalado, autenticado e usado na conta do proprietário. |
| Atestado do proprietário com IDs/instantes de operações de cliente real | O cliente/conta identificado executou a etapa atestada. | Etapas posteriores; disponibilidade permanente; integração social nativa. |
| JSON/CSV fictício importado | A rota de arquivo testada aceita o formato e preserva a cobertura observada. | Formato de um export real; histórico completo; conexão API da rede. |

Só preencher evidências executadas. Registrar versão do código, versões dos clientes, IDs de exploração/ramificação/revisão/proposta/decisão e instante; nunca token, arquivo de credencial ou log integral com conteúdo privado. Se faltar confirmação da fronteira de testes, registrar “aguardando confirmação”, não “passou”.

`human.record_verification` é atestado humano explícito, limitado à etapa efetivamente observada. Não tratar esse registro como detecção automática nem transformar fixture em estado de integração real. Separar `configurado`, `autenticado`, `leitura verificada` e `operação testada`, além de motivo de indisponibilidade e última verificação.

## Roteiro manual Codex → Claude

Estado inicial: **não executado nos clientes reais**. Requer o proprietário nos seus clientes autenticados; não inicia modelos nem consome assinatura/API durante a implementação. Marca e redes permanecem escolhas do proprietário. A qualidade editorial é decidida por humanos, separadamente dos testes técnicos.

1. Escolher a marca fictícia do primeiro piloto ou uma pequena amostra real autorizada após aceitar a política. Escolher objetivo editorial e critérios de comparação. Registrar cobertura parcial das fontes e separar textos próprios de re-shares/referências.
2. Iniciar o serviço local e criar perfil de voz A na UI humana. Anotar seu `profile_revision_id`. Criar uma exploração que pode começar com tema/texto em aberto. Aceitar explicitamente uma proposta A; anotar os IDs da proposta, decisão e revisão.
3. Provisionar credenciais Arena separadas para os dois clientes, ambas `kind:agent`; mantê-las fora do Git. Não distribuir token humano aos agentes. Instalar cada configuração somente por ação autorizada do proprietário. Não assumir que o ambiente de desenvolvimento e a máquina do proprietário compartilham paths ou credenciais.
4. Criar B a partir da revisão aceita de A, variando tema ou nicho; fixar a mesma versão da voz e travar uma dimensão estruturada que ficará constante. Registrar revisão de origem, dimensões variadas, travas e base atual.
5. Abrir uma conversa nova no Codex nativo. Conferir em `/mcp` a conexão Arena. Pedir descoberta de `arena.list_work`, leitura exata de B com `arena.read_context`, leitura de uma fonte permitida com `arena.read_source` e uma proposta com `arena.submit_proposal`. Usar chave de idempotência e revisão esperada. Observar a proposta pendente na UI com autoria Codex e fontes; nenhum aceite deve ocorrer pelo MCP.
6. O humano registra uma crítica ou pergunta. Confirmar que feedback não avançou o estado aceito. Pedir ao Codex uma revisão localizada sobre a mesma base atual. Registrar IDs e conteúdo observável; não pedir/expor raciocínio privado do modelo.
7. Exportar o contexto exato de B e encerrar a conversa Codex. Guardar o pacote apenas no local escolhido pelo proprietário. Registrar checksum e revisão; não transferir a conversa inteira.
8. Abrir conversa nova no Claude nativo. Confirmar a conexão Arena em `/mcp`. Entregar o pacote e a próxima ação solicitada. Pedir releitura de permissões e revisão atual via MCP antes de escrever; recuperar fontes extensas sob demanda. Solicitar crítica/alternativa e proposta de revisão com autoria Claude. Observar na UI que o histórico de Codex e decisões humanas permaneceu acessível.
9. Comparar A e B sobre revisões explícitas com `arena.compare_branches` ou UI; verificar base comum, diferenças, travas, voz fixada e itens “requer revisão”. Avaliar clareza, público, voz e sustentação factual. Tratar previsão de engajamento como hipótese.
10. O humano aceita apenas dimensões/trechos selecionados através da UI, usando a versão apresentada e o head esperado. Confirmar decisão autenticada, proposta derivada no aceite parcial, preservação da alternativa original e nova revisão. Se houver conflito, comparar e reapresentar; não sobrescrever o trabalho anterior.
11. Mudar uma entrada e observar invalidação do texto dependente; revisar ou decidir reutilização explícita na revisão atual. Confirmar que uma correção do post não criou silenciosamente uma versão de voz nem migrou as ramificações antigas.
12. Exportar o texto revisado e o pacote, reabrir o contexto numa sessão nova e conferir IDs/proveniência/lacunas. O estado deve dizer “exportado”; não existe publicação ou agendamento na v1.
13. Se houver fonte fictícia específica para verificação, revogá-la e confirmar bloqueio de leitura/exportação e marcação dos derivados. Se necessário, remover a fonte e realizar a verificação de remoção descrita acima. Nunca usar uma fonte real apenas para provocar um teste adversarial sem a autorização correspondente.
14. Preencher o registro do piloto com etapas concluídas, falhas, instantes e IDs. Registrar a etapa real de cada cliente por `human.record_verification`. Marcar o piloto “passou” apenas se ambos executaram operações reais e o humano confirmou preservação do contexto, decisões, voz e travas. Falta de um cliente deixa a passagem “não verificada”, mesmo com suíte técnica verde.

Modelo mínimo de registro:

```text
Commit: <hash>
Workspace/exploração: <IDs>
Marca/amostra e cobertura: <declaradas pelo proprietário>
Voz fixada: <profile_revision_id>
A / B e origem: <branch_ids e revision_ids>
Codex: <versão; etapa; instante; proposal_id; sem credenciais>
Claude: <versão; etapa; instante; proposal_id; sem credenciais>
Decisão humana: <decision_id; versão apresentada; novo head>
Exportação: <revision_id; checksum; lacunas>
Resultado técnico: <comandos e cenários realmente executados>
Resultado de clientes reais: <não executado / parcial / passou / falhou>
Julgamento editorial humano: <critérios e conclusão>
Limitações e próxima ação: <concretas>
```

