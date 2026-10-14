# Arena

Desenvolva textos com Codex e ChatGPT mantendo a conversa no próprio harness. A Arena guarda explorações, propostas, decisões, versões de voz e ramificações; o visualizador permite acompanhar e interagir com o artefato.

- **Codex:** ferramentas MCP e visualizador local compacto.
- **ChatGPT:** as mesmas ferramentas e um recurso MCP Apps para exibição embutida em hosts compatíveis.
- **Interação:** selecionar um trecho, comentar ou pedir revisão gera contexto persistente. Edições embutidas são propostas; decisões humanas usam uma sessão própria no visualizador.

O código é público. O workspace e seus arquivos ficam na máquina onde a Arena executa. O piloto usa dados fictícios; a execução de IA permanece no harness e usa sua configuração existente.

## Executar localmente

Requer Node.js 24.15 ou superior na série 24, npm e um cliente MCP. SQLite é fornecido pelo Node; `node:sqlite` tem status de release candidate nessa série.

```bash
git clone https://github.com/MathBorgess/arena.git
cd arena
npm ci
npm run build
npm run init
npm start
```

A inicialização informa onde ficam a base e os arquivos de credenciais, sem imprimir seus valores. Abra o endereço local informado pelo servidor e autentique a sessão humana com o token do proprietário guardado no arquivo indicado. A Arena preserva as credenciais existentes ao reiniciar.

A base e os tokens ficam em um diretório persistente separado do cache do plugin; `ARENA_DATA_DIR` seleciona outro diretório para um piloto isolado. Mantenha esse diretório e eventuais exportações sob seu controle.

## Usar nos agentes

O pacote inclui [plugin.json](plugin.json), [mcp.json](mcp.json) e a [skill Arena](skills/arena/SKILL.md). A configuração de cliente é uma ação explícita; baixar e compilar este repositório prepara o pacote.

Siga [a configuração dos clientes](docs/mcp-clients.md) para iniciar o MCP com uma credencial de agente. A credencial humana permanece no canal de revisão. ChatGPT desktop local e ChatGPT web/hospedado têm requisitos de conexão distintos; a configuração local de Codex não torna o servidor acessível à web.

O visualizador embutido usa a ponte MCP Apps para recuperar contexto, registrar seleções e submeter propostas. Ações como “Revisar trecho” solicitam continuação explicitamente quando o host permite. Atualizações de contexto podem chegar ao modelo no próximo turno. O visualizador local oferece o canal humano de aceite, edição aceita, travas e perfil de voz.

## Fluxo de trabalho

1. Comece uma exploração com uma pergunta ou objetivo, mesmo sem texto final.
2. Peça ao agente alternativas; veja as propostas e justificativas no artefato.
3. Selecione um trecho e registre uma crítica. O agente recupera a seleção e a revisão exatas antes de trabalhar.
4. Compare caminhos ou ramifique dimensões mantendo voz e valores travados.
5. Aceite a proposta apresentada na sessão humana; o histórico anterior permanece disponível.
6. Revise dependências afetadas e exporte texto/contexto quando desejar.

A versão textual termina em texto revisado/exportado. Geração de imagens, publicação social, agendamento e execução autônoma de agentes estão fora da v1.

## Fontes e memória

Use os [arquivos fictícios de exemplo](examples/) ou um JSON/CSV autorizado, normalizado conforme [o guia de importação](docs/importing-text.md). A rota de arquivo informa a cobertura observada; integrações nativas de redes sociais permanecem indisponíveis.

O perfil de voz tem versões aprovadas imutáveis. Uma correção de post não modifica o perfil automaticamente. Consulte a [política de dados](docs/data-policy.md) para revogação, remoção, exportações e backups controlados pelo proprietário.

## Desenvolvimento e evidência

```bash
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

As fronteiras confirmadas são o domínio/MCP e a interação no artefato até sua persistência e recuperação pelo agente. Testes usam SQLite real e dados fictícios. Fixtures do SDK/host de referência verificam protocolo e componente; a instalação, renderização e participação de clientes nativos são verificadas separadamente pelo [roteiro Codex → ChatGPT](docs/native-client-pilot.md).

Leia [a especificação recebida](docs/spec/arena-v1-original.md), [as decisões atuais](docs/spec/implementation-notes.md) e [AGENTS.md](AGENTS.md). Merge e implantação permanecem sob decisão do proprietário.
