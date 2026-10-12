FROM node:20-alpine AS base

# Step 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json ./
COPY packages/classifier/package.json ./packages/classifier/
COPY packages/tracker/package.json ./packages/tracker/
COPY packages/middleware/package.json ./packages/middleware/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN npm install

# Step 2: Build packages and dashboard
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@trafficpulse/classifier
RUN npm run build --workspace=@trafficpulse/tracker
RUN npm run build --workspace=@trafficpulse/middleware
RUN npm run build --workspace=@trafficpulse/dashboard

# Step 3: Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@trafficpulse/dashboard"]
