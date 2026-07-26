"use server";

import { conferirItens, type ItemEnviado } from "@/lib/montar-pedido";
import { criarPedido, type RespostaCheckout } from "@/lib/criar-pedido";
import { validarCupom } from "@/lib/cupons";
import { mesaAtual } from "@/lib/modo";

// Nada de reexportar o tipo daqui: em módulo "use server" todo export vira
// ação de servidor, e um tipo reexportado quebra em tempo de execução. Quem
// precisar do tipo importa de "@/lib/criar-pedido".

/** Confere um cupom sem criar pedido — usado no botão "Aplicar" do checkout. */
export async function conferirCupomAction(
  codigo: string,
  itens: ItemEnviado[],
): Promise<
  { ok: true; descontoCentavos: number; codigo: string } | { ok: false; erro: string }
> {
  const conferencia = await conferirItens(itens);
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro };

  const resultado = await validarCupom(codigo, conferencia.subtotalCentavos);
  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  return {
    ok: true,
    descontoCentavos: resultado.descontoCentavos,
    codigo: resultado.cupom.codigo,
  };
}

/**
 * Checkout do site. A regra de negócio toda mora em criarPedido(); aqui só
 * entra o que é do navegador: a mesa, que veio do QR Code no cookie.
 */
export async function criarPedidoAction(entrada: unknown): Promise<RespostaCheckout> {
  return criarPedido(entrada, { mesaNumero: await mesaAtual() });
}
