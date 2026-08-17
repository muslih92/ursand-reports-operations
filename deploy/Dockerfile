FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile || bun install

COPY . .

# Build for a plain Node server instead of Cloudflare Workers
ENV NITRO_PRESET=node_server
# VITE_* values are inlined at build time, so they must be present here
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
RUN bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
