# 🏃 Documentation Technique : Module Activités & Configuration Dev/Prod

Ce document résume l'architecture du module de suivi d'activités (Live Tracker & synchronisation Santé) et les règles d'environnement (Développement vs Production) mises en place sur l'API **Jump-In / RunHub**.

---

## 1. 🗄️ Modélisation Base de Données (Prisma)

### Modèle `Activity` (`prisma/schema/activities.prisma`)
La table `activities` stocke les séances de sport enregistrées en direct sur l'application ou synchronisées depuis Apple Santé / Google Santé Connect.

| Champ | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Identifiant unique de l'activité |
| `userId` | UUID | Référence vers `User` (cascade on delete) |
| `sportId` | UUID? | Référence vers `Sport` (optionnel) |
| `title` | VarChar(120) | Titre de la course (ex: *« Course matinale aux Almadies »*) |
| `description`| Text? | Notes personnelles du coureur |
| `source` | Enum | `IN_APP_TRACKER`, `APPLE_HEALTH`, `HEALTH_CONNECT`, `MANUAL` |
| `externalId` | String? (Unique) | Clé externe pour **déduplication automatique** (évite les doublons lors des synchronisations montres/santé) |
| `startedAt` | Timestamptz | Date et heure de début de session |
| `endedAt` | Timestamptz | Date et heure de fin de session |
| `durationSeconds` | Int | Durée totale d'effort en secondes |
| `distanceMeters` | Float | Distance totale en mètres |
| `distanceKm` | Float | Distance en kilomètres |
| `avgPaceSecPerKm` | Int? | Allure moyenne en secondes/km (ex: 318 pour 5:18 /km) |
| `caloriesBurned` | Int? | Calories actives estimées (kcal) |
| `elevationGainMeters` | Float? | Dénivelé positif cumulé (D+) |
| `avgHeartRate` / `maxHeartRate` | Int? | Fréquences cardiaques (bpm) |
| `polyline` | Text? | Tracé GPS compressé (algorithme standard Google Polyline, ~2 Ko par course) |
| `visibility` | Enum | `PUBLIC` (flux & profil), `FOLLOWERS` (clubs), `PRIVATE` |
| `deletedAt` | Timestamptz? | Horodatage de suppression douce (Soft-delete) |

### Enums associés (`prisma/schema/enums.prisma`)
* `ActivitySource` : `in_app_tracker`, `apple_health`, `health_connect`, `manual`.
* `ActivityVisibility` : `public`, `followers`, `private`.

---

## 2. 🚀 Endpoints REST (`/api/activities`)

Tous les endpoints sont protégés par le guard JWT global (`JwtAuthGuard`) et documentés dans Swagger.

| Méthode | Route | Description | Statut HTTP |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/activities` | Enregistre une activité (avec déduplication `externalId` automatique) | `201 Created` |
| `GET` | `/api/activities/me` | Historique de mes courses avec pagination par curseur (`limit`, `cursor`, `sportId`, dates) | `200 OK` |
| `GET` | `/api/activities/me/stats` | Statistiques agrégées : km de la semaine courante (lundi 00h), km du mois, total km, durée et calories | `200 OK` |
| `GET` | `/api/activities/:id` | Détails d'une course et de son tracé (vérifie les droits de visibilité) | `200 OK` |
| `PATCH`| `/api/activities/:id` | Modification du titre, de la description ou de la visibilité (auteur uniquement) | `200 OK` |
| `DELETE`| `/api/activities/:id` | Suppression douce (`deletedAt = now()`, auteur uniquement) | `200 OK` |

---

## 3. 🌐 Documentation Swagger (OpenAPI) Plateforme

* **Accès en local** : `http://localhost:3000/docs` (JSON brut : `http://localhost:3000/docs-json`).
* **Couverture globale** :
  - **Plugin CLI `@nestjs/swagger`** configuré dans `nest-cli.json` : introspecte automatiquement les DTOs TypeScript et les contraintes `class-validator`.
  - **20 sections `@ApiTags`** documentant la totalité des 58 routes de la plateforme (Auth, Users, Sports, Clubs, Events, Activities, Feed, Search, Notifications, etc.).
  - **Authentification JWT globale** : Bouton *« Authorize »* (`Bearer <token>`) persistant après rafraîchissement.

---

## 4. ⚙️ Configuration Environnements (Dev vs Prod)

### Tableau comparatif

| Paramètre | 🛠️ Développement (`NODE_ENV=development`) | 🚀 Production (`NODE_ENV=production`) |
| :--- | :--- | :--- |
| **Documentation Swagger (`/docs`)** | **Active automatiquement** | **Désactivée par défaut** (active si `ENABLE_SWAGGER=true`) |
| **Helmet & CSP** | CSP assouplie (`contentSecurityPolicy: false`) pour Swagger UI | **CSP stricte** et protection `crossOriginEmbedderPolicy: true` |
| **CORS** | Autorise toutes les origines locales (Expo Go, simulateurs, localhost) | Filtrage strict via variable **`ALLOWED_ORIGINS`** |
| **Validation DTOs** | Messages d'erreurs complets pour le débogage | `disableErrorMessages: true` (masque les détails internes) |
| **Script de lancement** | `npm run start:dev` (watch mode) | `npm run start:prod` (`node dist/src/main`) |
| **Variables d'environnement** | Fichier `.env` local | Injection sécurisée (Docker / PaaS / Secrets Cloud) |

### Fichier modèle : `.env.example`
Le fichier `.env.example` documente toutes les clés requises :
* `NODE_ENV`, `PORT`, `ALLOWED_ORIGINS`, `ENABLE_SWAGGER`
* `DATABASE_URL` (PostgreSQL / Neon)
* `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
* `GOOGLE_CLIENT_ID_*`, `APPLE_CLIENT_ID`
* `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
* `GOOGLE_MAPS_API_KEY`

---

## 5. 📱 Architecture Frontend RunHub (`feat/activity-tracker`)

Le frontend mobile (Expo SDK 56 / React Native 0.85) intègre le suivi d'activité en direct avec rendu cartographique fluide et design system clair :

* **Services métier (`src/features/tracker/services/`)** :
  - `haversine.service.ts` : Calcul géodésique précis de la distance entre deux points GPS, avec filtre anti-dérive (< 2,5 m ignoré à l'arrêt).
  - `polyline.service.ts` : Compression et décompression Google/Strava Polyline pour optimiser les requêtes réseau (~2 Ko pour 10 km).
  - `tracker-metrics.service.ts` : Formatage temps (`HH:MM:SS`), allure moyenne (`MM:SS /km`) et calcul des calories brûlées selon le sport et le poids.
  - `location-tracker.service.ts` : Gestionnaire de géolocalisation `expo-location` (`Accuracy.BestForNavigation`, `distanceInterval: 4m`).
  - `tracker-api.service.ts` : Client API pour enregistrer l'activité (`POST /activities`) et récupérer historique et statistiques.

* **Gestion d'état (`useTrackerStore.ts` & `useLiveTracker.ts`)** :
  - Store Zustand gérant la machine d'état (`idle` → `running` ⇄ `paused` → `stopped`), chrono seconde par seconde, dénivelé positif cumulé et tableau de coordonnées.
  - Hook coordonnant le timer, l'écouteur GPS et les retours haptiques tactiles (`expo-haptics`).

* **Composants d'interface (`src/features/tracker/components/`)** :
  - `SportSelector.tsx` : Sélecteur Course, Marche, Trail, Vélo avec palettes de couleurs dédiées.
  - `TrackerHUD.tsx` : Carte tête haute à fort contraste (grands chiffres pour la distance en km, temps, allure et calories).
  - `TrackerControls.tsx` : Boutons circulaires tactiles (Démarrer Bissap, Pause Ambre, Reprendre Émeraude, Terminer Noir).
  - `MapLibreView.tsx` : Carte MapLibre avec support du tracé en direct (`GeoJSONSource` + `Layer` ligne avec contour blanc et couleur du sport).

* **Écrans & Navigation Expo Router** :
  - `LiveTrackerScreen.tsx` (`/tracker/live`) : Écran de tracking plein écran avec vue cartographique et centrage automatique.
  - `ActivitySummaryScreen.tsx` (`/tracker/summary`) : Écran récapitulatif avec aperçu du tracé, grille de statistiques, saisie du titre et des notes, choix de visibilité (`PUBLIC`, `FOLLOWERS`, `PRIVATE`), synchronisation santé et bouton de sauvegarde.
  - Intégration dans `CreateBottomSheet.tsx` : accessible depuis le bouton central **"+"** de la barre de navigation (*« Enregistrer une sortie »*).

