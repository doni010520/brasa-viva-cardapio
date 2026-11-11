-- =============================================================
-- NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65).
--
-- Emissão DIRETA na SEFAZ-BA, sem provedor no meio. O que é segredo
-- (certificado A1, senha e CSC) fica no ambiente do servidor, nunca
-- aqui: a tabela configuracoes é lida pelo cardápio público.
--
-- Rodar depois de 0001..0028.
-- =============================================================

-- -------------------------------------------------------------
-- Dados fiscais da casa (saem no XML e no DANFE impresso)
-- -------------------------------------------------------------
alter table public.configuracoes
  add column if not exists razao_social        text,
  add column if not exists inscricao_estadual  text,
  -- 1 = Simples Nacional, 2 = Simples excesso de sublimite, 3 = Regime normal, 4 = MEI
  add column if not exists crt                 int  not null default 1 check (crt between 1 and 4),
  add column if not exists fiscal_logradouro   text,
  add column if not exists fiscal_numero       text,
  add column if not exists fiscal_complemento  text,
  add column if not exists fiscal_bairro       text,
  add column if not exists fiscal_cep          text,
  add column if not exists fiscal_municipio_ibge text not null default '2910057',  -- Dias d'Ávila
  add column if not exists fiscal_municipio    text not null default 'Dias d''Avila',
  add column if not exists fiscal_uf           text not null default 'BA',
  -- emissão
  add column if not exists nfce_ativa          boolean not null default false,
  -- 2 = homologação (teste, sem valor fiscal), 1 = produção
  add column if not exists nfce_ambiente       int  not null default 2 check (nfce_ambiente in (1, 2)),
  add column if not exists nfce_serie          int  not null default 1 check (nfce_serie between 1 and 889),
  -- valem para produto sem regra própria; quem define é a contabilidade
  add column if not exists nfce_ncm_padrao     text not null default '21069090',
  add column if not exists nfce_cfop_padrao    text not null default '5102',
  add column if not exists nfce_csosn_padrao   text not null default '102';

-- -------------------------------------------------------------
-- Regra fiscal por produto (bebida costuma ter NCM e ST diferentes)
-- -------------------------------------------------------------
alter table public.produtos
  add column if not exists ncm   text,
  add column if not exists cfop  text,
  add column if not exists csosn text,
  -- obrigatório quando o item tem substituição tributária (CSOSN 500)
  add column if not exists cest  text;

-- -------------------------------------------------------------
-- Notas emitidas
-- -------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos(id) on delete restrict,
  modelo             int  not null default 65,
  serie              int  not null,
  numero             int  not null,
  ambiente           int  not null check (ambiente in (1, 2)),
  chave              text not null,
  status             text not null default 'processando'
                          check (status in ('processando', 'autorizada', 'rejeitada', 'cancelada', 'erro')),
  cstat              text,
  motivo             text,
  protocolo          text,
  valor_centavos     int  not null,
  cpf_consumidor     text,
  -- XML assinado enviado; depois de autorizada vira o nfeProc (nota + protocolo)
  xml                text,
  qrcode             text,
  -- cancelamento (evento 110111, até 30 min depois de autorizada)
  protocolo_cancelamento text,
  justificativa_cancelamento text,
  xml_cancelamento   text,
  criado_em          timestamptz not null default now(),
  autorizada_em      timestamptz,
  cancelada_em       timestamptz
);

-- número é único por série e ambiente; a chave também
create unique index if not exists notas_fiscais_numero_idx
  on public.notas_fiscais (modelo, serie, ambiente, numero);
create unique index if not exists notas_fiscais_chave_idx on public.notas_fiscais (chave);
create index if not exists notas_fiscais_pedido_idx on public.notas_fiscais (pedido_id, criado_em desc);
-- no máximo UMA nota válida por pedido
create unique index if not exists notas_fiscais_uma_autorizada_idx
  on public.notas_fiscais (pedido_id) where status in ('processando', 'autorizada');

alter table public.notas_fiscais enable row level security;

drop policy if exists "admin le notas" on public.notas_fiscais;
create policy "admin le notas" on public.notas_fiscais
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- -------------------------------------------------------------
-- Numeração: contador por série e ambiente, sem buraco por corrida.
-- Número pulado vira obrigação de inutilizar na SEFAZ, então quem pega
-- número é só esta função (UPDATE ... RETURNING trava a linha).
-- -------------------------------------------------------------
create table if not exists public.nfce_numeracao (
  serie     int not null,
  ambiente  int not null,
  ultimo    int not null default 0,
  primary key (serie, ambiente)
);

alter table public.nfce_numeracao enable row level security;
-- sem policy: só o servidor (service role) mexe

create or replace function public.proximo_numero_nfce(p_serie int, p_ambiente int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.nfce_numeracao (serie, ambiente, ultimo)
  values (p_serie, p_ambiente, 0)
  on conflict (serie, ambiente) do nothing;

  update public.nfce_numeracao
     set ultimo = ultimo + 1
   where serie = p_serie and ambiente = p_ambiente
  returning ultimo into n;

  return n;
end;
$$;

revoke all on function public.proximo_numero_nfce(int, int) from public, anon, authenticated;
