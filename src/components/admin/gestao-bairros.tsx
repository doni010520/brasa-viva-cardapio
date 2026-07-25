'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bike, Loader2, Plus, Trash2 } from 'lucide-react'
import { excluirBairroAction, salvarBairroAction } from '@/app/admin/(painel)/config/acoes'
import { Botao, Campo, Cartao, Rotulo, Selo } from '@/components/ui'
import { centavosParaInput, moeda, paraCentavos } from '@/lib/format'
import type { Bairro } from '@/lib/types'

export function GestaoBairros({ bairros }: { bairros: Bairro[] }) {
  const [editando, setEditando] = useState<Bairro | 'novo' | null>(null)
  const [erro, setErro] = useState('')

  return (
    <Cartao className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-tinta-900">
            <Bike className="h-4 w-4" />
            Bairros e taxas de entrega
          </h2>
          <p className="text-xs text-tinta-500">
            O cliente só consegue pedir entrega para os bairros desta lista.
          </p>
        </div>
        <Botao type="button" variante="fantasma" onClick={() => setEditando('novo')}>
          <Plus className="h-4 w-4" />
          Bairro
        </Botao>
      </div>

      {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}

      {bairros.length === 0 ? (
        <p className="rounded-xl border border-dashed border-tinta-300 px-4 py-6 text-center text-sm text-tinta-400">
          Nenhum bairro cadastrado. Sem isso, a entrega não aparece no checkout.
        </p>
      ) : (
        <ul className="space-y-2">
          {bairros.map((bairro) => (
            <LinhaBairro
              key={bairro.id}
              bairro={bairro}
              onEditar={() => setEditando(bairro)}
              onErro={setErro}
            />
          ))}
        </ul>
      )}

      {editando && (
        <ModalBairro
          bairro={editando === 'novo' ? null : editando}
          ordemSugerida={bairros.length + 1}
          onFechar={() => setEditando(null)}
        />
      )}
    </Cartao>
  )
}

function LinhaBairro({
  bairro,
  onEditar,
  onErro,
}: {
  bairro: Bairro
  onEditar: () => void
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [apagando, apagar] = useTransition()

  function excluir() {
    if (!confirm(`Parar de entregar em ${bairro.nome}?`)) return
    apagar(async () => {
      const resposta = await excluirBairroAction(bairro.id)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-2 rounded-xl bg-tinta-50 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-tinta-900">
          {bairro.nome}
          {!bairro.ativo && (
            <Selo tom="neutro" className="ml-2">
              Desligado
            </Selo>
          )}
        </span>
        <span className="block text-xs text-tinta-500">
          {bairro.taxa_centavos === 0 ? 'Entrega grátis' : moeda(bairro.taxa_centavos)} ·{' '}
          {bairro.tempo_min} min
        </span>
      </span>

      <button
        type="button"
        onClick={onEditar}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-tinta-500 hover:bg-tinta-200"
      >
        editar
      </button>
      <button
        type="button"
        onClick={excluir}
        disabled={apagando}
        className="toque rounded-lg text-tinta-400 hover:text-marca-600"
        aria-label={`Apagar ${bairro.nome}`}
      >
        {apagando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </li>
  )
}

function ModalBairro({
  bairro,
  ordemSugerida,
  onFechar,
}: {
  bairro: Bairro | null
  ordemSugerida: number
  onFechar: () => void
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState(bairro?.nome ?? '')
  const [taxa, setTaxa] = useState(centavosParaInput(bairro?.taxa_centavos ?? 0))
  const [tempo, setTempo] = useState(String(bairro?.tempo_min ?? 45))
  const [ordem, setOrdem] = useState(String(bairro?.ordem ?? ordemSugerida))
  const [ativo, setAtivo] = useState(bairro?.ativo ?? true)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    evento.stopPropagation()
    setErro('')
    salvar(async () => {
      const resposta = await salvarBairroAction({
        id: bairro?.id,
        nome,
        taxa_centavos: paraCentavos(taxa || '0'),
        tempo_min: tempo,
        ativo,
        ordem,
      })
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      router.refresh()
      onFechar()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anima-entrada w-full max-w-sm rounded-2xl bg-white p-5"
      >
        <h2 className="mb-4 text-lg font-bold text-tinta-900">
          {bairro ? 'Editar bairro' : 'Novo bairro'}
        </h2>

        {/* form próprio: este bloco vive dentro da página de configurações,
            que já tem outros formulários — não pode aninhar <form> */}
        <div className="space-y-3">
          <div>
            <Rotulo htmlFor="bairro-nome">Bairro</Rotulo>
            <Campo
              id="bairro-nome"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Boa Viagem"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Rotulo htmlFor="bairro-taxa">Taxa (R$)</Rotulo>
              <Campo
                id="bairro-taxa"
                inputMode="decimal"
                value={taxa}
                onChange={(e) => setTaxa(e.target.value)}
                placeholder="7,00"
              />
            </div>
            <div>
              <Rotulo htmlFor="bairro-tempo">Tempo (min)</Rotulo>
              <Campo
                id="bairro-tempo"
                type="number"
                min={0}
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
            </div>
            <div>
              <Rotulo htmlFor="bairro-ordem">Posição</Rotulo>
              <Campo
                id="bairro-ordem"
                type="number"
                min={0}
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-5 w-5 accent-black"
            />
            <span className="text-sm text-tinta-700">Entregando neste bairro</span>
          </label>

          {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}

          <div className="flex gap-2 pt-1">
            <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
              Cancelar
            </Botao>
            <Botao type="button" onClick={enviar} disabled={salvando} className="flex-1">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  )
}
