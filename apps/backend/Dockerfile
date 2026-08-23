# Multi-stage build because node-pty contains native code.
FROM node:24-bookworm AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:24-bookworm AS production-dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

FROM node:24-bookworm-slim AS runtime
ARG KUBECTL_VERSION=v1.36.0
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && curl -fsSLo /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && chmod +x /usr/local/bin/kubectl \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Include schema and migration history so the Argo CD migration Job can run
# `prisma migrate deploy` from this same image before each backend rollout.
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/envops-entrypoint

RUN sed -i 's/\r$//' /usr/local/bin/envops-entrypoint \
    && chmod +x /usr/local/bin/envops-entrypoint

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/envops-entrypoint"]

CMD ["node", "dist/server.js"]
