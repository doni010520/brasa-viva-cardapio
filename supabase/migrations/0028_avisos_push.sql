-- Avisos de pedido direto na tela do celular (Web Push).
--
-- Por que isto existe: hoje o "seu pedido está pronto" só sai pelo WhatsApp,
-- que depende da uazapi estar conectada, do número estar certo e da mensagem
-- não cair no meio de trinta conversas. O push chega no aparelho pelo próprio
-- navegador, de graça, e aparece como aviso de app — inclusive com a tela
-- bloqueada.
--
-- O que é uma "inscrição": quando o cliente toca em "me avise", o navegador
-- dele devolve um endereço secreto (o endpoint, no servidor do Google/Apple/
-- Mozilla) e duas chaves. Guardar isso é o que permite mandar o aviso depois.
-- Não é identidade e não é login: é um canal, e vale só para AQUELE aparelho
-- naquele navegador. A mesma pessoa no celular e no computador são duas linhas.
--
-- Nada aqui é dado sensível — mas o endpoint é o que faz o aviso tocar no
-- aparelho de alguém, então fica no mesmo cofre do login: RLS ligada e nenhuma
-- política, só o servidor encosta.

create table if not exists public.inscricoes_push (
  id          uuid primary key default gen_random_uuid(),

  -- endereço que o navegador do cliente deu para receber aviso; é a chave
  -- natural: reinscrever o mesmo aparelho tem que atualizar, não duplicar
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,

  -- Para quem mandar. O pedido é o motivo da inscrição ("me avise sobre ESTE
  -- almoço"); o cliente é o que faz o aviso continuar valendo nos próximos,
  -- sem precisar pedir de novo. Os dois podem ser nulos: quem pede sem se
  -- identificar ainda assim recebe o aviso do pedido que estava acompanhando.
  pedido_id   uuid references public.pedidos(id)  on delete set null,
  cliente_id  uuid references public.clientes(id) on delete cascade,

  -- só para o dono entender de onde veio quando algo não chegar
  navegador   text,

  criado_em       timestamptz not null default now(),
  ultimo_envio_em timestamptz,
  -- envio recusado em sequência: aparelho trocado, app desinstalado. A rotina
  -- de envio apaga sozinha quando o servidor de push diz que o canal morreu.
  falhas          int not null default 0
);

create index if not exists inscricoes_push_pedido_idx  on public.inscricoes_push (pedido_id);
create index if not exists inscricoes_push_cliente_idx on public.inscricoes_push (cliente_id);

alter table public.inscricoes_push enable row level security;
