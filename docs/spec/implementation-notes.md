# Arena v1: notas da execução

O pedido atual autoriza criar o repositório e implementar a spec. Ele sucede as restrições da sessão preparatória que diziam para ainda não implementar. Merge, implantação, contas reais e publicação social continuam fora desta execução.

## Escolhas concretas

- Repositório criado: MathBorgess/arena; integrado ao ai-tools-catalog por PR, sem merge.
- Piloto local privado, dados fictícios, Node.js 24 + TypeScript + SQLite. A publicidade do código não torna público o workspace.
- Toda conversa permanece no harness escolhido pelo autor. A Arena oferece um MCP e um visualizador compacto de artefatos em português, empacotáveis com uma skill em um plugin.
- Orientação final do proprietário: o visualizador mostra apenas o texto da proposta atual, em leitura, com seleção nativa pelo cursor. A seleção persiste automaticamente com proposta, versão, revisão-base e offsets. Não há painéis, comentários, edição, comparação, aceite, navegação ou botões de fluxo no visualizador. Toda solicitação e coordenação permanece na conversa e nas skills/comandos do harness.
- O humano comunica aceite, rejeição, edição e outras decisões na conversa. Em harnesses com execução local (Codex e ChatGPT Work), a skill utiliza um canal CLI humano separado, com credencial privada lida pelo processo, após instrução explícita do usuário sobre a versão apresentada. O MCP de agente continua sem autorização humana. Clientes exclusivamente MCP mantêm decisões pendentes até existir um canal humano autorizado; não simular autorização nem exigir controles editoriais no visualizador.
- Usar MCP Apps para exibição embutida quando o harness anunciar e suportar essa extensão. Para clientes sem renderização verificada, oferecer um painel local do mesmo artefato, aberto sob demanda. Prioridades confirmadas: Codex e ChatGPT. ChatGPT recebe MCP Apps quando disponível; Codex usa MCP e visualizador local, sem presumir renderização embutida. Claude fica como extensão posterior.
- Interações relevantes no artefato produzem eventos persistidos com ID, revisão, seleção e autoria. O agente recupera esses eventos e a revisão atual pelo MCP; em hosts compatíveis, a interface também atualiza o contexto via MCP Apps. Essa atualização não inicia automaticamente uma execução do agente.
- Nenhuma marca ou rede é presumida. Importação real por arquivo JSON/CSV de textos fornecido pelo usuário, com origem, direitos, seleção e cobertura explicitados. Integrações nativas de redes são indisponíveis nesta entrega.
- Fronteiras de teste propostas, ajustadas à visualização de artefatos: API pública do domínio/MCP e interação no componente visual (seleção/comentário/edição → evento persistido → contexto recebido pelo agente). Fronteiras explicitamente confirmadas pelo proprietário em 14/10/2026: “Confirmo MCP e interação no artefato”.
- Configuração das ferramentas nativas é documentada; não modificar a configuração pessoal do proprietário.

## Evidência e limites

Implementação iniciada após a confirmação das fronteiras de teste; registrar resultados somente após execução. A suíte planejada usará dados fictícios, SQLite real e clientes MCP do SDK. Essa evidência verificará contratos, sem provar participação real do Codex ou Claude. Renderização no harness, passagem Codex → ChatGPT e julgamento editorial humano são critérios de piloto pendentes até execução nos clientes reais.

O pacote portátil distingue fontes, inferências, propostas e decisões e não inclui credenciais. Fontes revogadas não podem ser relidas nem exportadas. A política de remoção inclui originais locais, conteúdo derivado controlado e índices; cópias previamente exportadas e backups administrados pelo usuário não podem ser recolhidos pelo produto.
