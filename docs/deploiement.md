# Déploiement Wigofly — état et chemin de production

Ce document décrit l'architecture cible, les variables d'environnement et le chemin
de migration de la démo locale vers une vraie mise en production. Il complète
`docs/prd-global-production.md` (le « quoi ») côté « comment ».

## 1. État actuel (V1 démo)

- **Frontend** : React + Vite (`v1/client`), build statique.
- **Backend** : Express (`v1/server`), un seul processus.
- **Persistance** : fichier JSON `v1/server/data.json` (aucune vraie base).
- **Auth** : email + mot de passe (scrypt), codes de vérification **non envoyés**
  (renvoyés en clair uniquement si `DEMO=true`).
- **Paiement/escrow** : **simulé** (aucun mouvement d'argent réel), mais le domaine
  porte déjà les champs prestataire (voir §4).
- **Fichiers** (photos, vidéos, KYC) : encodés en data URLs dans le JSON.

Tel quel, c'est une démo complète mais **pas déployable en production réelle**.

## 2. Architecture cible

| Brique      | Cible recommandée                    | Statut          |
|-------------|--------------------------------------|-----------------|
| Frontend    | Vercel (build statique Vite)         | à configurer    |
| Backend     | Render / Fly.io / Railway (Express)  | à configurer    |
| Base        | Supabase Postgres                    | schéma prêt (§3)|
| Fichiers    | Supabase Storage (URLs signées KYC)  | à brancher      |
| Emails      | Resend (vérif, reset, transactionnel)| à brancher      |
| Paiement    | Stripe Connect / Mangopay / Lemonway | modèle prêt (§4)|
| Monitoring  | Sentry (front + back)                | à brancher      |

## 3. Base de données

Le schéma Postgres initial est dans **`docs/supabase-schema.sql`**. Il modélise
fidèlement le domaine actuel (users, listings, trips, matching_offers, transactions
+ événements, messages, disputes, notifications, KYC, audit_logs, etc.) en forme
production : clés étrangères, index, contraintes d'états, horodatages.

**Chemin de migration (sans casser la démo)** :

1. Créer la base dans Supabase à partir de `supabase-schema.sql`.
2. Introduire un **adaptateur de persistance** (repository) derrière l'API Express :
   remplacer progressivement les accès directs `db.<collection>` de
   `server/index.js` par des appels repository, collection par collection.
3. Tant que la migration n'est pas complète, le mode JSON (`store.js`) reste le
   défaut ; l'adaptateur Postgres s'active via `DATABASE_URL`.
4. Les tests continuent de tourner sur une base isolée (aujourd'hui `DATA_FILE`
   jetable ; demain une base de test dédiée ou l'adaptateur JSON).

> Prochaine brique concrète recommandée : commencer l'adaptateur par les collections
> les moins couplées (`notifications`, `messages`, `audit_logs`) avant `transactions`.

## 4. Paiement / escrow (déjà « provider-ready »)

L'escrow V1 est simulé mais le modèle est prêt pour un vrai prestataire (voir
`server/escrow.js`). Chaque transaction porte :

- `payment_provider` (`escrow.provider`) — `'simulated'` par défaut ;
- `payment_intent_id` (`escrow.providerRef`) — l'identifiant côté prestataire ;
- `escrow_status` (`escrow.state`) — `held → frozen → released | refunded` ;
- `escrow_amount`, `traveler_pay`, `commission_amount` ;
- horodatages `held_at`, `frozen_at`, `released_at`, `refunded_at`.

Brancher un prestataire = implémenter la création d'intention de paiement dans
`createEscrow()` et la capture/remboursement dans `transitionEscrow()`, **sans
changer les appelants**.

## 5. Variables d'environnement

Voir **`v1/.env.example`** pour la liste commentée. Résumé :

| Variable           | Rôle                                                        | Prod |
|--------------------|-------------------------------------------------------------|------|
| `PORT`             | Port de l'API Express                                       | oui  |
| `DEMO`             | Expose `/api/dev/*` et codes en clair — **jamais en prod**  | non  |
| `DATA_FILE`        | Chemin du JSON (isolation des tests)                        | non  |
| `DATABASE_URL`     | Postgres Supabase (une fois l'adaptateur branché)           | oui  |
| `PERSISTENCE_DRIVER` | Driver `json` ou `postgres`                               | oui  |
| `PERSISTENCE_ALLOW_PARTIAL` | Autorise une migration partielle explicite en dev/staging | non |
| `PERSISTENCE_POSTGRES_COLLECTIONS` | Collections deja branchees Postgres (`auditLogs`) | non |
| `RESEND_API_KEY`   | Envoi d'emails transactionnels                              | oui  |
| `EMAIL_FROM`       | Expéditeur des emails                                       | oui  |
| `APP_URL`          | URL publique (liens dans les emails)                        | oui  |
| `PAYMENT_PROVIDER` | Prestataire escrow (`simulated` tant qu'aucun n'est branché)| oui  |

## 6. Checklist « secure by default » avant prod

- [ ] `DEMO` non défini / `false` (aucun endpoint `/api/dev/*`, aucun code en clair).
- [ ] `DATABASE_URL` défini, plus aucune dépendance à `data.json`.
- [ ] Emails réels branchés (`RESEND_API_KEY`) : vérification + reset fonctionnels.
- [ ] CORS restreint à l'origine du frontend (aujourd'hui `cors()` ouvert).
- [ ] Fichiers KYC/litiges en Storage privé (URLs signées), pas en data URLs publiques.
- [ ] HTTPS/TLS en frontal (reverse proxy ou plateforme).
- [ ] Monitoring erreurs 5xx (Sentry) actif.
- [ ] `npm test` et `npx vite build client` verts.
