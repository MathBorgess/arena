# Arena

Desenvolva textos com Codex e ChatGPT mantendo a conversa no próprio harness. A Arena guarda explorações, propostas, decisões, versões de voz e ramificações. O visualizador mostra somente o texto da proposta atual, ou o texto aceito quando não há proposta de texto, e permite selecionar um trecho com o cursor.

O fluxo editorial acontece na conversa pela [skill Arena](skills/arena/SKILL.md): iniciar, revisar, comparar, ramificar, aceitar, rejeitar, voz, fontes e exportar. A seleção persiste contexto da versão exata e não envia mensagem nem inicia agente. O código é público; workspace, banco, credenciais e exportações ficam na máquina escolhida pelo proprietário.

## Executar o piloto local

Antes do merge do PR, `main` contém apenas o bootstrap. Para testar esta implementação agora, clone a branch de integração indicada abaixo. Depois do merge, o checkout padrão poderá ser usado.

Requer Node.js 24.15 ou superior na série 24, npm e um cliente MCP. SQLite é fornecido pelo Node; `node:sqlite` tem status de release candidate nessa série.

```bash
git clone --branch codex/implement-arena-v1 https://github.com/MathBorgess/arena.git
cd arena
npm ci
npm run build
npm run init
npm start
```

A inicialização informa caminhos sem imprimir credenciais. A base e os tokens ficam por padrão em `~/.local/share/arena`, fora do checkout e do cache do plugin; `ARENA_DATA_DIR` escolhe outra pasta privada. Reiniciar preserva o estado; `init` recusa redefinir uma Arena existente. O visualizador local usa autenticação apenas para abrir o artefato; decisões editoriais permanecem na conversa.

## Usar nos agentes

O pacote inclui [plugin.json](plugin.json), [mcp.json](mcp.json), marketplace local em `.agents/plugins/marketplace.json` e a skill Arena. Depois de compilar e inicializar, o proprietário pode registrar o checkout com `codex plugin marketplace add /caminho/arena` e instalar com `codex plugin add arena@arena-local`. Esta implementação não aplica esses comandos à configuração pessoal.

Siga [a configuração dos clientes](docs/mcp-clients.md) para iniciar MCP com uma credencial de agente. Codex usa MCP stdio e visualizador local; ChatGPT pode usar o recurso MCP Apps em hosts compatíveis. ChatGPT desktop local e web/hospedado têm requisitos distintos: a configuração local não torna o servidor acessível à web.

No Codex, use `$arena revisar o trecho selecionado`, ou `/skills` → Arena e então o pedido. No ChatGPT, use `@Arena` ou o seletor de skills quando disponível. São argumentos da skill; este pacote não registra novos slash commands nativos.

| Pedido na conversa | Resultado |
| --- | --- |
| `iniciar um texto sobre…` | Exploração persistente, mesmo com dimensões em aberto. |
| `revisar o trecho selecionado para…` | Proposta pendente sobre contexto exato da seleção. |
| `comparar A com B` | Diferenças e critérios na conversa. |
| `ramificar variando o tema` | Caminho derivado que preserva voz e travas. |
| `aceitar a proposta <ID>, versão <N>` / `rejeitar…` | Decisão humana específica por canal local separado. |
| `voz…` / `fontes…` / `exportar…` | Perfil versionado, referências autorizadas ou exportação da revisão escolhida. |

Em Codex ou ChatGPT Work com shell local autorizado, a skill executa `node /caminho/arena/dist/cli.js call --operation OP --input-file JSON` após a instrução explícita sobre a versão apresentada. O processo lê sua própria credencial humana privada; o modelo e o MCP nunca recebem seu valor. CAS e idempotência impedem substituir uma versão desatualizada silenciosamente. ChatGPT conectado somente por MCP conserva propostas pendentes até haver um canal humano independente configurado.

## Fontes e memória

Use os [arquivos fictícios de exemplo](examples/) ou JSON/CSV autorizado conforme [o guia de importação](docs/importing-text.md). Direitos, origem, escopo e cobertura parcial ficam registrados. Integrações nativas de redes sociais permanecem indisponíveis.

Perfis de voz aprovados são imutáveis e ramificações fixam uma versão. Corrigir um post não altera o perfil automaticamente. Consulte [a política de dados](docs/data-policy.md) para revogação, remoção e backups. A v1 termina em texto revisado/exportado; geração de imagens, publicação social e agendamento ficam fora dela.

## Desenvolvimento e evidência

```bash
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Os testes usam SQLite real e dados fictícios nos seams confirmados de domínio/MCP e seleção→persistência→contexto. Fixtures SDK e host de referência verificam protocolo e componente; instalação, renderização e participação de clientes nativos exigem o [piloto Codex → ChatGPT](docs/native-client-pilot.md). A passagem real permanece não verificada.

Leia [a especificação recebida](docs/spec/arena-v1-original.md), [as decisões atuais](docs/spec/implementation-notes.md), [ADR 0003](docs/adr/0003-text-only-viewer.md) e [AGENTS.md](AGENTS.md). Merge e implantação permanecem sob decisão do proprietário.
