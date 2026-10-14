# Política de dados da Arena local

## Política de dados do piloto local

O ambiente suportado é uma máquina local, serviço HTTP em `127.0.0.1`, SQLite durável e clientes externos via MCP stdio. Usar somente conteúdo fictício nesta execução. Antes de importar fontes reais, o proprietário precisa escolher a amostra, confirmar direitos e escopo de uso e aceitar esta política. O código público não torna público o conteúdo do workspace.

### Retenção

| Categoria | Retenção e limite |
| --- | --- |
| Originais importados | Permanecem na base local até `human.remove_source` ou remoção completa da base pelo proprietário. Não há expiração automática prometida. |
| Revisões, propostas, decisões e feedback | Histórico mantido enquanto a base existe, sujeito à retirada do texto de fontes removidas e à restrição de leitura após revogação. IDs e relações mínimas de auditoria podem permanecer. |
| Perfil de voz | Versões aprovadas permanecem imutáveis; permissão de acesso ao material referenciado é reavaliada. Revogar uma fonte não autoriza reexibir seus exemplos por meio de uma versão antiga. |
| Estado de operações | Chaves de idempotência e resultados necessários à recuperação permanecem na base, mas resultados precisam ser saneados quando dados ou acesso são revogados. Nunca reexibir um token de convite nem conteúdo removido por replay. |
| Sessões locais | Fechar sessão encerra acesso de UI/cliente; não apaga revisões já confirmadas. Sessão de provedor não é memória canônica. |
| Credenciais | Arquivos ignorados pelo Git, acesso restrito ao proprietário; tokens armazenados por hash no domínio. Nunca em fontes, contexto, auditoria, URL ou logs. Revogar um membro invalida autenticação e operações posteriores. |
| Exportações | Pacotes e texto retornados são cópias entregues ao proprietário; não há prazo automático ou mecanismo de recolhimento para cópias salvas externamente. |
| Backups | V1 não promete criar, administrar ou apagar backups automáticos. O proprietário administra cópias e snapshots da máquina e decide sua retenção antes de inserir dados reais. |

### Revogar uma fonte

`human.revoke_source` exige ator humano autorizado, revisão esperada e motivo. A transação muda o estado, avança a revisão da fonte e registra o evento. Novas leituras e exportações falham ou omitem o material com indicação da lacuna. Artigos, voz, propostas e snapshots que dependem da fonte não podem funcionar como rota alternativa para seu conteúdo; derivados identificados ficam “requer revisão”. A origem continua disponível como metadado restrito quando permitido, sem trechos da fonte.

Revogação mantém o original para eventual avaliação administrativa local; não equivale a apagamento. V1 não oferece uma reativação automática. Nunca restaurar uma fonte como efeito colateral de um novo chat, leitura histórica, retry ou importação do pacote.

### Remover uma fonte

`human.remove_source` exige ator humano autorizado, revisão esperada e motivo. Após sucesso, o conteúdo original e o conteúdo derivado que a Arena controla devem estar logicamente apagados ou redigidos. A política inclui os registros de origem, artefatos aceitos, revisões históricas, propostas pendentes/rejeitadas, exemplos de voz vinculados, índices, caches e respostas persistidas de operações; textos de auditoria não podem reter uma cópia. Quando não houver vínculo confiável para separar um trecho, ocultar/remover conservadoramente o objeto afetado inteiro. Conservar apenas metadados necessários: ID, origem quando não sensível, status de remoção, revisão, autor autenticado da remoção e instante.

As revisões conservam seus identificadores e relações históricas; sua apresentação aplica as restrições atuais e indica a redação. Esta exceção de privacidade não promove um texto novo como versão editorial aceita. Não prometer fidelidade completa de um pacote histórico após uma remoção.

Verificação manual de remoção: consultar o ID por UI/MCP, ler contextos antigos e atuais, comparar ramificações, solicitar exportação e recuperar a operação pela chave. Nenhum caminho pode devolver o texto removido. Conteúdo copiado para outro arquivo, colado numa conversa de provedor ou salvo num pacote já exportado fica fora do controle da Arena. O proprietário precisa eliminá-lo nas ferramentas onde salvou a cópia.

O apagamento lógico na base não é promessa de sobrescrita física imediata de setores do disco: páginas livres SQLite, WAL, snapshots do sistema e backups podem conter bytes antigos. Para descarte completo do piloto, encerrar UI e clientes MCP, identificar a base correta, eliminar base e arquivos auxiliares `-wal`/`-shm`, credenciais, exportações e backups controlados; aplicar o mecanismo de descarte seguro do armazenamento quando necessário. Não executar essa ação destrutiva como parte da implementação. Um backup anterior não pode voltar a atender usuários sem reaplicar restrições e remoções posteriores; se não houver registro confiável dessas remoções, restaurar isoladamente e reavaliar os dados antes de liberar acesso.

### Retirar um membro e encerrar o piloto

`human.revoke_member` bloqueia novas autenticações, operações e recuperação por chave desse membro; não muda autoria de seu trabalho histórico. A UI não exibe credenciais existentes. O proprietário pode retirar os clientes Arena dos seus agentes depois do piloto, mantendo o histórico local ou descartando-o conforme a política acima. A v1 não promete apagar conversas mantidas pelo Codex, Claude ou outra ferramenta.

