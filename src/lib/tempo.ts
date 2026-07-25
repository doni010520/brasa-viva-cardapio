import type { Configuracoes, Horario } from './types'

/**
 * O servidor normalmente roda em UTC, mas o restaurante vive no fuso dele.
 * Tudo que envolve "está aberto agora" e "horários de retirada" passa por aqui.
 */
export const FUSO = process.env.NEXT_PUBLIC_FUSO_HORARIO || 'America/Sao_Paulo'

type PartesData = {
  ano: number
  mes: number // 1-12
  dia: number
  hora: number
  minuto: number
  diaSemana: number // 0 = domingo
}

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Quebra um instante nas partes do relógio de parede do fuso da loja. */
export function partesNoFuso(instante: Date = new Date()): PartesData {
  const p = Object.fromEntries(
    formatador.formatToParts(instante).map((parte) => [parte.type, parte.value])
  ) as Record<string, string>

  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // '24' aparece à meia-noite em algumas engines
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: DIAS[p.weekday] ?? 0,
  }
}

/** Deslocamento do fuso da loja em relação ao UTC, em ms, naquele instante. */
function deslocamento(instante: Date) {
  const p = partesNoFuso(instante)
  const segundos = Number(
    Object.fromEntries(
      formatador.formatToParts(instante).map((parte) => [parte.type, parte.value])
    ).second
  )
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, segundos)
  return comoUtc - instante.getTime()
}

/** Relógio de parede da loja -> instante real (Date em UTC). */
export function doFusoParaInstante(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number
): Date {
  const chute = Date.UTC(ano, mes - 1, dia, hora, minuto)
  // duas passadas resolvem a borda do horário de verão
  let instante = new Date(chute - deslocamento(new Date(chute)))
  instante = new Date(chute - deslocamento(instante))
  return instante
}

/** Minutos desde a meia-noite. Aceita '19:30' e '19:30:00'. */
export function minutosDoDia(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutosParaHhmm(minutos: number) {
  const h = Math.floor(minutos / 60) % 24
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export type EstadoLoja = {
  aberta: boolean
  motivo: string
  horarioHoje: { abre: string; fecha: string } | null
}

/**
 * A loja está aberta agora? Considera a chave geral do dono e o horário do dia.
 * Fechamento após a meia-noite (ex.: 18:00 -> 02:00) é suportado.
 */
export function estadoDaLoja(
  config: Pick<Configuracoes, 'aberto_manual'>,
  horarios: Horario[],
  agora: Date = new Date()
): EstadoLoja {
  if (!config.aberto_manual) {
    return { aberta: false, motivo: 'A loja está fechada no momento.', horarioHoje: null }
  }

  const p = partesNoFuso(agora)
  const minutosAgora = p.hora * 60 + p.minuto

  const hoje = horarios.find((h) => h.dia_semana === p.diaSemana)
  const ontem = horarios.find((h) => h.dia_semana === (p.diaSemana + 6) % 7)

  // varou a madrugada de ontem?
  if (ontem && !ontem.fechado) {
    const abre = minutosDoDia(ontem.abre)
    const fecha = minutosDoDia(ontem.fecha)
    if (fecha < abre && minutosAgora < fecha) {
      return {
        aberta: true,
        motivo: '',
        horarioHoje: { abre: ontem.abre.slice(0, 5), fecha: ontem.fecha.slice(0, 5) },
      }
    }
  }

  if (!hoje || hoje.fechado) {
    return { aberta: false, motivo: 'Hoje não abrimos.', horarioHoje: null }
  }

  const abre = minutosDoDia(hoje.abre)
  const fecha = minutosDoDia(hoje.fecha)
  const janela = { abre: hoje.abre.slice(0, 5), fecha: hoje.fecha.slice(0, 5) }
  const dentro = fecha > abre
    ? minutosAgora >= abre && minutosAgora < fecha
    : minutosAgora >= abre // fecha depois da meia-noite

  return dentro
    ? { aberta: true, motivo: '', horarioHoje: janela }
    : {
        aberta: false,
        motivo:
          minutosAgora < abre
            ? `Abrimos hoje às ${janela.abre}.`
            : `Já fechamos por hoje. Amanhã tem mais.`,
        horarioHoje: janela,
      }
}

export type OpcaoRetirada = { valor: string; rotulo: string }

/**
 * Horários de retirada oferecidos no checkout: de 15 em 15 minutos, do preparo
 * mínimo até o fechamento do dia. `valor` é ISO (UTC), pronto pro banco.
 */
export function horariosDeRetirada(
  config: Pick<Configuracoes, 'tempo_preparo_min' | 'antecedencia_min'>,
  horarios: Horario[],
  agora: Date = new Date()
): OpcaoRetirada[] {
  const p = partesNoFuso(agora)
  const hoje = horarios.find((h) => h.dia_semana === p.diaSemana)
  if (!hoje || hoje.fechado) return []

  const espera = Math.max(config.tempo_preparo_min, config.antecedencia_min)
  const primeiro = p.hora * 60 + p.minuto + espera
  const inicio = Math.max(minutosDoDia(hoje.abre), Math.ceil(primeiro / 15) * 15)

  const fechaBruto = minutosDoDia(hoje.fecha)
  const fim = fechaBruto > minutosDoDia(hoje.abre) ? fechaBruto : fechaBruto + 24 * 60

  const opcoes: OpcaoRetirada[] = []
  for (let m = inicio; m <= fim && opcoes.length < 48; m += 15) {
    const instante = doFusoParaInstante(p.ano, p.mes, p.dia, Math.floor(m / 60), m % 60)
    opcoes.push({ valor: instante.toISOString(), rotulo: minutosParaHhmm(m) })
  }
  return opcoes
}

/** ISO -> "18:45" no fuso da loja. */
export function horaCurta(iso: string | null) {
  if (!iso) return null
  const p = partesNoFuso(new Date(iso))
  return `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`
}

/** ISO -> "25/07 às 18:45" */
export function dataHoraCurta(iso: string) {
  const p = partesNoFuso(new Date(iso))
  return `${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')} às ${String(
    p.hora
  ).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`
}

/** "há 4 min" — usado no painel da cozinha. */
export function haQuantoTempo(iso: string, agora: Date = new Date()) {
  const minutos = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  return `há ${Math.floor(horas / 24)}d`
}

/** Data de hoje no fuso da loja, formato 'YYYY-MM-DD'. */
export function hojeIso(agora: Date = new Date()) {
  const p = partesNoFuso(agora)
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/** Início do dia (00:00 no fuso da loja) N dias atrás, como instante UTC. */
export function inicioDoDiaAtras(dias: number, agora: Date = new Date()) {
  const base = new Date(agora.getTime() - dias * 86400000)
  const p = partesNoFuso(base)
  return doFusoParaInstante(p.ano, p.mes, p.dia, 0, 0)
}
