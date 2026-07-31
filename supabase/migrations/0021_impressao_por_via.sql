-- =============================================================
-- Uma impressora para cada destino.
--
-- O balcão quer separar o que sai pela porta do que fica no salão:
--   'viagem' -> entrega e retirada (a térmica da expedição)
--   'salao'  -> pedidos de mesa    (a térmica da cozinha/salão)
--
-- O servidor decide a via; o agente na loja só mapeia via -> impressora
-- no .env dele. Enquanto houver uma impressora só, as duas vias caem
-- na mesma — separar depois é mudar uma linha lá, nada aqui.
--
-- Comandas antigas com via 'cozinha' continuam válidas: o agente
-- imprime qualquer via sem mapa na impressora padrão.
-- Rodar depois de 0001..0020.
-- =============================================================

create or replace function public.enfileira_impressao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vias    int;
  liga    boolean;
  destino text;
  i       int;
begin
  -- só quando ACABOU de entrar em 'recebido'
  if new.status <> 'recebido' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'recebido' then
    return null;
  end if;

  select impressao_automatica, vias_cozinha into liga, vias
    from public.configuracoes where id = 1;

  if not coalesce(liga, true) then
    return null;
  end if;

  -- mesa fica no salão; retirada e entrega saem pela porta
  destino := case when new.tipo_entrega = 'local' then 'salao' else 'viagem' end;

  -- não duplica se o pedido já tem comanda (de qualquer via, inclusive
  -- as antigas 'cozinha' de antes desta migração)
  if exists (select 1 from public.impressoes where pedido_id = new.id) then
    return null;
  end if;

  for i in 1..coalesce(vias, 1) loop
    insert into public.impressoes (pedido_id, via) values (new.id, destino);
  end loop;

  return null;
end;
$$;
