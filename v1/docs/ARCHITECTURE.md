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
