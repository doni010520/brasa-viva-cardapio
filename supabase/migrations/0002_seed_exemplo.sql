-- =============================================================
-- Cardápio inicial — Churrascaria Brasa Viva
-- Serve para o dono ver o sistema cheio no 1º acesso e ir ajustando.
-- Para zerar e começar do nada: delete from public.categorias;
-- (produtos e opções somem junto pelo cascade)
-- =============================================================

update public.configuracoes set
  nome              = 'Churrascaria Brasa Viva',
  descricao         = 'O Tradicional Churrasco Baiano. Peça pelo cardápio, pague e retire.',
  logo_url          = '/logo.jpg',
  cor_primaria      = '#e30613',
  telefone          = '(71) 99999-0000',
  whatsapp          = '5571999990000',
  endereco          = 'Informe o endereço da churrascaria no painel',
  tempo_preparo_min = 35,
  antecedencia_min  = 20
where id = 1;

do $$
declare
  cat_espetos     uuid;
  cat_pratos      uuid;
  cat_porcoes     uuid;
  cat_acomp       uuid;
  cat_bebidas     uuid;
  cat_sobremesas  uuid;
  prod  uuid;
  grupo uuid;
begin
  -- não duplica se já rodou
  if exists (select 1 from public.categorias) then
    raise notice 'Seed ignorado: já existem categorias cadastradas.';
    return;
  end if;

  insert into public.categorias (nome, descricao, ordem) values
    ('Espetos',        'No fogo na hora do pedido',            1) returning id into cat_espetos;
  insert into public.categorias (nome, descricao, ordem) values
    ('Pratos',         'Já vêm com os acompanhamentos da casa', 2) returning id into cat_pratos;
  insert into public.categorias (nome, descricao, ordem) values
    ('Porções',        'Para dividir',                          3) returning id into cat_porcoes;
  insert into public.categorias (nome, ordem) values
    ('Acompanhamentos', 4) returning id into cat_acomp;
  insert into public.categorias (nome, ordem) values
    ('Bebidas', 5) returning id into cat_bebidas;
  insert into public.categorias (nome, ordem) values
    ('Sobremesas', 6) returning id into cat_sobremesas;

  -- ---------------- Espetos ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, destaque, ordem)
    values (cat_espetos, 'Espeto de picanha',
            'Picanha na brasa, temperada só com sal grosso.', 2200, true, 1)
    returning id into prod;

  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Ponto da carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Mal passado', 0, 1),
    (grupo, 'Ao ponto',    0, 2),
    (grupo, 'Bem passado', 0, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_espetos, 'Espeto de alcatra', 'Corte macio, na medida do sal.', 1800, 2)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Ponto da carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Mal passado', 0, 1),
    (grupo, 'Ao ponto',    0, 2),
    (grupo, 'Bem passado', 0, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem) values
    (cat_espetos, 'Espeto de linguiça',        'Linguiça artesanal, bem tostada.',        1400, 3),
    (cat_espetos, 'Espeto de frango com bacon','Filé de frango enrolado no bacon.',       1600, 4),
    (cat_espetos, 'Espeto de coração',         'Coração de galinha no capricho.',         1500, 5),
    (cat_espetos, 'Espeto de queijo coalho',   'Com melaço de cana à parte.',             1200, 6);

  -- ---------------- Pratos ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, destaque, ordem)
    values (cat_pratos, 'Churrasco misto',
            'Picanha, linguiça e frango, com arroz, feijão tropeiro, farofa e vinagrete. Serve 1.',
            4900, true, 1)
    returning id into prod;

  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Ponto da carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Mal passado', 0, 1),
    (grupo, 'Ao ponto',    0, 2),
    (grupo, 'Bem passado', 0, 3);

  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Quer turbinar?', 0, 4, 2) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Farofa extra',        600, 1),
    (grupo, 'Vinagrete extra',     500, 2),
    (grupo, 'Mandioca frita',      900, 3),
    (grupo, 'Pão de alho (1 un.)', 800, 4);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, preco_promo_centavos, ordem)
    values (cat_pratos, 'Picanha na chapa',
            'Picanha fatiada na chapa com cebola, arroz, farofa e vinagrete. Serve 2 pessoas.',
            13900, 11900, 2)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Ponto da carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Mal passado', 0, 1),
    (grupo, 'Ao ponto',    0, 2),
    (grupo, 'Bem passado', 0, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_pratos, 'Costela no bafo',
            'Costela bovina assada por 6 horas, com mandioca e vinagrete. Serve 2 pessoas.',
            12900, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_pratos, 'Marmita executiva',
            'Carne do dia, arroz, feijão, farofa e salada. Sai rápido, feita na hora.', 2800, 4)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Escolha a carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Bife acebolado',   0, 1),
    (grupo, 'Frango grelhado',  0, 2),
    (grupo, 'Linguiça na brasa',0, 3),
    (grupo, 'Picanha fatiada', 900, 4);

  -- ---------------- Porções ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, destaque, ordem)
    values (cat_porcoes, 'Porção de picanha',
            '400g de picanha fatiada com farofa e vinagrete. Serve 2 a 3 pessoas.', 8900, true, 1)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Ponto da carne', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Mal passado', 0, 1),
    (grupo, 'Ao ponto',    0, 2),
    (grupo, 'Bem passado', 0, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem) values
    (cat_porcoes, 'Porção de linguiça',      'Linguiça artesanal fatiada, 400g.',    4500, 2),
    (cat_porcoes, 'Porção de mandioca frita','Crocante por fora, macia por dentro.', 3200, 3),
    (cat_porcoes, 'Porção de calabresa acebolada', null,                             3800, 4);

  -- ---------------- Acompanhamentos ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem) values
    (cat_acomp, 'Arroz branco',    'Porção individual.',              900, 1),
    (cat_acomp, 'Feijão tropeiro', 'Do jeito tradicional.',          1400, 2),
    (cat_acomp, 'Farofa da casa',  'Com bacon e ovos.',              1000, 3),
    (cat_acomp, 'Vinagrete',       'Fresquinho, feito todo dia.',     700, 4),
    (cat_acomp, 'Pão de alho',     'Unidade, na brasa.',              800, 5);

  -- ---------------- Bebidas ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_bebidas, 'Refrigerante lata 350ml', null, 700, 1)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Sabor', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Coca-Cola',      0, 1),
    (grupo, 'Coca-Cola Zero', 0, 2),
    (grupo, 'Guaraná',        0, 3),
    (grupo, 'Sprite',         0, 4);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_bebidas, 'Cerveja long neck 355ml', null, 1200, 2)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Marca', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Heineken', 300, 1),
    (grupo, 'Original', 200, 2),
    (grupo, 'Skol',       0, 3);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem)
    values (cat_bebidas, 'Suco natural 500ml', 'Laranja, caju, maracujá ou acerola.', 1300, 3)
    returning id into prod;
  insert into public.grupos_opcoes (produto_id, nome, min_escolhas, max_escolhas, ordem)
    values (prod, 'Sabor', 1, 1, 1) returning id into grupo;
  insert into public.opcoes (grupo_id, nome, preco_extra_centavos, ordem) values
    (grupo, 'Laranja',   0, 1),
    (grupo, 'Caju',      0, 2),
    (grupo, 'Maracujá',  0, 3),
    (grupo, 'Acerola',   0, 4);

  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem) values
    (cat_bebidas, 'Água de coco 300ml', null, 800, 4),
    (cat_bebidas, 'Água mineral 500ml', null, 400, 5);

  -- ---------------- Sobremesas ----------------
  insert into public.produtos (categoria_id, nome, descricao, preco_centavos, ordem) values
    (cat_sobremesas, 'Cocada baiana',     'Feita na casa, do jeito tradicional.', 900, 1),
    (cat_sobremesas, 'Pudim de leite',    'Fatia generosa.',                     1200, 2),
    (cat_sobremesas, 'Abacaxi na brasa',  'Com canela, sai quentinho.',          1000, 3);
end $$;

insert into public.cupons (codigo, tipo, valor, minimo_centavos, ativo)
values ('BRASA10', 'percentual', 10, 5000, true)
on conflict (codigo) do nothing;
