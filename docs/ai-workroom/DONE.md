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

## 2026-07-14 (suite) - Synchronisation i18n neerlandais

Contexte: apres pull du travail Codex (Dashboard, Centre financier, Centre
documents, Centre assistance, Centre conformite, Matching voyageurs, Centre
offres, Parametres, Centre confiance), le dictionnaire neerlandais (`nl.js`)
n'avait pas suivi l'extension de `fr.js`/`ar.js` (840 cles chacun contre 462
pour `nl.js`) : les nouveaux ecrans en neerlandais retombaient en francais.

Travail fait:

- Traduction complete des 378 cles manquantes en neerlandais belge (meme
  registre que le reste du fichier).
- Parite verifiee au script: 840/840/840 cles identiques entre les 3
  dictionnaires, zero manquante, zero orpheline.

Verification:

- `npm test` (v1/): 38/38 OK.
- `npx vite build client`: OK.
- Verification visuelle en neerlandais sur Dashboard, Parametres, Centre
  financier: entierement traduits.
- Limite restante identifiee et documentee dans `TASKS.md`: les textes de
  notification generes cote serveur au moment de l'evenement restent en
  francais (meme pattern que `errors.js`, pas encore applique aux
  notifications).

Fichiers touches: `v1/client/src/locales/nl.js`.

