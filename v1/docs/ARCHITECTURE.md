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

Première étape réalisée :

```text
client/src/features/trips/
├── components/
│   └── TripTransport.jsx
├── pages/
│   └── CreateTrip.jsx
└── index.js
```

Les chemins historiques restent compatibles :

```text
client/src/TripTransport.jsx
client/src/pages/CreateTrip.jsx
```

Ces deux fichiers réexportent désormais l'implémentation du domaine `trips`. Les
autres écrans peuvent donc migrer progressivement, sans changement massif des
imports.
