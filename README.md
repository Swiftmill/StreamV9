# StreamV9

StreamV9 est une plateforme de streaming auto-hébergée conçue pour fonctionner entièrement hors ligne (hors ressources vidéo) avec un backend Express sécurisé et un frontend Next.js (en cours de construction). Ce dépôt contient les premiers éléments fondamentaux : l'API Node.js/Express, les schémas Zod et un jeu de données initial.

## Architecture actuelle

- **API** : `src/server.ts` (Express + TypeScript) gère l'authentification, les sessions cookies HTTP-only (7 jours), la gestion des catalogues (films, séries, catégories), l'audit et l'historique utilisateur.
- **Validation** : Tous les payloads passent par des schémas [Zod](https://github.com/colinhacks/zod).
- **Stockage** : Données persistées dans des fichiers JSON sous `data/` avec verrouillage `proper-lockfile` et écritures atomiques.
- **Audit** : Chaque action critique est journalisée dans `data/audit.log`.

## Prérequis

- Node.js 18+
- npm 9+

> ℹ️ Le dépôt référence des dépendances NPM mais ne les installe pas automatiquement dans cet environnement. Pensez à exécuter `npm install` en local avec un accès réseau.

## Installation

```bash
npm install
cp .env.example .env
npm run build:server
```

Pour lancer l'API en mode développement :

```bash
npm run dev:server
```

L'API écoute par défaut sur `http://localhost:4000`.

## Authentification

- Page initiale : `/login`
- Utilisateur admin par défaut (`data/users/admin.json`)
  - **Identifiant** : `admin`
  - **Mot de passe** : `password` (à changer immédiatement en production)
- Exemple d'utilisateur standard (`data/users/users.json`)
  - **Identifiant** : `jane`
  - **Mot de passe** : `password`
- Hachage : bcrypt (`bcryptjs`) avec cookies HTTP-only signés et token CSRF stocké en session.

### Flux CSRF

1. Récupérer le token via `GET /api/auth/csrf`
2. Inclure l'entête `x-csrf-token` pour tout POST/PUT/DELETE sensible (login compris)

## Points d'API principaux

| Méthode | Route | Description | Authentification |
|---------|-------|-------------|------------------|
| POST | `/api/auth/login` | Connexion, retourne l'utilisateur + CSRF | CSRF requis |
| POST | `/api/auth/logout` | Déconnexion et destruction de session | Session + CSRF |
| GET | `/api/catalog/movies` | Liste des films | Session |
| POST | `/api/catalog/movies` | Création de film | Admin + CSRF |
| GET | `/api/catalog/series` | Liste des séries | Session |
| POST | `/api/catalog/series/:slug/episodes` | Merge épisode (CRUD intelligent) | Admin + CSRF |
| GET | `/api/users` | Liste des utilisateurs | Admin |
| POST | `/api/history` | Ajoute une entrée "Continuer" | Session + CSRF |

> Toutes les actions admin sont limitées à 10 requêtes/minute par utilisateur via un rate limiter en mémoire.

## Jeu de données fourni

- `data/catalog/movies.json` : 2 films (HLS) avec sous-titres VTT.
- `data/catalog/series/echoes-of-atlas.json` : 1 série avec 2 épisodes.
- `data/catalog/categories.json` : 3 catégories de base.
- `data/users/` : comptes admin + utilisateur démo.

## À venir

- Interface Next.js App Router (Netflix-like) avec lecteur HLS, historique et panneaux admin complets.
- Scripts utilitaires (`seed`, `backup`, `lint-catalog`).
- Docker multi-stage (`docker-compose.yml`).

Contributions bienvenues ! Merci de respecter les exigences de sécurité (Zod, CSRF, cookies HTTP-only, audit, etc.) lors des prochaines itérations.
