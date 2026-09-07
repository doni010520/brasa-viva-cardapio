"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buscarConfiguracoes } from "@/lib/dados";
import { consumirCupom } from "@/lib/cupons";
import { pushConfigurado, removerInscricao, salvarInscricao } from "@/lib/push";
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

/* ------------------------------------------------------------------ *
 * "Me avise quando ficar pronto"
 * ------------------------------------------------------------------ */

const esquemaInscricao = z.object({
  endpoint: z.string().trim().min(20).max(1000).startsWith("https://"),
  p256dh: z.string().trim().min(1).max(300),
  auth: z.string().trim().min(1).max(300),
});

/**
 * Liga os avisos deste pedido no aparelho de quem está olhando a tela.
 *
 * Quem pode: qualquer um com o link do pedido — o mesmo critério da página de
 * acompanhamento, que já mostra itens e endereço para quem tem o endereço.
 * O aviso não conta nada que a tela não conte, então não há o que proteger
 * além disso.
 */
export async function inscreverAvisosAction(
  pedidoId: string,
  inscricao: unknown,
): Promise<{ ok: boolean; erro?: string }> {
  if (!pushConfigurado()) {
    return { ok: false, erro: "Avisos não configurados nesta loja." };
  }

  const analise = esquemaInscricao.safeParse(inscricao);
  if (!analise.success) return { ok: false, erro: "Inscrição inválida." };

  const supabase = criarClienteAdmin();
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, cliente_id")
    .eq("id", pedidoId)
    .maybeSingle();

  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };

  const salvou = await salvarInscricao({
    inscricao: analise.data,
    pedidoId: pedido.id,
    // guardado junto: assim o PRÓXIMO pedido deste cliente já chega avisado,
    // sem ele precisar tocar em "me avise" de novo
    clienteId: pedido.cliente_id,
    navegador: (await headers()).get("user-agent"),
  });

  return salvou
    ? { ok: true }
    : { ok: false, erro: "Não consegui ligar os avisos agora." };
}

/** Desliga os avisos naquele aparelho. */
export async function cancelarAvisosAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const analise = z
    .string()
    .trim()
    .min(20)
    .max(1000)
    .startsWith("https://")
    .safeParse(endpoint);

  if (!analise.success) return { ok: false };
  return { ok: await removerInscricao(analise.data) };
}
