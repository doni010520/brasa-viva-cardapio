'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Camera, Loader2, MessageCircle } from 'lucide-react'
import {
  salvarConfiguracoesAction,
  salvarHorariosAction,
} from '@/app/admin/(painel)/config/acoes'
import { GestaoBairros } from '@/components/admin/gestao-bairros'
import { EstadoDoFormulario, useNaoSalvo } from '@/components/admin/nao-salvo'
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
    endereco_url: config.endereco_url ?? '',
    tempo_preparo_min: String(config.tempo_preparo_min),
    antecedencia_min: String(config.antecedencia_min),
    pedido_minimo: centavosParaInput(config.pedido_minimo_centavos),
    aceita_pagamento_online: config.aceita_pagamento_online,
    aceita_pagamento_local: config.aceita_pagamento_local,
    chave_pix: config.chave_pix ?? '',
    aceita_pix: config.aceita_pix,
    aceita_cartao: config.aceita_cartao,
    pix_expira_min: String(config.pix_expira_min),
    aceita_consumo_local: config.aceita_consumo_local,
    aceita_retirada: config.aceita_retirada,
    aceita_entrega: config.aceita_entrega,
    tempo_entrega_min: String(config.tempo_entrega_min),
    entrega_gratis_acima: centavosParaInput(config.entrega_gratis_acima_centavos),
    instagram_url: config.instagram_url ?? '',
    campanha_ativa: config.campanha_ativa,
    campanha_titulo: config.campanha_titulo ?? '',
    campanha_texto: config.campanha_texto ?? '',
    campanha_botao: config.campanha_botao ?? '',
    campanha_emoji: config.campanha_emoji ?? '🍫',
  })

  const { pendente, marcarSalvo } = useNaoSalvo(campos)

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
      else {
        marcarSalvo()
        setAviso('Configurações salvas.')
      }
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
                className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-tinta-200 text-base"
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

        <div>
          <Rotulo htmlFor="endereco_url">Link do endereço no Google Maps</Rotulo>
          <Campo
            id="endereco_url"
            value={campos.endereco_url}
            onChange={(e) => mudar('endereco_url', e.target.value)}
            placeholder="https://www.google.com/maps/..."
          />
          <p className="mt-1 text-xs text-tinta-400">
            Com o link preenchido, o endereço no rodapé do site vira um atalho para o mapa.
          </p>
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
        <h2 className="font-bold text-tinta-900">Como a casa atende</h2>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_consumo_local}
            onChange={(e) => mudar('aceita_consumo_local', e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">
              Atender no salão (buffet livre)
            </span>
            <span className="block text-xs text-tinta-500">
              O cliente escolhe “estou no restaurante”, paga pelo celular e se serve. Comida no
              quilo continua sendo direto no balcão, fora do sistema.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_retirada}
            onChange={(e) => mudar('aceita_retirada', e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-black"
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
            className="mt-0.5 h-5 w-5 accent-black"
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
            className="mt-0.5 h-5 w-5 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">
              Aceitar pagamento online
            </span>
            <span className="block text-xs text-tinta-500">
              O cliente paga dentro do site, sem ser jogado para fora.
            </span>
          </span>
        </label>

        {campos.aceita_pagamento_online && (
          <div className="ml-6 space-y-2.5 border-l-2 border-tinta-200 pl-4">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={campos.aceita_pix}
                onChange={(e) => mudar('aceita_pix', e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-black"
              />
              <span>
                <span className="block text-sm font-medium text-tinta-900">Pix</span>
                <span className="block text-xs text-tinta-500">
                  QR Code na própria tela. Cai na hora e é o mais barato para você.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={campos.aceita_cartao}
                onChange={(e) => mudar('aceita_cartao', e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-black"
              />
              <span>
                <span className="block text-sm font-medium text-tinta-900">
                  Cartão de crédito
                </span>
                <span className="block text-xs text-tinta-500">
                  Aprovação na hora. O Mercado Pago cobra a taxa dele.
                </span>
              </span>
            </label>

            {campos.aceita_pix && (
              <div className="max-w-[220px] pt-1">
                <Rotulo htmlFor="pix-expira">O Pix vence em (minutos)</Rotulo>
                <Campo
                  id="pix-expira"
                  type="number"
                  min={5}
                  max={1440}
                  value={campos.pix_expira_min}
                  onChange={(e) => mudar('pix_expira_min', e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.aceita_pagamento_local}
            onChange={(e) => mudar('aceita_pagamento_local', e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-black"
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

        <hr className="border-tinta-200" />
        <h2 className="flex items-center gap-2 font-bold text-tinta-900">
          <Camera className="h-4 w-4" />
          Campanha depois do pagamento
        </h2>
        <p className="-mt-2 text-xs text-tinta-500">
          Aparece na tela de agradecimento, logo depois que o cliente paga — o momento em que
          ele está com o celular na mão e satisfeito.
        </p>

        <div>
          <Rotulo htmlFor="instagram">Link do Instagram do restaurante</Rotulo>
          <Campo
            id="instagram"
            value={campos.instagram_url}
            onChange={(e) => mudar('instagram_url', e.target.value)}
            placeholder="https://instagram.com/brasaviva"
          />
        </div>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={campos.campanha_ativa}
            onChange={(e) => mudar('campanha_ativa', e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-black"
          />
          <span>
            <span className="block text-sm font-medium text-tinta-900">Mostrar a campanha</span>
            <span className="block text-xs text-tinta-500">
              Precisa do link do Instagram preenchido.
            </span>
          </span>
        </label>

        {campos.campanha_ativa && (
          <div className="space-y-3">
            <div className="grid grid-cols-[70px_1fr] gap-3">
              <div>
                <Rotulo htmlFor="camp-emoji">Emoji</Rotulo>
                <Campo
                  id="camp-emoji"
                  value={campos.campanha_emoji}
                  onChange={(e) => mudar('campanha_emoji', e.target.value)}
                  className="text-center text-lg"
                />
              </div>
              <div>
                <Rotulo htmlFor="camp-titulo">Título</Rotulo>
                <Campo
                  id="camp-titulo"
                  value={campos.campanha_titulo}
                  onChange={(e) => mudar('campanha_titulo', e.target.value)}
                  placeholder="Poste e ganhe um bombom!"
                />
              </div>
            </div>

            <div>
              <Rotulo htmlFor="camp-texto">Explicação da promoção</Rotulo>
              <AreaTexto
                id="camp-texto"
                rows={3}
                value={campos.campanha_texto}
                onChange={(e) => mudar('campanha_texto', e.target.value)}
                placeholder="Marque a gente numa foto do seu pedido e retire seu bombom no caixa."
                maxLength={280}
              />
            </div>

            <div>
              <Rotulo htmlFor="camp-botao">Texto do botão</Rotulo>
              <Campo
                id="camp-botao"
                value={campos.campanha_botao}
                onChange={(e) => mudar('campanha_botao', e.target.value)}
                placeholder="Quero meu bombom"
              />
            </div>
          </div>
        )}

        <EstadoDoFormulario pendente={pendente} aviso={aviso} erro={erro} />

        <Botao type="submit" disabled={salvando || !pendente} className="h-11 w-full">
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

  const { pendente, marcarSalvo } = useNaoSalvo(linhas)

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
      else {
        marcarSalvo()
        setAviso('Horários salvos.')
      }
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
                  className="h-5 w-5 accent-black"
                />
                abre
              </label>

              <input
                type="time"
                value={linha.abre}
                disabled={linha.fechado}
                onChange={(e) => mudar(linha.dia_semana, 'abre', e.target.value)}
                className="rounded-lg border border-tinta-200 bg-white px-2 py-1.5 text-base lg:text-sm disabled:opacity-40"
              />
              <span className="text-tinta-400">às</span>
              <input
                type="time"
                value={linha.fecha}
                disabled={linha.fechado}
                onChange={(e) => mudar(linha.dia_semana, 'fecha', e.target.value)}
                className="rounded-lg border border-tinta-200 bg-white px-2 py-1.5 text-base lg:text-sm disabled:opacity-40"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-tinta-400">
          Fecha depois da meia-noite? Coloque, por exemplo, 18:00 às 02:00 — o sistema entende.
        </p>

        <EstadoDoFormulario pendente={pendente} aviso={aviso} erro={erro} />

        <Botao type="submit" disabled={salvando || !pendente} className="h-11 w-full">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar horários
        </Botao>
      </Cartao>
    </form>
  )
}
