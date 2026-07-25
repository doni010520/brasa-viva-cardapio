'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react'
import {
  alternarAtivoAction,
  criarUsuarioAction,
  mudarPapelAction,
  removerUsuarioAction,
  trocarSenhaAction,
} from '@/app/admin/(painel)/usuarios/acoes'
import { Botao, Campo, Cartao, Rotulo, Selecao, Selo } from '@/components/ui'
import type { MembroEquipe } from '@/app/admin/(painel)/usuarios/page'

const O_QUE_CADA_UM_FAZ = {
  dono: 'Vê e mexe em tudo: preços, relatórios, clientes, configurações e equipe.',
  atendente: 'Só a tela de pedidos e o botão de esgotar item. Não vê faturamento.',
}

export function GestaoEquipe({
  membros,
  meuId,
}: {
  membros: MembroEquipe[]
  meuId: string
}) {
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  return (
    <>
      <div className="mb-4">
        <Botao onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4" />
          Adicionar pessoa
        </Botao>
      </div>

      {erro && (
        <p className="mb-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {aviso}
        </p>
      )}

      <div className="space-y-2">
        {membros.map((membro) => (
          <LinhaMembro
            key={membro.user_id}
            membro={membro}
            souEu={membro.user_id === meuId}
            onErro={setErro}
            onAviso={setAviso}
          />
        ))}
      </div>

      <Cartao className="mt-5 p-4">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-tinta-900">
          <ShieldCheck className="h-4 w-4" />O que cada perfil enxerga
        </h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold text-tinta-900">Dono</dt>
            <dd className="text-tinta-500">{O_QUE_CADA_UM_FAZ.dono}</dd>
          </div>
          <div>
            <dt className="font-semibold text-tinta-900">Atendente</dt>
            <dd className="text-tinta-500">{O_QUE_CADA_UM_FAZ.atendente}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-tinta-400">
          Sempre precisa sobrar pelo menos um dono ativo. O sistema recusa a operação que
          deixaria o restaurante sem administrador.
        </p>
      </Cartao>

      {criando && (
        <ModalNovo
          onFechar={() => setCriando(false)}
          onErro={setErro}
          onAviso={setAviso}
        />
      )}
    </>
  )
}

function LinhaMembro({
  membro,
  souEu,
  onErro,
  onAviso,
}: {
  membro: MembroEquipe
  souEu: boolean
  onErro: (m: string) => void
  onAviso: (m: string) => void
}) {
  const router = useRouter()
  const [ocupado, agir] = useTransition()
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  function executar(acao: () => Promise<{ ok: boolean; erro?: string; aviso?: string }>) {
    onErro('')
    onAviso('')
    agir(async () => {
      const r = await acao()
      if (!r.ok) onErro(r.erro ?? 'Não consegui completar.')
      else {
        if (r.aviso) onAviso(r.aviso)
        router.refresh()
      }
    })
  }

  return (
    <>
      <Cartao className={`flex flex-wrap items-center gap-3 p-3.5 ${membro.ativo ? '' : 'bg-tinta-50'}`}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${membro.ativo ? 'text-tinta-900' : 'text-tinta-400'}`}>
              {membro.nome || membro.email}
            </span>
            <Selo tom={membro.papel === 'dono' ? 'vermelho' : 'neutro'}>
              {membro.papel === 'dono' ? 'Dono' : 'Atendente'}
            </Selo>
            {souEu && <Selo tom="azul">você</Selo>}
            {!membro.ativo && <Selo tom="ambar">Sem acesso</Selo>}
          </p>
          <p className="text-sm text-tinta-500">{membro.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {!souEu && (
            <Selecao
              value={membro.papel}
              disabled={ocupado}
              onChange={(e) =>
                executar(() =>
                  mudarPapelAction(membro.user_id, e.target.value as 'dono' | 'atendente')
                )
              }
              className="w-auto min-w-32 py-1.5 text-xs"
              aria-label={`Perfil de ${membro.nome}`}
            >
              <option value="atendente">Atendente</option>
              <option value="dono">Dono</option>
            </Selecao>
          )}

          <button
            onClick={() => setTrocandoSenha(true)}
            disabled={ocupado}
            className="toque rounded-lg text-tinta-500 hover:bg-tinta-100"
            title="Trocar a senha desta pessoa"
            aria-label={`Trocar senha de ${membro.nome}`}
          >
            <KeyRound className="h-4 w-4" />
          </button>

          {!souEu && (
            <>
              <button
                onClick={() => executar(() => alternarAtivoAction(membro.user_id, !membro.ativo))}
                disabled={ocupado}
                className="toque rounded-lg text-tinta-500 hover:bg-tinta-100"
                title={membro.ativo ? 'Tirar o acesso sem apagar' : 'Devolver o acesso'}
                aria-label={membro.ativo ? `Suspender ${membro.nome}` : `Reativar ${membro.nome}`}
              >
                {ocupado ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : membro.ativo ? (
                  <UserX className="h-4 w-4" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
              </button>

              <button
                onClick={() => {
                  if (!confirm(`Remover ${membro.nome || membro.email} da equipe?`)) return
                  executar(() => removerUsuarioAction(membro.user_id))
                }}
                disabled={ocupado}
                className="toque rounded-lg text-tinta-400 hover:text-marca-600"
                aria-label={`Remover ${membro.nome}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </Cartao>

      {trocandoSenha && (
        <ModalSenha
          membro={membro}
          onFechar={() => setTrocandoSenha(false)}
          onErro={onErro}
          onAviso={onAviso}
        />
      )}
    </>
  )
}

function ModalNovo({
  onFechar,
  onErro,
  onAviso,
}: {
  onFechar: () => void
  onErro: (m: string) => void
  onAviso: (m: string) => void
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [erroLocal, setErroLocal] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<'dono' | 'atendente'>('atendente')

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErroLocal('')
    salvar(async () => {
      const r = await criarUsuarioAction({ nome, email, senha, papel })
      if (!r.ok) {
        setErroLocal(r.erro)
        return
      }
      onErro('')
      onAviso(`${nome} já pode entrar no painel com o e-mail ${email}.`)
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
        <h2 className="mb-4 text-lg font-bold text-tinta-900">Adicionar à equipe</h2>

        <div className="space-y-3">
          <div>
            <Rotulo htmlFor="novo-nome">Nome</Rotulo>
            <Campo
              id="novo-nome"
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Maria da Silva"
            />
          </div>

          <div>
            <Rotulo htmlFor="novo-email">E-mail (é com ele que entra)</Rotulo>
            <Campo
              id="novo-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@brasaviva.com.br"
            />
          </div>

          <div>
            <Rotulo htmlFor="nova-senha">Senha</Rotulo>
            <Campo
              id="nova-senha"
              type="text"
              required
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="mínimo 8 caracteres"
            />
            <p className="mt-1 text-xs text-tinta-400">
              Combine com a pessoa e peça para ela trocar depois.
            </p>
          </div>

          <div>
            <Rotulo htmlFor="novo-papel">Perfil</Rotulo>
            <Selecao
              id="novo-papel"
              value={papel}
              onChange={(e) => setPapel(e.target.value as 'dono' | 'atendente')}
            >
              <option value="atendente">Atendente</option>
              <option value="dono">Dono</option>
            </Selecao>
            <p className="mt-1 text-xs text-tinta-500">{O_QUE_CADA_UM_FAZ[papel]}</p>
          </div>
        </div>

        {erroLocal && <p className="mt-3 text-sm font-medium text-marca-600">{erroLocal}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar acesso
          </Botao>
        </div>
      </form>
    </div>
  )
}

function ModalSenha({
  membro,
  onFechar,
  onErro,
  onAviso,
}: {
  membro: MembroEquipe
  onFechar: () => void
  onErro: (m: string) => void
  onAviso: (m: string) => void
}) {
  const [salvando, salvar] = useTransition()
  const [senha, setSenha] = useState('')
  const [erroLocal, setErroLocal] = useState('')

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErroLocal('')
    salvar(async () => {
      const r = await trocarSenhaAction(membro.user_id, senha)
      if (!r.ok) {
        setErroLocal(r.erro)
        return
      }
      onErro('')
      onAviso(`Senha de ${membro.nome || membro.email} trocada.`)
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
        className="anima-entrada w-full max-w-sm rounded-2xl bg-white p-5"
      >
        <h2 className="mb-1 text-lg font-bold text-tinta-900">Trocar senha</h2>
        <p className="mb-4 text-sm text-tinta-500">{membro.nome || membro.email}</p>

        <Rotulo htmlFor="senha-nova">Nova senha</Rotulo>
        <Campo
          id="senha-nova"
          type="text"
          required
          minLength={8}
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="mínimo 8 caracteres"
        />

        {erroLocal && <p className="mt-3 text-sm font-medium text-marca-600">{erroLocal}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Trocar
          </Botao>
        </div>
      </form>
    </div>
  )
}
