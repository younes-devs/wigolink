# Architecture de Wigofly

Wigofly évolue progressivement vers une organisation par domaines métier. Cette
migration ne doit modifier ni le comportement utilisateur, ni les routes, ni les
contrats API.

## Règles de migration

- Une seule responsabilité métier est déplacée par étape.
- Les anciens chemins restent disponibles avec des façades de compatibilité.
- Les dépendances sensibles (authentification, KYC, paiement et temps réel) ne
  sont déplacées qu'après cartographie et tests dédiés.
- Chaque étape doit passer le contrôle des traductions, le build de production et
  la suite de tests avant d'être intégrée.

## Bootstrap `app`

Le démarrage React, le routeur et le contexte de session sont regroupés dans :

```text
client/src/app/
├── App.jsx
├── authContext.jsx
└── index.js
```

`main.jsx` charge directement `app/App.jsx`. Le chemin historique reste une
façade de compatibilité :

```text
client/src/App.jsx
```

Les domaines hors paiement importent `useAuth` depuis `app/authContext.jsx`
afin de ne plus dépendre du module du routeur. Le domaine paiement, laissé
volontairement inchangé jusqu'au choix du prestataire, continue temporairement
à utiliser la façade historique. Les routes, redirections, délais de session,
écrans de chargement et règles d'onboarding ne sont pas modifiés.

## Socle `core`

Le code technique indépendant des domaines commence à être regroupé dans :

```text
client/src/core/
├── api.js
└── index.js
```

`core/api.js` possède l'unique état frontend du token de session et le client
HTTP commun. Le chemin historique reste une façade de compatibilité :

```text
client/src/api.js
```

Le bootstrap `App.jsx` utilise directement le nouveau chemin. Les autres
consommateurs migreront progressivement afin de limiter la taille de chaque
changement. Les URLs, en-têtes, erreurs, délais de session et contrats API ne
sont pas modifiés. Ce socle ne contient aucune intégration propre à un
prestataire de paiement.

## Socle `shared`

Les premiers composants d'interface sans responsabilité métier sont regroupés
dans :

```text
client/src/shared/
└── ui/
    ├── Skeleton.jsx
    ├── Toast.jsx
    └── index.js
```

Les chemins historiques restent disponibles comme façades de compatibilité :

```text
client/src/Skeleton.jsx
client/src/Toast.jsx
```

`App.jsx` et le domaine `requests` utilisent directement `shared/ui`. Les autres
domaines migreront par étapes et continuent entre-temps à partager le même
contexte de toast et les mêmes composants de chargement grâce aux réexports.
Cette extraction ne modifie ni les styles, ni les durées, ni les interactions
des notifications.

## Domaine `trips`

État actuel :

```text
client/src/features/trips/
├── components/
│   └── TripTransport.jsx
├── pages/
│   ├── CreateTrip.jsx
│   ├── SavedTrips.jsx
│   ├── TripDetailSimple.jsx
│   ├── TripFeedSimple.jsx
│   └── TripRequestSimple.jsx
└── index.js
```

Les chemins historiques restent compatibles :

```text
client/src/TripTransport.jsx
client/src/pages/CreateTrip.jsx
client/src/pages/SavedTrips.jsx
client/src/pages/TripDetailSimple.jsx
client/src/pages/TripFeedSimple.jsx
client/src/pages/TripRequestSimple.jsx
```

Ces fichiers réexportent désormais l'implémentation du domaine `trips`. Les
écrans qui utilisent encore les chemins historiques restent compatibles, tandis
que le routeur principal charge directement les modules du domaine.

Les écrans `Profile`, `PublicProfile`, `Dashboard`, `Operations` et l'ancien feed
restent dans leurs domaines actuels. Ils peuvent afficher des informations de
trajet sans appartenir au domaine `trips`.

## Domaine `requests`

Les demandes d'envoi et leur mise en relation avec les voyageurs sont
regroupées dans :

```text
client/src/features/requests/
├── pages/
│   ├── CreateListing.jsx
│   ├── ListingDetail.jsx
│   ├── MyShipments.jsx
│   ├── OffersCenter.jsx
│   └── SenderMatching.jsx
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/pages/CreateListing.jsx
client/src/pages/ListingDetail.jsx
client/src/pages/MyShipments.jsx
client/src/pages/OffersCenter.jsx
client/src/pages/SenderMatching.jsx
```

Ce domaine couvre la publication et la gestion d'une demande d'envoi, le
matching avec les voyageurs et les propositions associées. `TripRequestSimple`
reste dans `trips`, car il appartient au parcours d'acceptation d'un trajet.
L'ancien `Feed.jsx`, qui mélange annonces, trajets et offres, reste temporairement
à son emplacement historique. Aucun endpoint de listing, matching ou shipment,
aucun contrat API et aucune règle de paiement ne sont modifiés.

## Domaine `messaging`

La messagerie frontend est regroupée sans modifier ses contrats API ni son
comportement temps réel :

```text
client/src/features/messaging/
├── pages/
│   ├── ConversationDetail.jsx
│   └── MessagesSimple.jsx
├── services/
│   └── realtime.js
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/pages/ConversationDetail.jsx
client/src/pages/MessagesSimple.jsx
client/src/realtime.js
```

Le routeur principal charge directement les pages du domaine. Les endpoints,
le cache d'inbox, le polling de secours et le canal Supabase Realtime conservent
leur comportement existant.

## Domaine `operations`

Le suivi frontend des opérations est regroupé dans :

```text
client/src/features/operations/
├── pages/
│   ├── OperationDetailSimple.jsx
│   └── OperationsSimple.jsx
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/pages/OperationDetailSimple.jsx
client/src/pages/OperationsSimple.jsx
```

Ce domaine couvre la liste active, l'historique, le détail et les actions de
suivi d'une opération. Les écrans Finance, Documents, Support, Transactions et
Paiements restent séparés : ils n'appartiennent pas à cette migration ciblée.
Les endpoints, statuts, règles escrow, codes de remise et règles de litige ne
sont pas modifiés.

## Domaine `profile`

Le profil personnel, les profils publics et les paramètres du compte sont
regroupés dans :

```text
client/src/features/profile/
├── pages/
│   ├── Profile.jsx
│   ├── PublicProfile.jsx
│   └── Settings.jsx
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/pages/Profile.jsx
client/src/pages/PublicProfile.jsx
client/src/pages/Settings.jsx
```

Ce domaine orchestre l'affichage et les préférences du compte. L'authentification,
le KYC, la vérification email et les règles serveur de changement d'identité ou
de suppression restent dans leurs modules actuels. Le déplacement ne modifie
aucun endpoint ni aucune confirmation de sécurité.

## Domaine `auth`

L'interface d'authentification et son composant visuel sont regroupés dans :

```text
client/src/features/auth/
├── components/
│   └── AuthJourneyLoop.jsx
├── pages/
│   └── Login.jsx
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/AuthJourneyLoop.jsx
client/src/pages/Login.jsx
```

La page conserve les modes connexion, inscription, vérification email, mot de
passe oublié et réinitialisation. Le contexte de session dans `App.jsx`, le
stockage du token dans `api.js`, l'onboarding et tous les contrôles serveur
restent à leur emplacement actuel. Aucun endpoint, délai de session ou mécanisme
de vérification n'est modifié.

## Domaine `kyc`

La page de vérification et le moteur d'assistance faciale sont regroupés dans :

```text
client/src/features/kyc/
├── pages/
│   └── Kyc.jsx
├── services/
│   └── faceGuidance.js
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/kycFaceGuidance.js
client/src/pages/Kyc.jsx
```

Le chargement du modèle MediaPipe reste différé et préparé à l'entrée du
parcours. `PhotoCapture` et `requestCameraStream` restent temporairement dans
`components.jsx` afin de limiter cette étape. Les statuts, documents, tentatives,
décisions admin et endpoints KYC serveur ne sont pas modifiés.

## Domaine `payments`

Les interfaces financières existantes sont regroupées dans :

```text
client/src/features/payments/
├── pages/
│   ├── FinanceCenter.jsx
│   ├── TransactionDetail.jsx
│   └── Transactions.jsx
└── index.js
```

Les anciens chemins restent disponibles comme façades de compatibilité :

```text
client/src/pages/FinanceCenter.jsx
client/src/pages/TransactionDetail.jsx
client/src/pages/Transactions.jsx
```

Ce domaine reste volontairement neutre vis-à-vis du prestataire de paiement.
Il affiche et orchestre uniquement les transactions et états escrow déjà
exposés par l'API. Aucun SDK, webhook, secret, variable d'environnement ou
contrat propre à Stripe, Mangopay ou un autre fournisseur ne doit être ajouté
avant une décision produit explicite. La présente migration ne modifie aucun
appel API ni aucune règle financière.

## Domaine `admin`

L'interface du back-office est regroupée dans :

```text
client/src/features/admin/
├── pages/
│   └── Admin.jsx
└── index.js
```

L'ancien chemin reste disponible comme façade de compatibilité :

```text
client/src/pages/Admin.jsx
```

Les traductions du back-office restent dans `client/src/locales/admin.*.js`.
La route frontend `/admin` ne constitue pas une autorisation : tous les
endpoints `/api/admin/*` restent protégés côté serveur par `auth` puis
`adminOnly`. Cette migration ne modifie ni les rôles, ni les décisions KYC, ni
les preuves, ni les journaux d'audit.

## Backend `middleware`

La modularisation backend commence par les contrôles d'accès autonomes :

```text
server/
└── middleware/
    ├── admin-only.js
    ├── database-availability.js
    ├── language.js
    ├── persistence-state.js
    ├── session-auth.js
    └── security-headers.js
```

`adminOnly` est importé par `server/index.js` et reste placé après `auth` sur
chacune des 17 routes `/api/admin/*`. Il refuse les membres avec le même statut
`403` et le même message qu'avant. Des tests unitaires dédiés complètent les
tests d'intégration existants sur les rôles et les endpoints administrateur.
Cette étape ne déplace aucune route et ne modifie aucun accès à la base de
données.

`language.js` contient le middleware de détection `fr/ar/nl`, les tables de
traduction des réponses API et `translateError`. Le serveur l'importe
directement, tandis que le chemin historique suivant reste compatible :

```text
server/errors.js
```

La sélection depuis `Accept-Language`, le repli français, les messages inconnus
et la traduction de `body.error` et `body.message` conservent leur comportement
existant.

`security-headers.js` construit le middleware des en-têtes HTTP communs. Le
générateur de `X-Request-Id` et les origines Supabase autorisées par la CSP sont
injectés depuis `server/index.js`. Les politiques `nosniff`, anti-framing,
référent, permissions navigateur et `Content-Security-Policy` restent
strictement identiques et disposent maintenant de tests unitaires dédiés.

`database-availability.js` construit le garde global qui empêche le serveur de
retomber sur les données JSON en production lorsque Supabase est indisponible.
La fonction de santé est injectée depuis `server/index.js`, `/api/health` reste
accessible et toutes les autres routes conservent exactement la même réponse
`503`. En développement, ce middleware ne consulte pas la santé de la base.
Cette extraction ne déplace aucun accès aux données et ne change ni le stockage,
ni les migrations, ni les contrats API.

`persistence-state.js` orchestre le rafraîchissement du document global et la
file des écritures Supabase. Les lectures relationnelles de trajets et de
messagerie continuent à contourner ce document, les autres lectures utilisent
le même cache court et les écritures restent strictement sérialisées. Une
réponse d'écriture n'est livrée qu'après synchronisation relationnelle et
validation du verrou Postgres. Les dépendances de stockage sont injectées par
`server/index.js`; le middleware ne crée ni connexion ni dépôt de données.
Les chemins rapides, les réponses `503`, la libération sur fermeture de la
requête et l'ordre de deux écritures concurrentes sont couverts par des tests
unitaires dédiés.

`session-auth.js` centralise la lecture des sessions persistantes, leur
expiration et les gardes HTTP et temps réel. Le stockage des sessions, la
recherche du membre, la règle d'accès après vérification email et la sauvegarde
locale restent injectés par `server/index.js`. Les réponses historiques restent
distinctes lorsque nécessaire : l'authentification HTTP transforme une panne de
session en `503`, tandis que le garde temps réel conserve son token de secours
dans la query et ses messages courts. Les comptes suspendus, inconnus ou non
vérifiés gardent les mêmes statuts et la session d'un compte non vérifié est
toujours invalidée. Les routes d'inscription, de connexion, de réinitialisation
et toute intégration OAuth restent en dehors de ce middleware.

## Backend `routes`

L'extraction progressive des déclarations Express commence par les endpoints
publics sans logique métier :

```text
server/
└── routes/
    ├── account-settings.js
    ├── notifications.js
    ├── rules.js
    ├── system.js
    └── training.js
```

`createSystemRouter` expose `/config` et `/health` sous le préfixe `/api`. Le
mode démo, le mode production, la disponibilité email et la fonction de santé
de la base sont injectés par `server/index.js`. Les URLs, statuts, corps JSON et
conditions de disponibilité restent identiques. Le healthcheck ne révèle
toujours aucun secret ni détail d'implémentation de la base. Des tests HTTP
dédiés couvrent le développement local, la production prête, l'email manquant
et la base indisponible.

`createNotificationsRouter` expose la boîte de notifications et le marquage
global comme lu sous `/api/notifications`. L'authentification, le dépôt de
notifications, le calcul des rappels, le rendu i18n et la sauvegarde sont
injectés depuis `server/index.js`. La lecture conserve la limite de 30 éléments,
déclenche toujours les rappels persistants avant la requête, traduit chaque
notification selon `req.lang` puis calcule le compteur non lu. L'écriture
conserve l'ordre marquage puis sauvegarde. Des tests HTTP vérifient également
qu'aucun accès au dépôt n'a lieu lorsque l'authentification refuse la requête.

`createAccountSettingsRouter` regroupe la lecture et la mise à jour des
préférences ainsi que la fin de l'onboarding. Le dépôt `settings`, l'audit, la
projection publique du membre et la sauvegarde sont injectés. La préférence de
sécurité reste forcée à actif par le dépôt existant. La mise à jour conserve
l'instantané précédent, les quatre champs audités et l'ordre mise à jour, audit,
sauvegarde. L'onboarding conserve l'ordre mutation, sauvegarde puis réponse avec
le profil public et les paramètres normalisés. Les URLs `/api/settings` et
`/api/onboarding/complete` ne changent pas.

`createRulesRouter` expose le référentiel public `/api/rules`. La whitelist
dynamique reste calculée par le dépôt à chaque requête, tandis que la blacklist,
les règles douanières et les fonctions de localisation sont injectées. Les
catégories autorisées ou interdites et les corridors sont rendus selon
`req.lang`; les tables `i18n` internes ne sortent jamais de l'API et les
catégories promues sans traduction conservent leur libellé français.

`createTrainingRouter` expose `/api/training/complete`. Il conserve
l'authentification, la mutation `trainingDone`, la sauvegarde et les réponses
existantes. La comparaison des réponses a été déplacée dans un validateur pur
afin que la route n'embarque plus la grille métier.

## Backend `validators`

La première validation indépendante d'Express est organisée dans :

```text
server/
└── validators/
    └── training.js
```

`invalidTrainingAnswers` possède la grille historique `q1=b`, `q2=c`, `q3=a`
et retourne les identifiants incorrects dans le même ordre. Il ne lit ni la
requête, ni le membre, ni la base. Les réponses complètes, partielles et vides
sont couvertes directement, tandis que les tests HTTP vérifient qu'une tentative
incorrecte ne modifie ni ne sauvegarde le compte.

## Backend `jobs`

La première orchestration réutilisée par plusieurs routes est regroupée dans :

```text
server/
└── jobs/
    └── matching-offer-reminders.js
```

`createMatchingOfferReminderJob` normalise les offres et produit les rappels
avant ou après expiration. L'état, les fonctions de normalisation, la résolution
du membre qui doit répondre, la notification, la sauvegarde, la fenêtre de six
heures et l'horloge sont injectés. Le job reste idempotent grâce aux marqueurs
`expiresSoonAt` et `expiredAt`, attend toutes les notifications avant de
sauvegarder et ne persiste que si un changement existe avec `persist=true`.
Les appels depuis les notifications, le matching, les offres et le tableau de
bord continuent à utiliser la même fonction créée dans `server/index.js`.

## Backend `services`

La première logique transverse indépendante d'Express est regroupée dans :

```text
server/
└── services/
    ├── audit.js
    └── notifications.js
```

`createAuditService` fournit l'écriture brute `audit` et le journal différentiel
`auditChange` à partir du dépôt `auditLogs`. Le calcul des changements reste
limité aux champs explicitement autorisés : les chaînes sont tronquées à 1000
caractères, les valeurs vides deviennent `null` et les objets ou contenus
binaires ne sont jamais copiés dans le journal. Un événement sans changement
n'est écrit que lorsque `meta.recordEmpty` le demande. Les métadonnées
`subjectUserId` et `changes` sont toujours recalculées par le service. Les appels
existants des domaines profil, trajets, opérations, messagerie, sécurité et
administration utilisent les mêmes fonctions assemblées dans `server/index.js`.

`createNotificationService` centralise la création des notifications utilisée
par les domaines métier et les jobs. Il dédoublonne les destinataires, applique
leurs préférences, interdit la désactivation effective des alertes `security` et
replie un type inconnu sur `transactions`. Une notification à clé conserve sa
clé et ses paramètres, avec un texte français servant uniquement de repli; la
traduction finale reste effectuée à la lecture. Les chaînes historiques restent
stockées telles quelles. Le dépôt, la recherche utilisateur, la normalisation
des préférences et le moteur de rendu sont injectés depuis `server/index.js`.

## Backend `config`

La configuration générale calculée au démarrage commence à être regroupée dans :

```text
server/
└── config/
    ├── cors-options.js
    └── runtime.js
```

`loadRuntimeConfig` normalise le mode production, la liste `APP_ORIGIN`, l'URL
Supabase et son origine realtime. Il conserve également les refus de démarrage
de `DEMO` et `TEST_EMAIL_BYPASS` en production. Les secrets des codes
d'opération et toute configuration liée au paiement restent volontairement
hors de ce module jusqu'à la décision sur le prestataire.

`createCorsOptions` reçoit `isProduction` et `appOrigins` depuis la configuration
runtime. En développement, les origines restent ouvertes. En production, seules
les origines configurées sont acceptées, tandis que les appels serveur sans
en-tête `Origin` restent autorisés. Les méthodes et en-têtes du préflight sont
inchangés et couverts par des tests dédiés.
