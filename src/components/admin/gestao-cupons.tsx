'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { excluirCupomAction, salvarCupomAction } from '@/app/admin/(painel)/cupons/acoes'
import { Botao, Campo, Cartao, Rotulo, Selecao, Selo, Vazio } from '@/components/ui'
import { centavosParaInput, moeda, paraCentavos } from '@/lib/format'
import type { Cupom } from '@/lib/types'

export function GestaoCupons({ cupons }: { cupons: Cupom[] }) {
  const [editando, setEditando] = useState<Cupom | 'novo' | null>(null)
  const [erro, setErro] = useState('')

  return (
    <>
      <div className="mb-4">
        <Botao onClick={() => setEditando('novo')}>
          <Plus className="h-4 w-4" />
          Novo cupom
        </Botao>
      </div>

      {erro && (
        <p className="mb-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      {cupons.length === 0 ? (
        <Vazio
          titulo="Nenhum cupom criado"
          descricao="Cupons ajudam a puxar cliente em dia fraco ou a divulgar uma novidade."
        >
          <Botao onClick={() => setEditando('novo')}>Criar cupom</Botao>
        </Vazio>
      ) : (
        <div className="space-y-2">
          {cupons.map((cupom) => (
            <LinhaCupom
              key={cupom.id}
              cupom={cupom}
              onEditar={() => setEditando(cupom)}
              onErro={setErro}
            />
          ))}
        </div>
      )}

      {editando && (
        <ModalCupom
          cupom={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

function LinhaCupom({
  cupom,
  onEditar,
  onErro,
}: {
  cupom: Cupom
  onEditar: () => void
  onErro: (mensagem: string) => void
}) {
  const router = useRouter()
  const [apagando, apagar] = useTransition()

  const esgotado = cupom.usos_maximos !== null && cupom.usos >= cupom.usos_maximos
  const vencido = cupom.validade !== null && cupom.validade < new Date().toISOString().slice(0, 10)

  function excluir() {
    if (!confirm(`Apagar o cupom ${cupom.codigo}?`)) return
    apagar(async () => {
      const resposta = await excluirCupomAction(cupom.id)
      if (!resposta.ok) onErro(resposta.erro)
      else router.refresh()
    })
  }

  return (
    <Cartao className="flex flex-wrap items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold tracking-wider text-tinta-900">
            {cupom.codigo}
          </span>
          {!cupom.ativo && <Selo tom="neutro">Desligado</Selo>}
          {vencido && <Selo tom="ambar">Vencido</Selo>}
          {esgotado && <Selo tom="ambar">Esgotado</Selo>}
        </p>
        <p className="text-sm text-tinta-500">
          {cupom.tipo === 'percentual'
            ? `${cupom.valor}% de desconto`
            : `${moeda(cupom.valor)} de desconto`}
          {cupom.minimo_centavos > 0 && ` · a partir de ${moeda(cupom.minimo_centavos)}`}
          {cupom.validade && ` · até ${cupom.validade.split('-').reverse().join('/')}`}
        </p>
      </div>

      <div className="text-right text-sm">
        <p className="font-semibold text-tinta-900 tabular-nums">
          {cupom.usos}
          {cupom.usos_maximos !== null && ` / ${cupom.usos_maximos}`}
        </p>
        <p className="text-xs text-tinta-400">usos</p>
      </div>

      <button
        onClick={onEditar}
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tinta-500 hover:bg-tinta-100"
      >
        editar
      </button>
      <button
        onClick={excluir}
        disabled={apagando}
        className="toque rounded-lg text-tinta-500 hover:bg-marca-50 hover:text-marca-600"
        aria-label={`Apagar cupom ${cupom.codigo}`}
      >
        {apagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </Cartao>
  )
}

function ModalCupom({ cupom, onFechar }: { cupom: Cupom | null; onFechar: () => void }) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')

  const [codigo, setCodigo] = useState(cupom?.codigo ?? '')
  const [tipo, setTipo] = useState<'percentual' | 'fixo'>(cupom?.tipo ?? 'percentual')
  const [valor, setValor] = useState(
    cupom ? (cupom.tipo === 'percentual' ? String(cupom.valor) : centavosParaInput(cupom.valor)) : ''
  )
  const [minimo, setMinimo] = useState(centavosParaInput(cupom?.minimo_centavos ?? 0))
  const [validade, setValidade] = useState(cupom?.validade ?? '')
  const [usosMaximos, setUsosMaximos] = useState(
    cupom?.usos_maximos !== null && cupom?.usos_maximos !== undefined
      ? String(cupom.usos_maximos)
      : ''
  )
  const [ativo, setAtivo] = useState(cupom?.ativo ?? true)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    salvar(async () => {
      const resposta = await salvarCupomAction({
        id: cupom?.id,
        codigo,
        tipo,
        // percentual guarda o número puro; fixo guarda centavos
        valor: tipo === 'percentual' ? Number(valor) : paraCentavos(valor),
        minimo_centavos: paraCentavos(minimo || '0'),
        ativo,
        validade: validade || null,
        usos_maximos: usosMaximos ? Number(usosMaximos) : null,
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
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="anima-entrada w-full max-w-md rounded-2xl bg-white p-5"
      >
        <h2 className="mb-4 text-lg font-bold text-tinta-900">
          {cupom ? 'Editar cupom' : 'Novo cupom'}
        </h2>

        <div className="space-y-3">
          <div>
            <Rotulo htmlFor="codigo">Código</Rotulo>
            <Campo
              id="codigo"
              required
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="BRASA10"
              className="font-mono tracking-wider uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo htmlFor="tipo">Tipo</Rotulo>
              <Selecao
                id="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'percentual' | 'fixo')}
              >
                <option value="percentual">Porcentagem</option>
                <option value="fixo">Valor fixo</option>
              </Selecao>
            </div>
            <div>
              <Rotulo htmlFor="valor">{tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}</Rotulo>
              <Campo
                id="valor"
                required
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={tipo === 'percentual' ? '10' : '5,00'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo htmlFor="minimo">Pedido mínimo (R$)</Rotulo>
              <Campo
                id="minimo"
                inputMode="decimal"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Rotulo htmlFor="usos">Limite de usos</Rotulo>
              <Campo
                id="usos"
                type="number"
                min={1}
                value={usosMaximos}
                onChange={(e) => setUsosMaximos(e.target.value)}
                placeholder="sem limite"
              />
            </div>
          </div>

          <div>
            <Rotulo htmlFor="validade">Vale até (opcional)</Rotulo>
            <Campo
              id="validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-5 w-5 accent-black"
            />
            <span className="text-sm text-tinta-700">Cupom ligado</span>
          </label>
        </div>

        {erro && <p className="mt-3 text-sm font-medium text-marca-600">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
        </div>
      </form>
    </div>
  )
}
