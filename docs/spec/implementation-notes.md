# Arena v1: notas da execução

O pedido atual autoriza criar o repositório e implementar a spec. Ele sucede as restrições da sessão preparatória que diziam para ainda não implementar. Merge, implantação, contas reais e publicação social continuam fora desta execução.

## Escolhas concretas

- Repositório proposto: MathBorgess/arena; integrado ao ai-tools-catalog por PR, sem merge.
- Piloto local privado, dados fictícios, Node.js 24 + TypeScript + SQLite. A publicidade do código não torna público o workspace.
- Toda conversa permanece no harness escolhido pelo autor. A Arena oferece um MCP e um visualizador compacto de artefatos em português, empacotáveis com uma skill em um plugin.
- A interface mostra o texto em edição, propostas, diferenças e ramificações. Permite selecionar trechos, comentar, editar, comparar e decidir sobre propostas. Não contém chat próprio nem plataforma de navegação editorial separada.
- Usar MCP Apps para exibição embutida quando o harness anunciar e suportar essa extensão. Para clientes sem renderização verificada, oferecer um painel local do mesmo artefato, aberto sob demanda. A escolha do harness prioritário está pendente; não presumir equivalência entre ChatGPT, Codex e Claude Code.
- Interações relevantes no artefato produzem eventos persistidos com ID, revisão, seleção e autoria. O agente recupera esses eventos e a revisão atual pelo MCP; em hosts compatíveis, a interface também atualiza o contexto via MCP Apps. Essa atualização não inicia automaticamente uma execução do agente.
- Nenhuma marca ou rede é presumida. Importação real por arquivo JSON/CSV de textos fornecido pelo usuário, com origem, direitos, seleção e cobertura explicitados. Integrações nativas de redes são indisponíveis nesta entrega.
- Fronteiras de teste propostas, ajustadas à visualização de artefatos: API pública do domínio/MCP e interação no componente visual (seleção/comentário/edição → evento persistido → contexto recebido pelo agente). Aguardando confirmação antes de escrever testes.
- Configuração das ferramentas nativas é documentada; não modificar a configuração pessoal do proprietário.

## Evidência e limites

Código e testes ainda não implementados. A suíte planejada usará dados fictícios, SQLite real e clientes MCP do SDK. Essa evidência verificará contratos, sem provar participação real do Codex ou Claude. Renderização no harness, passagem entre os dois clientes e julgamento editorial humano são critérios de piloto pendentes até execução nos clientes reais.

O pacote portátil distingue fontes, inferências, propostas e decisões e não inclui credenciais. Fontes revogadas não podem ser relidas nem exportadas. A política de remoção inclui originais locais, conteúdo derivado controlado e índices; cópias previamente exportadas e backups administrados pelo usuário não podem ser recolhidos pelo produto.
