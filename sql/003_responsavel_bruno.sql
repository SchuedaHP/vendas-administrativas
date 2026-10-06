-- Quarta responsavel: BRUNO FERREIRA (decisao David, 06/10/2026).
--
-- Bruno passou a vendedor administrativo da JOSY em outubro/2026 (cadastro `promotores`:
-- NOME ABREVIADO "BRUNO FERREIRA - VENDEDOR ADM"). A lista de responsaveis vive em DOIS lugares no
-- banco -- o CHECK da tabela e o teste dentro da RPC -- alem do formulario. Esta migracao muda os
-- dois; a funcao e' a da 002 (trava de orcamento duplicado) com a lista ampliada, nada mais.
-- Linhas antigas continuam validas: a lista nova e' um SUPERCONJUNTO da anterior.

begin;

alter table public.vendas_administrativas drop constraint if exists vendas_administrativas_responsavel_check;
alter table public.vendas_administrativas
  add constraint vendas_administrativas_responsavel_check
  check (responsavel in ('PATRICIA LIMA', 'GIOVANNA SANTANA', 'TATI SILVA', 'BRUNO FERREIRA'));

create or replace function public.registrar_venda_administrativa(
  p_numero_orcamento text,
  p_cpf text,
  p_nome_titular text,
  p_telefone text,
  p_responsavel text,
  p_request_fingerprint text
)
returns table (id bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono   text;
  v_quando timestamptz;
begin
  if p_numero_orcamento !~ '^[0-9]{1,12}$'
     or p_cpf !~ '^[0-9]{11}$'
     or char_length(btrim(p_nome_titular)) not between 3 and 150
     or p_telefone !~ '^[0-9]{11}$'
     or p_responsavel not in ('PATRICIA LIMA', 'GIOVANNA SANTANA', 'TATI SILVA', 'BRUNO FERREIRA')
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  -- Trava do orcamento. O `order by id` devolve o PRIMEIRO envio, que e' o que prevalece
  -- (mesma regra que `montar_vendas_efetiva.py` ja' aplica para duplicata de mesma chave).
  select v.responsavel, v.created_at
    into v_dono, v_quando
    from public.vendas_administrativas v
   where v.numero_orcamento = p_numero_orcamento
     and v.status = 'ATIVO'
   order by v.id
   limit 1;
  if found then
    raise exception 'orcamento_ja_cadastrado'
      using errcode = 'P0001',
            hint = format(
              'O orcamento %s ja foi cadastrado por %s em %s. Se o cadastro estiver errado, peca a anulacao antes de registrar de novo.',
              p_numero_orcamento, v_dono,
              to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_fingerprint));
  if (select count(*) from public.vendas_administrativas v
      where v.request_fingerprint = p_request_fingerprint
        and v.created_at >= now() - interval '1 hour') >= 60 then
    raise exception 'limite_de_envios_excedido' using errcode = 'P0001';
  end if;

  return query
  insert into public.vendas_administrativas (
    numero_orcamento, cpf, nome_titular, telefone, responsavel, request_fingerprint
  ) values (
    p_numero_orcamento, p_cpf, upper(btrim(regexp_replace(p_nome_titular, '\s+', ' ', 'g'))),
    p_telefone, p_responsavel, p_request_fingerprint
  )
  returning vendas_administrativas.id, vendas_administrativas.created_at;
exception
  -- Corrida: dois envios do mesmo orcamento passam juntos pelo teste acima e um esbarra no
  -- indice parcial. Sai com a MESMA mensagem, para o formulario nao ter dois textos diferentes
  -- para o mesmo fato.
  when unique_violation then
    raise exception 'orcamento_ja_cadastrado'
      using errcode = 'P0001',
            hint = format('O orcamento %s acabou de ser cadastrado por outra pessoa. Recarregue a aba Consultar registros.',
                          p_numero_orcamento);
end;
$$;

revoke all on function public.registrar_venda_administrativa(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_venda_administrativa(text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
