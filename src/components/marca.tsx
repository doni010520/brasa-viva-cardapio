/**
 * Marca da casa. Se o dono subir um logo no painel, ele manda; se não,
 * cai neste desenho vetorial (chama + nome), que acompanha a cor da marca.
 */

export function Chama({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.6 1.2c.9 3.3.3 5.6-1.3 7.6-1 1.3-2.2 2.4-3.1 3.7-1 1.4-1.6 2.9-1.4 4.8-1.1-.9-1.8-2.2-2-3.8-1.4 1.5-2.2 3.3-2.2 5.2 0 3.9 3.4 6.9 7.7 6.9s7.7-3 7.7-6.9c0-3.2-1.5-5.6-3.4-7.7-.2 1.3-.8 2.3-1.8 3 .8-4.2-.6-8.2-4-12.8z"
      />
      <path
        fill="#fff"
        fillOpacity=".85"
        d="M12.2 13.4c.5 1.8.1 3.1-.8 4.2-.6.8-1.1 1.5-1.1 2.5 0 1.6 1.3 2.7 2.9 2.7s2.9-1.2 2.9-2.8c0-1.9-1.1-3.4-2.3-4.8-.1.7-.4 1.2-.9 1.6.3-1.4-.2-2.5-.7-3.4z"
      />
    </svg>
  )
}

export function Marca({
  nome,
  logoUrl,
  className = '',
}: {
  nome: string
  logoUrl?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={nome}
        // 56px: abaixo disso o nome dentro da logo fica ilegível no celular
        className={`h-14 w-auto max-w-[200px] rounded-lg object-contain ${className}`}
      />
    )
  }

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Chama className="h-9 w-9 text-marca" />
      <span className="text-lg leading-none font-black tracking-tight text-white uppercase">
        {nome}
      </span>
    </span>
  )
}
