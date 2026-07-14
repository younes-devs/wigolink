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

## 2026-07-14 (suite) - Codex : onboarding persistant par compte

Travail fait (Codex):

- L'onboarding premier lancement n'est plus seulement memorise dans
  `localStorage`; il est maintenant marque cote serveur dans les parametres du
  compte via `POST /api/onboarding/complete`.
- `/api/me` et les reponses d'auth renvoient `user.onboardingDone`, ce qui evite
  de revoir l'onboarding sur un autre appareil ou apres nettoyage du navigateur.
- Le client garde `localStorage` comme fallback immediat si la sauvegarde reseau
  echoue, donc l'experience reste fluide.

Fichiers touches: `v1/server/index.js`, `v1/server/test/api.test.js`,
`v1/client/src/Onboarding.jsx`.

Verification: `npm test` 40/40 OK (nouveau test onboarding persistant),
`npx vite build client` OK.

## 2026-07-14 (suite) - Claude : revue UX creation annonce -> matching -> transaction

Contexte: chantier demande explicitement par Codex dans `INBOX_CLAUDE.md`
("un vrai chantier produit restant... revue UX complete creation annonce ->
matching -> transaction, avec correction directe d'un point bloquant
trouve"), plutot qu'un simple audit.

Travail fait: parcours complet en conditions reelles (navigateur, deux
comptes demo differents), pas seulement lecture de code.

- Cote expediteur (`fatima@demo.wigofly.app`): creation d'annonce jusqu'au
  bout, y compris le nouvel ecran "Pre-controle de l'envoi" de Codex
  (14 criteres, case douane a cocher) et publication.
- Bug reel trouve sur `/envois` (Mes envois): la carte d'annonce publiee
  affichait son titre/trajet en mots empiles un par un au lieu d'une ligne —
  `.shipment-card-head` (flex row) laissait un pill de statut long
  (`flex: 0 0 auto`) et une icone ecraser le conteneur flexible du
  titre/trajet a une largeur calculee de 0px sur les cartes etroites de la
  grille 2 colonnes.
  - Premiere tentative (`flex: 1 1 auto` sur `.grow` seul) verifiee
    insuffisante par inspection des styles calcules (toujours 0px).
  - Correction retenue: `flex-wrap: wrap` sur `.shipment-card-head` +
    `flex: 1 1 160px` sur `.grow` (largeur minimale garantie), le pill de
    statut passe a la ligne suivante quand la place manque. Verifie par
    capture d'ecran (bureau et mobile 375px) et absence de nouveau
    debordement horizontal (`scrollWidth === clientWidth`).
- Cote voyageur (`karim@demo.wigofly.app`): ecran "Mission trajet" (trajet,
  compatibilite, annonces correspondantes), acceptation d'un transport
  (paiement mis en sequestre), ecran de transaction (timeline, recapitulatif
  douane, messagerie chiffree cote plateforme) et envoi d'un message —
  parcours complet fonctionnel, aucun autre point bloquant trouve.

Nettoyage: donnees de test creees pendant la verification (1 annonce, 1
transaction, 1 message, 4 notifications) supprimees de `server/data.json`
(serveur arrete pendant l'edition), 4 comptes demo reverifies apres
redemarrage, certificat HTTPS local remis en place.

Fichiers touches: `v1/client/src/styles.css`.

Verification: `npm test` 40/40 OK, `npx vite build client` OK, verification
visuelle du correctif (bureau + mobile 375px), 4 comptes demo fonctionnels
apres nettoyage des donnees de test.

## 2026-07-15 - Claude : fondation production (schema Supabase + escrow provider-ready)

Contexte: demarrage du chantier "Fondation production" du PRD
(`docs/prd-global-production.md`, P0.1 + P0.4), premiere brique concrete et
non-cassante avant le gros refactor persistance.

Travail fait:

- **Schema Postgres initial** `docs/supabase-schema.sql` : modelise fidelement
  tout le domaine actuel (users, sessions, verifications, kyc_submissions/
  decisions, trips, listings, matching_offers, transactions +
  transaction_events, messages, disputes, notifications, review_queue,
  custom_whitelist, audit_logs) en forme production — cles etrangeres, index,
  contraintes d'etats, horodatages. Ordre de creation verifie (contrainte
  croisee matching_offers -> transactions ajoutee en fin via ALTER).
- **Escrow "provider-ready"** (P0.4) `v1/server/escrow.js` : l'escrow reste
  simule (aucun mouvement reel) mais le domaine porte maintenant `provider`
  ('simulated'), `providerRef` (null), et des transitions centralisees qui
  horodatent chaque etat (held/frozen/released/refunded). Corrige au passage
  un manque : le remboursement ne laissait aucun horodatage (`refundedAt`
  absent). Branche sur les 5 sites de transition d'index.js sans changer les
  appelants ni le comportement simule. `txView` expose deja les nouveaux
  champs (spread), aucun changement client requis.
- **Config deploiement** : `v1/.env.example` (variables actuelles + cibles
  prod commentees : DATABASE_URL, RESEND_API_KEY, APP_URL, PAYMENT_PROVIDER)
  et `docs/deploiement.md` (architecture cible, chemin de migration JSON ->
  Postgres sans casser la demo, checklist secure-by-default avant prod).

Ce qui reste (relais possible Codex): commencer l'adaptateur de persistance
repository derriere l'API, collection par collection, en s'appuyant sur le
schema. Details dans `INBOX_CODEX.md`.

Fichiers touches: `docs/supabase-schema.sql` (nouveau), `docs/deploiement.md`
(nouveau), `v1/.env.example` (nouveau), `v1/server/escrow.js` (nouveau),
`v1/server/index.js`, `v1/server/test/api.test.js`.

Verification: `npm test` 40/40 OK (tests money etendus : les nouveaux champs
escrow provider/providerRef/heldAt/releasedAt et l'horodatage refundedAt sont
asseres de bout en bout contre un vrai serveur Express). `node --check` sur
escrow.js et index.js OK. Mode demo local intact (escrow simule inchange).

## 2026-07-15 - Codex : audit log serveur pour actions sensibles

Contexte: reprise directe du PRD global production, P0.8 securite/audit. Le
schema Supabase contenait deja une table cible `audit_logs`, mais l'app runtime
JSON ne tracait pas encore les actions admin sensibles.

Travail fait:

- Ajout de `auditLogs` dans le store JSON et migration douce pour les bases
  existantes.
- Ajout d'un helper serveur `audit()` et d'un endpoint admin
  `GET /api/admin/audit-logs` avec acteur public et limite bornee.
- Journalisation des decisions sensibles:
  - decision KYC admin (`kyc.approve`, `kyc.reject`, `kyc.refuse`);
  - retrait d'une categorie promue (`custom_whitelist.remove`);
  - revue d'annonce (`review.listing.approve/reject`);
  - arbitrage litige avec etat escrow final (`review.dispute.release_traveler`
    ou `review.dispute.refund_sender`).

Fichiers touches: `v1/server/store.js`, `v1/server/index.js`,
`v1/server/test/api.test.js`.

Verification: `npm test` 40/40 OK (assertions audit KYC, litige, whitelist),
`npx vite build client` OK.

## 2026-07-15 - Codex : premier repository de persistance (auditLogs)

Contexte: suite du chantier fondation production. Claude avait recommande de
commencer l'adaptateur de persistance par une collection peu couplee avant les
transactions; Codex a pris `auditLogs`, qui venait justement d'etre ajoute au
runtime.

Travail fait:

- Ajout de `v1/server/repositories.js` avec une fabrique `createRepositories()`.
- Extraction de `auditLogs` derriere un repository JSON (`append`, `list`,
  `flush`) dont l'interface pourra etre reprise par un adaptateur
  Postgres/Supabase.
- `server/index.js` n'accede plus directement a `db.auditLogs` pour ecrire ou
  lire les logs; il passe par `repositories.auditLogs`.
- L'endpoint admin `GET /api/admin/audit-logs` utilise maintenant le repository
  et conserve les garanties existantes: limite bornee, tri recent, acteur public.

Fichiers touches: `v1/server/repositories.js`, `v1/server/index.js`,
`v1/server/test/api.test.js`.

Verification: `npm test` 40/40 OK, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

## 2026-07-15 - Codex : repository messages

Contexte: suite de l'extraction progressive de la persistance vers des
repositories JSON remplacables par un adaptateur Postgres/Supabase, dernier
candidat peu risque avant les collections plus centrales.

Travail fait:

- Ajout de `repositories.messages` dans `v1/server/repositories.js`.
- Extraction des operations messages:
  - creation (`append`);
  - liste par transaction (`listForTransaction`);
  - export par auteur (`listFromUser`);
  - signaux de desintermediation/fraude (`flagged`, `flaggedFromUser`,
    `flaggedSenderCount`);
  - comptage (`count`, `all`).
- `server/index.js` ne lit/ecrit plus directement `db.messages`; chat
  transaction, export RGPD, trust score, KPIs, admin ops et fraude passent par
  le repository.
- Les regles metier restent dans `index.js` (autorisation, detection de fuite,
  notifications), donc le repository reste concentre sur la persistance.

Fichiers touches: `v1/server/repositories.js`, `v1/server/index.js`.

Verification: `npm test` 40/40 OK, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

## 2026-07-15 - Codex : repositories settings et KYC

Contexte: poursuite du PRD P0.1 migration Supabase. Apres `auditLogs`,
`notifications` et `messages`, Codex a extrait deux zones sensibles restantes:
preferences utilisateur et verification d'identite.

Travail fait:

- Ajout de `repositories.settings` dans `v1/server/repositories.js`.
  - normalisation des preferences notifications;
  - securite forcee sur les notifications critiques;
  - persistance de l'onboarding termine.
- Ajout de `repositories.kyc`.
  - creation et lecture des soumissions KYC;
  - historique des decisions admin;
  - compteurs de rejets et signaux fraude;
  - file admin KYC avec filtre/recherche/tri;
  - purge des photos et donnees sensibles KYC lors de la suppression RGPD.
- `server/index.js` ne lit/ecrit plus directement `db.kycSubmissions` ni
  `db.kycDecisions`; les routes utilisateur, RGPD, documents, admin ops, admin
  KYC et fraude passent par le repository.

Fichiers touches: `v1/server/repositories.js`, `v1/server/index.js`.

Verification: `npm test` 40/40 OK, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.

## 2026-07-15 - Codex : repositories reviewQueue et customWhitelist

Contexte: poursuite du PRD P0.1 migration Supabase sur les collections admin
sensibles avant les transactions. Ces deux collections pilotent la revue humaine
des annonces en zone grise, les litiges et la promotion de categories en liste
blanche.

Travail fait:

- Ajout de `repositories.reviewQueue` dans `v1/server/repositories.js`.
  - creation d'items de revue (`append`);
  - lecture de la file ouverte, avec filtre par type (`open`);
  - recherche et cloture d'une decision admin (`find`, `close`).
- Ajout de `repositories.customWhitelist`.
  - liste blanche promue (`all`);
  - fusion avec la whitelist statique (`combinedWith`);
  - verification d'existence (`hasIn`);
  - promotion depuis une annonce validee;
  - suppression admin auditee.
- `server/index.js` ne lit/ecrit plus directement `db.reviewQueue` ni
  `db.customWhitelist`; publication d'annonce grise, ouverture de litige,
  centre conformite, admin ops, admin overview, retrait whitelist et decisions
  de revue passent par les repositories.

Fichiers touches: `v1/server/repositories.js`, `v1/server/index.js`.

Verification: `npm test` 40/40 OK, `node --check server/index.js`,
`node --check server/repositories.js`, `npx vite build client` OK.

## 2026-07-15 - Codex : point d'entree persistence

Contexte: les petites collections sensibles sont maintenant derriere des
repositories JSON. Prochaine etape PRD P0.1: eviter que `server/index.js`
instancie directement ces repositories, et poser un point d'entree unique pour
le futur adaptateur Postgres/Supabase.

Travail fait:

- Ajout de `v1/server/persistence.js`.
- `server/index.js` passe maintenant par `createPersistence()` pour obtenir les
  repositories.
- Ajout de `persistenceConfig()`:
  - `json` par defaut sans `DATABASE_URL`;
  - `postgres` selectionne automatiquement si `DATABASE_URL` est defini;
  - `PERSISTENCE_DRIVER` permet de forcer explicitement le driver.
- Garde-fou production: `PERSISTENCE_DRIVER=postgres` ou `DATABASE_URL` refuse
  le demarrage avec un message clair tant que l'adaptateur Postgres complet
  n'est pas branche. Cela evite un faux mode production silencieux qui
  continuerait a ecrire dans `data.json`.
- Tests unitaires ajoutes pour verrouiller ces comportements.

Fichiers touches: `v1/server/persistence.js`, `v1/server/index.js`,
`v1/server/test/persistence.test.js`.

Verification: `npm test` 43/43 OK, `node --check server/persistence.js`,
`node --check server/index.js`, `node --check server/repositories.js`,
`npx vite build client` OK.

## 2026-07-15 - Codex : premier repository Postgres partiel (auditLogs)

Contexte: suite directe du point d'entree `persistence.js`. Objectif PRD P0.1:
brancher une premiere collection sur Postgres/Supabase sans pretendre que toute
l'application est deja migree.

Travail fait:

- Ajout de la dependance `pg`.
- Ajout de `v1/server/postgres-repositories.js`.
- Implementation de `createPostgresAuditLogRepository()`:
  - `append()` ecrit dans la table `audit_logs`;
  - `list()` lit les logs recents, borne `limit` a 200 et remappe les noms SQL
    (`actor_id`, `target_type`, etc.) vers le format API existant.
- `createPersistence()` peut maintenant activer explicitement un mode Postgres
  partiel:
  - `PERSISTENCE_DRIVER=postgres`;
  - `PERSISTENCE_ALLOW_PARTIAL=true`;
  - `PERSISTENCE_POSTGRES_COLLECTIONS=auditLogs`.
- Les autres collections restent en JSON dans ce mode partiel. Toute collection
  Postgres non supportee est refusee.
- Les endpoints admin sensibles attendent maintenant l'ecriture audit
  (`await audit(...)`) pour ne pas repondre OK avant le log.
- Variables documentees dans `v1/.env.example` et `docs/deploiement.md`.
- Tests ajoutes pour le mapping SQL et la configuration partielle.

Fichiers touches: `v1/server/postgres-repositories.js`,
`v1/server/persistence.js`, `v1/server/index.js`,
`v1/server/test/postgres-repositories.test.js`,
`v1/server/test/persistence.test.js`, `v1/package.json`,
`v1/package-lock.json`, `v1/.env.example`, `docs/deploiement.md`.

Verification: `npm test` 47/47 OK, `node --check server/persistence.js`,
`node --check server/postgres-repositories.js`, `node --check server/index.js`,
`node --check server/repositories.js`, `npx vite build client` OK.

## 2026-07-15 - Codex : repository Postgres partiel notifications

Contexte: deuxieme collection simple branchee sur le mode Postgres partiel apres
`auditLogs`. Les notifications sont critiques produit, mais leur repository est
encore assez isole pour eviter `transactions`/`listings`.

Travail fait:

- Ajout de `createPostgresNotificationRepository()` dans
  `v1/server/postgres-repositories.js`.
- Operations Postgres couvertes:
  - creation d'une notification dans `notifications`;
  - liste bornee par utilisateur;
  - compteur non lus;
  - marquage lu par utilisateur.
- `PERSISTENCE_POSTGRES_COLLECTIONS` accepte maintenant
  `auditLogs,notifications`.
- `notify()` et `runMatchingOfferReminders()` sont async.
- Les routes qui lisent ou emettent des notifications attendent les operations
  du repository, afin qu'une reponse OK ne parte pas avant l'ecriture Postgres.
- Tests SQL/mapping ajoutes pour notifications.

Fichiers touches: `v1/server/postgres-repositories.js`,
`v1/server/persistence.js`, `v1/server/index.js`,
`v1/server/test/postgres-repositories.test.js`,
`v1/server/test/persistence.test.js`, `v1/.env.example`,
`docs/deploiement.md`.

Verification: `npm test` 49/49 OK, `node --check server/persistence.js`,
`node --check server/postgres-repositories.js`, `node --check server/index.js`,
`node --check server/repositories.js`.

## 2026-07-15 - Codex : repository Postgres partiel messages

Contexte: troisieme collection simple branchee sur le mode Postgres partiel,
apres `auditLogs` et `notifications`. Les messages alimentent le chat, l'export
RGPD, le trust score, les KPIs et les signaux de desintermediation.

Travail fait:

- Ajout de `createPostgresMessageRepository()` dans
  `v1/server/postgres-repositories.js`.
- Operations Postgres couvertes:
  - creation dans `messages`;
  - liste par transaction;
  - liste par auteur pour l'export RGPD;
  - messages signales par auteur;
  - tous les messages signales;
  - compteur de messages;
  - compteur d'expediteurs signales distincts;
  - lecture complete pour le dashboard fraude.
- `PERSISTENCE_POSTGRES_COLLECTIONS` accepte maintenant
  `auditLogs,notifications,messages`.
- Les routes/fonctions qui lisent ou ecrivent `repositories.messages` sont
  compatibles async.
- Tests SQL/mapping ajoutes pour messages.

Fichiers touches: `v1/server/postgres-repositories.js`,
`v1/server/persistence.js`, `v1/server/index.js`,
`v1/server/test/postgres-repositories.test.js`,
`v1/server/test/persistence.test.js`, `v1/.env.example`,
`docs/deploiement.md`.

Verification: `npm test` 51/51 OK, `node --check server/persistence.js`,
`node --check server/postgres-repositories.js`, `node --check server/index.js`,
`node --check server/repositories.js`.

## 2026-07-15 - Codex : repository notifications

Contexte: suite de l'extraction progressive de la persistance vers des
repositories JSON remplacables par un adaptateur Postgres/Supabase.

Travail fait:

- Ajout de `repositories.notifications` dans `v1/server/repositories.js`.
- Extraction des operations notifications:
  - creation (`append`);
  - liste par utilisateur (`listForUser`);
  - compteur non lus (`unreadCount`);
  - marquage lu (`markAllRead`).
- `server/index.js` ne lit/ecrit plus directement `db.notifications`; `notify()`,
  `GET /api/notifications`, `POST /api/notifications/read` et le dashboard
  passent par le repository.
- Le rendu i18n reste dans `index.js`/`notify-i18n.js`, donc le repository reste
  concentre sur la persistance.

Fichiers touches: `v1/server/repositories.js`, `v1/server/index.js`.

Verification: `npm test` 40/40 OK, `node --check server/repositories.js`,
`node --check server/index.js`, `npx vite build client` OK.
