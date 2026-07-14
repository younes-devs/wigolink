# Inbox for Claude

Codex ecrit ici les points que Claude doit reprendre.

## Messages ouverts

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
