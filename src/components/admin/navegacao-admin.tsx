'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, BookOpen, Settings, Tag, UtensilsCrossed } from 'lucide-react'

const ITENS = [
  { href: '/admin', rotulo: 'Pedidos', icone: UtensilsCrossed },
  { href: '/admin/cardapio', rotulo: 'Cardápio', icone: BookOpen },
  { href: '/admin/cupons', rotulo: 'Cupons', icone: Tag },
  { href: '/admin/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  { href: '/admin/config', rotulo: 'Configurações', icone: Settings },
]

export function NavegacaoAdmin() {
  const rota = usePathname()

  return (
    <nav className="sem-barra flex gap-1 overflow-x-auto border-t border-white/10 px-3">
      <div className="mx-auto flex w-full max-w-6xl gap-1">
        {ITENS.map(({ href, rotulo, icone: Icone }) => {
          const ativo = href === '/admin' ? rota === '/admin' : rota.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                ativo
                  ? 'border-marca text-white'
                  : 'border-transparent text-tinta-400 hover:text-white'
              }`}
            >
              <Icone className="h-4 w-4" />
              {rotulo}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
