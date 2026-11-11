'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleAlert, Loader2, Receipt, Wifi } from 'lucide-react'
import { salvarFiscalAction, testarSefazAction } from '@/app/admin/(painel)/config/acoes'
import { Botao, Campo, Cartao, Rotulo, Selecao } from '@/components/ui'
import type { Configuracoes } from '@/lib/types'

export type SituacaoCertificado =
  | { estado: 'ausente' }
  | { estado: 'invalido'; erro: string }
  | { estado: 'ok'; titular: string; cnpj: string | null; validoAte: string; cnpjBate: boolean }

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <span>{children}</span>
    </li>
  )
}

/**
 * Dados fiscais da NFC-e. O que é segredo (certificado, senha, CSC) não
 * passa por aqui: fica no ambiente do servidor. A tela só mostra se está
 * configurado e deixa testar a conexão com a SEFAZ.
 */
export function ConfigFiscal({
  config,
  certificado,
  cscConfigurado,
  pendencias,
}: {
  config: Configuracoes
  certificado: SituacaoCertificado
  cscConfigurado: boolean
  pendencias: string[]
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [testando, testar] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null)

  const [f, setF] = useState({
    razao_social: config.razao_social ?? '',
    inscricao_estadual: config.inscricao_estadual ?? '',
    crt: String(config.crt ?? 1),
    fiscal_logradouro: config.fiscal_logradouro ?? '',
    fiscal_numero: config.fiscal_numero ?? '',
    fiscal_complemento: config.fiscal_complemento ?? '',
    fiscal_bairro: config.fiscal_bairro ?? '',
    fiscal_cep: config.fiscal_cep ?? '',
    fiscal_municipio_ibge: config.fiscal_municipio_ibge ?? '2910057',
    fiscal_municipio: config.fiscal_municipio ?? "Dias d'Avila",
    nfce_ativa: config.nfce_ativa ?? false,
    nfce_ambiente: String(config.nfce_ambiente ?? 2),
    nfce_serie: String(config.nfce_serie ?? 1),
    nfce_ncm_padrao: config.nfce_ncm_padrao ?? '21069090',
    nfce_cfop_padrao: config.nfce_cfop_padrao ?? '5102',
    nfce_csosn_padrao: config.nfce_csosn_padrao ?? '102',
  })
  const muda = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [campo]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })

  function enviar() {
    setMsg(null)
    if (f.nfce_ambiente === '1' && config.nfce_ambiente !== 1) {
      const certeza = window.confirm(
        'Mudar para PRODUÇÃO: a partir daqui as notas têm valor fiscal de verdade. Já testou em homologação?'
      )
      if (!certeza) return
    }
    salvar(async () => {
      const r = await salvarFiscalAction({ ...f })
      setMsg(r.ok ? { ok: true, texto: 'Dados fiscais salvos.' } : { ok: false, texto: r.erro })
      router.refresh()
    })
  }

  function testarConexao() {
    setTeste(null)
    testar(async () => {
      const r = await testarSefazAction()
      setTeste({ ok: r.ok, texto: r.mensagem })
    })
  }

  return (
    <Cartao className="mt-6 space-y-4 p-4">
      <h2 className="flex items-center gap-2 font-bold text-tinta-900">
        <Receipt className="h-5 w-5" />
        Nota fiscal (NFC-e)
      </h2>

      <ul className="space-y-1.5 rounded-xl bg-tinta-50 p-3 text-sm text-tinta-700">
        <Item ok={certificado.estado === 'ok' && certificado.cnpjBate}>
          {certificado.estado === 'ausente' && 'Certificado digital A1: aguardando.'}
          {certificado.estado === 'invalido' && `Certificado com problema: ${certificado.erro}`}
          {certificado.estado === 'ok' && (
            <>
              Certificado de {certificado.titular.split(':')[0]}, válido até{' '}
              {new Date(certificado.validoAte).toLocaleDateString('pt-BR')}
              {!certificado.cnpjBate && ' — ATENÇÃO: o CNPJ do certificado é diferente do CNPJ da loja.'}
            </>
          )}
        </Item>
        <Item ok={cscConfigurado}>
          {cscConfigurado ? 'CSC (código de segurança da SEFAZ) configurado.' : 'CSC da SEFAZ-BA: aguardando.'}
        </Item>
        <Item ok={pendencias.length === 0}>
          {pendencias.length === 0 ? 'Tudo pronto para emitir.' : `Falta: ${pendencias.join('; ')}.`}
        </Item>
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Rotulo htmlFor="razao">Razão social (como está no CNPJ)</Rotulo>
          <Campo id="razao" value={f.razao_social} onChange={muda('razao_social')} maxLength={60} />
        </div>
        <div>
          <Rotulo htmlFor="ie">Inscrição estadual</Rotulo>
          <Campo id="ie" inputMode="numeric" value={f.inscricao_estadual} onChange={muda('inscricao_estadual')} />
        </div>
        <div>
          <Rotulo htmlFor="crt">Regime tributário</Rotulo>
          <Selecao id="crt" value={f.crt} onChange={muda('crt')}>
            <option value="1">Simples Nacional</option>
            <option value="4">MEI</option>
            <option value="2">Simples (excesso de sublimite)</option>
            <option value="3">Regime normal (não suportado ainda)</option>
          </Selecao>
        </div>
        <div className="sm:col-span-2">
          <Rotulo htmlFor="lgr">Rua (endereço do CNPJ)</Rotulo>
          <Campo id="lgr" value={f.fiscal_logradouro} onChange={muda('fiscal_logradouro')} maxLength={60} />
        </div>
        <div>
          <Rotulo htmlFor="nro">Número</Rotulo>
          <Campo id="nro" value={f.fiscal_numero} onChange={muda('fiscal_numero')} />
        </div>
        <div>
          <Rotulo htmlFor="cpl">Complemento</Rotulo>
          <Campo id="cpl" value={f.fiscal_complemento} onChange={muda('fiscal_complemento')} />
        </div>
        <div>
          <Rotulo htmlFor="bairro">Bairro</Rotulo>
          <Campo id="bairro" value={f.fiscal_bairro} onChange={muda('fiscal_bairro')} />
        </div>
        <div>
          <Rotulo htmlFor="cep">CEP</Rotulo>
          <Campo id="cep" inputMode="numeric" value={f.fiscal_cep} onChange={muda('fiscal_cep')} />
        </div>
        <div>
          <Rotulo htmlFor="mun">Município</Rotulo>
          <Campo id="mun" value={f.fiscal_municipio} onChange={muda('fiscal_municipio')} />
        </div>
        <div>
          <Rotulo htmlFor="ibge">Código IBGE do município</Rotulo>
          <Campo id="ibge" inputMode="numeric" value={f.fiscal_municipio_ibge} onChange={muda('fiscal_municipio_ibge')} />
        </div>
      </div>

      <h3 className="pt-2 text-sm font-bold text-tinta-900">Regra fiscal padrão dos produtos</h3>
      <p className="-mt-2 text-xs text-tinta-500">
        Confirme com a contabilidade. Produto com regra diferente (bebida, por exemplo) é ajustado no cardápio.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Rotulo htmlFor="ncm">NCM</Rotulo>
          <Campo id="ncm" inputMode="numeric" value={f.nfce_ncm_padrao} onChange={muda('nfce_ncm_padrao')} />
        </div>
        <div>
          <Rotulo htmlFor="cfop">CFOP</Rotulo>
          <Campo id="cfop" inputMode="numeric" value={f.nfce_cfop_padrao} onChange={muda('nfce_cfop_padrao')} />
        </div>
        <div>
          <Rotulo htmlFor="csosn">CSOSN</Rotulo>
          <Selecao id="csosn" value={f.nfce_csosn_padrao} onChange={muda('nfce_csosn_padrao')}>
            <option value="102">102 - Sem crédito</option>
            <option value="103">103 - Isento (faixa)</option>
            <option value="300">300 - Imune</option>
            <option value="400">400 - Não tributada</option>
            <option value="500">500 - ICMS por ST</option>
          </Selecao>
        </div>
      </div>

      <h3 className="pt-2 text-sm font-bold text-tinta-900">Emissão</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Rotulo htmlFor="amb">Ambiente</Rotulo>
          <Selecao id="amb" value={f.nfce_ambiente} onChange={muda('nfce_ambiente')}>
            <option value="2">Homologação (teste, sem valor fiscal)</option>
            <option value="1">Produção (nota de verdade)</option>
          </Selecao>
        </div>
        <div>
          <Rotulo htmlFor="serie">Série</Rotulo>
          <Campo id="serie" inputMode="numeric" value={f.nfce_serie} onChange={muda('nfce_serie')} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-tinta-700">
        <input type="checkbox" checked={f.nfce_ativa} onChange={muda('nfce_ativa')} className="h-4 w-4" />
        Mostrar o botão &quot;Emitir NFC-e&quot; nos pedidos
      </label>

      <div className="flex flex-wrap gap-2">
        <Botao onClick={enviar} disabled={salvando}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar dados fiscais
        </Botao>
        <Botao variante="fantasma" onClick={testarConexao} disabled={testando || certificado.estado !== 'ok'}>
          {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
          Testar conexão com a SEFAZ
        </Botao>
      </div>
      {msg && <p className={msg.ok ? 'text-sm text-emerald-700' : 'text-sm text-marca-600'}>{msg.texto}</p>}
      {teste && <p className={teste.ok ? 'text-sm text-emerald-700' : 'text-sm text-marca-600'}>{teste.texto}</p>}
    </Cartao>
  )
}
