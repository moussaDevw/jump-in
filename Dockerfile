FROM node:22.14.0-bookworm-slim AS builder

WORKDIR /usr/src/app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Copie du reste du code source (filtré par .dockerignore) et compilation TypeScript
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Suppression des devDependencies pour ne garder que le strict nécessaire en production
RUN npm prune --omit=dev && npm cache clean --force


FROM node:22.14.0-bookworm-slim AS runner

WORKDIR /usr/src/app

# Certificats SSL et OpenSSL pour les appels HTTPS externes (Bictorys, Google, Apple, R2, Resend) et Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=dev
ENV PORT=3000

# Copie uniquement des artefacts nécessaires depuis le stage builder avec les droits de l'utilisateur 'node'
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

# Sécurité : exécution sans privilèges root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]