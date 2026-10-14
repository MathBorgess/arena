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

Validação das correções em `f30f735`, integradas em `acb54d8` com árvore idêntica: `npm run check`, `npm run build`, `npm test` (**42/42**) e `npm run test:ui` (**8/8**) passaram. Os oito cenários de navegador incluem respostas atrasadas, conflito de seleção, proposta nova e revogação, preservando a interface somente de texto.

O teste adicional do pacote compilado usou processos CLI reais e cliente SDK stdio: descobriu **15 ferramentas de agente**, abriu a proposta atual, registrou seleção, recuperou eventos, leu o recurso UI autocontido e aceitou a versão exata pelo CLI humano independente. O diretório fictício foi removido após encerrar os clientes. Nenhuma credencial foi impressa.

A revisão final apontou cinco itens no eixo Standards (duas violações e três heurísticas) e dois no eixo Spec. Todos foram tratados por um único implementador, com regressões públicas e validação focada; não houve segunda rodada ampla de revisão. Ver `docs/review.md` para os eixos separados, prioridades e resoluções.

Entrega técnica: [PR Arena #7](https://github.com/MathBorgess/arena/pull/7). Integração: [PR ai-tools-catalog #2](https://github.com/MathBorgess/ai-tools-catalog/pull/2), em draft até a implementação chegar à `main` da Arena e permitir avançar o gitlink conforme as regras do catálogo. Os tickets técnicos fecham pelo merge do PR; o pai e o piloto nativo permanecem abertos enquanto esse piloto não for executado.
