'use client'

import { useEffect, useState } from 'react'

/**
 * Diz se o formulário tem alteração que ainda não foi gravada.
 *
 * Existe porque a pessoa mexe em três campos, o telefone toca, e meia hora
 * depois ela não lembra se clicou em Salvar. O formulário precisa responder
 * isso sozinho, o tempo todo — não dá para exigir memória de ninguém no
 * meio do serviço.
 *
 * Funciona por comparação: uma foto (JSON) do último estado salvo contra o
 * estado atual. Quem salva chama `marcarSalvo()` no sucesso, e a foto passa
 * a ser a de agora.
 */
export function useNaoSalvo(atual: unknown) {
  const foto = JSON.stringify(atual)
  const [salvo, setSalvo] = useState(foto)
  const pendente = foto !== salvo

  // Fechar a aba ou dar F5 com alteração pendente pergunta antes de descartar.
  useEffect(() => {
    if (!pendente) return
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // o Chrome ignora o texto, mas exige returnValue para mostrar o aviso
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pendente])

  return { pendente, marcarSalvo: () => setSalvo(foto) }
}

/** O estado do formulário, sempre visível ao lado do botão de salvar. */
export function EstadoDoFormulario({
  pendente,
  aviso,
  erro,
  mostrarTudoSalvo = true,
}: {
  pendente: boolean
  aviso: string
  erro: string
  mostrarTudoSalvo?: boolean
}) {
  if (erro) return <p className="text-sm font-medium text-marca-600">{erro}</p>
  if (pendente) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
        Alterações ainda não salvas — clique em Salvar.
      </p>
    )
  }
  if (aviso) return <p className="text-sm font-medium text-emerald-700">{aviso}</p>
  if (mostrarTudoSalvo) return <p className="text-sm text-tinta-400">Tudo salvo.</p>
  return null
}
