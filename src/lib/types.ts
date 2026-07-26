// Tipos do domínio. Dinheiro sempre em centavos (inteiro).

export type Categoria = {
  id: string
  nome: string
  descricao: string | null
  ordem: number
  ativo: boolean
}

export type Opcao = {
  id: string
  grupo_id: string
  nome: string
  preco_extra_centavos: number
  disponivel: boolean
  ordem: number
}

export type GrupoOpcoes = {
  id: string
  produto_id: string
  nome: string
  min_escolhas: number
  max_escolhas: number
  ordem: number
  opcoes: Opcao[]
}

export type Produto = {
  id: string
  categoria_id: string | null
  nome: string
  descricao: string | null
  preco_centavos: number
  preco_promo_centavos: number | null
  imagem_url: string | null
  disponivel: boolean
  destaque: boolean
  ordem: number
  /** 'ambos' | 'so_local' (buffet) | 'so_viagem' (marmita embalada) */
  modo_consumo: 'ambos' | 'so_local' | 'so_viagem'
  grupos_opcoes?: GrupoOpcoes[]
}

export type CategoriaComProdutos = Categoria & { produtos: Produto[] }

export type Configuracoes = {
  id: number
  nome: string
  descricao: string | null
  logo_url: string | null
  cor_primaria: string
  telefone: string | null
  whatsapp: string | null
  endereco: string | null
  aberto_manual: boolean
  tempo_preparo_min: number
  antecedencia_min: number
  pedido_minimo_centavos: number
  aceita_pagamento_online: boolean
  aceita_pagamento_local: boolean
  chave_pix: string | null
  // meios online, cada um ligado/desligado pelo dono
  aceita_pix: boolean
  aceita_cartao: boolean
  pix_expira_min: number
  foto_fachada_url: string | null
  // campanha pós-pagamento
  instagram_url: string | null
  campanha_ativa: boolean
  campanha_titulo: string | null
  campanha_texto: string | null
  campanha_botao: string | null
  campanha_emoji: string | null
  // relacionamento com o cliente
  pedir_aniversario: boolean
  brinde_aniversario: string | null
  // onde a casa atende
  aceita_consumo_local: boolean
  aceita_retirada: boolean
  aceita_entrega: boolean
  tempo_entrega_min: number
  entrega_gratis_acima_centavos: number | null
}

/**
 * O cliente não cria conta: o telefone é a identidade e o cadastro se monta
 * sozinho a cada pedido. Estes números são recalculados por gatilho no banco.
 */
export type Cliente = {
  id: string
  telefone: string
  nome: string
  email: string | null
  data_nascimento: string | null
  observacoes: string | null
  aceita_promocoes: boolean
  primeiro_pedido_em: string | null
  ultimo_pedido_em: string | null
  total_pedidos: number
  total_gasto_centavos: number
  criado_em: string
}

export type Mesa = {
  id: string
  numero: string
  apelido: string | null
  ativa: boolean
  ordem: number
}

export type Bairro = {
  id: string
  nome: string
  taxa_centavos: number
  tempo_min: number
  ativo: boolean
  ordem: number
}

export type Horario = {
  dia_semana: number
  fechado: boolean
  abre: string // 'HH:MM:SS'
  fecha: string
}

export type Cupom = {
  id: string
  codigo: string
  tipo: 'percentual' | 'fixo'
  valor: number
  minimo_centavos: number
  ativo: boolean
  validade: string | null
  usos_maximos: number | null
  usos: number
}

export const STATUS_PEDIDO = [
  'aguardando_pagamento',
  'recebido',
  'em_preparo',
  'pronto',
  'saiu_para_entrega',
  'retirado',
  'cancelado',
] as const

export type StatusPedido = (typeof STATUS_PEDIDO)[number]
export type StatusPagamento = 'pendente' | 'pago' | 'falhou' | 'estornado'
export type FormaPagamento = 'online' | 'local'

/** Onde o pedido vai ser consumido. */
export type TipoEntrega = 'local' | 'retirada' | 'entrega'

/**
 * A primeira pergunta do site: a pessoa está no salão ou vai levar?
 * Guardado em cookie, porque o cardápio muda conforme a resposta
 * (buffet livre só existe para quem está no restaurante).
 */
export type ModoConsumo = 'local' | 'viagem'
export const COOKIE_MODO = 'modo_consumo'

export type OpcaoEscolhida = {
  id: string // id da opção no banco — o servidor revalida o preço por aqui
  grupo: string
  nome: string
  preco_extra_centavos: number
}

export type PedidoItem = {
  id: string
  pedido_id: string
  produto_id: string | null
  produto_nome: string
  quantidade: number
  preco_unit_centavos: number
  opcoes: OpcaoEscolhida[]
  observacao: string | null
  total_centavos: number
}

export type Pedido = {
  id: string
  numero: number
  cliente_nome: string
  cliente_telefone: string
  observacoes: string | null
  subtotal_centavos: number
  desconto_centavos: number
  total_centavos: number
  cupom_codigo: string | null
  forma_pagamento: FormaPagamento
  status_pagamento: StatusPagamento
  status: StatusPedido
  retirada_prevista: string | null
  // quem pediu (cadastro montado pelo telefone) e de qual mesa
  cliente_id: string | null
  cliente_nascimento: string | null
  mesa_id: string | null
  mesa_numero: string | null
  // entrega
  tipo_entrega: TipoEntrega
  entrega_taxa_centavos: number
  bairro_id: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_referencia: string | null
  mp_preference_id: string | null
  mp_payment_id: string | null
  // pagamento por API
  cliente_email: string | null
  cliente_cpf: string | null
  metodo_pagamento: string | null
  pix_copia_cola: string | null
  pix_expira_em: string | null
  pagamento_detalhe: string | null
  criado_em: string
  atualizado_em: string
  itens?: PedidoItem[]
}

// ---- Carrinho (vive no localStorage do cliente) ----
export type ItemCarrinho = {
  linhaId: string // id da linha no carrinho (produto + combinação de opções)
  produtoId: string
  nome: string
  imagemUrl: string | null
  precoBaseCentavos: number
  opcoes: OpcaoEscolhida[]
  observacao: string
  quantidade: number
}

/** O rótulo do fim muda conforme o pedido é consumido no salão, retirado ou entregue. */
export function rotuloStatus(status: StatusPedido, tipo: TipoEntrega = 'retirada') {
  const entrega = tipo === 'entrega'
  const noLocal = tipo === 'local'

  const mapa: Record<StatusPedido, string> = {
    aguardando_pagamento: 'Aguardando pagamento',
    recebido: noLocal ? 'Pago, pode se servir' : 'Pedido recebido',
    em_preparo: 'Em preparo',
    pronto: entrega
      ? 'Pronto, aguardando entregador'
      : noLocal
        ? 'Pronto, pegue no balcão'
        : 'Pronto para retirada',
    saiu_para_entrega: 'Saiu para entrega',
    retirado: entrega ? 'Entregue' : noLocal ? 'Consumido' : 'Retirado',
    cancelado: 'Cancelado',
  }
  return mapa[status]
}

/** Como o modo de consumo aparece para o pessoal do balcão. */
export const ROTULO_TIPO_ENTREGA: Record<TipoEntrega, string> = {
  local: 'No salão',
  retirada: 'Retirada',
  entrega: 'Entrega',
}
