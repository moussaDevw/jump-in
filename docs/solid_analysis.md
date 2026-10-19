# 🏗️ Rapport d'Analyse d'Architecture : Respect des Principes SOLID (Backend Jump-In)

> **Date** : Septembre 2026  
> **Projet concerné** : `jump-in` (Backend NestJS v11 / Prisma ORM / PostgreSQL + PostGIS)  
> **Auteur** : Antigravity (Assistant IA)

---

## 📑 Sommaire
1. [Vue d'Ensemble & Tableau Récapitulatif](#1-vue-densemble--tableau-récapitulatif)
2. [Analyse Détaillée Principe par Principe](#2-analyse-détaillée-principe-par-principe)
   - [S - Single Responsibility Principle (SRP)](#s---single-responsibility-principle-srp)
   - [O - Open / Closed Principle (OCP)](#o---open--closed-principle-ocp)
   - [L - Liskov Substitution Principle (LSP)](#l---liskov-substitution-principle-lsp)
   - [I - Interface Segregation Principle (ISP)](#i---interface-segregation-principle-isp)
   - [D - Dependency Inversion Principle (DIP)](#d---dependency-inversion-principle-dip)
3. [Exemples Concrets de Refactorisation](#3-exemples-concrets-de-refactorisation)
   - [1. Pattern Strategy pour l'Authentification OAuth](#1-pattern-strategy-pour-lauthentification-oauth)
   - [2. Abstraction du Service de Stockage (Storage Provider)](#2-abstraction-du-service-de-stockage-storage-provider)
   - [3. Découpage et Extraction de `EventsService`](#3-découpage-et-extraction-de-eventsservice)
4. [Plan d'Action & Recommandations](#4-plan-daction--recommandations)

---

## 1. Vue d'Ensemble & Tableau Récapitulatif

| Principe SOLID | Niveau de Respect | Diagnostic Synthétique |
|---|:---:|---|
| **S** - Single Responsibility Principle | 🟡 **Partiel** | Modules NestJS bien séparés par domaine, mais services centraux (`EventsService`, `AuthService`, `RegistrationsService`) surchargés de responsabilités hétérogènes. |
| **O** - Open / Closed Principle | 🔴 **Non respecté** | Utilisation de blocs conditionnels (`if/else`) au lieu de polymorphismes ou de patterns extensibles (ex: OAuth providers, stockage S3). |
| **L** - Liskov Substitution Principle | 🟢 **Respecté** | Conforme au niveau des interfaces NestJS (`CanActivate`, `NestInterceptor`), mais manque de hiérarchies/interfaces de domaine métier. |
| **I** - Interface Segregation Principle | 🟡 **Partiel** | DTOs bien segmentés par action, mais absence d'interfaces de contrats pour les services applicatifs. |
| **D** - Dependency Inversion Principle | 🟡 **Partiel** | Le conteneur IoC de NestJS est utilisé, mais injection directe de classes concrètes (Prisma ORM, AWS S3, OAuth Clients) sans couches d'abstraction. |

---

## 2. Analyse Détaillée Principe par Principe

---

### S - Single Responsibility Principle (SRP)
> *"Une classe ou un module ne doit avoir qu'une seule raison de changer."*

#### ✅ Points Forts
- **Architecture en couches NestJS** : Séparation claire entre les **Controllers** (transport HTTP, routing, codes de statut), les **Guards** (sécurité / authentification), les **DTOs** (validation et assainissement des entrées) et les **Services** (logique métier).
- **Organisation modulaire par domaine** : Dossiers dédiés pour `events`, `clubs`, `users`, `auth`, `location`, `upload`, `sports`, `search`.

#### ⚠️ Violations & Problèmes Identifiés
1. **`EventsService` (555 lignes)** et **`RegistrationsService` (518 lignes)** accumulent des responsabilités très disparates :
   - **Logique métier pure** (jauges, calculs de dates, statuts d'événements).
   - **Génération d'identifiants techniques & tokens** (`generateUniqueSlug`, `generateTicketCode`).
   - **Requêtes spatiales SQL PostGIS complexes** (`ST_DistanceSphere`, `ST_MakePoint` en `$queryRaw`).
   - **Vérifications de rôles et droits d'administration** (`ClubRole.ADMIN`, `isAdmin`), qui relèvent de la politique d'autorisation.
2. **`AuthService`** mélange :
   - La validation cryptographique des jetons OAuth tiers (Google OAuth2Client, Apple Sign-In).
   - La gestion du cycle de vie des utilisateurs (recherche par identité / email, création de compte).
   - Le hachage bcrypt des refresh tokens.
   - La génération et signature des jetons JWT.

---

### O - Open / Closed Principle (OCP)
> *"Les entités logicielles doivent être ouvertes à l'extension, mais fermées à la modification."*

#### ⚠️ Violations Majeures Identifiées

1. **Authentification OAuth (`AuthService.verifyOAuth`)** :
   ```typescript
   // jump-in/src/auth/auth.service.ts
   if (dto.provider === 'google') {
     // Logique spécifique Google (OAuth2Client, verifyIdToken...)
   } else if (dto.provider === 'apple') {
     // Logique spécifique Apple (appleSignin.verifyIdToken...)
   } else {
     throw new BadRequestException('Provider non supporté');
   }
   ```
   * **Conséquence** : L'ajout d'un nouveau fournisseur (Facebook, WhatsApp OTP, TikTok, Magic Link) nécessite de **modifier directement** le corps de la méthode `verifyOAuth`.
   * **Solution attendue** : Pattern **Strategy** avec un registre de providers implémentant une interface `OAuthStrategy`.

2. **Service de Stockage (`UploadService`)** :
   * La classe dépend directement de `@aws-sdk/client-s3` et de Cloudflare R2.
   * Changer de système de stockage (ex: Google Cloud Storage, Supabase Storage ou stockage local pour les tests) exige de réécrire la classe `UploadService`.

3. **Passerelles de Paiement** :
   * Le schéma Prisma déclare `WAVE`, `ORANGE_MONEY`, `FREE_MONEY`, `CARD`. L'intégration de ces providers nécessite un contrat unifié `PaymentGateway` pour éviter les cascades de `switch / case`.

---

### L - Liskov Substitution Principle (LSP)
> *"Les sous-types doivent pouvoir remplacer leurs types de base sans altérer la cohérence du programme."*

#### ✅ Diagnostic
- Les composants de l'infrastructure NestJS (`JwtAuthGuard`, `EventOrganizerGuard`) implémentent scrupuleusement l'interface `CanActivate` du framework.
- Aucune régression ou violation de contrat n'a été détectée dans les classes existantes.
- **Note** : Le projet utilise une approche TypeScript fonctionnelle/procédurale basée sur des services plats, avec peu d'héritage de classes métier.

---

### I - Interface Segregation Principle (ISP)
> *"Aucun client ne doit être forcé de dépendre de méthodes qu'il n'utilise pas."*

#### ✅ Points Forts
- **DTOs ultra-spécialisés** : Les DTOs de validation sont granulaires (`CreateEventDto`, `UpdateEventDto`, `FindAllEventsDto`, `ScanTicketDto`, `GetPresignedUrlDto`).

#### ⚠️ Axes d'Amélioration
- **Absence d'interfaces de contrats TypeScript** pour les services :
  - Par exemple, un module qui a seulement besoin de générer des slugs ou d'effectuer un calcul de distance dépend directement de l'ensemble de la classe monolithique `EventsService`.
- **Typage faible sur les requêtes brutes** : Utilisation régulière de `any[]` lors des appels `$queryRaw` de Prisma (notamment sur PostGIS).

---

### D - Dependency Inversion Principle (DIP)
> *"Les modules de haut niveau ne doivent pas dépendre des modules de bas niveau. Les deux doivent dépendre d'abstractions."*

#### ✅ Points Forts
- Utilisation systématique du conteneur d'**Injection de Dépendances** (IoC) de NestJS via `@Injectable()` et les constructeurs.

#### ⚠️ Violations Identifiées
1. **Couplage fort à Prisma ORM** :
   - Tous les services injectent directement la classe concrète `PrismaService` au lieu de s'appuyer sur des abstractions de dépôts (pattern **Repository** : `IEventRepository`, `IUserRepository`).
   - Cela complexifie l'écriture de tests unitaires sans base de données réelle.
2. **Instanciation directe de dépendances tierces** :
   - `new S3Client(...)` instancié en dur dans le constructeur de `UploadService`.
   - `new OAuth2Client(...)` instancié directement à la volée dans `AuthService`.
   - Appels directs aux fonctions globales (`appleSignin`, `crypto`, `fetch`).

---

## 3. Exemples Concrets de Refactorisation

### 1. Pattern Strategy pour l'Authentification OAuth

#### Définition du Contrat
```typescript
// src/auth/strategies/oauth-provider.interface.ts
export interface OAuthUserPayload {
  providerId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface IOAuthProviderStrategy {
  readonly provider: string;
  verifyToken(idToken: string): Promise<OAuthUserPayload>;
}
```

#### Implémentation Google
```typescript
// src/auth/strategies/google-oauth.strategy.ts
@Injectable()
export class GoogleOAuthStrategy implements IOAuthProviderStrategy {
  readonly provider = 'google';
  private client: OAuth2Client;

  constructor(private readonly configService: ConfigService) {
    this.client = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));
  }

  async verifyToken(idToken: string): Promise<OAuthUserPayload> {
    const audiences = [
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_ID_IOS'),
      this.configService.get('GOOGLE_CLIENT_ID_ANDROID'),
      this.configService.get('GOOGLE_CLIENT_ID_WEB'),
    ].filter(Boolean);

    const ticket = await this.client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new UnauthorizedException('Token Google invalide');

    return {
      providerId: payload.sub,
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
    };
  }
}
```

#### Refactorisation de `AuthService` (Respect OCP & SRP)
```typescript
@Injectable()
export class AuthService {
  private strategies = new Map<string, IOAuthProviderStrategy>();

  constructor(
    strategiesList: IOAuthProviderStrategy[],
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    strategiesList.forEach((s) => this.strategies.set(s.provider, s));
  }

  async verifyOAuth(dto: VerifyOAuthDto) {
    const strategy = this.strategies.get(dto.provider);
    if (!strategy) {
      throw new BadRequestException(`Provider "${dto.provider}" non supporté`);
    }

    const oAuthData = await strategy.verifyToken(dto.idToken);
    return this.findOrCreateUserAndSignTokens(oAuthData);
  }
}
```

---

### 2. Abstraction du Service de Stockage (Storage Provider)

```typescript
// src/upload/interfaces/storage-provider.interface.ts
export interface IStorageProvider {
  generatePresignedUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  getPublicUrl(key: string): string;
}
```
* Permet d'injecter `S3StorageProvider`, `GoogleCloudStorageProvider` ou `MockStorageProvider` pour les tests sans altérer `UploadService`.

---

### 3. Découpage et Extraction de `EventsService`

* **`GeoSpatialService`** : Centralise toutes les formules SQL PostGIS (`ST_DistanceSphere`, `ST_MakePoint`).
* **`SlugService` / `TokenGeneratorService`** : Génération isolée des `shareSlug` et des `ticketCode` avec tests unitaires dédiés.
* **`EventAuthorizationService`** : Vérification des permissions complexes sur les clubs et les événements.

---

## 4. Plan d'Action & Recommandations

1. **Priorité 1 (Facile & Fort Impact - OCP)** :
   - Refactoriser `AuthService` avec le pattern **Strategy** pour Google et Apple.
2. **Priorité 2 (Qualité de code & Testabilité - SRP)** :
   - Extraire la logique de génération de tokens/slugs et la logique PostGIS hors de `EventsService` et `RegistrationsService`.
3. **Priorité 3 (Évolutivité - DIP)** :
   - Créer une couche d'abstraction pour les paiements (`PaymentGateway`) avant l'implémentation complète des webhooks Wave / Orange Money.
