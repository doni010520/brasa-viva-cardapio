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
RUN npm ci

# ---------- build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# As NEXT_PUBLIC_* entram no bundle do navegador, então precisam existir no build.
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

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
