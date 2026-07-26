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

## Sauvegardes

Avant une ouverture commerciale, activer les sauvegardes automatiques ou le
PITR Supabase selon le plan retenu. Tester une restauration dans un projet
Supabase distinct au moins une fois par trimestre. Les tables prioritaires sont
`wigofly_app_state`, `audit_logs`, `messages`, `wigofly_kyc_submissions` et
`wigofly_kyc_decisions`. Ne jamais tester une restauration sur la production.
