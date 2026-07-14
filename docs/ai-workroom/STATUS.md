# Status

Derniere mise a jour: 2026-07-14 (Claude)

## Etat Git

- Repo: `crypt0pwn/cloudkilo`
- Branche de reference: `main`
- Dernier commit connu au moment de creation de cet espace: `56d589c feat: expand Wigofly product operations`
- Derniere reprise Codex: onboarding premier lancement persistant par compte.
- Derniere reprise Claude: revue UX creation annonce -> matching -> transaction,
  correctif `.shipment-card-head` (flexbox, carte ecrasee sur grille etroite)
  dans `v1/client/src/styles.css`.

## Etat produit

- Tests serveur: 40/40 OK au dernier controle local Claude.
- Build client Vite: OK au dernier controle local Claude.
- Onboarding: affiche une seule fois par compte, avec sauvegarde serveur et
  fallback local.
- i18n: fr/ar/nl a parite complete. Erreurs API, categories de regles et notifications serveur sont traduites cote serveur via `Accept-Language`.
- Parcours creation annonce -> matching -> transaction verifie en conditions
  reelles (2 comptes demo) jusqu'a l'acceptation, l'escrow et la messagerie.
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
