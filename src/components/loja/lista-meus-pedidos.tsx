'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Loader2, LogOut, MessageCircle, Phone } from 'lucide-react'
import { buscarMeusPedidosAction } from '@/app/(loja)/meus-pedidos/acoes'
import { sairAction } from '@/app/(loja)/entrar/acoes'
import { DicaInstalar } from '@/components/loja/dica-instalar'
import { Botao, Cartao, Selo, Vazio } from '@/components/ui'
import { linkWhatsapp, mascaraTelefone, moeda } from '@/lib/format'
import type { SessaoCliente } from '@/lib/cliente-sessao'
import { dataHoraCurta } from '@/lib/tempo'
import { ROTULO_TIPO_ENTREGA, rotuloStatus, type Pedido } from '@/lib/types'

const CHAVE = 'cardapio:pedidos'

/** Pedidos ainda em andamento ficam em cima e com destaque. */
const EM_ANDAMENTO = ['aguardando_pagamento', 'recebido', 'em_preparo', 'pronto', 'saiu_para_entrega']

export function ListaMeusPedidos({
  whatsappLoja,
  telefoneLoja,
  nomeLoja,
  sessao,
}: {
  whatsappLoja: string | null
  telefoneLoja: string | null
  nomeLoja: string
  sessao: SessaoCliente | null
}) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      let ids: string[] = []
      try {
        ids = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
      } catch {
        ids = []
      }

      const encontrados = await buscarMeusPedidosAction(ids)
      if (!cancelado) setPedidos(encontrados)
    }

    carregar()
    // pedido em andamento muda de status; recarrega enquanto a tela estiver aberta
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') carregar()
    }, 20000)

    return () => {
      cancelado = true
      clearInterval(intervalo)
    }
  }, [sessao])

  if (pedidos === null) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-tinta-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Procurando seus pedidos...</span>
      </div>
    )
  }

  const andamento = pedidos.filter((p) => EM_ANDAMENTO.includes(p.status))
  const anteriores = pedidos.filter((p) => !EM_ANDAMENTO.includes(p.status))

  return (
    <div className="py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao cardápio
      </Link>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">Meus pedidos</h1>
      {sessao ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-500">
          <span>
            {sessao.nome ? (
              <>
                Entrou como <strong className="text-tinta-700">{sessao.nome}</strong>
              </>
            ) : (
              <>Entrou com {mascaraTelefone(sessao.telefone)}</>
            )}
          </span>
          <form action={sairAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1 font-medium text-tinta-500 underline underline-offset-2 hover:text-tinta-900"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-1 text-sm text-tinta-500">
          Os pedidos feitos neste aparelho. Entre com o WhatsApp para ver todos.
        </p>
      )}

      {pedidos.length === 0 ? (
        <div className="mt-6">
          <Vazio
            titulo="Nenhum pedido por aqui"
            descricao={
              sessao
                ? 'Ainda não há pedidos feitos com este WhatsApp.'
                : 'Quando você fizer um pedido, ele aparece nesta tela.'
            }
          >
            <Link href="/">
              <Botao>Ver cardápio</Botao>
            </Link>
          </Vazio>
        </div>
      ) : (
        <>
          {andamento.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold text-tinta-500">Em andamento</h2>
              <div className="space-y-2">
                {andamento.map((p) => (
                  <LinhaPedido key={p.id} pedido={p} destaque />
                ))}
              </div>
            </section>
          )}

          {anteriores.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-bold text-tinta-500">Pedidos anteriores</h2>
              <div className="space-y-2">
                {anteriores.map((p) => (
                  <LinhaPedido key={p.id} pedido={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Sem entrar, a lista é só o que este navegador lembra — trocou de
          celular ou limpou os dados, sumiu. É o convite mais importante da
          tela, então fica logo abaixo dos pedidos. */}
      {!sessao && (
        <Cartao className="border-marca/30 bg-marca/5 mt-6 p-4">
          <h2 className="font-bold text-tinta-900">Veja seus pedidos em qualquer celular</h2>
          <p className="mt-1 text-sm text-tinta-600">
            Entre com o seu WhatsApp e o histórico vai com você. Sem senha para inventar: a gente
            manda um código e pronto.
          </p>
          <Link href="/entrar" className="mt-3 inline-block">
            <Botao className="h-11">
              <MessageCircle className="h-4 w-4" />
              Entrar com o WhatsApp
            </Botao>
          </Link>
        </Cartao>
      )}

      {sessao && pedidos.length > 0 && <DicaInstalar />}

      <Cartao className="mt-4 p-4">
        <h2 className="font-bold text-tinta-900">Não achou seu pedido?</h2>
        <p className="mt-1 text-sm text-tinta-500">
          {sessao
            ? `Aqui aparece tudo que foi pedido com o seu WhatsApp. Se algum pedido saiu com outro número, fale com a gente que a gente acha.`
            : `Se você pediu de outro celular, entre com o seu WhatsApp aqui em cima. O link de cada pedido também foi para a sua conversa com a ${nomeLoja}.`}
        </p>
        {whatsappLoja && (
          <a
            href={linkWhatsapp(whatsappLoja, `Olá! Preciso de ajuda com um pedido na ${nomeLoja}.`)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block"
          >
            <Botao variante="fantasma">
              <MessageCircle className="h-4 w-4" />
              Abrir a conversa no WhatsApp
            </Botao>
          </a>
        )}
        {!whatsappLoja && telefoneLoja && (
          <p className="mt-3 flex items-center gap-2 text-sm text-tinta-600">
            <Phone className="h-4 w-4 shrink-0" />
            Ligue para {telefoneLoja}.
          </p>
        )}
      </Cartao>
    </div>
  )
}

function LinhaPedido({ pedido, destaque = false }: { pedido: Pedido; destaque?: boolean }) {
  const cancelado = pedido.status === 'cancelado'

  return (
    <Link href={`/pedido/${pedido.id}`} className="block">
      <Cartao
        className={`flex items-center gap-3 p-3.5 transition hover:border-tinta-300 ${
          destaque ? 'border-marca' : ''
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black tabular-nums ${
            destaque ? 'bg-marca text-white' : 'bg-tinta-100 text-tinta-500'
          }`}
        >
          {String(pedido.numero).padStart(3, '0')}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Selo tom={cancelado ? 'vermelho' : destaque ? 'ambar' : 'verde'}>
              {rotuloStatus(pedido.status, pedido.tipo_entrega)}
            </Selo>
            <span className="text-xs text-tinta-400">
              {ROTULO_TIPO_ENTREGA[pedido.tipo_entrega]}
            </span>
          </p>
          <p className="mt-0.5 truncate text-sm text-tinta-500">
            {(pedido.itens ?? []).map((i) => `${i.quantidade}x ${i.produto_nome}`).join(', ')}
          </p>
          <p className="text-xs text-tinta-400">{dataHoraCurta(pedido.criado_em)}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold text-tinta-900 tabular-nums">{moeda(pedido.total_centavos)}</p>
          <ChevronRight className="ml-auto h-4 w-4 text-tinta-300" />
        </div>
      </Cartao>
    </Link>
  )
}
