'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  QrCode,
  Settings,
  Tag,
  UserCog,
  Users,
  UtensilsCrossed,
} from 'lucide-react'

/** `soDono` esconde do atendente. A tranca de verdade está no servidor. */
const ITENS = [
  { href: '/admin', rotulo: 'Pedidos', icone: UtensilsCrossed, soDono: false },
  { href: '/admin/cardapio', rotulo: 'Cardápio', icone: BookOpen, soDono: false },
  { href: '/admin/clientes', rotulo: 'Clientes', icone: Users, soDono: true },
  { href: '/admin/mesas', rotulo: 'Mesas', icone: QrCode, soDono: true },
  { href: '/admin/cupons', rotulo: 'Cupons', icone: Tag, soDono: true },
  { href: '/admin/relatorios', rotulo: 'Relatórios', icone: BarChart3, soDono: true },
  { href: '/admin/usuarios', rotulo: 'Equipe', icone: UserCog, soDono: true },
  { href: '/admin/config', rotulo: 'Configurações', icone: Settings, soDono: true },
]

export function NavegacaoAdmin({ ehDono }: { ehDono: boolean }) {
  const rota = usePathname()
  const visiveis = ITENS.filter((i) => ehDono || !i.soDono)

  return (
    <nav className="sem-barra flex gap-1 overflow-x-auto border-t border-white/10 px-3">
      <div className="mx-auto flex w-full max-w-6xl gap-1">
        {visiveis.map(({ href, rotulo, icone: Icone }) => {
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
