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
├── components/
│   ├── AppNavigation.jsx
│   ├── Onboarding.jsx
│   ├── SideRail.jsx
│   └── index.js
├── App.jsx
├── authContext.jsx
└── index.js
```

`main.jsx` charge directement `app/App.jsx`. Le chemin historique reste une
façade de compatibilité :

```text
client/src/App.jsx
```

`AppNavigation` contient le header et la navigation mobile, `SideRail` le
panneau contextuel desktop et `Onboarding` le premier parcours du membre.
`app/App.jsx` importe ces composants depuis le barrel local. Les anciens chemins
restent compatibles :

```text
client/src/components.jsx  # reexporte Header et BottomNav
client/src/Onboarding.jsx
client/src/SideRail.jsx
```

Les domaines hors paiement importent `useAuth` depuis `app/authContext.jsx`
afin de ne plus dépendre du module du routeur. Le domaine paiement, laissé
volontairement inchangé jusqu'au choix du prestataire, continue temporairement
à utiliser la façade historique. Les routes, redirections, délais de session,
écrans de chargement, fréquence des badges de navigation et règles d'onboarding
ne sont pas modifiés.

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

## Domaine `guidance`

Les centres d'accompagnement visibles par le membre sont regroupés dans :

```text
client/src/features/guidance/
├── pages/
│   ├── ComplianceCenter.jsx
│   ├── DocumentsCenter.jsx
│   ├── SupportCenter.jsx
│   └── TrustCenter.jsx
└── index.js
```

Le routeur principal charge directement ces pages. Les chemins historiques
restent des façades de compatibilité :

```text
client/src/pages/ComplianceCenter.jsx
client/src/pages/DocumentsCenter.jsx
client/src/pages/SupportCenter.jsx
client/src/pages/TrustCenter.jsx
```

Ce domaine correspond aux lectures backend `guidance-centers` et
`member-overview`. Il assemble conformité, documents, assistance et confiance
sans déplacer les décisions de litige ni les mutations financières. Les URLs,
appels API, états de chargement, exports et textes traduits sont inchangés.

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
    ├── account.js
    ├── account-privacy.js
    ├── account-settings.js
    ├── auth-access.js
    ├── auth-registration.js
    ├── kyc.js
    ├── notifications.js
    ├── profile.js
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

`createAccountRouter` expose l'identité privée courante sous `/api/me`.
L'authentification, la projection publique et la vue KYC sont injectées depuis
`server/index.js`. La route reste une lecture pure et renvoie le même contrat :
profil public, email, fournisseur de connexion, téléphone, limites du compte,
formation et état KYC. Les projections ne sont jamais appelées lorsque
l'authentification refuse la requête.

`createAccountPrivacyRouter` expose la demande de suppression, l'export et la
confirmation de suppression sous `/api/profile`. Il applique uniquement
l'authentification et le contrat HTTP; les règles de confidentialité sont
déléguées à `createAccountPrivacyService`. L'export conserve son en-tête de
téléchargement historique.

`createAuthRegistrationRouter` regroupe inscription, vérification email, renvoi
du code et l'indisponibilité explicite de Google sous `/api/auth`. L'envoi du
code précède toujours la création effective du compte; un échec email ne laisse
ni membre ni vérification partielle. La préférence de session longue traverse
l'inscription et les renvois jusqu'à l'ouverture de session. Les dépôts
`users` et `authVerifications` encapsulent désormais l'ajout/recherche du compte
et les codes temporaires; les durées et réponses HTTP restent inchangées.

`createAuthAccessRouter` complète `/api/auth` avec connexion, suspension,
mot de passe oublié, réinitialisation et déconnexion. La récupération conserve
une réponse non énumérable pour les emails inconnus. Un reset valide consomme
son code, invalide toutes les sessions puis reconnecte uniquement un compte
déjà vérifié. Le dépôt `authResets` encapsule les codes temporaires et la session
de recours d'un compte suspendu conserve sa durée historique de 24 heures.

`createKycRouter` orchestre la soumission manuelle sous `/api/kyc/submit`.
Il conserve l'ordre des garde-fous : statut du compte, validité des champs et
photos, limite de rejets, ajout au dépôt, passage à `pending`, sauvegarde puis
projection de la vue KYC. L'authentification, le dépôt KYC, la validation des
images, la limite de tentatives et la projection sont injectés. Une requête
refusée ne consulte ni ne modifie le dépôt.

`createProfileRouter` regroupe les mutations des informations publiques, de la
photo, du mot de passe et de l'email sous `/api/profile`. Les données autorisées
sont normalisées avant mutation; les propriétés sensibles ou inconnues sont
ignorées. Chaque modification conserve le même journal d'audit. Le mot de passe
courant est vérifié avant le nouveau, puis toutes les sessions sont invalidées
avant l'audit et la sauvegarde. Le changement d'email délègue sa demande et sa
confirmation à `createAccountEmailService`. Une validation ou une
authentification refusée ne produit aucun effet.

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
    ├── kyc.js
    ├── profile.js
    └── training.js
```

`validateKycSubmission` contrôle le nom légal, le type de document, la majorité
et les photos requises, puis normalise uniquement la charge utile persistable.
`computeAge` reçoit une horloge injectable afin de tester précisément la date
anniversaire. Le routeur conserve les textes, statuts HTTP et l'ordre historique
des erreurs.

`validateProfileUpdate` limite les mutations à `name`, `city` et `phone`, avec
les mêmes nettoyages et longueurs. `validateProfilePhoto` accepte la suppression
ou les Data URL JPEG, PNG et WebP sous la limite historique. Les erreurs visibles
et la limite effective restent inchangées. `validatePasswordChange` conserve la
priorité de la vérification du mot de passe courant sur la règle des huit
caractères.

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
    ├── account-email.js
    ├── account-privacy.js
    ├── audit.js
    └── notifications.js
```

`createAccountEmailService` orchestre le changement d'adresse sans dépendre
d'Express. Il conserve l'ordre des contrôles, la limitation anti-abus, l'envoi
du code avant sa persistance et la durée de quinze minutes. À la confirmation,
l'unicité est revérifiée, toutes les sessions sont invalidées et le changement
est audité avant sauvegarde. Le dépôt `accountConfirmations` encapsule désormais
les opérations `get`, `set` et `remove` utilisées aussi par la suppression de
compte; `server/index.js` n'accède plus directement à cette collection.

`createAccountPrivacyService` orchestre l'envoi du code de suppression, l'export
scopé et l'anonymisation. L'export exclut toujours le hash et les images KYC. La
suppression reste bloquée par une opération active; après confirmation elle
conserve l'ordre anonymisation, retrait du code, purge sensible KYC,
invalidation des sessions, audit puis sauvegarde. La reconnaissance des statuts
fermés est injectée depuis la règle d'opération existante, sans dupliquer la
logique ni modifier le paiement.

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

## Backend `trips`

La gestion non financière des trajets et des favoris est séparée dans :

```text
server/
|-- routes/
|   `-- trips.js
`-- services/
    `-- trips.js
```

`createTripService` centralise la création, la modification, le retrait logique,
la liste publique, la vue propriétaire, le détail, les trajets enregistrés et
la mission du voyageur. Il conserve les contrôles KYC, date, villes distinctes,
capacité, prix et moyen de transport. Une modification ou un retrait reste
interdit pendant une opération active. Les mutations gardent l'ordre historique
entre audit et sauvegarde, et le retrait nettoie aussi les références
enregistrées.

La mission rapproche uniquement les annonces publiées de tiers avec les trajets
futurs du membre. Elle agrège poids, capacité restante, rémunération potentielle
et valeur douanière, puis localise le corridor et les catégories dans la langue
de la requête. La date courante est injectée dans le service afin que la règle
d'expiration reste identique et testable.

`createTripsRouter` expose les contrats HTTP existants sans règle métier. La
route `/api/trips/mission` est désormais servie avant le paramètre dynamique
`/api/trips/:id`. La route `/api/trips/:id/accept` reste volontairement dans
`server/index.js` : elle déclenche le parcours financier et ne sera déplacée
qu'après le choix du prestataire de paiement et la validation de ses contraintes
de séquestre.

## Backend `listings`

La publication et la gestion non financière des demandes d'envoi sont séparées
dans :

```text
server/
|-- routes/
|   `-- listings.js
`-- services/
    `-- listings.js
```

`createListingService` centralise le feed filtré par les trajets du voyageur,
la recherche, les annonces du membre, le précontrôle, la publication, la
modification et le retrait. Les contrôles KYC, photos, catégorie, douane,
plafond, poids et rémunération restent identiques. Une catégorie grise rejoint
toujours la file de revue, et chaque création, modification ou retrait conserve
son audit avant sauvegarde. Une modification invalide est désormais atomique :
aucun autre champ du formulaire n'est appliqué partiellement.

`createListingsRouter` conserve les URLs, les statuts et l'enveloppe
`{ preflight }` utilisés par le frontend. Les routes
`/api/listings/:id/accept` et `/api/matching-offers/:id/accept` restent dans
`server/index.js`, car elles créent une transaction et un séquestre. Le service
extrait ne choisit ni n'implémente aucun prestataire de paiement.

## Backend `matching offers`

Les propositions entre expéditeurs et voyageurs sont regroupées dans :

```text
server/
|-- routes/
|   `-- matching-offers.js
`-- services/
    `-- matching-offers.js
```

`createMatchingOfferService` est la source unique de normalisation des anciennes
propositions, des expirations et de leur historique. Il calcule le centre de
matching, enrichit les offres avec leurs membres, trajets et annonces, puis
orchestre création idempotente, refus, retrait et contre-proposition. Les droits
des participants, la durée maximale, les notifications et l'ordre
mutation-notification-sauvegarde restent couverts par des tests. Le job de rappel
réutilise cette même normalisation afin d'éviter deux implémentations divergentes.

`createMatchingOffersRouter` expose les lectures et décisions non financières
sous les URLs existantes. `/api/matching-offers/:id/accept` reste volontairement
dans `server/index.js` : cette action transforme l'offre en transaction et crée
actuellement le séquestre. Elle continue toutefois d'utiliser la normalisation
du service, sans choix supplémentaire de prestataire.

## Backend `operation reads`

Les lectures utilisateur des opérations et transactions sont regroupées dans :

```text
server/
|-- routes/
|   `-- operation-reads.js
`-- services/
    `-- operation-reads.js
```

`createOperationReadService` sert les listes actives et historiques, les détails
scopés aux parties ou à l'administration, ainsi que le centre de pilotage des
envois. Il réutilise les projections historiques `operationView` et `txView` :
les codes bruts, hashes et compteurs de tentative restent donc absents des
réponses. Le centre conserve la transaction la plus récente, les priorités
d'action, les indicateurs douaniers et les totaux existants.

`createOperationReadsRouter` conserve les cinq contrats HTTP
`/operations`, `/operations/:id`, `/transactions`, `/transactions/:id` et
`/shipments/command-center`. Ce module est strictement en lecture. Les actions
de paiement, séquestre, remboursement, libération, litige et livraison restent
dans `server/index.js` jusqu'à l'extraction séparée de leur machine à états et
au choix du prestataire financier.

## Backend `admin records`

Les lectures sensibles du back-office sont regroupées dans :

```text
server/
|-- routes/
|   `-- admin-records.js
`-- services/
    `-- admin-records.js
```

`createAdminRecordService` sert la liste des membres, le dossier historique
d'un membre, les journaux d'audit, les files KYC et le centre de sécurité. Les
comptes supprimés restent visibles dans le dossier administrateur. Les messages
conservent explicitement leur expéditeur, leurs destinataires, leur date de
suppression, leurs métadonnées de pièce jointe et de localisation. Les décisions
KYC, documents encore disponibles et événements d'audit restent associés au
membre selon la configuration de conservation existante. Les hashes de mot de
passe et secrets de session ne sont jamais projetés.

`createAdminRecordsRouter` applique systématiquement `auth`, puis `adminOnly`,
avant d'appeler le service. Les routes extraites sont strictement en lecture.
Les arbitrages et écrans contenant des agrégats financiers restent dans
`server/index.js`.

## Backend `admin actions`

Les mutations administratives non financières sont regroupées dans :

```text
server/
|-- routes/
|   `-- admin-actions.js
`-- services/
    `-- admin-actions.js
```

`createAdminActionService` orchestre la journalisation d'accès aux dossiers,
les changements de rôle, avertissements et suspensions, les recours, le retrait
d'une catégorie personnalisée et les décisions KYC. Il protège
l'auto-destitution, le dernier administrateur actif, les sanctions contre un
administrateur, les recours en double et la limite de rejets KYC. Chaque
réussite conserve audit, notification éventuelle et sauvegarde.

`createAdminActionsRouter` applique `auth` puis `adminOnly` aux actions
administrateur. Seul `POST /safety/appeals` utilise directement la session
existante afin qu'un membre suspendu puisse encore exercer son recours. Les
arbitrages de litige, remboursements et KPI financiers restent hors de ce
domaine.

## Backend `admin fraud`

Les signaux de risque du back-office sont regroupés dans :

```text
server/
|-- routes/
|   `-- admin-fraud.js
`-- services/
    `-- admin-fraud.js
```

`createAdminFraudService` calcule le résumé du centre opérations et le détail
des comptes liés, paires récurrentes, messages signalés, annulations anormales,
litiges répétés et rejets KYC. Les participants d'un litige sont dédupliqués :
un expéditeur qui est aussi destinataire ne produit plus deux occurrences pour
le même dossier. Les données de membre sont projetées explicitement sans hash,
session ni document KYC.

`createAdminFraudRouter` protège `GET /admin/fraud` avec `auth`, puis
`adminOnly`, avant toute lecture. Le montant cumulé historique des paires reste
un indicateur en lecture seule. Ce domaine ne crée, ne libère, ne rembourse et
n'arbitre aucun séquestre.

## Backend `public profiles`

Les profils publics authentifiés et les avis sont regroupés dans :

```text
server/
|-- routes/
|   `-- public-profiles.js
`-- services/
    `-- public-profiles.js
```

`createPublicProfileService` assemble la projection publique d'un membre, ses
quatre prochains trajets publiés et les avis reçus. La notation reste possible
uniquement après une livraison terminée, entre deux participants distincts de
la transaction. Un tiers connaissant l'identifiant de la transaction ne peut
plus déposer une note, et un membre ne peut plus se noter lui-même. Les notes
dupliquées, valeurs hors limites et coordonnées de contact dans les commentaires
restent refusées avant toute mutation.

`createPublicProfilesRouter` conserve les contrats
`POST /transactions/:id/rate`, `GET /users/:id/reviews` et
`GET /users/:id`. Les trois routes restent protégées par `auth`. Ce domaine ne
lit ni ne modifie le séquestre et ne dépend d'aucun prestataire financier.

## Backend `member overview`

Les agrégats transversaux visibles par un membre sont regroupés dans :

```text
server/
|-- routes/
|   `-- member-overview.js
`-- services/
    `-- member-overview.js
```

`createMemberOverviewService` calcule le résumé de navigation, le centre de
confiance et le dashboard. Il centralise les opérations qui demandent une
action, les messages non lus, le score de confiance, les limites, incidents,
prochains trajets, correspondances, offres et notifications localisées. Le
dashboard continue d'exécuter le job idempotent de rappel avant de lire les
offres, puis borne chaque collection comme auparavant.

`createMemberOverviewRouter` conserve les contrats
`GET /navigation-summary`, `GET /trust-center` et `GET /dashboard`, tous
protégés par `auth`. Les indicateurs de séquestre affichés dans les protections
restent purement informatifs : ce module ne crée, ne libère et ne rembourse
aucun paiement.

## Backend `guidance centers`

Les centres Documents, Conformité et Assistance sont regroupés dans :

```text
server/
|-- routes/
|   `-- guidance-centers.js
`-- services/
    `-- guidance-centers.js
```

`createGuidanceCenterService` assemble uniquement les dossiers du membre
authentifié. Documents indexe douane, scellage, état de séquestre, litige et
historique KYC. Conformité localise corridors et catégories, puis priorise les
revues et dépassements de franchise. Assistance projette les litiges et choisit
l'action suivante selon le rôle et l'état de la transaction.

`createGuidanceCentersRouter` conserve les contrats
`GET /documents-center`, `GET /compliance-center` et `GET /support-center`.
Chaque route applique `auth` avant le service. Les états financiers présents
dans Documents sont en lecture seule : les mutations de séquestre, les preuves
de litige et les décisions administrateur restent hors de ce module.

## Backend `conversation inbox`

La gestion non financiere de la boite de messagerie est separee dans :

```text
server/
|-- routes/
|   `-- conversation-inbox.js
`-- services/
    `-- conversation-inbox.js
```

`createConversationInboxService` centralise la liste filtree, la recherche, les
lectures, les compteurs non lus, la saisie, l'archivage, l'epinglage et le
blocage. Les mutations conservent l'ordre historique entre modification,
sauvegarde, diffusion realtime et audit. La suppression d'une conversation
reste limitee a la boite du membre : les messages ne sont pas effaces et
l'audit conserve les participants, le nombre de messages et le drapeau
`retainedForAdmin`.

`createConversationInboxRouter` expose ces operations sous les URLs existantes
et ne contient que l'authentification et la traduction des resultats en contrats
HTTP.

## Backend `conversation messages`

La creation et le contenu des conversations sont regroupes dans :

```text
server/
|-- routes/
|   `-- conversation-messages.js
`-- services/
    `-- conversation-messages.js
```

`createConversationMessageService` orchestre l'ouverture directe ou liee a un
trajet/une operation, le signalement, l'envoi et la suppression d'un message.
Il conserve la verification des participants, le blocage mutuel, la validation
des images et localisations, l'idempotence par `clientId`, la detection des
coordonnees fractionnees sur dix minutes et le cooldown apres tentatives
repetees. Une tentative interdite reste auditee et peut alimenter la file de
moderation. Un message valide conserve l'ordre notification, sauvegarde puis
diffusion realtime.

`createConversationMessageRouter` ne connait aucune regle metier : il transmet
le membre et la charge utile au service, puis conserve exactement le statut et
le corps HTTP calcules. Les routes ne modifient aucun contrat de transaction et
n'introduisent aucune decision sur le prestataire de paiement.

## Backend `transaction communications`

La messagerie historique rattachee directement aux transactions et le
recapitulatif douanier sont regroupes dans :

```text
server/
|-- routes/
|   `-- transaction-communications.js
`-- services/
    `-- transaction-communications.js
```

`createTransactionCommunicationService` verifie l'appartenance a la transaction
avant toute lecture ou ecriture. Un administrateur peut consulter les preuves,
mais ne peut pas intervenir dans la conversation s'il n'est pas lui-meme une
partie. La detection des coordonnees, le cooldown, l'audit, les notifications
et la limite de 2 000 caracteres conservent leur ordre historique.

Le recapitulatif douanier localise le corridor et la categorie sans exposer de
donnees privees. Une operation creee depuis un trajet et depourvue d'annonce
renvoie maintenant un statut 404 explicite au lieu de provoquer une erreur 500.
Ce module ne lit ni ne modifie l'escrow et ne prend aucune decision de paiement.

`createTransactionCommunicationsRouter` conserve les trois URLs existantes et
se limite a l'authentification, au transfert des parametres et a la restitution
du statut HTTP calcule par le service.

## Backend `relational reads`

Les lectures indexees a fort trafic sont assemblees dans :

```text
server/
|-- middleware/
|   `-- relational-read-auth.js
`-- routes/
    `-- relational-reads.js
```

`createRelationalReadAuth` authentifie le bearer avec la session persistante et
la table relationnelle des membres. Il conserve les refus historiques pour une
base absente, une session expiree et un email non verifie. Lorsque les lectures
relationnelles ne sont pas activees, il passe a la route historique avec
`next('route')` sans ouvrir de connexion SQL.

`createRelationalReadsRouter` sert les trois lectures de trajets et les trois
lectures de conversations/messages depuis les tables indexees. Les filtres,
pagination, projection de l'apercu, statuts 404/503 et textes publics restent
identiques. Chaque endpoint verifie encore son drapeau de migration et conserve
le fallback vers le document historique. Les ecritures restent volontairement
sur le chemin atomique existant pendant cette phase.

## Backend `realtime`

Le temps reel backend est maintenant separe entre :

```text
server/
|-- routes/
|   `-- realtime.js
`-- services/
    `-- realtime.js
```

`createRealtimeRouter` conserve les contrats `/api/realtime` et
`/api/realtime/session`. L'ancien flux SSE reste explicitement indisponible avec
le statut 410. La session Supabase n'est fournie qu'apres authentification et ne
contient que l'URL, la cle publiable et le canal propre au membre. La cle
serveur ne traverse jamais la reponse HTTP. Sans configuration complete, le
client recoit toujours `{ enabled: false }`.

`createRealtimeService` encapsule la configuration Supabase, la creation stable
du canal utilisateur et la diffusion des evenements de conversation. La
publication serveur utilise seule la cle secrete et encode le nom du canal. Une
panne reseau est absorbee afin qu'une indisponibilite Realtime ne bloque jamais
la persistance d'un message. Les registres locaux de presence restent derriere
la meme interface pour conserver les champs `otherOnline` et
`otherLastSeenAt`.

## Exploitation et performance

Les routes d'observabilite et de maintenance sont separees dans :

```text
server/
|-- observability.js
`-- routes/
    |-- maintenance.js
    `-- observability.js
```

L'observabilite produit des journaux JSON avec identifiant de requete et
conserve des metriques glissantes de latence et d'erreur. Leur lecture est
reservee aux administrateurs. La maintenance des images de messagerie remplace
les anciennes pieces jointes inline par le stockage objet configure, sans
supprimer l'historique du message.

Les lectures relationnelles peuvent etre verifiees avec
`npm run migrate:relational:verify`. Le test de charge HTTP est disponible avec
`npm run load:test` et le controle des dependances de production avec
`npm run audit:production`. Les procedures de deploiement et d'incident sont
detaillees dans `docs/OPERATIONS.md`.

Le CSS source est decoupe par surface dans `client/src/styles/`, puis importe
dans son ordre historique par `client/src/styles.css`. Les dictionnaires arabe,
neerlandais et administrateur sont charges dynamiquement afin d'alleger le
premier affichage sans modifier les cles de traduction.

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
