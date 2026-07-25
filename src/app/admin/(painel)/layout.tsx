import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExternalLink, LogOut } from 'lucide-react'
import { NavegacaoAdmin } from '@/components/admin/navegacao-admin'
import { sairAction } from '@/app/admin/login/acoes'
import { buscarConfiguracoes } from '@/lib/dados'
import { usuarioAdminAtual } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const [admin, config] = await Promise.all([usuarioAdminAtual(), buscarConfiguracoes()])
  if (!admin) redirect('/admin/login')

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ '--marca': config.cor_primaria } as React.CSSProperties}
    >
      <header className="sem-impressao sticky top-0 z-30 bg-carvao-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{config.nome}</p>
            <p className="truncate text-xs text-tinta-400">{admin.email}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-tinta-300 transition hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Ver cardápio</span>
            </Link>

            <form action={sairAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-tinta-300 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </div>
        </div>

        <NavegacaoAdmin />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
