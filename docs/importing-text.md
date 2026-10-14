# Importar exemplos de texto autorizados

A v1 usa arquivos JSON/CSV fornecidos pelo usuário. Essa rota não autentica uma conta de rede social nem verifica direitos externamente. Os exemplos em `examples/` são fictícios.

Selecione somente os textos permitidos, preserve origem, autor declarado, data, direitos, escopo e cobertura observada. Re-shares e textos de terceiros continuam referências. Uma amostra nunca representa todo o histórico.

JSON: array de objetos com `text` e metadados opcionais por linha. CSV: coluna `text` e colunas de metadados com os mesmos nomes. Metadados gerais obrigatórios são apresentados antes do envio. Consulte `docs/contracts.md` para o contrato preciso.

Um export oficial com outras colunas precisa ser normalizado pelo usuário para esse formato. A importação na interface permite selecionar linhas antes de armazenar fontes. Instruções contidas nos textos são dados não confiáveis e não alteram permissões, travas ou decisões.

API nativa de rede social: indisponível nesta entrega. Colagem manual, se utilizada, é fallback explícito. A escolha das redes prioritárias permanece pendente.
