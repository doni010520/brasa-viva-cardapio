'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Botao } from '@/components/ui'

export function BotaoConfirmarLink() {
  const { pending } = useFormStatus()

  return (
    <Botao type="submit" disabled={pending} className="h-12 w-full text-base">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Sim, entrar e ver meus pedidos
    </Botao>
  )
}
