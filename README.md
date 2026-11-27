# RunHub / Jump-In — API Back-End

API RESTful officielle de la plateforme sportive et communautaire **RunHub (Jump-In)**, développée avec **NestJS**, **Prisma 7** et **PostgreSQL / PostGIS**.

Elle propulse l'ensemble des fonctionnalités de l'application mobile : authentification multi-fournisseurs, gestion de clubs et d'événements sportifs, inscriptions avec billetterie et check-in par QR code, suivi d'activités sportives (*Live Tracker*), fil d'actualité géolocalisé, notifications push et paiements Mobile Money / Carte.

---

## Sommaire

- [Stack Technique](#-stack-technique)
- [Architecture du Projet](#-architecture-du-projet)
- [Modules Fonctionnels & Endpoints](#-modules-fonctionnels--endpoints)
- [Prérequis](#-prérequis)
- [Installation & Démarrage Rapide](#-installation--démarrage-rapide)
- [Variables d'Environnement](#-variables-denvironnement)
- [Base de Données & Prisma](#-base-de-données--prisma)
- [Scripts Disponibles](#-scripts-disponibles)
- [Sécurité & Architecture Globale](#-sécurité--architecture-globale)
- [Documentation Complémentaire](#-documentation-complémentaire)

---

## 🛠 Stack Technique

| Catégorie | Technologie | Usage |
| :--- | :--- | :--- |
| **Framework** | [NestJS 11](https://nestjs.com/) (TypeScript 5.7) | Architecture modulaire, injection de dépendances, REST API |
| **Base de données** | PostgreSQL + **PostGIS** | Stockage relationnel et requêtes géospatiales (proximité, rayons) |
| **ORM** | [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`) | Schéma multi-fichiers typé, migrations et pool de connexions `pg` |
| **Authentification** | Passport JWT, Google OAuth, Apple Sign-In, Email OTP | Sessions sécurisées (Access + Refresh tokens) & connexion sans mot de passe |
| **Paiements** | **Bictorys** | Encaissements via Wave, Orange Money, Free Money et Carte bancaire |
| **Stockage Médias** | **Cloudflare R2** / AWS S3 | Téléversement direct client via URLs pré-signées (`@aws-sdk/client-s3`) |
| **Notifications** | **Expo Server SDK** & **Resend** | Notifications Push mobiles (iOS/Android) et e-mails transactionnels (OTP) |
| **Géolocalisation** | **Google Maps / Places API** | Autocomplétion d'adresses et résolution de coordonnées géographiques |
| **Documentation API** | **Swagger / OpenAPI** (`@nestjs/swagger`) | Interface interactive disponible sur `/docs` |
| **Tests** | **Jest** & **Supertest** | Tests unitaires (`*.spec.ts`) et tests End-to-End (`test/`) |

---

## 📂 Architecture du Projet

```text
jump-in/
├── docs/                       # Guides techniques détaillés (paiements, schéma, tracker, sécurité)
├── prisma/
│   ├── migrations/             # Historique des migrations SQL PostgreSQL / PostGIS
│   ├── schema/                 # Schéma Prisma modulaire découpé par domaine métier
│   │   ├── base.prisma         # Datasource PostgreSQL + extension PostGIS
│   │   ├── enums.prisma        # Énumérations globales
│   │   ├── users.prisma        # Utilisateurs, réglages, OAuth, OTP
│   │   ├── sports.prisma       # Catalogue des disciplines sportives
│   │   ├── clubs.prisma        # Clubs, membres, rôles, abonnés, demandes d'adhésion
│   │   ├── events.prisma       # Événements, galeries photos, favoris, likes
│   │   ├── registrations.prisma# Inscriptions aux événements & check-in
│   │   ├── activities.prisma   # Sessions sportives enregistrées (Live Tracker)
│   │   ├── payments.prisma     # Transactions, webhooks et règlements organisateurs
│   │   ├── notifications.prisma# Notifications in-app & tokens push appareils
│   │   ├── messages.prisma     # Messagerie / échanges
│   │   └── audit.prisma        # Journaux d'audit
│   └── seed.ts                 # Script d'initialisation (49 sports pré-configurés)
├── src/
│   ├── activities/             # Enregistrement d'activités sportives et statistiques personnelles
│   ├── auth/                   # OAuth (Google/Apple), Email OTP, Refresh Token, Logout
│   ├── clubs/                  # CRUD clubs, gestion des membres, demandes d'adhésion, follows
│   ├── common/                 # Décorateurs, guards globaux, filtres d'erreurs, service géospatial
│   ├── events/                 # Événements, inscriptions, check-in QR, galerie, likes et favoris
│   ├── feed/                   # Fil d'actualité public, à proximité (PostGIS) et personnalisé
│   ├── location/               # Proxy sécurisé Google Places (autocomplete & détails)
│   ├── mail/                   # Envoi d'e-mails transactionnels via Resend (fallback console en dev)
│   ├── notifications/          # Centre de notifications et gestion des tokens Expo Push
│   ├── payments/               # Intégration Bictorys, webhooks sécurisés et anti-double paiement
│   ├── prisma/                 # Service Prisma global avec adaptateur PostgreSQL
│   ├── search/                 # Recherche globale multi-critères (événements, clubs, sportifs)
│   ├── sports/                 # Référentiel des sports disponibles
│   ├── upload/                 # Génération d'URLs pré-signées Cloudflare R2 / S3
│   ├── users/                  # Profil utilisateur, préférences, localisation, sports pratiqués
│   ├── app.module.ts           # Module racine et configuration des Guards globaux
│   └── main.ts                 # Point d'entrée HTTP, CORS, Helmet, ValidationPipe et Swagger
├── test/                       # Configuration et suites de tests E2E
├── .env.example                # Modèle des variables d'environnement
└── prisma.config.ts            # Configuration Prisma 7 (schéma multi-fichiers & seed)
```

---

## 🌐 Modules Fonctionnels & Endpoints

Toutes les routes de l'API utilisent le préfixe global **`/api`** (ex: `http://localhost:3000/api/...`).

| Domaine | Préfixe | Fonctionnalités principales |
| :--- | :--- | :--- |
| **Auth** | `/api/auth` | Vérification OAuth (`POST /oauth/verify`), envoi/vérification code OTP e-mail, rafraîchissement JWT (`POST /refresh`), déconnexion |
| **Utilisateurs** | `/api/users` | Profil courant (`GET/PATCH /me`), localisation (`PATCH /me/location`), paramètres, sports favoris, clubs rejoints, suppression de compte |
| **Sports** | `/api/sports` | Liste des disciplines sportives (`GET /`) et administration du catalogue (`POST`, `PATCH`, `DELETE`) |
| **Clubs** | `/api/clubs` | Création/édition de clubs, gestion des sports du club, membres & rôles, demandes d'adhésion (`join-requests`), abonnements (`follow`) |
| **Événements** | `/api/events` | Création, publication, annulation, partage par slug, inscriptions (`register`), check-in manuel ou scan QR (`check-in/scan`), galerie photo, likes & favoris |
| **Activités** | `/api/activities` | Sauvegarde des sessions GPS (*Live Tracker*), historique personnel (`GET /me`) et agrégation de statistiques (`GET /me/stats`) |
| **Feed** | `/api/feed` | Découverte d'événements : flux général (`GET /`), autour de soi (`GET /nearby`) et recommandations (`GET /for-you`) |
| **Recherche** | `/api/search` | Recherche filtrée d'événements (`/events`), de clubs (`/clubs`) et d'utilisateurs (`/users`) |
| **Paiements** | `/api/payments` | Initiation de paiement (`/initiate`), webhooks Bictorys (`/webhook/bictorys`), vérification de statut et historique des transactions |
| **Notifications** | `/api/notifications` | Liste paginée, compteur de non-lus (`/unread-count`), marquage lu (`/read-all`) et enregistrement des appareils (`/api/devices`) |
| **Localisation** | `/api/location` | Autocomplétion de lieux (`/autocomplete`) et récupération des coordonnées (`/details`) |
| **Upload** | `/api/upload` | Génération d'URLs pré-signées sécurisées (`POST /presigned-url`) pour upload direct vers Cloudflare R2 |

> La liste exhaustive des paramètres, schémas de requêtes (DTOs) et codes de retour est consultable dans **Swagger UI** sur `http://localhost:3000/docs`.

---

## 📋 Prérequis

- **Node.js** >= 20.x (v22 LTS recommandé)
- **npm** >= 10.x
- **PostgreSQL** >= 15 avec l'extension **`postgis`** activée (en local via Docker ou hébergé sur [Neon](https://neon.tech/) / Supabase)

---

## 🚀 Installation & Démarrage Rapide

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer les variables d'environnement

Copiez le fichier d'exemple et renseignez vos clés locales :

```bash
cp .env.example .env
```

*(Sous Windows PowerShell : `Copy-Item .env.example .env`)*

### 3. Préparer la base de données (Prisma & PostGIS)

Assurez-vous que votre base PostgreSQL est accessible via `DATABASE_URL`, puis générez le client Prisma, appliquez les migrations et initialisez le catalogue des sports :

```bash
# Générer le client TypeScript Prisma
npx prisma generate

# Appliquer les migrations en développement
npx prisma migrate dev

# Insérer les 49 sports de référence
npm run seed
```

### 4. Lancer le serveur

```bash
# Mode développement avec rechargement à chaud (watch)
npm run start:dev
```

- **API disponible sur** : `http://localhost:3000/api`
- **Documentation Swagger** : `http://localhost:3000/docs`

---

## ⚙️ Variables d'Environnement

Référez-vous au fichier `.env.example` pour la configuration complète :

| Groupe | Variables | Description |
| :--- | :--- | :--- |
| **Serveur** | `NODE_ENV`, `PORT`, `ALLOWED_ORIGINS`, `ENABLE_SWAGGER` | Environnement (`development`, `production`, `test`), port HTTP (défaut `3000`), origines CORS séparées par des virgules et activation de `/docs` |
| **Base de données** | `DATABASE_URL` | URL de connexion PostgreSQL (avec PostGIS disponible) |
| **JWT** | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Clés secrètes de signature et durées de validité (ex: `15m` et `30d`) |
| **OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID_WEB`, `GOOGLE_CLIENT_ID_IOS`, `GOOGLE_CLIENT_ID_ANDROID`, `APPLE_CLIENT_ID` | Identifiants clients Google et Apple pour la vérification des jetons natifs |
| **Stockage R2 / S3** | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Identifiants S3/Cloudflare R2 et domaine public de diffusion des médias |
| **Cartographie** | `GOOGLE_MAPS_API_KEY` | Clé API Google Maps / Places |
| **E-mails (OTP)** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Clé API Resend (optionnel en développement : si absente, les codes OTP s'affichent dans les logs du terminal) |
| **Paiements** | `BICTORYS_API_URL`, `BICTORYS_API_KEY`, `BICTORYS_WEBHOOK_SECRET`, `BICTORYS_SUCCESS_URL`, `BICTORYS_ERROR_URL`, `PLATFORM_FEE_PERCENT` | Configuration de la passerelle Bictorys (sandbox ou production) et commission plateforme (défaut `3` %) |

---

## 🗄 Base de Données & Prisma

Ce projet utilise la fonctionnalité **Multi-File Prisma Schema** configurée via `prisma.config.ts` (`prisma/schema/*.prisma`).

Commandes courantes :

```bash
# Ouvrir l'interface graphique Prisma Studio
npx prisma studio

# Créer une nouvelle migration après modification d'un fichier dans prisma/schema/
npx prisma migrate dev --name nom_de_la_migration

# Déployer les migrations en production / CI
npx prisma migrate deploy

# Relancer le seed des sports (idempotent via upsert)
npm run seed
```

---

## 📜 Scripts Disponibles

| Commande | Description |
| :--- | :--- |
| `npm run start:dev` | Démarre l'API en mode développement avec rechargement automatique |
| `npm run start:debug` | Démarre l'API avec l'inspecteur Node.js activé |
| `npm run build` | Compile le projet TypeScript dans le dossier `dist/` |
| `npm run start:prod` | Exécute la version compilée (`node dist/src/main`) |
| `npm run seed` | Peuple la base de données avec les disciplines sportives de base |
| `npm run lint` | Analyse et corrige le code avec ESLint |
| `npm run format` | Formate les fichiers sources et de tests avec Prettier |
| `npm run test` | Lance la suite de tests unitaires Jest |
| `npm run test:watch` | Lance les tests unitaires en mode interactif |
| `npm run test:cov` | Génère le rapport de couverture de code dans `coverage/` |
| `npm run test:e2e` | Exécute les tests End-to-End |

---

## 🔒 Sécurité & Architecture Globale

L'application applique plusieurs couches de protection par défaut dès le démarrage (`main.ts` et `app.module.ts`) :

1. **Authentification par défaut (`JwtAuthGuard`)** : Toutes les routes nécessitent un jeton Bearer valide, sauf celles explicitement décorées avec `@Public()`.
2. **Contrôle d'accès par rôles (`AdminGuard`, `@ClubRole`)** : Vérification granulaire des privilèges administrateur plateforme et des rôles internes aux clubs (propriétaire, admin, coach, membre).
3. **Limitation de débit (`ThrottlerGuard`)** : Double protection anti-abus globale :
   - *Anti-burst* : max **5 requêtes / seconde** par client.
   - *Soutenu* : max **100 requêtes / minute** par client.
4. **Validation stricte des entrées (`ValidationPipe`)** : Rejet automatique des propriétés non déclarées (`whitelist: true`, `forbidNonWhitelisted: true`), typage automatique (`transform: true`) et masquage des détails internes en production.
5. **En-têtes HTTP & CORS (`Helmet`)** : Protection des en-têtes HTTP et filtrage strict des origines autorisées en production via `ALLOWED_ORIGINS`.
6. **Gestion centralisée des erreurs (`AllExceptionsFilter`)** : Normalisation uniforme de toutes les réponses d'erreur HTTP et journalisation contrôlée.

---

## 📚 Documentation Complémentaire

Des guides d'architecture et de spécifications détaillées sont disponibles dans le dossier `docs/` :

- `docs/schema-documentation.md` — Documentation complète du modèle de données PostgreSQL / PostGIS.
- `docs/payments-bictorys-guide.md` — Intégration de la passerelle Bictorys, cycle de vie des paiements et webhooks.
- `docs/anti-double-paiement.md` — Mécanismes d'idempotence et de verrouillage contre les doubles encaissements.
- `docs/activity-tracker-and-environments.md` — Fonctionnement du module *Live Activity Tracker* et gestion des environnements.
- `docs/solid_analysis.md` — Principes d'architecture SOLID appliqués aux modules NestJS du projet.

---

## 📄 Licence

Projet privé — **UNLICENSED** (Tous droits réservés).
