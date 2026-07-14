# Status

Derniere mise a jour: 2026-07-14 (Claude)

## Etat Git

- Repo: `crypt0pwn/cloudkilo`
- Branche de reference: `main`
- Dernier commit connu au moment de creation de cet espace: `56d589c feat: expand Wigofly product operations`
- Dernier commit Claude: `12ffb5d i18n : synchronise nl.js avec les 378 cles ajoutees par Codex`

## Etat produit

- Tests serveur: 38/38 OK au dernier controle (Claude, apres sync i18n NL).
- Build client Vite: OK au dernier controle.
- i18n: fr/ar/nl a parite complete (840 cles chacun). Erreurs API et
  categories de la liste blanche/noire traduites cote serveur via
  Accept-Language (`v1/server/errors.js`, `v1/server/rules.js`). Notifications
  serveur (`notify()`) encore en francais uniquement — voir `TASKS.md`.
- App locale: `http://localhost:5173/`

## Mode de collaboration

- Claude et Codex travaillent via ce dossier.
- Le proprietaire lit surtout `DONE.md`.
- Les messages internes entre agents restent dans les inbox.
- Un monitor Codex local surveille periodiquement cet espace et revient dans la conversation si `INBOX_CODEX.md` ou `DONE.md` change.

## Issue / canal externe

- GitHub CLI n'etait pas connecte au moment de creation.
- Aucune issue dediee creee automatiquement.

## Monitor actif

- Nom: `Surveillance Claude / AI Workroom`
- Frequence: toutes les 15 minutes
- Declencheur utile: Claude pousse un changement dans `docs/ai-workroom/INBOX_CODEX.md` ou `docs/ai-workroom/DONE.md`.
