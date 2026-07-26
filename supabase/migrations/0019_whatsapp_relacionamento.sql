-- O WhatsApp deixa de fechar pedido.
--
-- DECISÃO DE NEGÓCIO: pedido é sempre pelo site. É lá que o preço é conferido,
-- o pagamento acontece e o cliente vê o que está levando antes de confirmar.
-- O WhatsApp fica com o que ele faz melhor: avisar do pedido, tirar dúvida,
-- lembrar de quem sumiu, dar parabéns no aniversário — e mandar o link.
--
-- Some, então, tudo que existia para montar carrinho na conversa. Banco não
-- guarda o que não usa, e coluna órfã vira armadilha para quem mexer depois.

alter table public.conversas_whatsapp
  drop column if exists carrinho,
  drop column if exists tipo_entrega,
  drop column if exists bairro_id,
  drop column if exists endereco_rua,
  drop column if exists endereco_numero,
  drop column if exists endereco_complemento,
  drop column if exists endereco_referencia;

-- ------------------------------------------------------------ aniversário
-- Marca o ano do último parabéns. Sem isso, um cron que rodasse duas vezes no
-- mesmo dia mandaria dois parabéns para a mesma pessoa — e ninguém erra tanto
-- quanto quem manda mensagem repetida.
alter table public.clientes
  add column if not exists aniversario_avisado_ano int;

create index if not exists clientes_aniversario_pendente_idx
  on public.clientes (aniversario_avisado_ano)
  where data_nascimento is not null;

alter table public.configuracoes
  add column if not exists mensagem_aniversario text,
  -- cupom que vai junto do parabéns; opcional
  add column if not exists cupom_aniversario text;

update public.configuracoes
set mensagem_aniversario = coalesce(mensagem_aniversario,
  'Feliz aniversário, {nome}! 🎉' || chr(10) || chr(10) ||
  'A turma da {loja} deseja um dia daqueles. Se quiser comemorar com a gente, ' ||
  'é só pedir por aqui: {link}')
where id = 1;

comment on column public.configuracoes.mensagem_aniversario is
  'Aceita {nome}, {loja}, {link} e {cupom}. O sistema troca antes de enviar.';
