# Guide Étape par Étape — Configuration du `Dockerfile` (RunHub / Jump-In)

Ce document détaille toutes les étapes pour transformer le `Dockerfile` actuel en une configuration **prête pour la production** (légère, sécurisée et adaptée aux spécificités de **NestJS 11**, **Prisma 7** et **`bcrypt`**).

---

## 🔍 Pourquoi modifier le `Dockerfile` actuel ?

Le `Dockerfile` initial présente plusieurs problèmes critiques pour ce projet :

1. **Absence de `.dockerignore`** : `COPY . .` copie votre dossier `node_modules` Windows dans le conteneur Linux (ce qui casse les modules natifs comme **`bcrypt`** et les moteurs **Prisma**) ainsi que votre fichier `.env` (fuite de secrets dans l'image).
2. **Client Prisma 7 non généré** : Sans `npx prisma generate` avant la compilation, TypeScript et `@prisma/client` échoueront. De plus, `prisma.config.ts` appelle `env("DATABASE_URL")`, ce qui exige une variable `DATABASE_URL` (même factice) pendant l'étape de build.
3. **Pas de build TypeScript (`npm run start`)** : Lancer `nest start` en conteneur embarque tous les outils de développement, consomme beaucoup de RAM et ne transmet pas proprement les signaux d'arrêt (`SIGTERM`) à Node.js.
4. **Piège sur le chemin de sortie `dist/`** : Dans `package.json`, `"start:prod"` cible `dist/src/main`, mais `tsconfig.build.json` exclut `prisma.config.ts`, donc `nest build` génère en réalité **`dist/main.js`** à la racine de `dist/`.
5. **Image lourde et exécution en `root`** : `node:22.14.0` pèse plus de 1 Go et exécute l'API avec les droits administrateur `root`.

---

## Étape 1 : Créer le fichier `.dockerignore`

À la racine du projet (au même niveau que le `Dockerfile`), créez un fichier nommé **`.dockerignore`**.

Il empêche Docker d'envoyer des fichiers lourds, sensibles ou incompatibles OS lors du `COPY . .` :

```dockerignore
# Dépendances locales (seront installées proprement pour Linux dans le conteneur)
node_modules
npm-debug.log*

# Fichiers compilés et tests locaux
dist
coverage
test
*.spec.ts

# Secrets et variables d'environnement (NE JAMAIS copier dans l'image)
.env
.env.*
!.env.example

# Git, documentation et IDE
.git
.gitignore
.vscode
.idea
docs
README.md
modules_plan.md
```

---

## Étape 2 : Vérifier le point d'entrée de production (`package.json`)

Lorsque vous lancez `npm run build`, NestJS compile le code dans **`dist/main.js`** (et non `dist/src/main.js`).

Dans `package.json`, il est recommandé d'aligner le script `start:prod` :

```json
"start:prod": "node dist/main"
```

*(Dans le `Dockerfile`, nous appellerons directement `CMD ["node", "dist/main.js"]` pour que Node reçoive directement les signaux système Linux sans passer par `npm`.)*

---

## Étape 3 : Construire le `Dockerfile` en Multi-Stage (Détail des étapes)

Nous utilisons l'image **`node:22.14.0-bookworm-slim`** (basée sur Debian `glibc`) plutôt qu'`alpine` afin d'éviter toute erreur de compilation C++ avec **`bcrypt`** et les binaires **Prisma**.

### 3.1 — Étape `builder` : Dépendances système et NPM

On installe `openssl` (requis par Prisma), puis uniquement `package.json` et `package-lock.json` avant le reste du code pour tirer parti du cache Docker avec `npm ci` :

```dockerfile
FROM node:22.14.0-bookworm-slim AS builder

WORKDIR /usr/src/app

# OpenSSL est requis par le moteur Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copie des manifestes uniquement (optimisation du cache des layers Docker)
COPY package*.json ./

# Installation déterministe de toutes les dépendances (dev incluses pour compiler)
RUN npm ci
```

### 3.2 — Étape `builder` : Génération du client Prisma 7 & Build NestJS

On copie la configuration Prisma (`prisma/` + `prisma.config.ts`) et le code source, on génère le client Prisma (avec une `DATABASE_URL` factice uniquement le temps du build car `prisma.config.ts` vérifie sa présence), on compile NestJS, puis on nettoie les `devDependencies` :

```dockerfile
# Copie du schéma Prisma multi-fichiers et de sa config
COPY prisma ./prisma
COPY prisma.config.ts ./

# URL factice utilisée uniquement par prisma.config.ts lors de la génération des types
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Copie du reste du code source (filtré par .dockerignore) et compilation TypeScript
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Suppression des devDependencies pour ne garder que le strict nécessaire en production
RUN npm prune --omit=dev && npm cache clean --force
```

### 3.3 — Étape `runner` : Image finale légère et sécurisée

On repart d'une image vierge `node:22.14.0-bookworm-slim`, on n'y copie que les `node_modules` de production (contenant déjà le client Prisma généré) et le dossier `dist/`, puis on passe sur l'utilisateur non-root `node` :

```dockerfile
FROM node:22.14.0-bookworm-slim AS runner

WORKDIR /usr/src/app

# Certificats SSL et OpenSSL pour les appels HTTPS externes (Bictorys, Google, Apple, R2, Resend) et Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Copie uniquement des artefacts nécessaires depuis le stage builder avec les droits de l'utilisateur 'node'
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

# Sécurité : exécution sans privilèges root
USER node

EXPOSE 3000

# Vérification de santé intégrée (route GET /api du Health Controller)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Lancement direct via Node (gestion propre de SIGTERM / arrêt gracieux Prisma)
CMD ["node", "dist/main.js"]
```

---

## Étape 4 : Fichier `Dockerfile` complet prêt à l'emploi

Voici l'assemblage complet à placer dans votre fichier `Dockerfile` :

```dockerfile
# ==============================================================================
# STAGE 1 : BUILDER (Installation, génération Prisma & compilation TypeScript)
# ==============================================================================
FROM node:22.14.0-bookworm-slim AS builder

WORKDIR /usr/src/app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./

# Prisma 7 lit env("DATABASE_URL") dans prisma.config.ts même pendant `generate`
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev && npm cache clean --force

# ==============================================================================
# STAGE 2 : RUNNER (Image finale de production légère & non-root)
# ==============================================================================
FROM node:22.14.0-bookworm-slim AS runner

WORKDIR /usr/src/app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
```

---

## Étape 5 : Construire et tester le conteneur en local

### 1. Compiler l'image Docker

```bash
docker build -t jump-in-api:latest .
```

### 2. Lancer le conteneur avec votre fichier `.env`

```bash
docker run --rm -p 3000:3000 --env-file .env --name jump-in-api jump-in-api:latest
```

> **Note si PostgreSQL tourne en local sur votre PC (hors Neon/Cloud)** :
> Depuis l'intérieur d'un conteneur Docker, `localhost` désigne le conteneur lui-même. Si votre `DATABASE_URL` pointe vers `localhost:5432`, remplacez `localhost` par `host.docker.internal` lors du test Docker.

### 3. Vérifier le bon fonctionnement

```bash
# Vérifier la route de santé
curl http://localhost:3000/api

# Voir les logs du conteneur
docker logs -f jump-in-api
```

---

## Étape 6 (Optionnel) : Gérer les migrations Prisma en déploiement

En production, la bonne pratique consiste à **séparer l'exécution des migrations du démarrage des réplicas de l'API** (pour éviter que plusieurs conteneurs ne lancent une migration simultanément) :

- **Via CI/CD (GitHub Actions, GitLab CI, Render/Railway Pre-Deploy Command)** :
  Exécutez `npx prisma migrate deploy` lors du pipeline de déploiement avant de basculer le trafic vers la nouvelle image.
- **Si vous devez lancer les migrations depuis l'image Docker elle-même** :
  1. Déplacez `"prisma"` et `"dotenv"` de `devDependencies` vers `dependencies` dans `package.json` (ou ne les supprimez pas au `npm prune`).
  2. Ajoutez dans le stage `runner` :
     ```dockerfile
     COPY --from=builder --chown=node:node /usr/src/app/prisma ./prisma
     COPY --from=builder --chown=node:node /usr/src/app/prisma.config.ts ./
     ```
  3. Vous pourrez alors exécuter ponctuellement :
     ```bash
     docker run --rm --env-file .env jump-in-api:latest npx prisma migrate deploy
     ```
