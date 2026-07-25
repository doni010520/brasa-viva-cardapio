# syntax=docker/dockerfile:1

# =============================================================
# Cardápio Online — imagem de produção (EasyPanel / Docker)
# =============================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---------- dependências ----------
FROM base AS deps
COPY package.json package-lock.json* ./

# O playwright só é usado pelos testes locais. Se um dia a versão dele voltar
# a baixar navegador no install, o build da imagem levaria centenas de MB
# desnecessários — e poderia quebrar por falta de dependência do sistema.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# As NEXT_PUBLIC_* entram no bundle do navegador, então precisam existir no
# momento do build — configurar só em "Environment" não basta.
# No EasyPanel: Build > Build Arguments.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_URL_BASE
ARG NEXT_PUBLIC_MP_PUBLIC_KEY
ARG NEXT_PUBLIC_FUSO_HORARIO=America/Sao_Paulo
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_URL_BASE=$NEXT_PUBLIC_URL_BASE \
    NEXT_PUBLIC_MP_PUBLIC_KEY=$NEXT_PUBLIC_MP_PUBLIC_KEY \
    NEXT_PUBLIC_FUSO_HORARIO=$NEXT_PUBLIC_FUSO_HORARIO \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- execução ----------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Sao_Paulo

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# O standalone traz só o servidor mínimo; estáticos e public vão à parte.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Sinal de vida que não depende do banco: instabilidade do Supabase não pode
# fazer o orquestrador reiniciar o app em loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
