# Canal editorial local

Use apenas num harness com shell local autorizado. Resolva a raiz do pacote a partir da localização desta skill (`skills/arena/` → dois níveis acima), confirme `dist/cli.js` compilado e o diretório privado Arena já escolhido. Não configure clientes nem inicialize/reset a base como efeito de aceitar uma proposta. Se o canal não estiver disponível, deixe a decisão pendente.

Escreva somente os argumentos da ação num arquivo temporário fora do Git, com modo `0600`, por uma ferramenta de escrita estruturada. Não inclua identidade ou credencial. Execute sem interpolação de conteúdo editorial no shell:

```sh
node /CAMINHO/arena/dist/cli.js call --operation human.decide_proposal --input-file /CAMINHO/PRIVADO/decisao.json --data-dir /CAMINHO/PRIVADO/arena
```

O CLI lê `owner.token` de forma privada (ou `ARENA_OWNER_TOKEN_FILE` já configurado pelo proprietário), autentica um humano e injeta o workspace configurado. Nunca leia esse arquivo com ferramentas do modelo, peça que o usuário cole seu conteúdo ou use o token do agente como fallback. O comando retorna somente o resultado editorial ou um envelope `error`; segredos e operações de emissão/revogação de credenciais ficam fora deste canal.

## Aceitar ou rejeitar

Releia contexto/proposta antes da decisão; vincule a instrução real do usuário à proposta/versão apresentada. Exemplo de argumentos — substitua IDs somente pelos retornados pelo serviço:

```json
{
  "idempotency_key": "uma-chave-unica-para-esta-decisao",
  "proposal_id": "ID-DA-PROPOSTA-APRESENTADA",
  "presented_version": 1,
  "expected_revision": "HEAD-LIDO",
  "expected_head_revision": "HEAD-LIDO",
  "decision": "accepted"
}
```

Para rejeitar, use `decision: "rejected"` e o motivo em `comment`. `selected_dimensions` aceita dimensões presentes na proposta, somente no aceite. Aceitar um trecho exige uma proposta de texto derivada que materialize aquele trecho, apresentada e decidida pelo usuário; offsets de seleção não são um aceite parcial por si só. Não gere um campo `approved: true` para representar uma instrução que não ocorreu.

Após timeout/resultado incerto, use o mesmo CLI com `--operation arena.get_operation` e `{ "idempotency_key": "a-chave-original" }`. A consulta MCP do agente tem outra identidade. Se encontrado, use o resultado persistido; se não encontrado, repita os mesmos argumentos e a mesma chave. `REVISION_CONFLICT`, `LOCK_VIOLATION` ou mudança de versão exige resolver o estado e a decisão humana pendente; não altere o head automaticamente para fazer a operação passar.

## Outras ações explícitas

Consulte os schemas/contratos do pacote para montar os argumentos concretos:

- `human.edit_branch`: alteração aceita específica, head exato, changes/dependencies/source_ids e reason.
- `human.set_locks`: head exato, mapa completo de travas a conservar e reason; retirar uma trava exige instrução explícita.
- `human.create_profile`: perfil inicial concreto aprovado pelo humano, source_ids e conteúdo completo de voz.
- `human.approve_profile`: proposal_id de voz, presented_version e expected_revision do head da voz; ramificações anteriores continuam fixadas na versão original.
- `human.import_sources`: arquivo JSON/CSV autorizado, direitos, escopo, origem e cobertura reais. `human.revoke_source`/`human.remove_source`: fonte/revisão exatas e motivo; confira os efeitos nos derivados e na política de retenção.
- `human.review_artifacts`: reutilização explícita de dimensões invalidadas na revisão exata, nunca validação automática baseada em warnings.
- `human.export_text`: branch_id/revision_id do texto aceito revisado. Guarde a exportação somente no destino escolhido; nenhuma publicação implícita.

Toda mutação inclui chave única e está sujeita a autorização, CAS e auditoria no domínio. Leituras editoriais disponíveis pelo CLI incluem contexto, comparação, fontes, perfis, eventos e operação. Convites/revogação de membros, verificação de cliente nativo e chamadas que produzem credenciais não fazem parte de `call`.
