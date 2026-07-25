-- =============================================================
-- Relatórios de venda.
--
-- Tudo é somado DENTRO do banco, numa chamada só. Puxar milhares de
-- pedidos para somar em JavaScript funciona no primeiro mês e trava no
-- primeiro ano — e o dono abre esta tela todo dia.
--
-- As datas são agrupadas no fuso do restaurante, não em UTC: senão o
-- movimento da noite cai no dia seguinte no relatório.
--
-- Padrão usado em todos os blocos: uma consulta interna faz o GROUP BY e
-- as somas; o JSON é montado por fora. Montar o objeto e agrupar por ele
-- é erro de SQL ("aggregate functions are not allowed in GROUP BY").
-- Rodar depois de 0001..0009.
-- =============================================================

create or replace function public.relatorio_vendas(
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_fuso   text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado jsonb;
begin
  with
  -- pedidos que contam como venda: fora cancelado e não pago
  vendas as (
    select p.*,
           (p.criado_em at time zone p_fuso) as momento_local
      from public.pedidos p
     where p.criado_em >= p_inicio
       and p.criado_em <  p_fim
       and p.status not in ('cancelado', 'aguardando_pagamento')
  ),
  itens as (
    select i.*, v.momento_local, pr.categoria_id
      from public.pedido_itens i
      join vendas v on v.id = i.pedido_id
      left join public.produtos pr on pr.id = i.produto_id
  ),
  -- para separar quem comprou pela primeira vez de quem voltou
  primeira_compra as (
    select cliente_id, min(criado_em) as quando
      from public.pedidos
     where status not in ('cancelado', 'aguardando_pagamento')
       and cliente_id is not null
     group by cliente_id
  )
  select jsonb_build_object(

    'resumo', (
      select jsonb_build_object(
        'faturamento',   coalesce(sum(total_centavos), 0),
        'pedidos',       count(*),
        'ticket_medio',  case when count(*) = 0 then 0
                              else round(coalesce(sum(total_centavos), 0)::numeric / count(*)) end,
        'descontos',     coalesce(sum(desconto_centavos), 0),
        'taxas_entrega', coalesce(sum(entrega_taxa_centavos), 0),
        'itens',         coalesce((select sum(quantidade) from itens), 0),
        'clientes',      count(distinct cliente_id),
        'cancelados',    (select count(*) from public.pedidos
                           where criado_em >= p_inicio and criado_em < p_fim
                             and status = 'cancelado'),
        'nao_pagos',     (select count(*) from public.pedidos
                           where criado_em >= p_inicio and criado_em < p_fim
                             and status = 'aguardando_pagamento')
      ) from vendas
    ),

    'por_dia', coalesce((
      select jsonb_agg(
               jsonb_build_object('dia', dia, 'rotulo', rotulo,
                                  'pedidos', pedidos, 'total', total)
               order by dia
             )
        from (
          select to_char(momento_local, 'YYYY-MM-DD') as dia,
                 to_char(momento_local, 'DD/MM')      as rotulo,
                 count(*)                             as pedidos,
                 sum(total_centavos)                  as total
            from vendas
           group by 1, 2
        ) g
    ), '[]'::jsonb),

    -- em que hora do dia o movimento acontece: serve para montar escala
    'por_hora', coalesce((
      select jsonb_agg(
               jsonb_build_object('hora', hora, 'pedidos', pedidos, 'total', total)
               order by hora
             )
        from (
          select extract(hour from momento_local)::int as hora,
                 count(*)                              as pedidos,
                 sum(total_centavos)                   as total
            from vendas
           group by 1
        ) g
    ), '[]'::jsonb),

    'por_dia_semana', coalesce((
      select jsonb_agg(
               jsonb_build_object('dia_semana', dia_semana,
                                  'pedidos', pedidos, 'total', total)
               order by dia_semana
             )
        from (
          select extract(dow from momento_local)::int as dia_semana,
                 count(*)                             as pedidos,
                 sum(total_centavos)                  as total
            from vendas
           group by 1
        ) g
    ), '[]'::jsonb),

    'produtos', coalesce((
      select jsonb_agg(
               jsonb_build_object('nome', nome, 'quantidade', quantidade, 'total', total)
               order by total desc
             )
        from (
          select produto_nome        as nome,
                 sum(quantidade)     as quantidade,
                 sum(total_centavos) as total
            from itens
           group by produto_nome
        ) g
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(
               jsonb_build_object('nome', nome, 'quantidade', quantidade, 'total', total)
               order by total desc
             )
        from (
          select coalesce(c.nome, 'Sem categoria') as nome,
                 sum(i.quantidade)                 as quantidade,
                 sum(i.total_centavos)             as total
            from itens i
            left join public.categorias c on c.id = i.categoria_id
           group by c.nome
        ) g
    ), '[]'::jsonb),

    'por_tipo', coalesce((
      select jsonb_agg(
               jsonb_build_object('tipo', tipo, 'pedidos', pedidos,
                                  'total', total, 'ticket', ticket)
               order by total desc
             )
        from (
          select tipo_entrega        as tipo,
                 count(*)            as pedidos,
                 sum(total_centavos) as total,
                 round(sum(total_centavos)::numeric / count(*)) as ticket
            from vendas
           group by tipo_entrega
        ) g
    ), '[]'::jsonb),

    'por_pagamento', coalesce((
      select jsonb_agg(
               jsonb_build_object('forma', forma, 'metodo', metodo,
                                  'pedidos', pedidos, 'total', total)
               order by total desc
             )
        from (
          select forma_pagamento                 as forma,
                 coalesce(metodo_pagamento, '-') as metodo,
                 count(*)                        as pedidos,
                 sum(total_centavos)             as total
            from vendas
           group by forma_pagamento, metodo_pagamento
        ) g
    ), '[]'::jsonb),

    'cupons', coalesce((
      select jsonb_agg(
               jsonb_build_object('codigo', codigo, 'usos', usos,
                                  'desconto', desconto, 'vendeu', vendeu)
               order by desconto desc
             )
        from (
          select cupom_codigo            as codigo,
                 count(*)                as usos,
                 sum(desconto_centavos)  as desconto,
                 sum(total_centavos)     as vendeu
            from vendas
           where cupom_codigo is not null
           group by cupom_codigo
        ) g
    ), '[]'::jsonb),

    'bairros', coalesce((
      select jsonb_agg(
               jsonb_build_object('bairro', bairro, 'pedidos', pedidos,
                                  'total', total, 'taxas', taxas)
               order by total desc
             )
        from (
          select endereco_bairro             as bairro,
                 count(*)                    as pedidos,
                 sum(total_centavos)         as total,
                 sum(entrega_taxa_centavos)  as taxas
            from vendas
           where tipo_entrega = 'entrega' and endereco_bairro is not null
           group by endereco_bairro
        ) g
    ), '[]'::jsonb),

    'mesas', coalesce((
      select jsonb_agg(
               jsonb_build_object('mesa', mesa, 'pedidos', pedidos, 'total', total)
               order by total desc
             )
        from (
          select mesa_numero         as mesa,
                 count(*)            as pedidos,
                 sum(total_centavos) as total
            from vendas
           where mesa_numero is not null
           group by mesa_numero
        ) g
    ), '[]'::jsonb),

    -- cliente novo é quem fez a primeira compra da vida dentro do período
    'clientes', coalesce((
      select jsonb_build_object(
        'novos',       count(*) filter (where pc.quando >= p_inicio and pc.quando < p_fim),
        'recorrentes', count(*) filter (where pc.quando <  p_inicio)
      )
      from (select distinct cliente_id from vendas where cliente_id is not null) v
      join primeira_compra pc on pc.cliente_id = v.cliente_id
    ), jsonb_build_object('novos', 0, 'recorrentes', 0))

  ) into resultado;

  return resultado;
end;
$$;

comment on function public.relatorio_vendas is
  'Todos os números de venda de um período, somados no banco e no fuso da loja.';
