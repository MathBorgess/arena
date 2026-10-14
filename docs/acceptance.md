# Evidência de aceite técnico

As fronteiras MCP e interação no artefato foram confirmadas pelo proprietário em 2026-10-14. A orientação posterior reduziu o visualizador a texto e seleção e transferiu o fluxo para a conversa. A spec recebida fica preservada; as escolhas atuais estão nas notas de implementação e no ADR 0003.

Os testes usam dados fictícios, SQLite real, HTTP real e clientes do SDK MCP. O host embutido é um AppBridge de referência. Isso verifica os contratos técnicos e não estabelece instalação, renderização ou execução de modelos nos clientes nativos.

| Cenário | Evidência pública |
| --- | --- |
| T1: começar sem post | `test/arena.test.ts`: exploração vazia recuperada depois de reiniciar; proposta e feedback separados de aceite. |
| T2: variar dimensões | `test/acceptance.test.ts`: alternativas das sete dimensões com origem, comparação e base conservadas. |
| T3: preservar estilo e travas | `test/domain.test.ts` e `test/acceptance.test.ts`: perfil fixado, travas servidoras e alerta qualitativo sujeito a julgamento humano. |
| T4: invalidar dependências | `test/domain.test.ts`: invalidação transitiva, artefato independente conservado e revisão explícita antes de exportar. |
| T5: decisão humana | `test/arena.test.ts`, `test/cli.test.ts`: proposta pendente, feedback sem aceite, decisão por credencial humana e versão apresentada. |
| T6: concorrência | `test/arena.test.ts`, `test/cli.test.ts`: CAS recusa segundo aceite desatualizado e conserva as propostas. |
| T7: repetição e queda | `test/arena.test.ts`, `test/cli.test.ts`: recuperação por chave e reinício sem duplicar proposta ou decisão. |
| T8: memória | `test/domain.test.ts`: voz aprovada imutável; correção de texto e voz separadas; ramificações antigas permanecem fixadas. |
| T9: acesso | `test/domain.test.ts`, `test/mcp.test.ts`, testes de navegador: revogação imediata, páginas e retries redigidos, sem vazamento entre workspaces. |
| T10: integração parcial | `test/domain.test.ts`, `test/mcp.test.ts`: estados separados, credencial inválida/revogada recusada, rede social nativa indisponível. APIs sociais reais não são executadas. |
| T11: portabilidade | `test/acceptance.test.ts`, `test/cli.test.ts`: pacote com IDs, voz, decisões, fontes e checksum; sessão independente reconsulta o estado; sem credenciais. |
| T12: fontes adversariais | `test/acceptance.test.ts`, `test/arena.test.ts`: texto importado não destrava valores nem concede poderes humanos ao agente. |
| T13: texto apenas | Enumeração MCP em `test/mcp.test.ts` e escopo dos contratos: não há ferramenta de imagem, mídia, publicação ou agendamento. |

O visualizador é verificado por `test-ui/`: texto somente leitura, proposta atual, seleção exata persistida, atualização de contexto onde suportada, nenhuma mensagem automática, atualização após proposta nova e limpeza após restrição de fontes. A decisão ocorre na conversa e utiliza o CLI humano em harness com execução local; cliente somente MCP mantém essa decisão pendente.

## Piloto nativo pendente

O percurso Codex → ChatGPT real e a qualidade editorial são trabalho separado em [issue #8](https://github.com/MathBorgess/arena/issues/8) e `docs/native-client-pilot.md`. Nenhum modelo, conta real, configuração pessoal, servidor remoto ou túnel foi acionado nesta execução. A versão técnica permite preparar esse piloto; não o declara concluído.

## Resultado final

Registrar aqui os resultados do build, checks, testes e revisão depois que a simplificação estiver integrada.
