# Exploitation de Wigofly

## Garde-fous avant deploiement

Executer ces commandes dans `v1` :

```text
npm run audit:production
npm run check:i18n
npm test
npm run build
```

L'audit autorise temporairement une seule alerte connue de React Router
(`GHSA-qwww-vcr4-c8h2`). Elle concerne les actions serveur/RSC. Wigofly utilise
`BrowserRouter` comme SPA et n'importe aucun runtime serveur React Router. Le
script echoue automatiquement si ce mode apparait ou si une autre alerte est
publiee. Cette exception doit etre retiree des qu'une version corrigee compatible
est disponible.

## Base relationnelle

Apres `supabase/schema.sql` et la migration :

```text
npm run migrate:relational
npm run migrate:relational:verify
```

La verification refuse une table absente, une collection relationnelle moins
complete que l'etat source ou un message rattache a une conversation absente.
`RELATIONAL_TRIP_READS` et `RELATIONAL_MESSAGE_READS` ne doivent valoir `true`
qu'apres ce controle.

`RELATIONAL_MESSAGE_WRITES` doit rester `false` tant que la colonne
`messages.client_id`, l'index `messages_client_id_unique_idx` et les lectures
relationnelles ne sont pas verifies. Une fois actif, surveiller les erreurs
`relational_message_write_failed` et `relational_conversation_*_failed` dans
Vercel Logs. Le retour arriere consiste uniquement a remettre ce drapeau a
`false`; les lignes deja ecrites restent lisibles et conservees.

`RELATIONAL_CONVERSATION_MEMBERS=true` remplace les tableaux partages
`readBy`, `archivedBy`, `pinnedBy`, `deletedBy` et `blockedBy` par une ligne
indexee par participant. Ouvrir une conversation met alors a jour une seule
ligne, quel que soit le nombre de messages. Appliquer le schema, executer le
backfill et verifier une ligne par participant avant activation.

`RELATIONAL_OPERATION_READS=true` retire les pages `En cours` et detail
d'operation du document global. `RELATIONAL_TRIP_WRITES=true` couvre pour
l'instant les ajouts et retraits de favoris.

`RELATIONAL_OPERATION_WRITES=true` active les mutations transactionnelles SQL
du parcours operation : demande, confirmation/refus, paiement simule, codes de
remise/livraison, annulation, litige et preuves. PostgreSQL verrouille seulement
la ligne concernee avec `FOR UPDATE`; une relance de demande sur le meme trajet
retourne l'operation active existante au lieu d'en creer une seconde.

`RELATIONAL_KYC=true` active le depot, la consultation et les decisions KYC
relationnels. Ne l'activer qu'apres `npm run migrate:relational:verify`.
La soumission et le statut membre sont ecrits dans une meme transaction; une
decision admin conserve atomiquement le dossier, le statut membre et son
historique. Une suppression de compte anonymise le compte mais ne supprime pas
automatiquement les preuves KYC.

`RELATIONAL_ADMIN_MEMBERS=true` sert la liste et les dossiers membres depuis
les tables relationnelles, avec recherche et pagination bornees.
`RELATIONAL_ADMIN_ACTIONS=true` active ensuite les roles, suspensions,
restaurations et traces d'acces transactionnels. La mutation et son audit sont
valides ensemble. Un verrou transactionnel PostgreSQL serialise les changements
de role afin que deux requetes concurrentes ne puissent jamais retirer le
dernier administrateur.

`RELATIONAL_SAFETY_APPEALS=true` deplace les recours de suspension dans
`wigofly_review_queue`. Un membre ne peut avoir qu'un recours ouvert; sa
creation, son audit, la decision admin et une eventuelle levee de suspension
sont transactionnels. Executer le backfill avant activation pour conserver les
anciens recours dans les dossiers membres.

Les signalements de conversation sont conserves sans limite fonctionnelle dans
`wigofly_conversation_reports`, indexes par conversation et par auteur. La
conversation active ne garde qu'un compteur et la date du dernier signalement:
son enregistrement reste petit, tandis que l'historique complet demeure
consultable dans le dossier administrateur.

`LAZY_GLOBAL_STATE=true` evite de telecharger `wigofly_app_state` au demarrage
de chaque fonction Vercel. Les routes relationnelles et les endpoints sans etat
utilisent directement leurs tables ciblees; le document historique est charge
uniquement lorsqu'une route encore non migree en a besoin. Ne l'activer qu'une
fois `RELATIONAL_AUTH`, les lectures/ecritures metier, KYC et les actions admin
actives.

## Images de conversation

Les nouvelles images sont stockees dans le bucket prive
`SUPABASE_MESSAGE_MEDIA_BUCKET`. La maintenance administrateur
`POST /api/admin/maintenance/message-media` migre les anciennes images inline.
Elle est idempotente, auditee et protegee par `auth` puis `adminOnly`.

Le script equivalent pour une execution privee est :

```text
npm run migrate:message-media
```

## Observabilite

Chaque reponse possede `X-Request-Id`. Les erreurs 500 et les requetes plus
lentes que `SLOW_REQUEST_MS` sont journalisees en JSON avec la route, la duree,
le statut, l'environnement et le commit Vercel. Les administrateurs peuvent
consulter le resume glissant via `GET /api/admin/observability`.

Ne jamais activer durablement `OBSERVABILITY_LOG_ALL=true` : les succes normaux
genereraient trop de logs. Les journaux ne contiennent ni corps de requete, ni
token, ni email, ni secret.

## Test de charge

Le scenario par defaut teste uniquement le healthcheck en lecture :

```text
npm run load:test
```

Variables disponibles :

```text
LOAD_TEST_URL=https://wigofly.vercel.app
LOAD_TEST_PATH=/api/health
LOAD_TEST_REQUESTS=100
LOAD_TEST_CONCURRENCY=10
LOAD_TEST_MAX_P95_MS=2000
LOAD_TEST_MAX_FAILURE_RATE=0
```

Pour une route authentifiee, fournir temporairement `LOAD_TEST_TOKEN` dans le
terminal, jamais dans un fichier suivi par Git.

Pour une campagne complete, utiliser :

```text
npm run load:authenticated
```

Ce script exige `DATABASE_URL`, cree une session de lecture valable 15 minutes,
ne journalise ni le jeton ni l'identite du membre, puis supprime la session dans
un bloc `finally`. Lancer d'abord 20 a 30 requetes avec une concurrence de 4 ou
5. Une charge plus forte en production exige une fenetre annoncee et une
surveillance simultanee de Vercel Observability et Supabase.

## Jeu de donnees de charge

Ne jamais mesurer la scalabilite uniquement avec les quelques comptes de
production. Le generateur cree un volume synthetique coherent dans une base de
staging separee :

```powershell
$env:SCALABILITY_DATABASE_URL='postgresql://...base-staging...'
$env:SCALABILITY_FIXTURE_CONFIRM='STAGING_ONLY'
npm run fixture:scalability -- --profile=medium --run-id=release-20260729
```

Le profil `medium` cree 10 000 membres, 100 000 trajets, 50 000 operations,
20 000 conversations et 500 000 messages. `small` sert aux verifications
rapides; `large` exige une base de staging dimensionnee.

Nettoyage cible du meme jeu :

```powershell
npm run fixture:scalability:cleanup -- --run-id=release-20260729
```

Le script exige `SCALABILITY_DATABASE_URL`, refuse `NODE_ENV=production` et
`VERCEL_ENV=production`, et ne supprime que les lignes portant exactement le
`fixtureRun` demande.

Verifier ensuite les plans des lectures critiques :

```powershell
$env:SCALABILITY_MAX_QUERY_MS='250'
npm run explain:scalability -- --run-id=release-20260729
```

Le rapport contient la latence PostgreSQL, les types de noeuds du plan et les
scans sequentiels suspects. La commande echoue si une requete depasse le seuil;
elle doit etre verte avant une campagne HTTP authentifiee sur le staging.

## Sauvegardes

Avant une ouverture commerciale, activer les sauvegardes automatiques ou le
PITR Supabase selon le plan retenu. Tester une restauration dans un projet
Supabase distinct au moins une fois par trimestre. Les tables prioritaires sont
`wigofly_app_state`, `audit_logs`, `messages`, `wigofly_kyc_submissions` et
`wigofly_kyc_decisions`. Ne jamais tester une restauration sur la production.

## Medias prives

Les images de messagerie et les documents KYC doivent etre stockes dans des
buckets Supabase prives. Configurer `SUPABASE_SECRET_KEY`, puis conserver les
valeurs suivantes si les noms de buckets par defaut ne conviennent pas :

```text
SUPABASE_MESSAGE_MEDIA_BUCKET=wigofly-message-media
SUPABASE_KYC_MEDIA_BUCKET=wigofly-kyc-media
SUPABASE_PROFILE_MEDIA_BUCKET=wigofly-profile-media
```

Apres le deploiement du code, migrer une seule fois les anciennes images encore
presentes en base64 :

```bash
npm run migrate:message-media
npm run migrate:kyc-media
npm run migrate:profile-media
```

Les commandes sont relancables. Verifier leur compteur `migrated`, puis controler
un ancien message et un ancien dossier KYC depuis l'administration.
