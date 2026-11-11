'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, Printer, Receipt } from 'lucide-react'
import {
  cancelarNfceAction,
  emitirNfceAction,
  reimprimirNfceAction,
} from '@/app/admin/(painel)/nfce-acoes'
import { Botao, Campo, Selecao } from '@/components/ui'
import type { Pedido } from '@/lib/types'

/**
 * NFC-e dentro do cartão do pedido.
 *
 * Pedido pago online já sabe a forma de pagamento; pago no balcão, quem
 * emite escolhe (e, no dinheiro, pode informar o valor recebido pro troco
 * sair na nota). CPF é opcional — só se o cliente pedir "CPF na nota".
 */

// espelha FORMAS_PAGAMENTO de lib/nfce/xml (que não pode vir pro navegador)
const FORMAS = [
  { codigo: '01', rotulo: 'Dinheiro' },
  { codigo: '20', rotulo: 'Pix (chave / QR da loja)' },
  { codigo: '03', rotulo: 'Cartão de crédito' },
  { codigo: '04', rotulo: 'Cartão de débito' },
] as const

const CANCELA_ATE_MIN = 30

function mascaraCpf(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function NotaFiscalPedido({ pedido }: { pedido: Pedido }) {
  const router = useRouter()
  const [enviando, enviar] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [cpf, setCpf] = useState(pedido.cliente_cpf ? mascaraCpf(pedido.cliente_cpf) : '')
  const [forma, setForma] = useState('')
  const [recebido, setRecebido] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const notas = pedido.notas ?? []
  const valida = notas.find((n) => n.status === 'autorizada')
  // a numeração é reaproveitada: no máximo uma nota "em aberto" por pedido
  const ultima =
    notas.find((n) => n.status === 'rejeitada' || n.status === 'erro' || n.status === 'processando') ??
    notas.find((n) => n.status === 'cancelada')
  const pagoOnline = pedido.forma_pagamento === 'online'

  function emitir() {
    setErro('')
    setAviso('')
    if (!pagoOnline && !forma) {
      setErro('Escolha como o cliente pagou.')
      return
    }
    const centavos = recebido ? Math.round(Number(recebido.replace(/\./g, '').replace(',', '.')) * 100) : undefined
    enviar(async () => {
      const r = await emitirNfceAction({
        pedidoId: pedido.id,
        cpf,
        pagamento: pagoOnline ? undefined : (forma as (typeof FORMAS)[number]['codigo']),
        valorPagoCentavos: forma === '01' && centavos && !Number.isNaN(centavos) ? centavos : undefined,
      })
      if (!r.ok) setErro(r.erro)
      else {
        setAviso(r.mensagem ?? 'Nota autorizada.')
        setAberto(false)
      }
      router.refresh()
    })
  }

  function reimprimir() {
    setErro('')
    enviar(async () => {
      const r = await reimprimirNfceAction(pedido.id)
      if (!r.ok) setErro(r.erro)
      else setAviso('DANFE enviado para a impressora.')
    })
  }

  function cancelar() {
    if (!valida) return
    const justificativa = window.prompt(
      'Motivo do cancelamento (mínimo 15 letras). Ex.: "Cliente desistiu do pedido após a emissão"'
    )
    if (!justificativa) return
    setErro('')
    enviar(async () => {
      const r = await cancelarNfceAction(valida.id, justificativa)
      if (!r.ok) setErro(r.erro)
      else setAviso(r.mensagem ?? 'Nota cancelada.')
      router.refresh()
    })
  }

  // ---- já tem nota válida
  if (valida) {
    return (
      <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 font-semibold">
            <Receipt className="h-3.5 w-3.5" />
            NFC-e nº {valida.numero}
            {valida.ambiente === 2 && ' (teste)'}
          </span>
          <button onClick={reimprimir} disabled={enviando} className="flex items-center gap-1 font-medium hover:underline disabled:opacity-50">
            <Printer className="h-3.5 w-3.5" />
            DANFE
          </button>
          {/* a SEFAZ só aceita cancelar NFC-e até 30 min depois; depois disso ela mesma recusa */}
          <button
            onClick={cancelar}
            disabled={enviando}
            title={`Cancelamento só é aceito até ${CANCELA_ATE_MIN} min depois da autorização`}
            className="flex items-center gap-1 font-medium text-marca-600 hover:underline disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Cancelar nota
          </button>
          {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
        {aviso && <p className="mt-1">{aviso}</p>}
        {erro && <p className="mt-1 text-marca-600">{erro}</p>}
      </div>
    )
  }

  // ---- sem nota (ou a última falhou)
  return (
    <div className="mt-2 text-xs">
      {ultima && ultima.status === 'cancelada' && (
        <p className="mb-1 text-tinta-500">NFC-e nº {ultima.numero} cancelada.</p>
      )}
      {ultima?.status === 'processando' && (
        <p className="mb-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
          NFC-e nº {ultima.numero} ficou sem resposta da SEFAZ. Toque em tentar de novo: eu confiro antes de reenviar.
        </p>
      )}
      {ultima && (ultima.status === 'rejeitada' || ultima.status === 'erro') && (
        <p className="mb-1 rounded-lg bg-marca-50 px-2 py-1 text-marca-600">
          Nota não saiu{ultima.cstat ? ` (${ultima.cstat})` : ''}: {ultima.motivo ?? 'sem resposta da SEFAZ'}
        </p>
      )}

      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="flex items-center gap-1 font-medium text-tinta-600 hover:underline"
          title="Emite a NFC-e deste pedido na SEFAZ-BA"
        >
          <Receipt className="h-3.5 w-3.5" />
          {ultima && ultima.status !== 'cancelada' ? 'Tentar emitir de novo' : 'Emitir NFC-e'}
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-tinta-200 bg-white p-2">
          <Campo
            inputMode="numeric"
            placeholder="CPF na nota (opcional)"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
          />
          {!pagoOnline && (
            <Selecao value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="">Como o cliente pagou?</option>
              {FORMAS.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.rotulo}
                </option>
              ))}
            </Selecao>
          )}
          {forma === '01' && (
            <Campo
              inputMode="decimal"
              placeholder="Valor recebido (pro troco), ex.: 100,00"
              value={recebido}
              onChange={(e) => setRecebido(e.target.value.replace(/[^\d,.]/g, ''))}
            />
          )}
          <div className="flex gap-2">
            <Botao onClick={emitir} disabled={enviando} className="flex-1 py-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              Emitir
            </Botao>
            <Botao variante="fantasma" onClick={() => setAberto(false)} disabled={enviando} className="py-2">
              Fechar
            </Botao>
          </div>
        </div>
      )}
      {aviso && <p className="mt-1 text-emerald-700">{aviso}</p>}
      {erro && <p className="mt-1 text-marca-600">{erro}</p>}
    </div>
  )
}
