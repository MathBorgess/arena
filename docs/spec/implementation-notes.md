# Arena v1: notas da execução

O pedido atual autoriza criar o repositório e implementar a spec. Ele sucede as restrições da sessão preparatória que diziam para ainda não implementar. Merge, implantação, contas reais e publicação social continuam fora desta execução.

## Escolhas concretas

- Repositório proposto: MathBorgess/arena; integrado ao ai-tools-catalog por PR, sem merge.
- Piloto local privado, dados fictícios, Node.js 24 + TypeScript + SQLite. A publicidade do código não torna público o workspace.
- Interface web em português; os clientes Codex e Claude continuam externos e usam MCP stdio.
- Nenhuma marca ou rede é presumida. Importação real por arquivo JSON/CSV de textos fornecido pelo usuário, com origem, direitos, seleção e cobertura explicitados. Integrações nativas de redes são indisponíveis nesta entrega.
- Fronteiras de teste propostas: API pública do domínio e MCP, mais revisão e comparação na interface humana. Aguardando confirmação antes de escrever testes.
- Configuração das ferramentas nativas é documentada; não modificar a configuração pessoal do proprietário.

## Evidência e limites

A suíte técnica usa dados fictícios, SQLite real e clientes MCP do SDK. Essa evidência verifica contratos, não prova participação real do Codex ou Claude. A passagem entre os dois clientes e o julgamento editorial humano são critérios de piloto pendentes até execução nos clientes reais.

O pacote portátil distingue fontes, inferências, propostas e decisões e não inclui credenciais. Fontes revogadas não podem ser relidas nem exportadas. A política de remoção inclui originais locais, conteúdo derivado controlado e índices; cópias previamente exportadas e backups administrados pelo usuário não podem ser recolhidos pelo produto.
