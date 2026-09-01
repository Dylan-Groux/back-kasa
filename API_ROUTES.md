# Kasa Backend API — Synthèse des routes

> Source de vérité pour le frontend. Générée à partir du code réel (`routes/`, `controllers/`, `services/`, `middlewares/`) et vérifiée contre `public/openapi.json` (servi via `/docs.html`, Swagger UI — voir note en bas de fichier).

Toutes les routes `/api/*` et `/auth/*` passent par le middleware `dbReady` : si la DB n'est pas initialisée, réponse `503 { "error": "Database not ready" }`.

Format d'erreur uniforme : `{ "error": "<message>" }`.

Statuts standards : `400` validation, `401` pas de token / token invalide, `403` rôle insuffisant, `404` ressource absente, `409` conflit d'unicité.

⚠️ `routes/users.js` (montée sur `/users`) est le scaffold par défaut d'express-generator, inutilisée en pratique — à ignorer. Les vraies routes sont sous `/api/*` et `/auth/*`.

Auth : header `Authorization: Bearer <token>` (JWT obtenu via `/auth/register` ou `/auth/login`).

---

## Auth (`/auth`) — endpoints publics, aucune protection JWT

| Méthode | Route | Body (JSON) | Succès | Erreurs |
|---|---|---|---|---|
| POST | `/auth/register` | `{name*, email*, password*(≥6 car.), picture?, role?: 'owner'\|'client' (def. client)}` | `201 {token, user:{id,name,email,picture,role}}` | `400` champ manquant, `409` email déjà pris |
| POST | `/auth/login` | `{email*, password*}` | `200 {token, user}` | `400` champs manquants, `401` credentials invalides |
| POST | `/auth/request-reset` | `{email*}` | `200 {ok:true, message, token?}` (token renvoyé seulement hors production) | toujours `200` (anti-enumeration) |
| POST | `/auth/reset-password` | `{token*, password*(≥6)}` | `200 {ok:true}` | `400` token invalide/expiré ou password trop court |

---

## Properties (`/api/properties`)

| Méthode | Route | Auth | Body / Params | Succès | Erreurs |
|---|---|---|---|---|---|
| GET | `/api/properties` | — | — | `200 [PropertyBase...]` | — |
| GET | `/api/properties/:id` | — | — | `200 PropertyDetail` | `404` |
| POST | `/api/properties` | Bearer, rôle `owner`\|`admin` | `{id?, title*, description?, cover?, location?, price_per_night?(def.80), host_id? ou host:{name,picture}, pictures?[], equipments?[], tags?[]}` | `201 PropertyDetail` | `400` title/host manquant, `401`, `403`, `409` id dupliqué |
| PATCH | `/api/properties/:id` | Bearer, rôle `owner`\|`admin` | subset de `{title, description, cover, location, host_id, price_per_night}` (≥1 champ) | `200 PropertyDetail` | `400` aucun champ, `401`, `403`, `404` |
| DELETE | `/api/properties/:id` | Bearer, rôle `owner`\|`admin` | — | `204` no content | `401`, `403`, `404` |

**PropertyBase**
```json
{
  "id": "string",
  "slug": "string",
  "title": "string",
  "description": "string|null",
  "cover": "string|null",
  "location": "string|null",
  "price_per_night": 0,
  "rating_avg": 0,
  "ratings_count": 0,
  "host": { "id": 0, "name": "string", "picture": "string|null" }
}
```

**PropertyDetail** = `PropertyBase` + `{ "pictures": ["string"], "equipments": ["string"], "tags": ["string"] }`

⚠️ Pas de vérification d'ownership réelle : `requireRole(['owner','admin'])` autorise n'importe quel `owner` à modifier/supprimer la propriété d'un autre `owner` (la fonction `getPropertyOwnerId` existe dans `services/propertiesService.js` mais n'est jamais utilisée dans les routes).

---

## Users (`/api/users`)

| Méthode | Route | Auth | Body / Params | Succès | Erreurs |
|---|---|---|---|---|---|
| GET | `/api/users` | Bearer, admin only | — | `200 [{id,name,picture,role}...]` | `401`, `403` |
| GET | `/api/users/:id` | Bearer, self ou admin | — | `200 {id,name,picture,role}` | `401`, `403`, `404` |
| POST | `/api/users` | Bearer, admin only | `{name*, picture?, role?: owner\|client\|admin (def. client)}` | `201 {id,name,picture,role}` | `400`, `401`, `403`, `409` |
| PATCH | `/api/users/:id` | Bearer, self ou admin | subset `{name, picture, role}` — `role=admin` requiert que l'appelant soit déjà admin | `200 {id,name,picture,role}` | `400` aucun champ / rôle invalide, `401`, `403`, `404` |

---

## Ratings (`/api/properties/:id/ratings`) — aucune protection JWT

| Méthode | Route | Body | Succès | Erreurs |
|---|---|---|---|---|
| GET | `/api/properties/:id/ratings` | — | `200 [{id,score,comment,created_at,user:{id,name,picture}}...]` | `404` property |
| POST | `/api/properties/:id/ratings` | `{user_id*, score*(entier 1-5), comment?}` | `201 {rating_avg, ratings_count, ratings:[...]}` | `400` score/user_id invalide, `404` property ou user |

⚠️ Route non protégée par `requireAuth` : `user_id` vient du body, donc n'importe qui peut noter au nom de n'importe quel utilisateur.

---

## Favorites

| Méthode | Route | Auth | Body / Params | Succès | Erreurs |
|---|---|---|---|---|---|
| POST | `/api/properties/:id/favorite` | Bearer (tout rôle) | — (userId pris du token) | `200 {ok:true}` (idempotent) | `401`, `404` property |
| DELETE | `/api/properties/:id/favorite` | Bearer | — | `200 {ok:true}` (idempotent) | `401` |
| GET | `/api/users/:id/favorites` | Bearer, self ou admin | — | `200 [PropertyBase...]` | `401`, `403`, `404` user |

---

## Conversations & messages (`/api/conversations`) — Bearer requis sur toutes les routes

Conversations strictement bipartites (deux colonnes FK fixes `participant_one_id`/`participant_two_id`, normalisées `one < two`, pas de table de jointure). `conversationId` et l'id des messages sont des UUID (non-séquentiels) : une conversation inexistante et une conversation dont l'appelant n'est pas membre renvoient toutes deux `404` (jamais `403`) pour éviter l'énumération d'IDs via l'URL de deep-link.

| Méthode | Route | Body | Succès | Erreurs |
|---|---|---|---|---|
| GET | `/api/conversations` | — | `200 [{id, other_participant:{id,name,picture}, last_message:{content,created_at,sender_id}\|null, updated_at}...]` triées par `updated_at` desc | `401` |
| POST | `/api/conversations` | `{participant_id*}` | `201` (créée) ou `200` (déjà existante) `{id, other_participant, created_at}` — find-or-create, jamais de doublon | `400` participant_id manquant/invalide/soi-même/inexistant, `401` |
| POST | `/api/conversations/:conversationId/messages` | `{content*}` (non vide après trim, ≤2000 car.) | `201 {id, conversation_id, content, sender:{id,name,picture}, receiver:{id,name,picture}, created_at}` — `sender_id`/`receiver_id` toujours dérivés du token + des participants, jamais du body | `400` content invalide, `401`, `404` conversation inexistante ou non-membre |
| GET | `/api/conversations/:conversationId/messages` | — | `200 {conversation_id, messages:[{id,content,sender,receiver,created_at}...]}` triés chronologiquement (ancien → récent) | `401`, `404` conversation inexistante ou non-membre |

`created_at`/`updated_at` en ISO 8601 UTC (`toISOString()`), généré côté application plutôt que via `CURRENT_TIMESTAMP` SQLite pour garantir le format attendu par le frontend (regroupement par jour fait côté client via `Intl.DateTimeFormat`, pas ici).

---

## Uploads

| Méthode | Route | Auth | Body | Succès | Erreurs |
|---|---|---|---|---|---|
| POST | `/api/uploads/image` | Bearer, rôle `owner`\|`admin` | `multipart/form-data` : `file*` (image, ≤10MB, champ `"file"`), `purpose?: property-cover\|property-picture\|user-picture\|other`, `property_id?` | `201 {url, filename, size, mimetype, purpose, property_id?, instructions}` | `400` non-image/manquant, `401`, `403`, `404` property_id invalide, `500` si `multer` absent |
| DELETE | `/api/uploads/images` | Bearer, rôle `owner`\|`admin` | `{filenames?[], urls?[], filename?, url?}` (JSON) ou query `?filenames=a,b` | `200 {ok,deleted[],not_found[],errors[],results[]}` | `207` suppression partielle, `400` rien fourni, `401`, `403` |

---

## Points à trancher avec l'équipe

1. **Ratings non authentifiées** — `user_id` vient du body plutôt que du token, donc falsifiable.
2. **Properties sans vérif d'ownership** — tout `owner` peut modifier/supprimer la propriété d'un autre `owner`.

## Note

`public/openapi.json` (servi via `/docs.html`, Swagger UI) contient déjà ce contrat en OpenAPI 3.0 à jour avec le code — c'est la source la plus fiable pour générer un client typé côté frontend (ex. `openapi-typescript`). Ce fichier `API_ROUTES.md` en est une synthèse lisible, à tenir à jour manuellement si l'API évolue.
