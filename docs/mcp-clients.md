# Arena nos clientes Codex e ChatGPT

A Arena mantém o contexto editorial em SQLite local. A conversa continua no cliente escolhido; o MCP lê contexto e registra propostas. O visualizador mostra artefatos e comparação. Aceitar uma proposta, editar o estado aceito, mudar travas ou aprovar voz exige login humano no visualizador local. O token de agente usado pelo widget não recebe essas permissões.

Os exemplos abaixo são instruções para a máquina do proprietário. Esta implementação não altera configurações pessoais, inicia modelos, conecta redes sociais, publica o plugin ou abre túneis. Claude fica adiado. SDK e host de referência são evidência técnica; instalação e uso real de Codex/ChatGPT permanecem verificações separadas.

## Preparar dados e credenciais locais

Use Node 24.15 ou posterior na linha 24; a execução foi verificada com Node 24.21. `node:sqlite` tem estabilidade release candidate. Instale dependências e compile no checkout:

```sh
npm ci
npm run build
node dist/cli.js init
node dist/cli.js agent --name codex
node dist/cli.js agent --name chatgpt
node dist/cli.js serve
```

Os comandos `init` e `agent` mostram caminhos, nunca os valores dos tokens. Por padrão os dados ficam em `~/.local/share/arena`, fora do checkout e do cache do plugin; `ARENA_DATA_DIR` ou `--data-dir /CAMINHO/PRIVADO` escolhe outra pasta. `init` recusa reinicialização de uma base existente. Diretórios ficam com modo `0700`; configuração, banco e arquivos de token com `0600`.

`arena.json` contém somente versão, workspace e caminho da base. `owner.token` é a credencial humana local; `agent.token` é o agente inicial. Identidades nomeadas ficam em `agents/codex.token` e `agents/chatgpt.token`, com tokens diferentes e autoria separada. `agent --name` usa a credencial humana local para convidar um agente e lê a revisão atual de membros antes da escrita. Nome já provisionado não é redefinido.

Abra `http://127.0.0.1:8787` na mesma máquina, consulte o arquivo `owner.token` localmente e use o login humano do visualizador. Esse segredo não deve ser inserido no chat ou na configuração MCP. A UI usa cookie HttpOnly/SameSite=Strict e valida a origem das escritas. `serve --port 0` escolhe porta livre e mostra a URL. Outros processos MCP usam a mesma base por transações SQLite e revisões esperadas.

## Codex: MCP stdio

Exemplo de configuração com caminhos absolutos na máquina do proprietário:

```toml
[mcp_servers.arena]
command = "node"
args = ["/CAMINHO/arena/dist/cli.js", "mcp"]

[mcp_servers.arena.env]
ARENA_DATA_DIR = "/CAMINHO/PRIVADO/arena"
ARENA_AGENT_TOKEN_FILE = "/CAMINHO/PRIVADO/arena/agents/codex.token"
ARENA_VIEWER_URL = "http://127.0.0.1:8787"
```

O comando equivalente, a executar pelo proprietário quando quiser configurar seu cliente:

```sh
codex mcp add arena --env ARENA_DATA_DIR=/CAMINHO/PRIVADO/arena --env ARENA_AGENT_TOKEN_FILE=/CAMINHO/PRIVADO/arena/agents/codex.token -- node /CAMINHO/arena/dist/cli.js mcp
```

`mcp --agent codex --data-dir /CAMINHO/PRIVADO/arena` também seleciona o arquivo nomeado. `ARENA_AGENT_TOKEN_FILE` tem precedência. Sem seleção, usa somente `agent.token`; nunca `owner.token`. Arquivo ausente, permissões abertas, token inválido ou token humano causam recusa. O processo stdio escreve somente mensagens MCP em stdout; erros locais saneados usam stderr.

Codex CLI, desktop e extensão IDE compartilham MCP quando usam o mesmo host Codex. Conferir em `/mcp` e iniciar uma nova sessão antes de depender das ferramentas. Isso não instala ferramentas no ChatGPT web. Fonte: [MCP oficial OpenAI](https://learn.chatgpt.com/docs/extend/mcp), consultada em 14/10/2026.

## Plugin local e ChatGPT desktop

O checkout contém o manifesto portátil `plugin.json`, servidores em `mcp.json`, skill companheira em `skills/arena/` e marketplace local em `.agents/plugins/marketplace.json`. O comando de lançamento empacotado é `node ${PLUGIN_ROOT}/dist/cli.js mcp`. Compile antes de usar a distribuição e inclua `dist/`, os assets locais `web/`, manifestos, skill e dependências de runtime; dados e tokens continuam na pasta privada externa. Não colocar credenciais no pacote.

O desktop pode descobrir um marketplace local, instalar o plugin dessa fonte e usar stdio em threads de execução local. O proprietário escolhe a pasta, configura o acesso do agente necessário e reinicia o app conforme a versão instalada. Um catálogo local não requer publicação no diretório público; submissão pública de plugin stdio é um processo separado e restrito a parceiros aprovados. Fontes: [empacotamento](https://developers.openai.com/plugins/build/plugins), [execução desktop](https://developers.openai.com/plugins/deploy/desktop-only).

O formato novo usa `plugin.json` e `mcp.json` na raiz, com seus schemas Agent Plugins. O formato de compatibilidade `.codex-plugin/plugin.json`/`.mcp.json` também existe, mas não se deve misturá-los renomeando arquivos. `source.path` do catálogo local resolve a partir da raiz do marketplace, não de `.agents/plugins`. Este repositório oferece a distribuição para revisão; instalação nativa real ainda precisa ser executada pelo proprietário.

## Artefato embutido e fallback

`arena.open_artifact` retorna contexto autorizado da revisão, texto/JSON útil e apresentação. O recurso `ui://arena/artifact/v1.html` usa `text/html;profile=mcp-app`; `presentation.ui_support` indica `advertised` ou `not_advertised` com base nas capacidades anunciadas do host. “Advertised” não afirma que a UI apareceu. O HTML compilado é autocontido; a ponte faz operações MCP, sem buscar o cookie humano do viewer.

Em um host compatível, a UI usa `App.connect`, `callServerTool`, `updateModelContext` e, no gesto explícito de pedir uma revisão, `sendMessage`. O host pode aplicar contexto apenas no próximo turno e conservar somente a última atualização. Eventos persistidos de `arena.record_interaction`/`arena.read_events` mantêm o histórico; `since_cursor` lê eventos posteriores ao checkpoint, enquanto `cursor` percorre uma página do mesmo snapshot.

Seleção/comentário da UI embutida identifica o agente autenticado e uma origem de UI não verificada. Não é aceite humano. Alterações embutidas são propostas pendentes. O botão de revisão humana abre ou mostra a URL local sem segredo; a pessoa faz login independente e decide sobre a versão exibida. Se o host não renderizar MCP Apps ou não abrir um link localhost, usar os resultados estruturados e abrir o visualizador local manualmente. Fonte: [UI MCP Apps no ChatGPT](https://developers.openai.com/plugins/build/chatgpt-ui), [referência de visibilidade e permissões](https://developers.openai.com/plugins/reference).

As dependências estão fixadas em SDK `1.32.1` e ext-apps `1.7.5`. ext-apps v1 aceita SDK `^1.29.0`; React é opcional para este viewer vanilla. ext-apps latest v2 exige SDK dividido v2, portanto não atualizar essa dependência isoladamente. Metadados: [registro ext-apps 1.7.5](https://registry.npmjs.org/@modelcontextprotocol%2fext-apps/1.7.5).

Ao submeter proposta, o cliente pode declarar `session_metadata` com `provider`, `client_name`, `client_version` e `external_session_id` opcional. A Arena deriva autoria e revisão de entrada do estado autenticado; esses campos são apenas declaração de cliente, não prova de conta/execução nativa. Não incluir segredos ou configurações de ambiente. IDs de sessão do provedor são auxiliares; o contexto canônico e sua retomada continuam na Arena. O adaptador não acrescenta automaticamente dados variáveis do handshake aos argumentos de uma escrita, preservando retries com a mesma chave e os mesmos argumentos.

## HTTP local e ChatGPT web

`serve` também disponibiliza `/mcp` com Streamable HTTP stateless para compatibilidade local. Toda requisição exige Bearer de um agente, revalida autenticação e verifica Host/Origin de loopback. Cada requisição tem um servidor MCP independente; esse transporte não conserva a declaração de capacidade UI do handshake para chamadas posteriores. O recurso continua anunciado, mas não inferir suporte ou renderização dessa declaração ausente. Não é uma integração remota pronta: não oferece discovery OAuth nem muda o bind para uma rede pública. O canal humano `/api/*` continua separado.

ChatGPT web/hospedado precisa alcançar um endpoint HTTPS Streamable HTTP ou um Secure MCP Tunnel autorizado. Dados privados exigem a rota de autenticação apropriada à superfície; o guia oficial descreve OAuth 2.1, PKCE e validação de issuer/audience/expiração/scopes. Um token fixo de stdio não deve ser presumido compatível com o formulário web. A conexão customizada é distinta de publicação pública. Fontes: [conectar um servidor customizado](https://developers.openai.com/plugins/deploy/connect-chatgpt), [autenticação](https://developers.openai.com/plugins/build/auth).

`127.0.0.1` se refere à máquina do processo/navegador que acessa o endereço. O serviço num ambiente remoto de desenvolvimento não aparece automaticamente no localhost do proprietário ou de outro dispositivo. A iframe embutida tem origem isolada; CSP não concede acesso ao cookie humano local nem substitui CORS. Não alterar essas fronteiras para afirmar integração. Para este piloto, servidor, banco e visualizador local ficam na máquina escolhida pelo proprietário; endpoint remoto, OAuth e túnel são trabalho posterior.

## Verificar a passagem Codex → ChatGPT

1. Escolher amostra fictícia ou, após autorização e política de retenção, uma pequena amostra real. Criar voz aprovada A, aceitar texto A e ramificar B de uma revisão exata com voz/travas fixadas.
2. No Codex real, confirmar a conexão Arena, ler B e fontes permitidas, submeter proposta e observar a autoria e o estado pendente. Encerrar a conversa.
3. No ChatGPT real, confirmar instalação/conexão na superfície escolhida e ler o mesmo contexto externo. Pedir crítica/proposta sem transferir o chat inteiro. Abrir o artefato quando houver renderização; selecionar um trecho e solicitar revisão explicitamente.
4. Conferir que eventos do widget têm autoria de agente e que nenhuma proposta foi aceita automaticamente. O humano usa o viewer autenticado, compara A/B e aceita a versão apresentada; o estado anterior e a alternativa continuam conservados.
5. Registrar versões dos clientes, revisão/IDs de operações, etapa efetivamente observada, falhas e julgamento editorial. Sem logs/tokens privados. Configurado, autenticado, leitura verificada, operação testada e renderização observada são fatos separados.

Os testes usam clientes **SDK** e um host de referência. Não certificam contas, disponibilidade de ferramentas, instalação de plugin ou execução nativa do Codex/ChatGPT. Até a passagem acima acontecer nos clientes do proprietário, registrar “não verificado”; Claude continua adiado.
