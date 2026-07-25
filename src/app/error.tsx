'use client'

import { useEffect } from 'react'

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  // erro típico de instalação: o app subiu sem as credenciais do banco
  const faltaConfig = /Variável de ambiente ausente|fetch failed|Invalid URL/i.test(error.message)

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-tinta-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-tinta-900">
          {faltaConfig ? 'O sistema ainda não foi configurado' : 'Algo deu errado por aqui'}
        </h1>

        <p className="mt-2 text-sm text-tinta-500">
          {faltaConfig ? (
            <>
              Não consegui falar com o banco de dados. Confira as variáveis{' '}
              <code className="rounded bg-tinta-100 px-1 font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{' '}
              e{' '}
              <code className="rounded bg-tinta-100 px-1 font-mono text-xs">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{' '}
              e se as migrações do Supabase já foram rodadas.
            </>
          ) : (
            'Tente de novo. Se continuar, avise a equipe do restaurante.'
          )}
        </p>

        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-tinta-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tinta-700"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
