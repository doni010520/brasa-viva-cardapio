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
  // entrega
  aceita_retirada: boolean
  aceita_entrega: boolean
  tempo_entrega_min: number
  entrega_gratis_acima_centavos: number | null
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
export type TipoEntrega = 'retirada' | 'entrega'

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

/** O rótulo do fim muda conforme o pedido é retirada ou entrega. */
export function rotuloStatus(status: StatusPedido, tipo: TipoEntrega = 'retirada') {
  const entrega = tipo === 'entrega'
  const mapa: Record<StatusPedido, string> = {
    aguardando_pagamento: 'Aguardando pagamento',
    recebido: 'Pedido recebido',
    em_preparo: 'Em preparo',
    pronto: entrega ? 'Pronto, aguardando entregador' : 'Pronto para retirada',
    saiu_para_entrega: 'Saiu para entrega',
    retirado: entrega ? 'Entregue' : 'Retirado',
    cancelado: 'Cancelado',
  }
  return mapa[status]
}
