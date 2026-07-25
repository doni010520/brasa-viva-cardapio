'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Power } from 'lucide-react'
import { alternarLojaAction } from '@/app/admin/(painel)/acoes'

export function ChaveDaLoja({
  abertaManual,
  abertaAgora,
  motivo,
}: {
  abertaManual: boolean
  abertaAgora: boolean
  motivo: string
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()

  function alternar() {
    salvar(async () => {
      await alternarLojaAction(!abertaManual)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p
          className={`text-sm font-bold ${abertaAgora ? 'text-emerald-600' : 'text-tinta-500'}`}
        >
          {abertaAgora ? 'Recebendo pedidos' : 'Não está recebendo'}
        </p>
        {!abertaAgora && motivo && <p className="text-xs text-tinta-400">{motivo}</p>}
      </div>

      <button
        onClick={alternar}
        disabled={salvando}
        title={abertaManual ? 'Fechar a loja agora' : 'Reabrir a loja'}
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition disabled:opacity-50 ${
          abertaManual
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-tinta-200 text-tinta-600 hover:bg-tinta-300'
        }`}
      >
        {salvando ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Power className="h-5 w-5" />
        )}
        <span className="sr-only">{abertaManual ? 'Fechar loja' : 'Abrir loja'}</span>
      </button>
    </div>
  )
}
