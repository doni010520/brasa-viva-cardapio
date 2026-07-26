'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Bot,
  Check,
  Hand,
  Loader2,
  MessageSquare,
  Send,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import {
  assumirConversaAction,
  experimentarAgenteAction,
  limparConversaDeTesteAction,
  responderComoHumanoAction,
  salvarAgenteAction,
} from '@/app/admin/(painel)/whatsapp/acoes'
import type { ConversaResumo } from '@/app/admin/(painel)/whatsapp/page'
import { AreaTexto, Botao, Campo, Cartao, Rotulo, Selo, Vazio } from '@/components/ui'
import { mascaraTelefone } from '@/lib/format'
import { dataHoraCurta } from '@/lib/tempo'

const TELEFONE_DE_TESTE = '00000000000'

export function PainelAgente({
  ativo: ativoInicial,
  nome: nomeInicial,
  instrucoes: instrucoesInicial,
  temModelo,
  temWhatsapp,
  urlWebhook,
  conversas,
}: {
  ativo: boolean
  nome: string
  instrucoes: string
  temModelo: boolean
  temWhatsapp: boolean
  urlWebhook: string | null
  conversas: ConversaResumo[]
}) {
  const [ativo, setAtivo] = useState(ativoInicial)
  const [nome, setNome] = useState(nomeInicial)
  const [instrucoes, setInstrucoes] = useState(instrucoesInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, salvar] = useTransition()

  const reais = conversas.filter((c) => c.telefone !== TELEFONE_DE_TESTE)

  function aoSalvar() {
    setAviso(null)
    salvar(async () => {
      const r = await salvarAgenteAction({ ativo, nome, instrucoes })
      if (!r.ok) {
        setAviso(r.erro)
        setAtivo(ativoInicial)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* O que falta para funcionar, dito antes de tudo: ligar o robô sem
          modelo ou sem WhatsApp conectado é deixar o cliente no vácuo. */}
      {(!temModelo || !temWhatsapp) && (
        <Cartao className="border-amber-300 bg-amber-50 p-4">
          <div className="flex gap-2.5 text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">Ainda falta ligar uma peça</p>
              <ul className="mt-1 space-y-0.5">
                {!temModelo && (
                  <li>
                    Sem chave de IA no servidor: preencha <code>ANTHROPIC_API_KEY</code> ou{' '}
                    <code>OPENAI_API_KEY</code>.
                  </li>
                )}
                {!temWhatsapp && (
                  <li>
                    Sem WhatsApp conectado: preencha <code>UAZAPI_URL</code> e{' '}
                    <code>UAZAPI_TOKEN</code>.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </Cartao>
      )}

      <Cartao className="p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="accent-marca mt-1 h-5 w-5 shrink-0"
          />
          <span>
            <span className="block font-bold text-tinta-900">Robô atendendo no WhatsApp</span>
            <span className="block text-sm text-tinta-500">
              Desligado, as mensagens continuam chegando no aparelho e ninguém responde sozinho.
            </span>
          </span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="agente-nome">Como o robô se apresenta</Rotulo>
            <Campo
              id="agente-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>

        <div className="mt-4">
          <Rotulo htmlFor="agente-instrucoes">Jeito de falar</Rotulo>
          <AreaTexto
            id="agente-instrucoes"
            rows={4}
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            maxLength={2000}
            placeholder="Ex.: fale como baiano, chame de meu rei, ofereça a cocada de sobremesa..."
          />
          <p className="mt-1 text-xs text-tinta-400">
            Preço, cardápio, taxa de entrega e horário o robô já pega do sistema sozinho — não
            precisa escrever aqui, e escrever pode fazer ele falar valor errado.
          </p>
        </div>

        {aviso && (
          <p className="bg-marca-50 text-marca-700 mt-3 rounded-xl px-3.5 py-2.5 text-sm font-medium">
            {aviso}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Botao onClick={aoSalvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
          {ativo && temModelo && temWhatsapp && (
            <Selo tom="verde">
              <Check className="h-3.5 w-3.5" />
              No ar
            </Selo>
          )}
        </div>
      </Cartao>

      {urlWebhook && (
        <Cartao className="p-4">
          <h2 className="font-bold text-tinta-900">Endereço do webhook</h2>
          <p className="mt-1 text-sm text-tinta-500">
            Cole isto na uazapi, em Webhook, marcando o evento de mensagem recebida. O token vai no
            cabeçalho <code>x-webhook-token</code>.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-xl bg-tinta-100 px-3 py-2 text-xs text-tinta-700">
            {urlWebhook}
          </code>
        </Cartao>
      )}

      <ExperimentarAgente habilitado={temModelo} />

      <div>
        <h2 className="mb-2 text-sm font-bold text-tinta-500">Conversas</h2>
        {reais.length === 0 ? (
          <Vazio
            titulo="Nenhuma conversa ainda"
            descricao="Quando alguém mandar mensagem no WhatsApp da loja, ela aparece aqui."
          />
        ) : (
          <div className="space-y-2">
            {reais.map((conversa) => (
              <LinhaConversa key={conversa.id} conversa={conversa} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LinhaConversa({ conversa }: { conversa: ConversaResumo }) {
  const [aberta, setAberta] = useState(false)
  const [texto, setTexto] = useState('')
  const [ocupado, executar] = useTransition()

  const ultima = conversa.mensagens.at(-1)

  return (
    <Cartao className="p-3.5">
      <button
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            conversa.humano_assumiu ? 'bg-amber-100 text-amber-700' : 'bg-tinta-100 text-tinta-500'
          }`}
        >
          {conversa.humano_assumiu ? <Hand className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-bold text-tinta-900">
            {conversa.nome ?? mascaraTelefone(conversa.telefone)}
          </span>
          <span className="block truncate text-sm text-tinta-500">
            {ultima ? `${ultima.papel === 'cliente' ? '' : '↩ '}${ultima.texto}` : 'sem mensagens'}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {conversa.humano_assumiu ? (
            <Selo tom="ambar">Com a equipe</Selo>
          ) : (
            <Selo tom="verde">Robô</Selo>
          )}
          <span className="mt-1 block text-xs text-tinta-400">
            {dataHoraCurta(conversa.atualizado_em)}
          </span>
        </span>
      </button>

      {aberta && (
        <div className="mt-3 border-t border-tinta-200 pt-3">
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {conversa.mensagens.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.papel === 'cliente'
                    ? 'bg-tinta-100 text-tinta-700'
                    : 'bg-marca-50 text-tinta-800 ml-auto'
                }`}
              >
                {m.texto}
              </p>
            ))}
          </div>

          {conversa.ultimo_pedido_id && (
            <Link
              href={`/admin/comanda/${conversa.ultimo_pedido_id}`}
              className="mt-3 inline-block text-sm font-medium text-tinta-600 underline underline-offset-2"
            >
              Ver a comanda do último pedido
            </Link>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Botao
              variante="fantasma"
              disabled={ocupado}
              onClick={() =>
                executar(async () => {
                  await assumirConversaAction(conversa.id, !conversa.humano_assumiu)
                })
              }
            >
              {conversa.humano_assumiu ? (
                <>
                  <Undo2 className="h-4 w-4" />
                  Devolver para o robô
                </>
              ) : (
                <>
                  <Hand className="h-4 w-4" />
                  Assumir a conversa
                </>
              )}
            </Botao>
          </div>

          {/* Responder aqui já assume a conversa: quem escreveu foi gente. */}
          <div className="mt-2 flex gap-2">
            <Campo
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Responder como equipe..."
              maxLength={1000}
            />
            <Botao
              disabled={ocupado || !texto.trim()}
              onClick={() =>
                executar(async () => {
                  const r = await responderComoHumanoAction(conversa.id, texto)
                  if (r.ok) setTexto('')
                })
              }
            >
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Botao>
          </div>
        </div>
      )}
    </Cartao>
  )
}

/** Um WhatsApp de mentira, para o dono ver o robô trabalhando antes de soltar. */
function ExperimentarAgente({ habilitado }: { habilitado: boolean }) {
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<{ de: 'eu' | 'robo'; texto: string }[]>([])
  const [ocupado, executar] = useTransition()

  function mandar() {
    const meu = texto.trim()
    if (!meu) return
    setTexto('')
    setLinhas((atual) => [...atual, { de: 'eu', texto: meu }])

    executar(async () => {
      const r = await experimentarAgenteAction(meu)
      setLinhas((atual) => [
        ...atual,
        ...(r.ok
          ? r.respostas.map((t) => ({ de: 'robo' as const, texto: t }))
          : [{ de: 'robo' as const, texto: `[erro] ${r.erro}` }]),
      ])
    })
  }

  return (
    <Cartao className="p-4">
      <h2 className="flex items-center gap-2 font-bold text-tinta-900">
        <MessageSquare className="h-4 w-4" />
        Experimentar
      </h2>
      <p className="mt-1 text-sm text-tinta-500">
        Converse com o robô aqui como se fosse um cliente. Nada é enviado pelo WhatsApp — mas se
        você mandar ele fechar um pedido, o pedido entra de verdade na cozinha.
      </p>

      {linhas.length > 0 && (
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {linhas.map((l, i) => (
            <p
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                l.de === 'eu' ? 'bg-tinta-100 text-tinta-700' : 'bg-marca-50 text-tinta-800 ml-auto'
              }`}
            >
              {l.texto}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Campo
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') mandar()
          }}
          disabled={!habilitado}
          placeholder={habilitado ? 'Oi, queria uma marmita...' : 'Falta a chave de IA'}
        />
        <Botao onClick={mandar} disabled={!habilitado || ocupado || !texto.trim()}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Botao>
      </div>

      {linhas.length > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-tinta-400 underline underline-offset-2"
          onClick={() =>
            executar(async () => {
              await limparConversaDeTesteAction()
              setLinhas([])
            })
          }
        >
          Começar do zero
        </button>
      )}
    </Cartao>
  )
}
