# -----------------------------------------------------------
# Backend API - Multi-stage Dockerfile (Node 20)
# -----------------------------------------------------------

# Stage 1: Base image with build tools for native modules
FROM node:20-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++

# Stage 2: Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

# Stage 3: Runner (production image)
FROM base AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application source
COPY . .

EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })" || exit 1

CMD ["node", "server.js"]
