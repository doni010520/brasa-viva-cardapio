import Link from 'next/link'

export default function NaoEncontrado() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-tinta-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-tinta-900">Página não encontrada</h1>
        <p className="mt-2 text-sm text-tinta-500">
          O link pode ter mudado, ou este pedido não existe mais.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl bg-tinta-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tinta-700"
        >
          Ir para o cardápio
        </Link>
      </div>
    </div>
  )
}
