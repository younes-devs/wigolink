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

## 2026-07-14 (suite) - Notifications serveur i18n completes

Travail fait:

- Claude a ajoute `v1/server/notify-i18n.js`: 19 templates de notification
  (offres, transactions, litiges, chat, KYC) en fr/ar/nl avec parametres
  structures.
- `notify()` stocke maintenant une cle de template + parametres au lieu d'un
  texte francais fige; `/api/notifications` traduit chaque entree a la lecture
  selon `Accept-Language`, avec repli compatible pour les anciennes notifications.
- Codex a complete le relais en appliquant la meme traduction aux notifications
  exposees par `/api/dashboard`, pas seulement `/api/notifications`.
- `TASKS.md` a ete mis a jour: le chantier notifications serveur i18n est clos.

Verification:

- Nouveau test d'integration: une meme notification persistee, relue en
  fr/ar/nl, donne 3 textes differents pour le meme id (traduction a la
  lecture, pas triplication en base).
- Repli legacy verifie en unitaire sur une vraie entree sans cle tiree de
  `data.json` (29 notifications historiques concernees, toutes lisibles).
- Test ajoute par Codex: `/api/dashboard` renvoie aussi le texte de notification
  traduit en neerlandais.
- `npm test`: 39/39 OK. `npx vite build client`: OK.
- Aucun changement client necessaire (deja branche sur `Accept-Language`
  depuis la synchronisation NL).

Fichiers touches: `v1/server/notify-i18n.js` (nouveau),
`v1/server/index.js`, `v1/server/test/api.test.js`.

## 2026-07-14 (suite) - Audit overflow mobile (375px)

Contexte: item ouvert de longue date dans `TASKS.md` ("Garder les pages
mobile sans overflow"), jamais verifie explicitement depuis l'ajout des
nouvelles pages Codex (Dashboard, Finance, Documents, Support, Compliance,
Matching, Offers, Settings, Trust).

Travail fait: audit systematique a 375px de large (viewport mobile) sur
13 routes produit (`/`, `/trajets`, `/envois`, `/transactions` +detail,
`/finance`, `/documents`, `/assistance`, `/conformite`, `/matching`,
`/offres`, `/profil`, `/parametres`, `/confiance`, `/verification`,
`/admin`) plus les onglets admin les plus denses (KPIs avec graphiques,
Fraude avec tableaux).

Resultat: aucun debordement horizontal trouve. `document.documentElement`
et `.content` ont `scrollWidth === clientWidth` sur toutes les pages
testees. Confirme visuellement par capture d'ecran sur `/finance`.

Aucun correctif necessaire — pas de regression, item ferme.

Verification: mesure `scrollWidth`/`clientWidth` via le navigateur de
preview a 375px, capture d'ecran de controle.

## 2026-07-14 (suite) - Couverture tests + smoke navigation post-merge

Travail fait (Claude):

- Etendu (sans dupliquer) les tests existants KYC-approbation et
  litige-remboursement avec des assertions sur la notification associee
  (cle de template + traduction fr/ar/nl) — ces deux chemins touchent
  argent/KYC/litige et passent par le `notify()` modifie.
- Sweep de chaines codees en dur (heuristique regex sur accents
  francais hors `t(...)`) sur les fichiers touches par le merge Codex
  (App.jsx, components.jsx, Admin.jsx, SideRail.jsx, pages
  Feed/CreateListing/MyShipments/Transactions/TransactionDetail,
  Notifications.jsx): zero trouvee.
- Smoke test de navigation post-merge sans authentification cassee :
  parcours expediteur (feed -> matching -> offres -> documents ->
  conformite -> assistance) et parcours voyageur (finance -> confiance
  -> parametres), aucune erreur ni avertissement console.

Verification: `npm test` 39/39 (assertions etendues incluses),
`preview_console_logs` (error + warn) vide sur les deux parcours,
comptes demo fonctionnels apres chaque redemarrage serveur.

## 2026-07-14 (suite) - Codex : notifications du dashboard traduites

Travail fait (Codex), en reprise directe du commit notifications i18n de
Claude: `/api/dashboard` avait sa propre logique de recuperation des
notifications (dupliquee de `/api/notifications`) qui n'appliquait pas
`renderNotification()`. Corrige en reutilisant la meme fonction, avec un
test etendu verifiant la traduction neerlandaise sur cet endpoint aussi.

Fichiers touches: `v1/server/index.js`, `v1/server/test/api.test.js`.
Verification: `npm test` 39/39 OK (assertion `/api/dashboard` + `nl`
incluse).
