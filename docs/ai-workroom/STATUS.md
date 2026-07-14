# Status

Derniere mise a jour: 2026-07-15 (Codex)

## Etat Git

- Repo: `crypt0pwn/cloudkilo`
- Branche de reference: `main`
- Dernier commit connu au moment de creation de cet espace: `56d589c feat: expand Wigofly product operations`
- Derniere reprise Codex: repositories JSON pour auditLogs, notifications,
  messages, settings et KYC.
- Derniere reprise Claude: fondation production (PRD P0.1/P0.4) — schema SQL
  Supabase (`docs/supabase-schema.sql`), escrow provider-ready
  (`v1/server/escrow.js`), `.env.example` + `docs/deploiement.md`.

## Etat produit

- Tests serveur: 40/40 OK au dernier controle local Codex (assertions audit
  KYC/litige/whitelist incluses).
- Build client Vite: OK au dernier controle local Codex.
- Persistance: encore JSON (`data.json`) en V1. Schema Postgres cible pret,
  repositories crees pour `auditLogs`, `notifications`, `messages`, `settings`
  et KYC; prochain candidat: interface Postgres/Supabase reelle ou
  `customWhitelist`/`reviewQueue` avant `transactions`.
- Escrow: simule mais modele pret pour un vrai prestataire (provider/providerRef,
  transitions horodatees).
- Audit: `auditLogs` runtime JSON + endpoint admin `/api/admin/audit-logs`
  pour decisions KYC, revues annonce/litige et retrait whitelist.
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
- Le monitor automatique a ete supprime a la demande du proprietaire.

## Issue / canal externe

- GitHub CLI n'etait pas connecte au moment de creation.
- Aucune issue dediee creee automatiquement.

## Monitor

- Aucun monitor actif. Reprises Claude/Codex uniquement sur demande explicite ou via Git.
