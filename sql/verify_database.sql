begin;
set local role service_role;

do $$
declare
  i integer;
begin
  for i in 1..60 loop
    perform * from public.registrar_venda_administrativa(
      (700000 + i)::text,
      '52998224725',
      'TESTE TRANSACIONAL',
      '11987654321',
      'PATRICIA LIMA',
      repeat('f', 64)
    );
  end loop;

  begin
    perform * from public.registrar_venda_administrativa(
      '700061',
      '52998224725',
      'TESTE TRANSACIONAL',
      '11987654321',
      'PATRICIA LIMA',
      repeat('f', 64)
    );
    raise exception 'o limite de 60 envios nao foi aplicado' using errcode = '22000';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'limite_de_envios_excedido' then
        raise;
      end if;
  end;
end;
$$;

rollback;

select count(*) as registros_persistidos
from public.vendas_administrativas
where request_fingerprint = repeat('f', 64);
