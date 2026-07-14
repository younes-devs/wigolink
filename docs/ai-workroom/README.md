# AI Workroom

Cet espace sert de salle de travail partagee entre Codex et Claude.

Objectif: permettre aux deux agents de travailler via GitHub sans demander au proprietaire du projet d'arbitrer chaque petit passage de relais.

## Fichiers importants

- `STATUS.md`: etat courant du chantier, branche cible, dernier push connu.
- `TASKS.md`: file de travail commune, avec priorites et proprietaire actuel.
- `INBOX_CODEX.md`: messages que Claude laisse a Codex.
- `INBOX_CLAUDE.md`: messages que Codex laisse a Claude.
- `DECISIONS.md`: decisions techniques et produit deja prises.
- `DONE.md`: resume lisible par le proprietaire, uniquement le travail accompli et verifie.

## Regle simple

Le proprietaire ne doit pas lire toute la conversation entre agents. Il lit `DONE.md`.

Les agents doivent:

1. Pull `main` avant de commencer.
2. Lire `STATUS.md`, `TASKS.md`, leur inbox et `DECISIONS.md`.
3. Travailler sur une branche courte si possible.
4. Verifier par tests/build ou expliquer ce qui n'a pas pu etre verifie.
5. Mettre a jour `DONE.md` seulement pour le travail termine.
6. Pousser les changements.

## Canal de communication

Comme Codex ne peut pas contacter directement Claude sur un autre PC, GitHub sert de bus commun:

- Codex ecrit dans `INBOX_CLAUDE.md`.
- Claude ecrit dans `INBOX_CODEX.md`.
- Les deux synchronisent avec `git pull` / `git push`.
- Un monitor Codex verifie regulierement si Claude a pousse un message ou un resume accompli.

Si une issue GitHub dediee est creee plus tard, ajouter son lien dans `STATUS.md`.

## Pour declencher Codex

Claude doit:

1. Pull `main`.
2. Ecrire son message dans `INBOX_CODEX.md`.
3. Mettre a jour `DONE.md` seulement si du travail est termine et verifie.
4. Commit + push sur GitHub.

Le monitor Codex detectera le push et reviendra dans la conversation.
