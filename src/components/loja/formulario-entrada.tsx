'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { ArrowLeft, Loader2, MessageCircle, TriangleAlert } from 'lucide-react'
import {
  confirmarCodigoAction,
  pedirCodigoAction,
  type EstadoEntrada,
} from '@/app/(loja)/entrar/acoes'
import { Botao, Campo, Rotulo } from '@/components/ui'
import { mascaraTelefone } from '@/lib/format'

const INICIAL: EstadoEntrada = { etapa: 'telefone', telefone: '', erro: null, codigoNaTela: null }

function BotaoEnviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" disabled={pending} className="h-12 w-full text-base">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Botao>
  )
}

export function FormularioEntrada({ nomeLoja }: { nomeLoja: string }) {
  const [estado, enviarTelefone] = useActionState(pedirCodigoAction, INICIAL)
  const [confirmacao, enviarCodigo] = useActionState(confirmarCodigoAction, INICIAL)

  // Depois de pedir o código a tela vira; um erro na conferência não pode
  // jogar a pessoa de volta para a etapa do telefone.
  const naEtapaDoCodigo = estado.etapa === 'codigo'
  const erro = naEtapaDoCodigo ? confirmacao.erro : estado.erro

  return (
    <div className="mx-auto max-w-sm py-8">
      <Link
        href="/meus-pedidos"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="bg-marca/10 text-marca mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
        <MessageCircle className="h-6 w-6" />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">
        {naEtapaDoCodigo ? 'Digite o código' : 'Entrar com o WhatsApp'}
      </h1>
      <p className="mt-1.5 text-sm text-tinta-500">
        {naEtapaDoCodigo ? (
          <>
            Mandamos um código de 6 dígitos para{' '}
            <strong className="text-tinta-700">{mascaraTelefone(estado.telefone)}</strong>.
          </>
        ) : (
          <>
            Sem senha e sem cadastro: a gente manda um código no seu WhatsApp e pronto. Aí você vê
            seus pedidos de qualquer celular.
          </>
        )}
      </p>

      {naEtapaDoCodigo ? (
        <form action={enviarCodigo} className="mt-6 space-y-4">
          <input type="hidden" name="telefone" value={estado.telefone} />

          {estado.codigoNaTela && (
            <div className="flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Modo demonstração</p>
                <p className="mt-0.5">
                  O WhatsApp da loja ainda não está conectado, então o código aparece aqui:{' '}
                  <strong className="tracking-widest">{estado.codigoNaTela}</strong>
                </p>
              </div>
            </div>
          )}

          <div>
            <Rotulo htmlFor="codigo">Código de 6 dígitos</Rotulo>
            <Campo
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              placeholder="000000"
              className="h-14 text-center text-2xl font-black tracking-[0.4em] tabular-nums"
            />
          </div>

          {erro && (
            <p className="bg-marca-50 text-marca-700 rounded-xl px-3.5 py-2.5 text-sm font-medium">
              {erro}
            </p>
          )}

          <BotaoEnviar>Ver meus pedidos</BotaoEnviar>

          <p className="text-center text-sm text-tinta-500">
            Não chegou?{' '}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-semibold text-tinta-700 underline underline-offset-2"
            >
              Tentar com outro número
            </button>
          </p>
        </form>
      ) : (
        <form action={enviarTelefone} className="mt-6 space-y-4">
          <div>
            <Rotulo htmlFor="telefone">Seu WhatsApp</Rotulo>
            <Campo
              id="telefone"
              name="telefone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              autoFocus
              placeholder="(71) 99999-9999"
              defaultValue={estado.telefone}
              className="h-12 text-base"
            />
            <p className="mt-1.5 text-xs text-tinta-400">
              Use o mesmo número que você informa nos pedidos.
            </p>
          </div>

          {erro && (
            <p className="bg-marca-50 text-marca-700 rounded-xl px-3.5 py-2.5 text-sm font-medium">
              {erro}
            </p>
          )}

          <BotaoEnviar>Receber código no WhatsApp</BotaoEnviar>

          <p className="text-center text-xs text-tinta-400">
            A {nomeLoja} usa o seu número só para identificar seus pedidos.
          </p>
        </form>
      )}
    </div>
  )
}
