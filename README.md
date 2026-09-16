# Vendas Administrativas

Formulário público para a operação administrativa da gestão Josy, com uma segunda aba de conferência
dos registros. A página é um cabeçalho fixo (logo + título) e duas abas — **Registrar venda** e
**Consultar registros**. A listagem vem da função Vercel, em ordem decrescente de inserção; CPF e
telefone são mascarados no servidor e o fingerprint técnico nunca é enviado ao navegador.

## Exportação em XLSX

O botão **Exportar XLSX** da aba de conferência gera a planilha no próprio navegador, com as mesmas
colunas da tabela e respeitando a busca ativa (exporta o que está na tela). CPF e telefone saem
mascarados, como chegam do servidor: a exportação não é caminho alternativo para o dado íntegro.

A planilha é montada por `lib/xlsx.mjs`, um gerador de `.xlsx` sem dependência externa — a CSP da
página só aceita script de mesma origem, então não há como carregar uma biblioteca por CDN. O
arquivo é um ZIP sem compressão com as partes mínimas do OOXML. `tests/xlsx.test.mjs` abre o
resultado de volta com o `zipfile` do Python para garantir que o Excel vai aceitá-lo.

## Publicação

1. Importe o repositório `SchuedaHP/vendas-administrativas` na Vercel.
2. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `FORM_RATE_LIMIT_SECRET` nos ambientes Production e Preview.
3. Use o slug `vendas-administrativas` e publique.
4. Faça um envio controlado e confirme o protocolo antes de liberar a URL à operação.

A chave de serviço é segredo de servidor: nunca deve ser prefixada com `NEXT_PUBLIC_`, incluída no HTML ou commitada.

Correções são auditáveis: um registro incorreto deve mudar para `ANULADO`, preenchendo `anulado_em`
e `motivo_anulacao`. Não apague registros da tabela.

## Desenvolvimento local

Não há dependências externas. Use `npm test` para os testes e `npm run preview` para abrir a interface. A prévia visual não grava dados.
