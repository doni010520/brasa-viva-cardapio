'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { entrarAction } from '@/app/admin/login/acoes'
import { Botao, Campo, Rotulo } from '@/components/ui'

function BotaoEntrar() {
  const { pending } = useFormStatus()
  return (
    <Botao type="submit" disabled={pending} className="h-11 w-full">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Entrar
    </Botao>
  )
}

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao] = useActionState(entrarAction, null)

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="proximo" value={proximo} />

      <div>
        <Rotulo htmlFor="email">E-mail</Rotulo>
        <Campo id="email" name="email" type="email" required autoComplete="email" autoFocus />
      </div>

      <div>
        <Rotulo htmlFor="senha">Senha</Rotulo>
        <Campo
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {estado?.erro && (
        <p className="rounded-xl bg-marca-50 px-3.5 py-2.5 text-sm font-medium text-marca-700">
          {estado.erro}
        </p>
      )}

      <BotaoEntrar />
    </form>
  )
}
