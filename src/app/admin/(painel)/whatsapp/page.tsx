import { redirect } from 'next/navigation'
import { PainelAgente } from '@/components/admin/painel-agente'
import { temIA } from '@/lib/agente/modelo'
import { buscarConfiguracoes } from '@/lib/dados'
import { criarClienteAdmin, usuarioAdminAtual } from '@/lib/supabase/server'
import { urlBaseConfigurada } from '@/lib/url'
import { whatsappConfigurado } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export type ConversaResumo = {
  id: string
  telefone: string
  nome: string | null
  mensagens: { papel: 'cliente' | 'agente'; texto: string }[]
  humano_assumiu: boolean
  ultimo_pedido_id: string | null
  atualizado_em: string
}

export default async function PaginaWhatsapp() {
  const admin = await usuarioAdminAtual()
  // o proxy já barra, mas a página confere de novo: se um dia o matcher mudar,
  // esta tela não vira uma porta aberta sem ninguém perceber
  if (!admin?.ehDono) redirect('/admin')

  const config = await buscarConfiguracoes()

  const { data } = await criarClienteAdmin()
    .from('conversas_whatsapp')
    .select('id, telefone, nome, mensagens, humano_assumiu, ultimo_pedido_id, atualizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(50)

  const base = urlBaseConfigurada()

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-tinta-900">Atendimento por WhatsApp</h1>
        <p className="text-sm text-tinta-500">
          O robô tira dúvida, dá notícia do pedido e leva o cliente para o site. Pedido é sempre
          fechado por lá.
        </p>
      </div>

      <PainelAgente
        ativo={config.agente_whatsapp_ativo}
        nome={config.agente_nome ?? 'Brasinha'}
        instrucoes={config.agente_instrucoes ?? ''}
        mensagemAniversario={config.mensagem_aniversario ?? ''}
        cupomAniversario={config.cupom_aniversario ?? ''}
        urlTarefas={base ? `${base}/api/tarefas/diarias` : null}
        temIA={temIA()}
        temWhatsapp={whatsappConfigurado()}
        urlWebhook={base ? `${base}/api/whatsapp/webhook` : null}
        conversas={(data ?? []) as ConversaResumo[]}
      />
    </>
  )
}
