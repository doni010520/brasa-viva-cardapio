'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Printer, Trash2 } from 'lucide-react'
import {
  criarMesasEmLoteAction,
  excluirMesaAction,
  salvarMesaAction,
} from '@/app/admin/(painel)/mesas/acoes'
import { Botao, Campo, Cartao, Rotulo, Selo, Vazio } from '@/components/ui'
import type { Mesa } from '@/lib/types'

type MesaComQr = { mesa: Mesa; url: string; svg: string }

export function GestaoMesas({
  mesas,
  nomeLoja,
}: {
  mesas: MesaComQr[]
  nomeLoja: string
}) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)
  const [quantidade, setQuantidade] = useState('10')
  const [salvando, salvar] = useTransition()

  function criarLote() {
    setErro('')
    salvar(async () => {
      const resposta = await criarMesasEmLoteAction(Number(quantidade))
      if (!resposta.ok) setErro(resposta.erro)
      else {
        setCriando(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="sem-impressao mb-4 flex flex-wrap items-center gap-2">
        <Botao variante="fantasma" onClick={() => setCriando((v) => !v)}>
          <Plus className="h-4 w-4" />
          Criar mesas
        </Botao>
        <Botao onClick={() => window.print()} disabled={mesas.length === 0}>
          <Printer className="h-4 w-4" />
          Imprimir os cartazes
        </Botao>
      </div>

      {criando && (
        <Cartao className="sem-impressao mb-4 p-4">
          <Rotulo htmlFor="qtd">Quantas mesas o salão tem?</Rotulo>
          <div className="flex gap-2">
            <Campo
              id="qtd"
              type="number"
              min={1}
              max={100}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="max-w-32"
            />
            <Botao onClick={criarLote} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Botao>
          </div>
          <p className="mt-1 text-xs text-tinta-400">
            Numera de 1 em diante, pulando as que já existem.
          </p>
        </Cartao>
      )}

      {erro && (
        <p className="sem-impressao mb-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      {mesas.length === 0 ? (
        <div className="sem-impressao">
          <Vazio
            titulo="Nenhuma mesa cadastrada"
            descricao="Crie as mesas do salão para gerar os QR Codes."
          >
            <Botao onClick={() => setCriando(true)}>Criar mesas</Botao>
          </Vazio>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mesas.map((item) => (
            <CartazMesa
              key={item.mesa.id}
              item={item}
              nomeLoja={nomeLoja}
              onErro={setErro}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CartazMesa({
  item,
  nomeLoja,
  onErro,
}: {
  item: MesaComQr
  nomeLoja: string
  onErro: (m: string) => void
}) {
  const router = useRouter()
  const [apagando, apagar] = useTransition()
  const { mesa } = item

  function excluir() {
    if (!confirm(`Apagar a mesa ${mesa.numero}? O QR já impresso deixa de funcionar.`)) return
    apagar(async () => {
      const resposta = await excluirMesaAction(mesa.id)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  function alternar() {
    apagar(async () => {
      const resposta = await salvarMesaAction({
        id: mesa.id,
        numero: mesa.numero,
        apelido: mesa.apelido ?? undefined,
        ativa: !mesa.ativa,
        ordem: mesa.ordem,
      })
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  return (
    <Cartao className="break-inside-avoid overflow-hidden">
      {/* o que vai para o papel */}
      <div className="px-4 pt-4 text-center">
        <p className="text-xs font-semibold tracking-wide text-tinta-500 uppercase">
          {nomeLoja}
        </p>
        <p className="mt-1 text-3xl font-black text-tinta-900">
          Mesa {mesa.numero}
        </p>
        {mesa.apelido && <p className="text-sm text-tinta-500">{mesa.apelido}</p>}

        <div className="mx-auto mt-3 w-44 [&>svg]:h-44 [&>svg]:w-44">
          <div dangerouslySetInnerHTML={{ __html: item.svg }} />
        </div>

        <p className="mt-3 text-sm font-semibold text-tinta-900">
          Aponte a câmera e peça daqui mesmo
        </p>
        <p className="mb-4 text-xs text-tinta-400">Sem baixar aplicativo.</p>
      </div>

      {/* controles, que não vão para o papel */}
      <div className="sem-impressao flex items-center gap-2 border-t border-tinta-200 p-2.5">
        {!mesa.ativa && <Selo tom="ambar">Desligada</Selo>}
        <button
          onClick={alternar}
          disabled={apagando}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
        >
          {mesa.ativa ? 'desligar' : 'ligar'}
        </button>
        <button
          onClick={excluir}
          disabled={apagando}
          className="toque ml-auto rounded-lg text-tinta-400 hover:text-marca-600"
          aria-label={`Apagar mesa ${mesa.numero}`}
        >
          {apagando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>
    </Cartao>
  )
}
