'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BadgePercent,
  Banknote,
  Bike,
  Check,
  CreditCard,
  Loader2,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { precoDaLinha, useCarrinho } from '@/components/carrinho-contexto'
import { conferirCupomAction, criarPedidoAction } from '@/app/(loja)/checkout/acoes'
import { AreaTexto, Botao, Campo, Cartao, Rotulo, Selecao, Vazio } from '@/components/ui'
import { mascaraTelefone, moeda } from '@/lib/format'
import type { OpcaoRetirada } from '@/lib/tempo'
import type { Bairro, FormaPagamento, TipoEntrega } from '@/lib/types'

const CHAVE_CLIENTE = 'cardapio:cliente:v1'

type DadosSalvos = {
  nome?: string
  telefone?: string
  email?: string
  nascimento?: string
  enderecoRua?: string
  enderecoNumero?: string
  enderecoComplemento?: string
  bairroId?: string
}

export function FormularioCheckout({
  noLocal,
  mesa,
  pedirAniversario,
  brindeAniversario,
  pedidoMinimoCentavos,
  aceitaOnline,
  aceitaLocal,
  aceitaRetirada,
  aceitaEntrega,
  bairros,
  tempoPreparoMin,
  tempoEntregaMin,
  entregaGratisAcimaCentavos,
  horariosRetirada,
}: {
  noLocal: boolean
  mesa: string | null
  pedirAniversario: boolean
  brindeAniversario: string | null
  pedidoMinimoCentavos: number
  aceitaOnline: boolean
  aceitaLocal: boolean
  aceitaRetirada: boolean
  aceitaEntrega: boolean
  bairros: Bairro[]
  tempoPreparoMin: number
  tempoEntregaMin: number
  entregaGratisAcimaCentavos: number | null
  horariosRetirada: OpcaoRetirada[]
}) {
  const router = useRouter()
  const { itens, carregado, subtotalCentavos, limpar } = useCarrinho()
  const [enviando, iniciarEnvio] = useTransition()

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [retirada, setRetirada] = useState(horariosRetirada[0]?.valor ?? '')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(
    aceitaOnline ? 'online' : 'local'
  )
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>(
    noLocal ? 'local' : aceitaRetirada ? 'retirada' : 'entrega'
  )

  const [bairroId, setBairroId] = useState(bairros[0]?.id ?? '')
  const [enderecoRua, setEnderecoRua] = useState('')
  const [enderecoNumero, setEnderecoNumero] = useState('')
  const [enderecoComplemento, setEnderecoComplemento] = useState('')
  const [enderecoReferencia, setEnderecoReferencia] = useState('')

  const [cupomDigitado, setCupomDigitado] = useState('')
  const [cupomAplicado, setCupomAplicado] = useState<string | null>(null)
  const [descontoCentavos, setDescontoCentavos] = useState(0)
  const [erroCupom, setErroCupom] = useState('')
  const [conferindoCupom, conferirCupom] = useTransition()

  const [erro, setErro] = useState('')

  // Recupera os dados de quem já pediu antes
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_CLIENTE)
      if (!salvo) return
      const dados = JSON.parse(salvo) as DadosSalvos
      if (dados.nome) setNome(dados.nome)
      if (dados.telefone) setTelefone(dados.telefone)
      if (dados.email) setEmail(dados.email)
      if (dados.nascimento) setNascimento(dados.nascimento)
      if (dados.enderecoRua) setEnderecoRua(dados.enderecoRua)
      if (dados.enderecoNumero) setEnderecoNumero(dados.enderecoNumero)
      if (dados.enderecoComplemento) setEnderecoComplemento(dados.enderecoComplemento)
      if (dados.bairroId && bairros.some((b) => b.id === dados.bairroId)) {
        setBairroId(dados.bairroId)
      }
    } catch {
      // sem drama: o cliente digita de novo
    }
  }, [bairros])

  // Trocou para entrega com "pagar na retirada" marcado? Passa para online,
  // senão o cliente só descobriria o problema ao tentar enviar.
  useEffect(() => {
    if (tipoEntrega === 'entrega' && formaPagamento === 'local' && aceitaOnline) {
      setFormaPagamento('online')
    }
  }, [tipoEntrega, formaPagamento, aceitaOnline])

  const itensParaServidor = useMemo(
    () =>
      itens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: i.quantidade,
        opcaoIds: i.opcoes.map((o) => o.id),
        observacao: i.observacao || undefined,
      })),
    [itens]
  )

  const ehEntrega = tipoEntrega === 'entrega'
  const ehNoLocal = tipoEntrega === 'local'
  const bairroEscolhido = bairros.find((b) => b.id === bairroId) ?? null

  const entregaIsenta =
    entregaGratisAcimaCentavos !== null &&
    entregaGratisAcimaCentavos > 0 &&
    subtotalCentavos >= entregaGratisAcimaCentavos

  const taxaCentavos = ehEntrega && bairroEscolhido && !entregaIsenta
    ? bairroEscolhido.taxa_centavos
    : 0

  const totalCentavos = Math.max(0, subtotalCentavos - descontoCentavos) + taxaCentavos

  if (!carregado) return <div className="py-16 text-center text-tinta-400">Carregando...</div>

  if (itens.length === 0) {
    return (
      <div className="py-10">
        <Vazio titulo="Seu carrinho está vazio" descricao="Escolha os itens antes de fechar.">
          <Link href="/">
            <Botao>Ver cardápio</Botao>
          </Link>
        </Vazio>
      </div>
    )
  }

  function aplicarCupom() {
    setErroCupom('')
    conferirCupom(async () => {
      const resposta = await conferirCupomAction(cupomDigitado, itensParaServidor)
      if (!resposta.ok) {
        setErroCupom(resposta.erro)
        setCupomAplicado(null)
        setDescontoCentavos(0)
        return
      }
      setCupomAplicado(resposta.codigo)
      setDescontoCentavos(resposta.descontoCentavos)
    })
  }

  function removerCupom() {
    setCupomAplicado(null)
    setCupomDigitado('')
    setDescontoCentavos(0)
    setErroCupom('')
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro('')

    iniciarEnvio(async () => {
      const resposta = await criarPedidoAction({
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim() || undefined,
        nascimento: nascimento || undefined,
        observacoes: observacoes.trim() || undefined,
        formaPagamento,
        tipoEntrega,
        retiradaPrevista: ehEntrega || ehNoLocal ? null : retirada || null,
        cupom: cupomAplicado ?? undefined,
        itens: itensParaServidor,
        bairroId: ehEntrega ? bairroId : null,
        enderecoRua: ehEntrega ? enderecoRua.trim() : undefined,
        enderecoNumero: ehEntrega ? enderecoNumero.trim() : undefined,
        enderecoComplemento: ehEntrega ? enderecoComplemento.trim() || undefined : undefined,
        enderecoReferencia: ehEntrega ? enderecoReferencia.trim() || undefined : undefined,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      const paraSalvar: DadosSalvos = {
        nome: nome.trim(),
        telefone,
        email: email.trim(),
        nascimento,
        enderecoRua: enderecoRua.trim(),
        enderecoNumero: enderecoNumero.trim(),
        enderecoComplemento: enderecoComplemento.trim(),
        bairroId,
      }
      localStorage.setItem(CHAVE_CLIENTE, JSON.stringify(paraSalvar))

      const anteriores: string[] = JSON.parse(localStorage.getItem('cardapio:pedidos') ?? '[]')
      localStorage.setItem(
        'cardapio:pedidos',
        JSON.stringify([resposta.pedidoId, ...anteriores].slice(0, 10))
      )
      limpar()

      if (resposta.externo) window.location.href = resposta.destino
      else router.push(resposta.destino)
    })
  }

  const faltaParaMinimo = pedidoMinimoCentavos - subtotalCentavos
  // quem está no salão não escolhe retirada/entrega
  const mostraEscolhaDeEntrega = !ehNoLocal && aceitaRetirada && aceitaEntrega
  // entrega sem pagamento online configurado não tem como ser paga
  const entregaSemPagamento = ehEntrega && !aceitaOnline

  return (
    <form onSubmit={enviar} className="py-6">
      <Link
        href="/carrinho"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-tinta-500 hover:text-tinta-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao carrinho
      </Link>

      <h1 className="text-2xl font-black tracking-tight text-tinta-900">Fechar pedido</h1>
      {mesa && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          <UtensilsCrossed className="h-4 w-4" />
          Mesa {mesa}
        </p>
      )}
      <p className="mt-1 text-sm text-tinta-500">
        {ehNoLocal
          ? 'Pague por aqui e apresente o código no salão.'
          : ehEntrega
            ? `A entrega leva cerca de ${bairroEscolhido?.tempo_min ?? tempoEntregaMin} minutos.`
            : `O preparo leva cerca de ${tempoPreparoMin} minutos.`}
      </p>

      {/* ---------- Retirada ou entrega ---------- */}
      {mostraEscolhaDeEntrega && (
        <Cartao className="mt-5 p-4">
          <h2 className="mb-3 font-bold text-tinta-900">Como quer receber</h2>
          <div className="grid grid-cols-2 gap-2">
            <BotaoEscolha
              marcada={!ehEntrega}
              onSelecionar={() => setTipoEntrega('retirada')}
              icone={<Store className="h-5 w-5" />}
              titulo="Retirar no balcão"
              descricao="Sem taxa"
            />
            <BotaoEscolha
              marcada={ehEntrega}
              onSelecionar={() => setTipoEntrega('entrega')}
              icone={<Bike className="h-5 w-5" />}
              titulo="Receber em casa"
              descricao={
                entregaIsenta
                  ? 'Entrega grátis'
                  : bairroEscolhido
                    ? `A partir de ${moeda(bairroEscolhido.taxa_centavos)}`
                    : 'Taxa por bairro'
              }
            />
          </div>
        </Cartao>
      )}

      {/* ---------- Dados do cliente ---------- */}
      <Cartao className="mt-4 p-4">
        <h2 className="mb-3 font-bold text-tinta-900">
          {ehNoLocal ? 'Seus dados' : ehEntrega ? 'Seus dados' : 'Quem vai retirar'}
        </h2>

        <div className="space-y-3">
          <div>
            <Rotulo htmlFor="nome">Nome</Rotulo>
            <Campo
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
            />
          </div>

          <div>
            <Rotulo htmlFor="telefone">Telefone (WhatsApp)</Rotulo>
            <Campo
              id="telefone"
              required
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              placeholder="(71) 99999-0000"
              autoComplete="tel"
            />
            <p className="mt-1 text-xs text-tinta-400">
              A gente avisa por aqui quando o pedido estiver pronto.
            </p>
          </div>

          {pedirAniversario && (
            <div>
              <Rotulo htmlFor="nascimento">
                Seu aniversário <span className="font-normal text-tinta-400">(opcional)</span>
              </Rotulo>
              <Campo
                id="nascimento"
                type="date"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
              {brindeAniversario && (
                <p className="mt-1 text-xs text-emerald-700">
                  🎁 No seu aniversário, {brindeAniversario}.
                </p>
              )}
            </div>
          )}

          {formaPagamento === 'online' && (
            <div>
              <Rotulo htmlFor="email">E-mail (opcional)</Rotulo>
              <Campo
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                autoComplete="email"
              />
              <p className="mt-1 text-xs text-tinta-400">
                Adianta o preenchimento na hora de pagar e serve de comprovante.
              </p>
            </div>
          )}

          {!ehEntrega && !ehNoLocal && horariosRetirada.length > 0 && (
            <div>
              <Rotulo htmlFor="retirada">Horário da retirada</Rotulo>
              <Selecao id="retirada" value={retirada} onChange={(e) => setRetirada(e.target.value)}>
                {horariosRetirada.map((opcao, indice) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                    {indice === 0 ? ' (o quanto antes)' : ''}
                  </option>
                ))}
              </Selecao>
            </div>
          )}

          <div>
            <Rotulo htmlFor="obs">Observação do pedido</Rotulo>
            <AreaTexto
              id="obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={
                ehNoLocal
                  ? 'Ex.: mesa 12, somos 3 pessoas'
                  : ehEntrega
                    ? 'Ex.: portão azul, interfone quebrado'
                    : 'Ex.: embala pra viagem'
              }
              maxLength={300}
            />
          </div>
        </div>
      </Cartao>

      {/* ---------- Endereço ---------- */}
      {ehEntrega && (
        <Cartao className="mt-4 p-4">
          <h2 className="mb-3 font-bold text-tinta-900">Endereço da entrega</h2>

          <div className="space-y-3">
            <div>
              <Rotulo htmlFor="bairro">Bairro</Rotulo>
              <Selecao
                id="bairro"
                required
                value={bairroId}
                onChange={(e) => setBairroId(e.target.value)}
              >
                {bairros.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome} · {b.taxa_centavos === 0 ? 'grátis' : moeda(b.taxa_centavos)} ·{' '}
                    {b.tempo_min} min
                  </option>
                ))}
              </Selecao>
              <p className="mt-1 text-xs text-tinta-400">
                Não achou seu bairro? Ainda não entregamos lá — dá para retirar no balcão.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Rotulo htmlFor="rua">Rua</Rotulo>
                <Campo
                  id="rua"
                  required
                  value={enderecoRua}
                  onChange={(e) => setEnderecoRua(e.target.value)}
                  placeholder="Rua das Flores"
                  autoComplete="address-line1"
                />
              </div>
              <div>
                <Rotulo htmlFor="numero">Número</Rotulo>
                <Campo
                  id="numero"
                  required
                  value={enderecoNumero}
                  onChange={(e) => setEnderecoNumero(e.target.value)}
                  placeholder="123"
                />
              </div>
            </div>

            <div>
              <Rotulo htmlFor="complemento">Complemento (opcional)</Rotulo>
              <Campo
                id="complemento"
                value={enderecoComplemento}
                onChange={(e) => setEnderecoComplemento(e.target.value)}
                placeholder="Apto 42, bloco B"
              />
            </div>

            <div>
              <Rotulo htmlFor="referencia">Ponto de referência (opcional)</Rotulo>
              <Campo
                id="referencia"
                value={enderecoReferencia}
                onChange={(e) => setEnderecoReferencia(e.target.value)}
                placeholder="Em frente à praça"
              />
            </div>
          </div>
        </Cartao>
      )}

      {/* ---------- Pagamento ---------- */}
      <Cartao className="mt-4 p-4">
        <h2 className="mb-3 font-bold text-tinta-900">Como você quer pagar</h2>

        <div className="space-y-2">
          {aceitaOnline && (
            <OpcaoPagamento
              marcada={formaPagamento === 'online'}
              onSelecionar={() => setFormaPagamento('online')}
              icone={<CreditCard className="h-5 w-5" />}
              titulo="Pagar agora (Pix ou cartão)"
              descricao="Você paga aqui mesmo e o preparo começa na hora."
            />
          )}

          {/* Dinheiro só onde existe um balcão: no salão ou na retirada.
              Nunca na entrega — o entregador não recebe pagamento. */}
          {aceitaLocal && !ehEntrega && (
            <OpcaoPagamento
              marcada={formaPagamento === 'local'}
              onSelecionar={() => setFormaPagamento('local')}
              icone={<Banknote className="h-5 w-5" />}
              titulo={ehNoLocal ? 'Pagar no caixa' : 'Pagar na retirada'}
              descricao={
                ehNoLocal
                  ? 'Dinheiro, Pix ou cartão direto no caixa do restaurante.'
                  : 'Dinheiro, Pix ou cartão no balcão, na hora de retirar.'
              }
            />
          )}
        </div>

        {aceitaLocal && ehEntrega && !entregaSemPagamento && (
          <p className="mt-2 rounded-xl bg-tinta-100 px-3.5 py-2.5 text-xs text-tinta-600">
            Para entrega, o pagamento é pelo site. <strong>Dinheiro só na retirada</strong> no
            balcão — o entregador não recebe pagamento.
          </p>
        )}

        {entregaSemPagamento && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <strong className="font-semibold">Entrega indisponível agora.</strong> O pagamento
            online está fora do ar, e o entregador não recebe dinheiro. Escolha{' '}
            <strong>retirar no balcão</strong> para concluir o pedido.
          </p>
        )}
      </Cartao>

      {/* ---------- Cupom ---------- */}
      <Cartao className="mt-4 p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-tinta-900">
          <BadgePercent className="h-4 w-4" />
          Cupom de desconto
        </h2>

        {cupomAplicado ? (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" />
              {cupomAplicado} · −{moeda(descontoCentavos)}
            </span>
            <button
              type="button"
              onClick={removerCupom}
              className="text-xs font-semibold text-emerald-700 underline underline-offset-2"
            >
              remover
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Campo
                value={cupomDigitado}
                onChange={(e) => setCupomDigitado(e.target.value.toUpperCase())}
                placeholder="Digite o cupom"
                className="uppercase"
              />
              <Botao
                type="button"
                variante="fantasma"
                onClick={aplicarCupom}
                disabled={conferindoCupom || !cupomDigitado.trim()}
              >
                {conferindoCupom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Botao>
            </div>
            {erroCupom && <p className="mt-2 text-sm text-marca-600">{erroCupom}</p>}
          </>
        )}
      </Cartao>

      {/* ---------- Resumo ---------- */}
      <Cartao className="mt-4 p-4">
        <h2 className="mb-3 font-bold text-tinta-900">Resumo</h2>

        <ul className="space-y-2 text-sm">
          {itens.map((item) => (
            <li key={item.linhaId} className="flex justify-between gap-3">
              <span className="text-tinta-600">
                {item.quantidade}x {item.nome}
                {item.opcoes.length > 0 && (
                  <span className="block text-xs text-tinta-400">
                    {item.opcoes.map((o) => o.nome).join(', ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                {moeda(precoDaLinha(item) * item.quantidade)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1.5 border-t border-tinta-200 pt-3 text-sm">
          <div className="flex justify-between text-tinta-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{moeda(subtotalCentavos)}</span>
          </div>
          {descontoCentavos > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto</span>
              <span className="tabular-nums">− {moeda(descontoCentavos)}</span>
            </div>
          )}
          {ehEntrega && (
            <div className="flex justify-between text-tinta-600">
              <span>Taxa de entrega</span>
              <span className="tabular-nums">
                {taxaCentavos === 0 ? (
                  <span className="font-semibold text-emerald-700">grátis</span>
                ) : (
                  moeda(taxaCentavos)
                )}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-lg font-bold text-tinta-900">
            <span>Total</span>
            <span className="tabular-nums">{moeda(totalCentavos)}</span>
          </div>
        </div>

        {ehEntrega && !entregaIsenta && entregaGratisAcimaCentavos !== null && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
            Faltam {moeda(entregaGratisAcimaCentavos - subtotalCentavos)} em produtos para a
            entrega sair de graça.
          </p>
        )}
      </Cartao>

      {erro && (
        <p className="mt-4 rounded-xl bg-marca-50 px-4 py-3 text-sm font-medium text-marca-700">
          {erro}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Botao
            type="submit"
            disabled={enviando || faltaParaMinimo > 0 || entregaSemPagamento}
            className="h-12 w-full text-base"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {entregaSemPagamento
              ? 'Escolha retirar no balcão'
              : faltaParaMinimo > 0
                ? `Faltam ${moeda(faltaParaMinimo)} para o mínimo`
                : formaPagamento === 'online'
                  ? `Ir para o pagamento · ${moeda(totalCentavos)}`
                  : `Enviar pedido · ${moeda(totalCentavos)}`}
          </Botao>
        </div>
      </div>
    </form>
  )
}

function BotaoEscolha({
  marcada,
  onSelecionar,
  icone,
  titulo,
  descricao,
}: {
  marcada: boolean
  onSelecionar: () => void
  icone: React.ReactNode
  titulo: string
  descricao: string
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition ${
        marcada ? 'border-tinta-900 bg-tinta-50' : 'border-tinta-200 hover:border-tinta-300'
      }`}
    >
      <span className={marcada ? 'text-marca' : 'text-tinta-500'}>{icone}</span>
      <span className="text-sm font-semibold text-tinta-900">{titulo}</span>
      <span className="text-xs text-tinta-500">{descricao}</span>
    </button>
  )
}

function OpcaoPagamento({
  marcada,
  onSelecionar,
  icone,
  titulo,
  descricao,
}: {
  marcada: boolean
  onSelecionar: () => void
  icone: React.ReactNode
  titulo: string
  descricao: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
        marcada ? 'border-tinta-900 bg-tinta-50' : 'border-tinta-200 hover:border-tinta-300'
      }`}
    >
      <input
        type="radio"
        name="pagamento"
        checked={marcada}
        onChange={onSelecionar}
        className="mt-1 h-5 w-5 accent-black"
      />
      <span className="text-tinta-600">{icone}</span>
      <span className="flex-1">
        <span className="block font-semibold text-tinta-900">{titulo}</span>
        <span className="block text-sm text-tinta-500">{descricao}</span>
      </span>
    </label>
  )
}
