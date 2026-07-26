-- Link mágico: entrar sem digitar nada.
--
-- Junto com a confirmação do pedido, o WhatsApp do cliente recebe um link
-- que já entra na conta dele. Quem recebeu a mensagem é dono do número —
-- essa é a mesma prova que o código de 6 dígitos dá, só que sem digitar.
--
-- Na prática o cliente nunca vê tela de login: pediu uma vez, clicou no link
-- da confirmação, e a sessão se renova sozinha a cada visita.

alter table public.codigos_acesso
  -- 'codigo' = os 6 dígitos digitados; 'link' = token longo do link mágico
  add column if not exists tipo text not null default 'codigo'
    check (tipo in ('codigo', 'link'));

-- Busca do link vai direto pelo hash do token, não pelo telefone.
create index if not exists codigos_acesso_hash_idx
  on public.codigos_acesso (codigo_hash)
  where tipo = 'link';

-- A faxina da 0014 apagava tudo com mais de 1 dia de vida, o que mataria um
-- link mágico ainda dentro da validade. Agora ela olha o vencimento, não a
-- data de nascimento.
create or replace function public.limpa_acessos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.codigos_acesso  where expira_em < now() - interval '1 day';
  delete from public.sessoes_cliente where expira_em < now();
$$;
