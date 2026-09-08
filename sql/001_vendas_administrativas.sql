begin;

create table if not exists public.vendas_administrativas (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  numero_orcamento text not null check (numero_orcamento ~ '^[0-9]{1,12}$'),
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  nome_titular text not null check (char_length(nome_titular) between 3 and 150),
  telefone text not null check (telefone ~ '^[0-9]{11}$'),
  responsavel text not null check (responsavel in ('PATRICIA LIMA', 'GIOVANNA SANTANA', 'TATI SILVA')),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ANULADO')),
  anulado_em timestamptz,
  motivo_anulacao text,
  constraint vendas_administrativas_anulacao_consistente check (
    (status = 'ATIVO' and anulado_em is null and motivo_anulacao is null)
    or
    (status = 'ANULADO' and anulado_em is not null and nullif(btrim(motivo_anulacao), '') is not null)
  )
);

comment on table public.vendas_administrativas is 'Cadastros públicos de vendas administrativas; contém PII e não possui acesso direto por navegador.';
comment on column public.vendas_administrativas.cpf is 'PII: CPF normalizado com 11 dígitos.';
comment on column public.vendas_administrativas.telefone is 'PII: telefone normalizado com DDD e 11 dígitos.';
comment on column public.vendas_administrativas.request_fingerprint is 'HMAC do IP para limite de uso; nunca armazena o IP bruto.';

create index if not exists vendas_administrativas_created_at_idx on public.vendas_administrativas (created_at desc);
create index if not exists vendas_administrativas_orcamento_idx on public.vendas_administrativas (numero_orcamento);
create index if not exists vendas_administrativas_cpf_idx on public.vendas_administrativas (cpf);
create index if not exists vendas_administrativas_fingerprint_created_idx on public.vendas_administrativas (request_fingerprint, created_at desc);

alter table public.vendas_administrativas enable row level security;
alter table public.vendas_administrativas force row level security;
revoke all on table public.vendas_administrativas from public, anon, authenticated;
revoke all on sequence public.vendas_administrativas_id_seq from public, anon, authenticated;
grant select, insert, update on table public.vendas_administrativas to service_role;
grant usage, select on sequence public.vendas_administrativas_id_seq to service_role;

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
begin
  if p_numero_orcamento !~ '^[0-9]{1,12}$'
     or p_cpf !~ '^[0-9]{11}$'
     or char_length(btrim(p_nome_titular)) not between 3 and 150
     or p_telefone !~ '^[0-9]{11}$'
     or p_responsavel not in ('PATRICIA LIMA', 'GIOVANNA SANTANA', 'TATI SILVA')
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'dados_invalidos' using errcode = '22023';
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
end;
$$;

revoke all on function public.registrar_venda_administrativa(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_venda_administrativa(text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
