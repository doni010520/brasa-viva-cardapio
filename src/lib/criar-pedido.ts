import { z } from "zod";
import { buscarConfiguracoes, buscarHorarios } from "./dados";
import { consumirCupom, validarCupom } from "./cupons";
import { conferirItens, type ItemEnviado } from "./montar-pedido";
import { mercadoPagoConfigurado, urlBase } from "./mercadopago";
import { criarClienteAdmin } from "./supabase/server";
import { estadoDaLoja } from "./tempo";
import { apenasDigitos } from "./format";
import { avisarPedidoConfirmado } from "./whatsapp";
import type { Bairro } from "./types";

const esquemaItem = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().int().min(1).max(99),
  opcaoIds: z.array(z.string().uuid()).max(30),
  observacao: z.string().max(200).optional(),
});

const esquemaPedido = z.object({
  nome: z.string().trim().min(2, "Diga seu nome.").max(80),
  telefone: z.string().trim().min(10, "Telefone incompleto.").max(20),
  observacoes: z.string().trim().max(300).optional(),
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .max(120)
    .optional()
    .or(z.literal("")),
  cpf: z.string().trim().max(20).optional(),
  // opcional de propósito: serve para o brinde de aniversário, nunca trava a venda
  nascimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida.")
    .optional()
    .or(z.literal("")),
  formaPagamento: z.enum(["online", "local"]),
  tipoEntrega: z.enum(["local", "retirada", "entrega"]),
  retiradaPrevista: z.string().datetime().nullable().optional(),
  cupom: z.string().trim().max(30).optional(),
  itens: z.array(esquemaItem).min(1, "Seu carrinho está vazio.").max(60),
  // só usados quando tipoEntrega = 'entrega'
  bairroId: z.string().uuid().nullable().optional(),
  enderecoRua: z.string().trim().max(120).optional(),
  enderecoNumero: z.string().trim().max(20).optional(),
  enderecoComplemento: z.string().trim().max(80).optional(),
  enderecoReferencia: z.string().trim().max(120).optional(),
});

export type RespostaCheckout =
  | {
      ok: true;
      pedidoId: string;
      /** número curto que o cliente fala no balcão */
      numero: number;
      totalCentavos: number;
      destino: string;
      externo: boolean;
    }
  | { ok: false; erro: string };

/**
 * Cria um pedido. É o ÚNICO caminho que grava pedido no sistema: o checkout do
 * site e o agente de WhatsApp passam os dois por aqui, então as regras de
 * negócio (loja aberta, preço vindo do banco, entrega nunca paga na mão do
 * entregador) valem igual, venha o pedido de onde vier.
 *
 * A mesa entra por parâmetro em vez de sair do cookie: quem chama de fora do
 * navegador (o agente) não tem cookie nenhum.
 */
export async function criarPedido(
  entrada: unknown,
  opcoes: { mesaNumero?: string | null } = {},
): Promise<RespostaCheckout> {
  const analise = esquemaPedido.safeParse(entrada);
  if (!analise.success) {
    return {
      ok: false,
      erro: analise.error.issues[0]?.message ?? "Confira os dados do pedido.",
    };
  }
  const dados = analise.data;

  const [config, horarios] = await Promise.all([
    buscarConfiguracoes(),
    buscarHorarios(),
  ]);

  const loja = estadoDaLoja(config, horarios);
  if (!loja.aberta) {
    return {
      ok: false,
      erro: `Não dá para fechar o pedido agora. ${loja.motivo}`,
    };
  }

  if (apenasDigitos(dados.telefone).length < 10) {
    return { ok: false, erro: "Telefone inválido. Use DDD + número." };
  }

  // ---------------------------------------------------- onde vai comer
  const ehEntrega = dados.tipoEntrega === "entrega";
  const ehNoLocal = dados.tipoEntrega === "local";

  if (ehEntrega && !config.aceita_entrega) {
    return {
      ok: false,
      erro: "No momento não estamos entregando, só retirada.",
    };
  }
  if (dados.tipoEntrega === "retirada" && !config.aceita_retirada) {
    return {
      ok: false,
      erro: "No momento não estamos com retirada no balcão.",
    };
  }
  if (ehNoLocal && !config.aceita_consumo_local) {
    return { ok: false, erro: "No momento não estamos atendendo no salão." };
  }

  // Mesa vem do QR Code, nunca do formulário — o servidor confere se existe
  // e está ativa antes de carimbar a comanda.
  let mesa: { id: string; numero: string } | null = null;
  if (ehNoLocal) {
    const numeroMesa = opcoes.mesaNumero ?? null;
    if (numeroMesa) {
      const supabaseMesa = criarClienteAdmin();
      const { data } = await supabaseMesa
        .from("mesas")
        .select("id, numero")
        .eq("numero", numeroMesa)
        .eq("ativa", true)
        .maybeSingle();
      mesa = data ?? null;
    }
  }

  let bairro: Bairro | null = null;
  if (ehEntrega) {
    if (!dados.bairroId)
      return { ok: false, erro: "Escolha o bairro da entrega." };
    if (!dados.enderecoRua || !dados.enderecoNumero) {
      return { ok: false, erro: "Informe rua e número para a entrega." };
    }

    const supabase = criarClienteAdmin();
    const { data } = await supabase
      .from("bairros_entrega")
      .select("*")
      .eq("id", dados.bairroId)
      .eq("ativo", true)
      .maybeSingle();

    if (!data) return { ok: false, erro: "Ainda não entregamos nesse bairro." };
    bairro = data as Bairro;
  }

  // ---------------------------------------------------- forma de pagamento
  if (dados.formaPagamento === "online" && !config.aceita_pagamento_online) {
    return { ok: false, erro: "Pagamento online indisponível no momento." };
  }
  if (dados.formaPagamento === "local" && !config.aceita_pagamento_local) {
    return { ok: false, erro: "No momento só aceitamos pagamento online." };
  }

  // O entregador não recebe dinheiro. Quem quer pagar na hora, retira no balcão.
  // O checkout já esconde a opção; esta é a trava que vale, porque a de cima
  // é só interface e dá para contornar.
  if (dados.formaPagamento === "local" && ehEntrega) {
    return {
      ok: false,
      erro: "Pedido para entrega precisa ser pago pelo site. Dinheiro só na retirada no balcão.",
    };
  }
  if (dados.formaPagamento === "online" && !mercadoPagoConfigurado()) {
    return {
      ok: false,
      erro: "O pagamento online ainda não foi configurado. Escolha pagar na entrega/retirada.",
    };
  }

  // ------------------------------------------- preços saem do banco, não do navegador
  const conferencia = await conferirItens(dados.itens);
  if (!conferencia.ok) return { ok: false, erro: conferencia.erro };
  const { linhas, subtotalCentavos } = conferencia;

  if (subtotalCentavos < config.pedido_minimo_centavos) {
    const minimo = (config.pedido_minimo_centavos / 100)
      .toFixed(2)
      .replace(".", ",");
    return { ok: false, erro: `O pedido mínimo é R$ ${minimo}.` };
  }

  let descontoCentavos = 0;
  let cupomCodigo: string | null = null;
  if (dados.cupom) {
    const resultado = await validarCupom(dados.cupom, subtotalCentavos);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    descontoCentavos = resultado.descontoCentavos;
    cupomCodigo = resultado.cupom.codigo;
  }

  const taxaCentavos = bairro
    ? calcularTaxa(bairro, subtotalCentavos, config)
    : 0;
  const totalCentavos =
    Math.max(0, subtotalCentavos - descontoCentavos) + taxaCentavos;
  const pagoDepois = dados.formaPagamento === "local";

  // ------------------------------------------------------------- grava
  const supabase = criarClienteAdmin();
  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos")
    .insert({
      cliente_nome: dados.nome,
      cliente_telefone: dados.telefone,
      cliente_email: dados.email || null,
      cliente_cpf: dados.cpf ? dados.cpf.replace(/\D/g, "") : null,
      cliente_nascimento: dados.nascimento || null,
      mesa_id: mesa?.id ?? null,
      mesa_numero: mesa?.numero ?? null,
      observacoes: dados.observacoes || null,
      subtotal_centavos: subtotalCentavos,
      desconto_centavos: descontoCentavos,
      entrega_taxa_centavos: taxaCentavos,
      total_centavos: totalCentavos,
      cupom_codigo: cupomCodigo,
      forma_pagamento: dados.formaPagamento,
      status_pagamento: "pendente",
      status: pagoDepois ? "recebido" : "aguardando_pagamento",
      retirada_prevista: dados.retiradaPrevista ?? null,
      tipo_entrega: dados.tipoEntrega,
      bairro_id: bairro?.id ?? null,
      endereco_rua: ehEntrega ? dados.enderecoRua : null,
      endereco_numero: ehEntrega ? dados.enderecoNumero : null,
      endereco_complemento: ehEntrega
        ? dados.enderecoComplemento || null
        : null,
      endereco_bairro: bairro?.nome ?? null,
      endereco_referencia: ehEntrega ? dados.enderecoReferencia || null : null,
    })
    .select("*")
    .single();

  if (erroPedido || !pedido) {
    console.error("[checkout] falha ao gravar o pedido", erroPedido);
    return {
      ok: false,
      erro: "Não consegui registrar seu pedido. Tente de novo.",
    };
  }

  const { error: erroItens } = await supabase
    .from("pedido_itens")
    .insert(linhas.map((linha) => ({ ...linha, pedido_id: pedido.id })));

  if (erroItens) {
    // pedido sem itens é lixo no painel da cozinha
    await supabase.from("pedidos").delete().eq("id", pedido.id);
    return {
      ok: false,
      erro: "Não consegui registrar os itens. Tente de novo.",
    };
  }

  await supabase.from("pedido_eventos").insert({
    pedido_id: pedido.id,
    para: pagoDepois ? "recebido" : "aguardando_pagamento",
    origem: "sistema",
  });

  // ------------------------------------------------------------ segue o fluxo
  if (pagoDepois) {
    await consumirCupom(cupomCodigo);

    const base = await urlBase();
    // aviso é bônus: se o WhatsApp falhar, o pedido continua valendo
    await avisarPedidoConfirmado(pedido, config.nome, `${base}/pedido/${pedido.id}`);

    return {
      ok: true,
      pedidoId: pedido.id,
      numero: pedido.numero,
      totalCentavos: pedido.total_centavos,
      destino: `/pedido/${pedido.id}/obrigado`,
      externo: false,
    };
  }

  // Pagamento online: o pedido já existe como "aguardando_pagamento" e o cliente
  // segue para a tela de pagamento DENTRO do app (Pix, cartão ou boleto).
  return {
    ok: true,
    pedidoId: pedido.id,
    numero: pedido.numero,
    totalCentavos: pedido.total_centavos,
    destino: `/pedido/${pedido.id}/pagamento`,
    externo: false,
  };
}

/** Taxa do bairro, já considerando a isenção por valor do pedido. */
function calcularTaxa(
  bairro: Bairro,
  subtotalCentavos: number,
  config: { entrega_gratis_acima_centavos: number | null },
) {
  const isenta =
    config.entrega_gratis_acima_centavos !== null &&
    config.entrega_gratis_acima_centavos > 0 &&
    subtotalCentavos >= config.entrega_gratis_acima_centavos;

  return isenta ? 0 : bairro.taxa_centavos;
}
