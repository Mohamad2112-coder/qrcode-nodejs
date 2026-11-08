# -----------------------------------------------------------
# Frontend - Multi-stage Dockerfile (Next.js 14, Node 20)
# -----------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /usr/src/app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time args for Next.js public runtime config (inlined at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}

# Stage 1: Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm install --include=dev

# Stage 2: Build the Next.js application
FROM base AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Runner
FROM base AS runner
WORKDIR /usr/src/app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /usr/src/app/public ./public

# Copy built application (standalone output if configured)
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node_modules/.bin/next", "start"]
