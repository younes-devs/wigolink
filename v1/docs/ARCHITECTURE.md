# Architecture de Wigolink

Ce document decrit uniquement l'application active. L'historique des anciennes
architectures reste disponible dans Git.

## Vue d'ensemble

```text
Navigateur
  -> React/Vite
  -> /api sur le meme domaine
  -> Express dans une fonction Vercel
  -> PostgreSQL et Realtime Supabase
  -> Resend pour les emails transactionnels
  -> Stripe Checkout pour l'encaissement
```

Le frontend et l'API partagent le domaine de production. Les secrets Supabase
et Resend restent exclusivement cote serveur.

## Frontend

Point d'entree:

```text
client/src/main.jsx
client/src/app/App.jsx
```

`App.jsx` porte l'authentification, le chargement differe des pages et les routes
du produit:

```text
/trajets
/trajets/nouveau
/trajets/:id
/trajets/:id/demande
/en-cours
/operations/:id
/enregistres
/messages
/messages/:id
/profil
/membres/:id
/parametres
/verification
/admin
/cgu
/confidentialite
```

Les modules metier vivent dans `client/src/features`:

- `auth`: connexion, inscription et verification d'email;
- `trips`: recherche, publication, favoris et demandes;
- `operations`: suivi, paiement Stripe, codes de remise et litiges;
- `messaging`: boite de reception, conversation, medias et temps reel;
- `profile`: profil public, profil personnel et parametres;
- `kyc`: capture guidee et envoi du dossier;
- `admin`: moderation, KYC, historique et securite.

Les composants de navigation sont dans `client/src/app/components`, les briques
partagees dans `client/src/shared`, et les appels API dans
`client/src/core/api.js`.

Les pages coordonnent les donnees et les effets. Les composants d'un domaine
restent dans son dossier `components`; par exemple, une conversation se compose
de `ConversationChrome`, `ConversationMessages` et `ConversationComposer`.
L'administration expose un fichier facade `AdminPanels.jsx`, tandis que chaque
panneau fonctionnel vit dans son propre module.

Les styles sont charges dans un ordre explicite depuis `client/src/styles.css`:
fondations, domaines, mise en page responsive, retours d'etat, authentification
et contrastes sombres. Une feuille ne doit pas melanger ces responsabilites.

## API

Point d'entree:

```text
api/[...path].js
server/index.js
```

`server/index.js` assemble l'application. La logique nouvelle doit rester dans:

```text
server/routes
server/services
server/middleware
server/jobs
```

Le point d'entree ne contient que la configuration, les adaptateurs partages et
le cablage des routes. Les projections et regles metier transverses sont aussi
des services: `trip-projections`, `operation-projections`,
`conversation-domain`, `operation-codes`, `admin-operations` et
`admin-review`. Les routes Express traduisent HTTP vers ces services sans
dupliquer leur logique.

Les domaines actifs sont:

- comptes, sessions et verification d'email;
- profils, preferences et suppression logique;
- KYC et decisions administratives;
- trajets, favoris et recherche geographique;
- operations, codes temporaires et litiges;
- conversations, messages, medias et temps reel;
- notifications et retention;
- administration, audit et detection de fraude.

Certaines structures historiques `listings`, `matchingOffers` et
`transactions` restent lisibles cote serveur pour conserver les anciens
dossiers et l'historique administrateur. Elles ne constituent plus un parcours
frontend et ne doivent pas recevoir de nouvelles fonctionnalites.

## Parcours d'une operation

```text
attente_confirmation
  -> paiement_requis
  -> paye
  -> en_transport
  -> termine
```

Une operation peut aussi devenir `litige`. Stripe Checkout encaisse l'expediteur
sur une page hebergee par Stripe. Wigolink ne charge ni formulaire de carte ni
Stripe Connect dans son interface. Une fois la livraison confirmee, une demande
de versement manuel est ajoutee a la file d'administration; l'equipe effectue le
virement vers le compte bancaire chiffre du voyageur et enregistre sa reference.

Le champ historique `escrow` reste present dans certaines operations afin de
relire les anciens dossiers. Il sert uniquement de machine a etats interne et ne
signifie pas que Wigolink fournit un service de sequestre reglemente.

La remise repose sur deux codes temporaires:

1. le voyageur genere le code de prise en charge;
2. l'expediteur le saisit et place l'operation en transport;
3. l'expediteur genere le code de livraison;
4. le voyageur le saisit et termine l'operation.

Les preuves utiles a un litige sont les evenements audites, les messages et les
pieces jointes explicitement ajoutees au dossier.

## Donnees

`PERSISTENCE_DRIVER=postgres` est obligatoire en production. La base conserve:

- l'etat applicatif compatible avec les anciennes donnees;
- les tables relationnelles indexees pour les lectures frequentes;
- les sessions, messages, notifications et journaux d'audit;
- les dossiers et decisions KYC;
- les paiements Stripe, comptes de versement chiffres et demandes de virement;
- les medias de messagerie dans un bucket Supabase prive.

`server/data.json` est reserve au developpement local et n'est pas suivi par Git.
Les scripts SQL canoniques se trouvent dans `supabase`.

## Securite

- session opaque cote serveur;
- email verifie avant acces, sauf fournisseur OAuth verifie;
- autorisation controlee sur chaque route sensible;
- roles administrateur verifies cote API;
- limitations de debit sur l'authentification et les codes;
- journal d'audit append-only pour les actions sensibles;
- CORS limite a `APP_ORIGIN`;
- connexion PostgreSQL chiffree;
- bucket de medias prive et acces via route authentifiee.

## Tests et deploiement

Les tests Node se trouvent dans `server/test`. Les commandes de reference sont:

```text
npm run check:i18n
npm run lint
npm test
npm run build
npm run audit:production
```

Voir `DEPLOYMENT.md` pour les variables et migrations, puis `OPERATIONS.md` pour
les controles avant publication.
