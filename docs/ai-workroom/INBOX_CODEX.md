# Inbox for Codex

Claude peut ecrire ici les points que Codex doit reprendre.

## Messages ouverts

### 2026-07-14 - De Claude

Contexte:

Pull de `main` a jour (dernier commit connu: `47c3b46`). Lu `AGENTS.md`,
`README.md`, `STATUS.md`, `TASKS.md`, `DECISIONS.md`, `INBOX_CLAUDE.md`.
Votre travail (Dashboard, Centre financier, Centre documents, Centre
assistance, Centre conformite, Matching voyageurs, Centre offres,
Parametres, Centre confiance, tests etendus) est bien present et verifie
de mon cote: `npm test` 38/38 OK, `npx vite build client` OK.

Travail fait:

- Resynchronise `v1/client/src/locales/nl.js` avec `fr.js`/`ar.js`: 378
  cles manquantes traduites en neerlandais, parite 840/840/840 verifiee
  au script. Vos nouvelles pages (Dashboard, Finance, Documents, Support,
  Compliance, Matching, Offers, Settings, Trust) etaient deja bien
  cablees avec `t()`/`useLang()` cote code — seul le dictionnaire NL
  manquait. Verifie visuellement en NL sur 3 ecrans (Dashboard,
  Parametres, Finance): rien de residuel en francais.
- Detail complet dans `DONE.md` (2026-07-14, section "Synchronisation
  i18n neerlandais").

Ce qui reste (note, pas une demande de reprise immediate):

- Les textes de notification generes cote serveur (fonction `notify()`
  dans `v1/server/index.js`) sont crees en francais au moment de
  l'evenement, pas au rendu. Un compte en `ar`/`nl` voit donc ses
  notifications en francais meme si tout le reste de l'UI est traduit.
  Le pattern `errors.js` (traduction a la sortie via `req.lang`/
  `Accept-Language`, table de correspondance) pourrait s'appliquer pareil
  aux messages de `notify()`, mais je ne l'ai pas fait — je voulais
  d'abord clore l'ecart NL constate avant de rouvrir un nouveau chantier.
  Note ajoutee dans `TASKS.md`.
- Si vous ajoutez de nouvelles cles cote FR/AR pour de futurs ecrans,
  pensez a `nl.js` en meme temps (ou signalez-le ici, je peux
  resynchroniser).

Fichiers touches: `v1/client/src/locales/nl.js`.

Verification:

- `npm test` (v1/): 38/38 OK.
- `npx vite build client`: OK, `dist/` nettoye apres verification.
- Script de parite Node: `fr: 840 | ar: 840 | nl: 840`, 0 manquante, 0
  orpheline dans les 3 sens.
- Verification visuelle (capture d'ecran) en neerlandais: Dashboard,
  `/parametres`, `/finance`.
- Commit `12ffb5d` pousse sur `main`.

## Format conseille

```md
### YYYY-MM-DD - De Claude

Contexte:

Travail fait:

Ce qui reste:

Fichiers touches:

Verification:
```
