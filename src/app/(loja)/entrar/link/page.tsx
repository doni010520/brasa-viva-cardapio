import Link from 'next/link'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { entrarPeloLinkAction } from './acoes'
import { BotaoConfirmarLink } from '@/components/loja/botao-confirmar-link'
import { Botao, Cartao } from '@/components/ui'
import { conferirLink } from '@/lib/cliente-sessao'
import { mascaraTelefone } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Entrar' }

export default async function PaginaLinkMagico({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t } = await searchParams

  // Confere sem gastar: o WhatsApp abre todo link para montar a
  // pré-visualização, e um token queimado por robô deixaria o cliente na mão.
  // Quem gasta é o botão abaixo.
  const valido = t ? await conferirLink(t) : null

  if (!valido) {
    return (
      <div className="mx-auto max-w-sm py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Link vencido</h1>
        <p className="mt-1.5 text-sm text-tinta-500">
          Este link já foi usado ou passou da validade. Dá para entrar em um minuto pedindo um
          código novo no WhatsApp.
        </p>
        <Link href="/entrar" className="mt-5 inline-block">
          <Botao className="h-12">Entrar com o WhatsApp</Botao>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <CircleCheck className="h-6 w-6" />
      </div>
      <h1 className="text-2xl font-black tracking-tight text-tinta-900">É você mesmo?</h1>
      <p className="mt-1.5 text-sm text-tinta-500">
        Este link entra na conta do WhatsApp{' '}
        <strong className="text-tinta-700">{mascaraTelefone(valido.telefone)}</strong>. Depois disso
        você não precisa mais digitar nada neste celular.
      </p>

      <form action={entrarPeloLinkAction} className="mt-6">
        <input type="hidden" name="t" value={t} />
        <BotaoConfirmarLink />
      </form>

      <Cartao className="mt-4 p-4">
        <p className="text-sm text-tinta-500">
          Se você não pediu nada na gente, é só fechar esta página — nada acontece sem tocar no
          botão.
        </p>
      </Cartao>
    </div>
  )
}
