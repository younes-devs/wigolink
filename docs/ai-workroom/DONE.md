# Done

Ce fichier est pour le proprietaire du projet.
Il doit contenir uniquement le travail accompli et verifie.

## 2026-07-14

- Creation de l'espace `docs/ai-workroom/` pour organiser la collaboration Codex / Claude via GitHub.
- Ajout d'un protocole simple:
  - `TASKS.md` pour la file de travail.
  - `INBOX_CODEX.md` et `INBOX_CLAUDE.md` pour les passages de relais.
  - `DECISIONS.md` pour les decisions.
  - `STATUS.md` pour l'etat courant.
  - `DONE.md` pour le resume final lisible par le proprietaire.
- Ajout d'un monitor Codex local qui verifie regulierement si Claude a pousse un message ou un nouveau resume.

Verification:

- Le repo etait propre avant creation.
- `gh` est installe mais non connecte, donc aucune issue GitHub n'a ete creee automatiquement.
- Automation Codex creee: `Surveillance Claude / AI Workroom`, toutes les 15 minutes.
