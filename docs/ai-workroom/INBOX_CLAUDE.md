# Inbox for Claude

Codex ecrit ici les points que Claude doit reprendre.

## Messages ouverts

### 2026-07-15 - De Codex

J'ai repris moi-meme le PRD global cote P0.8 securite/audit.

Travail fait:

- Ajout du runtime audit log JSON (`auditLogs`) + endpoint admin
  `GET /api/admin/audit-logs`.
- Actions sensibles tracees: decisions KYC, retrait custom whitelist, revue
  annonce, arbitrage litige avec etat escrow final.
- Tests et build verts: `npm test` 40/40, `npx vite build client` OK.

Suite utile si tu reprends:

- Continuer la fondation production par l'adaptateur de persistance repository,
  mais eviter de commencer par `transactions`. Bons candidats: `auditLogs`,
  `notifications` ou `messages`, en gardant le store JSON comme fallback.

### 2026-07-15 - De Codex

Suite de la fondation production: j'ai extrait `auditLogs` derriere le premier
repository JSON (`v1/server/repositories.js`). `server/index.js` ne lit/ecrit
plus directement `db.auditLogs`.

Verification: `npm test` 40/40, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

Relais utile: continuer avec `notifications` ou `messages` derriere le meme
pattern repository, toujours sans toucher encore aux transactions.

### 2026-07-15 - De Codex

J'ai continue le meme chantier: `notifications` est maintenant aussi derriere
`repositories.notifications`.

`notify()`, `/api/notifications`, `/api/notifications/read` et le dashboard ne
touchent plus directement `db.notifications`. Le rendu i18n reste hors
repository pour garder une couche persistance simple.

Verification: `npm test` 40/40, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

Relais utile: prochain candidat logique = `messages`, toujours avant de toucher
aux transactions.

### 2026-07-15 - De Codex

J'ai pris le relais indique: `messages` est maintenant derriere
`repositories.messages`.

Le chat transaction, l'export RGPD, le trust score, les KPIs ops/admin et les
signaux fraude ne touchent plus directement `db.messages`. Le repository garde
seulement la persistance; les regles metier restent dans `server/index.js`.

Verification: `npm test` 40/40, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

Relais utile: soit continuer avec une petite collection (`settings`,
`kycDecisions`), soit poser l'interface d'adaptateur Postgres/Supabase reelle
pour les repositories deja extraits. Eviter encore `transactions` tant que la
frontiere repository n'est pas stabilisee.

### 2026-07-14 (suite) - De Codex

Le proprietaire demande maintenant de travailler a partir d'un PRD global pour
terminer Wigofly, pas seulement corriger des petits bugs.

Document a lire en priorite:

- `docs/prd-global-production.md`

Demande:

- Choisir un gros chantier utile dans ce PRD.
- Ne pas rester sur un audit: si tu trouves un probleme clair, implemente un
  correctif ou une premiere brique propre.
- Mettre a jour `DONE.md`, `TASKS.md` et/ou les inbox apres ton travail.
- Lancer les tests pertinents et pousser sur `main` si tout est vert.

Point de depart recommande par Codex:

- Fondation production Supabase: schema SQL initial + plan d'adaptateur de
  persistance, sans casser le mode demo local.

### 2026-07-14 (suite) - De Codex

J'ai repris le mode production apres le rappel du proprietaire: il veut une
collaboration active pour terminer le site, pas seulement de la surveillance.

Travail fait:

- Onboarding premier lancement rendu persistant par compte:
  `POST /api/onboarding/complete`, `user.onboardingDone` dans `/api/me` et les
  reponses d'auth, fallback `localStorage` conserve cote client.
- Tests et build verts: `npm test` 40/40, `npx vite build client` OK.

Ce qui reste pour toi si tu reprends:

- Choisir un vrai chantier produit restant, pas un simple audit. Bon candidat:
  revue UX complete creation annonce -> matching -> transaction, avec correction
  directe d'un point bloquant trouve.
- Si tu touches l'onboarding, garde la persistance serveur et ajoute un test.

## Archive

### 2026-07-14 - De Codex

Contexte:

Le repo est a jour sur `main` avec les commits Claude precedents et le commit Codex `56d589c`.
Un espace de collaboration commun vient d'etre cree dans `docs/ai-workroom/`.

Travail fait:

- Pages produit/operations ajoutees cote app.
- Matching/offres enrichis avec negociation, expiration, relances et surveillance admin.
- Tests serveur et build client verts avant creation de cet espace.

Ce qui reste:

- Pull `main`.
- Lire `docs/ai-workroom/README.md`.
- Utiliser `INBOX_CODEX.md` pour laisser les prochains passages de relais.
- Mettre `DONE.md` a jour uniquement pour du travail termine et verifie.

Verification:

- Derniere validation connue avant cet espace: `npm test` 38/38 OK, `npx vite build client` OK.

## Format conseille

```md
### YYYY-MM-DD - De Codex

Contexte:

Travail fait:

Ce qui reste:

Fichiers touches:

Verification:
```
