-- Volta atrás no login do cliente.
--
-- A decisão foi de negócio: nada de conta, nada de senha, nada de código no
-- WhatsApp. O que segura o histórico é o telefone, que agora é obrigatório no
-- checkout — e o gatilho da 0007 já monta a ficha do cliente a cada pedido.
--
-- Do lado do cliente, o histórico dele são os pedidos que o navegador guardou
-- (/meus-pedidos) mais a conversa de WhatsApp, onde cada confirmação deixou o
-- link do pedido. Do lado do dono, é a tela /admin/clientes, que continua
-- inteira: quem comprou, o quê, quando, há quanto tempo não volta, aniversário.
--
-- As tabelas de login saem de cena: banco não guarda o que não usa, e código
-- de acesso parado é superfície de ataque à toa.

drop function if exists public.limpa_acessos_vencidos();
drop table if exists public.sessoes_cliente;
drop table if exists public.codigos_acesso;
