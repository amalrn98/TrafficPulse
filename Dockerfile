# Multi-stage production Dockerfile pinned to Node 22 LTS
FROM node:22.14-alpine AS base
RUN apk add --no-cache libc6-compat openssl wget

# Stage 1: Install dependencies with lockfile
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/classifier/package.json ./packages/classifier/
COPY packages/tracker/package.json ./packages/tracker/
COPY packages/middleware/package.json ./packages/middleware/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN npm ci

# Stage 2: Build packages and Next.js standalone output
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build --workspace=@trafficpulse/classifier
RUN npm run build --workspace=@trafficpulse/tracker
RUN npm run build --workspace=@trafficpulse/middleware
RUN npx prisma generate --schema=apps/dashboard/prisma/schema.prisma
RUN npm run build --workspace=@trafficpulse/dashboard

# Stage 3: Minimal production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user setup
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy minimal standalone build output and static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/prisma ./apps/dashboard/prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/dashboard/server.js"]
