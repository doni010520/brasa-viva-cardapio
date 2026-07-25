'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, MessageCircle } from 'lucide-react'
import {
  salvarConfiguracoesAction,
  salvarHorariosAction,
} from '@/app/admin/(painel)/config/acoes'
import { GestaoBairros } from '@/components/admin/gestao-bairros'
import { AreaTexto, Botao, Campo, Cartao, Rotulo } from '@/components/ui'
import { centavosParaInput, mascaraTelefone, paraCentavos } from '@/lib/format'
import type { Bairro, Configuracoes, Horario } from '@/lib/types'

const DIAS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

export function FormularioConfig({
  config,
  horarios,
  bairros,
  mercadoPagoLigado,
  whatsappLigado,
}: {
  config: Configuracoes
  horarios: Horario[]
  bairros: Bairro[]
  mercadoPagoLigado: boolean
  whatsappLigado: boolean
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <BlocoLoja config={config} mercadoPagoLigado={mercadoPagoLigado} />

      <div className="space-y-4">
        <BlocoHorarios horarios={horarios} />
        <GestaoBairros bairros={bairros} />

        <Cartao className="p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-tinta-900">
            <MessageCircle className="h-4 w-4" />
            Avisos no WhatsApp
          </h2>
          {whatsappLigado ? (
            <p className="text-sm text-emerald-700">
              Ligado. O cliente recebe mensagem quando o pedido é confirmado, entra em preparo,
              fica pronto e sai para entrega.
            </p>
          ) : (
            <p className="flex gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Desligado. Configure <code className="font-mono">UAZAPI_URL</code> e{' '}
                <code className="font-mono">UAZAPI_TOKEN</code> no servidor para os avisos
                saírem sozinhos. Sem isso, o painel ainda abre a conversa com um clique.
              </span>
            </p>
          )}
        </Cartao>
      </div>
    </div>
  )
}

function BlocoLoja({
  config,
  mercadoPagoLigado,
}: {
  config: Configuracoes
  mercadoPagoLigado: boolean
}) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [campos, setCampos] = useState({
    nome: config.nome,
    descricao: config.descricao ?? '',
    logo_url: config.logo_url ?? '',
    cor_primaria: config.cor_primaria,
    telefone: config.telefone ?? '',
    whatsapp: config.whatsapp ?? '',
    endereco: config.endereco ?? '',
    tempo_preparo_min: String(config.tempo_preparo_min),
    antecedencia_min: String(config.antecedencia_min),
    pedido_minimo: centavosParaInput(config.pedido_minimo_centavos),
    aceita_pagamento_online: config.aceita_pagamento_online,
    aceita_pagamento_local: config.aceita_pagamento_local,
    chave_pix: config.chave_pix ?? '',
    aceita_retirada: config.aceita_retirada,
    aceita_entrega: config.aceita_entrega,
    tempo_entrega_min: String(config.tempo_entrega_min),
    entrega_gratis_acima: centavosParaInput(config.entrega_gratis_acima_centavos),
  })

  function mudar<C extends keyof typeof campos>(chave: C, valor: (typeof campos)[C]) {
    setCampos((atuais) => ({ ...atuais, [chave]: valor }))
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    salvar(async () => {
      const resposta = await salvarConfiguracoesAction({
        ...campos,
        pedido_minimo_centavos: paraCentavos(campos.pedido_minimo || '0'),
        entrega_gratis_acima_centavos: campos.entrega_gratis_acima
          ? paraCentavos(campos.entrega_gratis_acima)
          : null,
      })
      if (!resposta.ok) setErro(resposta.erro)
      else setAviso('Configurações salvas.')
    })
  }

  return (
    <form onSubmit={enviar}>
      <Cartao className="space-y-4 p-4">
        <h2 className="font-bold text-tinta-900">Dados da loja</h2>

        <div>
          <Rotulo htmlFor="nome">Nome</Rotulo>
          <Campo
            id="nome"
            required
            value={campos.nome}
            onChange={(e) => mudar('nome', e.target.value)}
          />
        </div>

        <div>
          <Rotulo htmlFor="descricao">Frase de apresentação</Rotulo>
          <AreaTexto
            id="descricao"
            rows={2}
            value={campos.descricao}
            onChange={(e) => mudar('descricao', e.target.value)}
            placeholder="O Tradicional Churrasco Baiano."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="logo">Endereço da logo</Rotulo>
            <Campo
              id="logo"
              value={campos.logo_url}
              onChange={(e) => mudar('logo_url', e.target.value)}
              placeholder="/logo.jpg"
            />
          </div>
          <div>
            <Rotulo htmlFor="cor">Cor da marca</Rotulo>
            <div className="flex gap-2">
              <input
                id="cor"
                type="color"
                value={campos.cor_primaria}
                onChange={(e) => mudar('cor_primaria', e.target.value)}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-tinta-200"
              />
              <Campo
                value={campos.cor_primaria}
                onChange={(e) => mudar('cor_primaria', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Rotulo htmlFor="telefone">Telefone</Rotulo>
            <Campo
              id="telefone"
              value={campos.telefone}
              onChange={(e) => mudar('telefone', mascaraTelefone(e.target.value))}
              placeholder="(71) 99999-0000"
            />
          </div>
          <div>
            <Rotulo htmlFor="whatsapp">WhatsApp (só números, com DDI)</Rotulo>
            <Campo
              id="whatsapp"
              value={campos.whatsapp}
              onChange={(e) => mudar('whatsapp', e.target.value.replace(/\D/g, ''))}
              placeholder="5571999990000"
            />
          </div>
        </div>

        <div>
          <Rotulo htmlFor="endereco">Endereço para retirada</Rotulo>
          <Campo
            id="endereco"
            value={campos.endereco}
            onChange={(e) => mudar('endereco', e.target.value)}
            placeholder="Rua, número, bairro"
          />
        </div>

        <hr className="border-tinta-200" />
        <h2 className="font-bold text-tinta-900">Operação</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Rotulo htmlFor="preparo">Preparo (min)</Rotulo>
            <Campo
              id="preparo"
              type="number"
              min={0}
              value={campos.tempo_preparo_min}
              onChange={(e) => mudar('tempo_preparo_min', e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="antecedencia">Antecedência (min)</Rotulo>
            <Campo
              id="antecedencia"
              type="number"
              min={0}
              value={campos.antecedencia_min}
              onChange={(e) => mudar('antecedencia_min', e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="minimo">Pedido mínimo (R$)</Rotulo>
            <Campo
              id="minimo"
              inputMode="decimal"
              value={campos.pedido_minimo}
              onChange={(e) => mudar('pedido_minimo', e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>
        <p className="-mt-1 text-xs text-tinta-400">
          O horário de retirada mais cedo oferecido ao cliente é o maior entre preparo e
          antecedência.
        </p>

        <hr className="border-tinta-200" />
        <h2 className="font-bold text-tinta-900">Retirada e entrega</h2>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_retirada}
            onChange={(e) => mudar('aceita_retirada', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">
              Aceitar retirada no balcão
            </span>
            <span className="block text-xs text-tinta-500">Sem taxa, com horário marcado.</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_entrega}
            onChange={(e) => mudar('aceita_entrega', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">Aceitar entrega</span>
            <span className="block text-xs text-tinta-500">
              Só funciona com bairros cadastrados ao lado.
            </span>
          </span>
        </label>

        {campos.aceita_entrega && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="tempo-entrega">Tempo padrão de entrega (min)</Rotulo>
              <Campo
                id="tempo-entrega"
                type="number"
                min={0}
                value={campos.tempo_entrega_min}
                onChange={(e) => mudar('tempo_entrega_min', e.target.value)}
              />
            </div>
            <div>
              <Rotulo htmlFor="entrega-gratis">Entrega grátis acima de (R$)</Rotulo>
              <Campo
                id="entrega-gratis"
                inputMode="decimal"
                value={campos.entrega_gratis_acima}
                onChange={(e) => mudar('entrega_gratis_acima', e.target.value)}
                placeholder="deixe vazio para nunca isentar"
              />
            </div>
          </div>
        )}

        <hr className="border-tinta-200" />
        <h2 className="font-bold text-tinta-900">Pagamento</h2>

        {!mercadoPagoLigado && (
          <p className="flex gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              O Mercado Pago ainda não foi configurado no servidor (variável{' '}
              <code className="font-mono">MP_ACCESS_TOKEN</code>). Enquanto isso, o pagamento
              online não aparece para o cliente.
            </span>
          </p>
        )}

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_pagamento_online}
            onChange={(e) => mudar('aceita_pagamento_online', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">
              Aceitar pagamento online
            </span>
            <span className="block text-xs text-tinta-500">Pix e cartão pelo Mercado Pago.</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_pagamento_local}
            onChange={(e) => mudar('aceita_pagamento_local', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">
              Aceitar pagamento na retirada
            </span>
            <span className="block text-xs text-tinta-500">
              O pedido entra na cozinha sem pagamento antecipado.
            </span>
          </span>
        </label>

        <div>
          <Rotulo htmlFor="pix">Chave Pix (mostrada no balcão)</Rotulo>
          <Campo
            id="pix"
            value={campos.chave_pix}
            onChange={(e) => mudar('chave_pix', e.target.value)}
            placeholder="CNPJ, telefone ou chave aleatória"
          />
        </div>

        {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}
        {aviso && <p className="text-sm font-medium text-emerald-700">{aviso}</p>}

        <Botao type="submit" disabled={salvando} className="h-11 w-full">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar configurações
        </Botao>
      </Cartao>
    </form>
  )
}

function BlocoHorarios({ horarios }: { horarios: Horario[] }) {
  const [salvando, salvar] = useTransition()
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [linhas, setLinhas] = useState(() =>
    Array.from({ length: 7 }, (_, dia) => {
      const existente = horarios.find((h) => h.dia_semana === dia)
      return {
        dia_semana: dia,
        fechado: existente?.fechado ?? false,
        abre: (existente?.abre ?? '11:00').slice(0, 5),
        fecha: (existente?.fecha ?? '23:00').slice(0, 5),
      }
    })
  )

  function mudar(dia: number, campo: 'fechado' | 'abre' | 'fecha', valor: boolean | string) {
    setLinhas((atuais) =>
      atuais.map((l) => (l.dia_semana === dia ? { ...l, [campo]: valor } : l))
    )
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    salvar(async () => {
      const resposta = await salvarHorariosAction(linhas)
      if (!resposta.ok) setErro(resposta.erro)
      else setAviso('Horários salvos.')
    })
  }

  return (
    <form onSubmit={enviar}>
      <Cartao className="space-y-3 p-4">
        <div>
          <h2 className="font-bold text-tinta-900">Horário de funcionamento</h2>
          <p className="text-xs text-tinta-500">
            Fora desse horário o cardápio continua visível, mas ninguém consegue fechar pedido.
          </p>
        </div>

        <div className="space-y-2">
          {linhas.map((linha) => (
            <div
              key={linha.dia_semana}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-tinta-50 px-3 py-2"
            >
              <span className="w-28 shrink-0 text-sm font-medium text-tinta-700">
                {DIAS[linha.dia_semana]}
              </span>

              <label className="flex items-center gap-1.5 text-xs text-tinta-600">
                <input
                  type="checkbox"
                  checked={!linha.fechado}
                  onChange={(e) => mudar(linha.dia_semana, 'fechado', !e.target.checked)}
                  className="h-4 w-4 accent-black"
                />
                abre
              </label>

              <input
                type="time"
                value={linha.abre}
                disabled={linha.fechado}
                onChange={(e) => mudar(linha.dia_semana, 'abre', e.target.value)}
                className="rounded-lg border border-tinta-200 bg-white px-2 py-1.5 text-sm disabled:opacity-40"
              />
              <span className="text-tinta-400">às</span>
              <input
                type="time"
                value={linha.fecha}
                disabled={linha.fechado}
                onChange={(e) => mudar(linha.dia_semana, 'fecha', e.target.value)}
                className="rounded-lg border border-tinta-200 bg-white px-2 py-1.5 text-sm disabled:opacity-40"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-tinta-400">
          Fecha depois da meia-noite? Coloque, por exemplo, 18:00 às 02:00 — o sistema entende.
        </p>

        {erro && <p className="text-sm font-medium text-marca-600">{erro}</p>}
        {aviso && <p className="text-sm font-medium text-emerald-700">{aviso}</p>}

        <Botao type="submit" disabled={salvando} className="h-11 w-full">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar horários
        </Botao>
      </Cartao>
    </form>
  )
}
