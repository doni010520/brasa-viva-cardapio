"use server";

import { revalidatePath } from "next/cache";
import { buscarConfiguracoes } from "@/lib/dados";
import { consumirCupom } from "@/lib/cupons";
import {
  consultarPagamento,
  mercadoPagoConfigurado,
  urlBase,
} from "@/lib/mercadopago";
import { criarClienteAdmin } from "@/lib/supabase/server";
import { avisarPedidoConfirmado } from "@/lib/whatsapp";
import type { Pedido } from "@/lib/types";

/**
 * "Já paguei, e agora?" — pergunta o status direto ao Mercado Pago.
 *
 * O webhook é o caminho normal, mas ele pode atrasar, e em ambiente local
 * nem chega. Este botão tira o cliente da incerteza sem depender disso.
 */
export async function verificarPagamentoAction(
  pedidoId: string,
): Promise<{ pago: boolean; mensagem: string }> {
  if (!mercadoPagoConfigurado()) {
    return { pago: false, mensagem: "Pagamento online não configurado." };
  }

  const supabase = criarClienteAdmin();
  const { data } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!data) return { pago: false, mensagem: "Pedido não encontrado." };

  const pedido = data as Pedido;
  if (pedido.status_pagamento === "pago") {
    return { pago: true, mensagem: "Pagamento confirmado!" };
  }
  if (!pedido.mp_payment_id) {
    return {
      pago: false,
      mensagem: "Ainda não há pagamento iniciado para este pedido.",
    };
  }

  let pagamento;
  try {
    pagamento = await consultarPagamento(pedido.mp_payment_id);
  } catch (erro) {
    console.error("[verificar] falha ao consultar o Mercado Pago", erro);
    return {
      pago: false,
      mensagem: "Não consegui consultar agora. Tente em instantes.",
    };
  }

  if (!pagamento) {
    return {
      pago: false,
      mensagem: "Pagamento não encontrado no Mercado Pago.",
    };
  }

  if (!pagamento.aprovado) {
    const emAberto = ["pending", "in_process"].includes(pagamento.status);
    return {
      pago: false,
      mensagem: emAberto
        ? "Ainda não caiu. Se você acabou de pagar, aguarde alguns segundos."
        : "O pagamento não foi aprovado. Tente outra forma.",
    };
  }

  // mesma trava do webhook: valor pago tem de cobrir o pedido
  if (pagamento.valorCentavos < pedido.total_centavos) {
    console.error(
      `[verificar] valor divergente no pedido ${pedido.id}: pago ${pagamento.valorCentavos}, devido ${pedido.total_centavos}`,
    );
    return {
      pago: false,
      mensagem: "O valor pago não confere. Fale com o restaurante.",
    };
  }

  await supabase
    .from("pedidos")
    .update({
      status_pagamento: "pago",
      status:
        pedido.status === "aguardando_pagamento" ? "recebido" : pedido.status,
    })
    .eq("id", pedido.id);

  await supabase.from("pedido_eventos").insert({
    pedido_id: pedido.id,
    de: pedido.status,
    para: "recebido",
    origem: "sistema",
  });

  await consumirCupom(pedido.cupom_codigo);

  try {
    const config = await buscarConfiguracoes();
    const base = await urlBase();
    await avisarPedidoConfirmado(pedido, config.nome, `${base}/pedido/${pedido.id}`);
  } catch (erro) {
    console.warn("[verificar] não consegui avisar no WhatsApp", erro);
  }

  revalidatePath(`/pedido/${pedido.id}`);
  revalidatePath("/admin");
  return {
    pago: true,
    mensagem: "Pagamento confirmado! Seu pedido entrou na fila.",
  };
}
