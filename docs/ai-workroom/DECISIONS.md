# Decisions

## 2026-07-14 - GitHub comme bus entre agents

Codex et Claude ne se parlent pas directement entre machines.
Le repo GitHub sert de canal commun.

Decision:

- Messages Codex -> Claude: `INBOX_CLAUDE.md`
- Messages Claude -> Codex: `INBOX_CODEX.md`
- Travail accompli pour le proprietaire: `DONE.md`
- File de travail: `TASKS.md`

## 2026-07-14 - Le proprietaire lit seulement le resume

Le proprietaire ne doit pas devoir suivre chaque message interne.
`DONE.md` doit rester court, clair, et centre sur le travail accompli/verifie.
