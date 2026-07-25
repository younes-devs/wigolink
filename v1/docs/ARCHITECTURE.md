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
