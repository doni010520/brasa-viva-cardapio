import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes))
}

type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo'

const VARIANTES: Record<VarianteBotao, string> = {
  primario: 'bg-marca text-white hover:brightness-110 shadow-sm',
  secundario: 'bg-tinta-900 text-white hover:bg-tinta-700',
  fantasma: 'bg-white text-tinta-700 border border-tinta-200 hover:bg-tinta-50',
  perigo: 'bg-white text-marca-600 border border-marca-100 hover:bg-marca-50',
}

export function Botao({
  variante = 'primario',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        'transition disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-900',
        VARIANTES[variante],
        className
      )}
      {...props}
    />
  )
}

export function Campo({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-tinta-200 bg-white px-3.5 py-2.5 text-sm',
        'placeholder:text-tinta-400 focus:border-tinta-400 focus:outline-none',
        'disabled:bg-tinta-100',
        className
      )}
      {...props}
    />
  )
}

export function AreaTexto({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-tinta-200 bg-white px-3.5 py-2.5 text-sm',
        'placeholder:text-tinta-400 focus:border-tinta-400 focus:outline-none',
        className
      )}
      {...props}
    />
  )
}

export function Selecao({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-tinta-200 bg-white px-3.5 py-2.5 text-sm',
        'focus:border-tinta-400 focus:outline-none',
        className
      )}
      {...props}
    />
  )
}

export function Rotulo({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-tinta-700', className)}
      {...props}
    />
  )
}

export function Cartao({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-tinta-200 bg-white', className)}
      {...props}
    />
  )
}

const TONS = {
  neutro: 'bg-tinta-100 text-tinta-700',
  verde: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-700',
  vermelho: 'bg-marca-50 text-marca-700',
  azul: 'bg-sky-50 text-sky-700',
} as const

export function Selo({
  tom = 'neutro',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tom?: keyof typeof TONS }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        TONS[tom],
        className
      )}
      {...props}
    />
  )
}

export function Vazio({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-tinta-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold text-tinta-700">{titulo}</p>
      {descricao && <p className="mt-1 text-sm text-tinta-500">{descricao}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
