# Vendas Administrativas

Formulário público para a operação administrativa da gestão Josy, com uma segunda aba de conferência
dos registros. A listagem vem da função Vercel, em ordem decrescente de inserção; CPF e telefone são
mascarados no servidor e o fingerprint técnico nunca é enviado ao navegador.

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
