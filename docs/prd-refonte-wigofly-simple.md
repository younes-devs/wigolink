# PRD - Refonte Wigofly simple

Date: 2026-07-15
Statut: nouvelle direction produit, a valider avant implementation
Responsable execution: Codex uniquement

## 1. Vision

Wigofly devient une application simple centree sur les voyageurs.

Au lieu d'un systeme large avec beaucoup de centres, matching avance, offres,
documents, finance et tableaux de bord disperses, l'app doit ressembler a un
produit mobile clair:

- voir les trajets publies par des voyageurs;
- enregistrer les trajets interessants;
- discuter avec un voyageur;
- accepter une proposition de trajet;
- suivre les operations en cours;
- gerer son profil.

Le produit doit etre compréhensible en moins de 10 secondes.

## 2. Nouveau menu principal

Le menu principal contient uniquement:

1. Trajet
2. En cours
3. Enregistres
4. Messagerie
5. Profil

Tout le reste doit etre soit retire de la navigation principale, soit deplace dans
Profil/Parametres/Admin, soit supprime de l'experience utilisateur V1.

### Routes cibles

| Menu | Route | Role |
|------|-------|------|
| Trajet | `/trajets` | Feed public/authentifie des voyages publies par les voyageurs |
| En cours | `/en-cours` | Operations actives apres acceptation/paiement |
| Enregistres | `/enregistres` | Wishlist de trajets sauvegardes |
| Messagerie | `/messages` | Liste de conversations type WhatsApp |
| Profil | `/profil` | Profil existant conserve et simplifie si besoin |

Routes detail:

| Route | Role |
|-------|------|
| `/trajets/:id` | Detail d'un trajet voyageur |
| `/messages/:threadId` | Conversation avec un utilisateur |
| `/operations/:id` | Detail operation en cours |

## 3. Principes produit

### Simplicite

L'utilisateur ne doit pas comprendre un vocabulaire interne comme "matching",
"offres", "centre financier", "centre documents", "conformite" ou "centre de
confiance" pour utiliser l'app.

Ces notions peuvent exister dans le backend, mais l'interface doit parler comme
un utilisateur normal:

- "Trajet"
- "Message"
- "Enregistrer"
- "Accepter"
- "Operation en cours"
- "Paiement"

### Voyageur d'abord

La page principale ne montre plus des colis a transporter. Elle montre les
trajets des voyageurs.

Exemple de carte:

- Oujda -> Bruxelles
- Date du billet: 22 juillet 2026
- Voyageur: Karim E.
- Prix propose: 25 EUR
- Places disponibles ou capacite: 6 kg
- Boutons: Enregistrer, Voir

### Discussion naturelle

La messagerie devient un pilier du produit. Elle doit fonctionner comme une app
de messagerie:

- liste de conversations;
- avatar + nom;
- dernier message;
- date/heure;
- badge non lu;
- detail de conversation;
- champ d'envoi en bas;
- lien direct depuis un trajet vers la conversation.

### Operations separees du feed

Une fois qu'un trajet est accepte et/ou paye, il sort mentalement du feed et
devient une operation en cours.

L'utilisateur doit trouver tout ce qui est actif dans "En cours".

## 4. Personas

### Expediteur

Personne qui veut envoyer quelque chose avec un voyageur.

Objectifs:

- trouver un voyageur qui fait le bon trajet;
- comparer prix, date, profil et description;
- poser une question avant d'accepter;
- payer puis suivre l'operation;
- garder l'historique dans la messagerie.

### Voyageur

Personne qui publie son trajet et propose de transporter des colis.

Objectifs:

- publier un trajet simplement;
- indiquer date, aeroport/ville, capacite, prix et description;
- recevoir des messages;
- accepter ou refuser une operation;
- suivre les operations actives.

### Admin

Role interne. Le back-office peut rester cache hors du menu principal.

Objectifs:

- surveiller les abus;
- gerer litiges, KYC, annonces/trajets suspects;
- garder l'audit et la securite.

## 5. Fonctionnalites par page

## 5.1 Trajet

### Objectif

Afficher uniquement les posts publies par les voyageurs.

Un post est un trajet disponible, pas une annonce de colis.

### Contenu du feed

Chaque carte trajet affiche:

- ville de depart;
- ville d'arrivee;
- date du billet ou date de voyage;
- nom/avatar du voyageur;
- statut KYC ou badge de confiance;
- prix propose par le voyageur;
- capacite disponible;
- court extrait de description;
- bouton "Enregistrer";
- bouton "Voir".

Exemple:

```txt
Oujda -> Bruxelles
22 juillet 2026
Karim E. - Verifie
Prix propose: 25 EUR
Capacite: 6 kg
"Je pars avec une valise soute, je peux prendre petit colis propre."
[Enregistrer] [Voir]
```

### Filtres

Filtres minimum:

- depart;
- arrivee;
- date;
- prix max;
- capacite minimum;
- voyageurs verifies seulement.

Recherche:

- ville depart/arrivee;
- nom voyageur;
- description.

### Detail trajet

Quand on clique sur une carte:

Informations affichees:

- trajet complet;
- date du billet;
- voyageur;
- note et historique;
- prix propose;
- capacite;
- description complete;
- conditions du voyageur;
- rappel securite;
- CTA principal "Accepter";
- CTA secondaire "Envoyer un message";
- CTA "Enregistrer" ou "Retirer des enregistres".

### Bouton Accepter

Comportement cible:

1. Si utilisateur non connecte: redirection login.
2. Si KYC requis et non fait: demande de verification.
3. Sinon: ouverture d'un flow d'acceptation.
4. L'utilisateur confirme ce qu'il veut envoyer.
5. Le systeme cree une operation en cours.
6. Si paiement actif: paiement/escrow.
7. Redirection vers `/en-cours` ou `/operations/:id`.

### Bouton Message

Comportement cible:

1. Cree ou ouvre une conversation entre l'utilisateur et le voyageur.
2. Redirige vers `/messages/:threadId`.
3. Le trajet est attache comme contexte dans la conversation.

## 5.2 En cours

### Objectif

Afficher toutes les operations actives.

Une operation active est creee quand un utilisateur accepte un trajet ou quand un
paiement/accord est en cours.

### Etats possibles

| Etat | Signification |
|------|---------------|
| attente_confirmation | Le voyageur doit confirmer |
| paiement_requis | L'expediteur doit payer |
| paye | Paiement effectue, operation active |
| collecte_prevue | Rendez-vous/pickup a organiser |
| en_transport | Le voyageur transporte le colis |
| livraison_prevue | Livraison a confirmer |
| litige | Probleme ouvert |
| termine | Operation finalisee, a archiver |

### Liste

Chaque operation affiche:

- trajet;
- voyageur ou expediteur;
- date;
- montant;
- statut;
- prochaine action;
- bouton "Ouvrir";
- bouton "Message".

### Detail operation

Le detail contient:

- resume trajet;
- participants;
- statut et timeline;
- paiement;
- checklist;
- documents/preuves si necessaire;
- actions selon role;
- bouton messagerie;
- bouton litige si probleme.

### Actions possibles

Selon le statut:

- payer;
- confirmer rendez-vous;
- confirmer depot;
- confirmer reception;
- ouvrir litige;
- annuler si encore possible;
- noter l'autre utilisateur.

## 5.3 Enregistres

### Objectif

Wishlist des trajets sauvegardes.

L'utilisateur peut enregistrer un trajet depuis le feed ou le detail, puis le
retrouver ici.

### Regles

- Un trajet expire automatiquement apres sa date de voyage.
- Les trajets expires sont retires de la wishlist automatiquement.
- Si un trajet est supprime ou plus disponible, il disparait ou passe en etat
  "indisponible" avant suppression.
- L'utilisateur peut retirer manuellement un trajet.

### Liste

Chaque item affiche:

- depart -> arrivee;
- date;
- voyageur;
- prix;
- capacite;
- bouton "Voir";
- bouton "Message";
- bouton retirer.

### Etat vide

Texte:

"Aucun trajet enregistre pour l'instant."

CTA:

"Voir les trajets"

## 5.4 Messagerie

### Objectif

Remplacer la logique de chat dispersee par une vraie messagerie centrale.

L'experience doit etre proche de WhatsApp:

- liste de conversations;
- dernier message visible;
- badge non lu;
- conversations triees par derniere activite;
- recherche;
- detail fluide;
- champ d'envoi toujours accessible.

### Liste conversations

Chaque conversation affiche:

- avatar;
- nom de l'autre personne;
- dernier message;
- heure/date;
- badge non lu;
- contexte optionnel: trajet ou operation liee.

### Detail conversation

Contenu:

- header avec avatar, nom, statut verifie;
- contexte trajet si conversation creee depuis un trajet;
- messages par bulles;
- date separatrice;
- champ texte;
- bouton envoyer;
- acces rapide au trajet ou a l'operation liee.

### Creation conversation

Une conversation peut etre creee depuis:

- bouton "Envoyer un message" sur un trajet;
- bouton "Message" dans une operation;
- reponse a une conversation existante.

### Securite messagerie

Le systeme garde la detection anti-contournement:

- telephone;
- email;
- liens suspects;
- mots indiquant un paiement hors plateforme.

Mais l'interface ne doit pas etre lourde. Si message suspect:

- avertissement discret;
- flag admin;
- message peut etre envoye ou bloque selon niveau de risque.

## 5.5 Profil

### Objectif

Garder le profil actuel comme base, mais l'adapter au nouveau systeme.

Le profil contient:

- photo;
- nom;
- ville;
- telephone/email;
- verification/KYC;
- note;
- historique simplifie;
- bouton parametres;
- deconnexion.

### Actions profil

- Modifier photo;
- Modifier nom/ville;
- Verifier son identite;
- Acceder aux parametres;
- Exporter/supprimer ses donnees dans Parametres;
- Se deconnecter.

### Elements a retirer du profil principal

Le profil ne doit pas devenir une page fourre-tout.

A retirer ou deplacer:

- liens vers centres trop complexes;
- finance;
- conformite;
- documents;
- offres;
- matching;
- assistance, sauf lien discret dans parametres/aide.

## 6. Donnees et modele cible

## 6.1 TripPost

Un trajet publie par un voyageur.

Champs:

- `id`
- `travelerId`
- `from`
- `to`
- `departureDate`
- `ticketDateLabel` ou `departureAt`
- `price`
- `currency`
- `capacityKg`
- `description`
- `conditions`
- `status`: `published`, `full`, `expired`, `removed`
- `createdAt`
- `updatedAt`

Regles:

- visible dans Trajet si `status = published` et date non expiree;
- expire automatiquement apres la date;
- peut etre enregistre par plusieurs utilisateurs.

## 6.2 SavedTrip

Wishlist.

Champs:

- `id`
- `userId`
- `tripId`
- `createdAt`

Regles:

- unique par `userId + tripId`;
- suppression automatique si trip expire/supprime.

## 6.3 Conversation

Champs:

- `id`
- `participantIds`
- `tripId` optionnel;
- `operationId` optionnel;
- `lastMessageAt`
- `createdAt`

## 6.4 Message

Champs:

- `id`
- `conversationId`
- `fromId`
- `text`
- `flagged`
- `readBy`
- `createdAt`

Note: les messages actuels lies a `txId` devront etre adaptes ou migres vers
`conversationId`.

## 6.5 Operation

Remplace l'experience visible "transaction/offre/matching".

Champs:

- `id`
- `tripId`
- `senderId`
- `travelerId`
- `status`
- `price`
- `currency`
- `descriptionParcel`
- `paymentStatus`
- `escrow`
- `timeline`
- `createdAt`
- `updatedAt`

## 7. API cible

### Trajets

```txt
GET    /api/trips
GET    /api/trips/:id
POST   /api/trips
PATCH  /api/trips/:id
DELETE /api/trips/:id
```

### Enregistres

```txt
GET    /api/saved-trips
POST   /api/saved-trips/:tripId
DELETE /api/saved-trips/:tripId
```

### Messagerie

```txt
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages
POST   /api/conversations/:id/read
```

### Operations

```txt
GET    /api/operations
GET    /api/operations/:id
POST   /api/trips/:id/accept
POST   /api/operations/:id/pay
POST   /api/operations/:id/confirm
POST   /api/operations/:id/dispute
```

## 8. Navigation et IA d'ecran

### Desktop

Sidebar simple avec 5 items.

Ordre:

1. Trajet
2. En cours
3. Enregistres
4. Messagerie
5. Profil

### Mobile

Bottom nav fixe avec les memes 5 items.

Contraintes:

- libelles courts;
- icones claires;
- badge sur Messagerie si non lu;
- badge sur En cours si action requise.

## 9. Suppressions / simplifications

Routes a retirer de la navigation principale:

- `/matching`
- `/offres`
- `/finance`
- `/documents`
- `/assistance`
- `/conformite`
- `/confiance`
- ancien dashboard si trop complexe
- anciennes pages centrees sur annonces colis si elles ne correspondent plus

Routes qui peuvent rester cachees:

- `/admin`
- `/verification`
- `/parametres`
- `/cgu`
- `/confidentialite`

## 10. Strategie de migration produit

### Phase 1 - PRD + architecture

- Valider ce PRD.
- Faire l'inventaire des composants actuels reutilisables.
- Mapper l'ancien modele vers le nouveau:
  - `trips` devient la source principale du feed;
  - `transactions` devient operations visibles;
  - `messages` migre vers conversations;
  - `matchingOffers` peut devenir une logique interne ou etre retire de l'UI.

### Phase 2 - Navigation

- Remplacer la navigation par les 5 items.
- Ajouter les routes cibles.
- Garder les anciennes routes accessibles uniquement si necessaire pendant la
  migration.

### Phase 3 - Page Trajet

- Transformer le feed pour afficher les trajets voyageurs.
- Ajouter detail trajet.
- Ajouter CTA enregistrer, message, accepter.

### Phase 4 - Enregistres

- Ajouter wishlist.
- Suppression automatique des trajets expires.
- Tests sur expiration.

### Phase 5 - Messagerie

- Creer liste conversations.
- Creer detail conversation.
- Relier message depuis trajet et operation.

### Phase 6 - En cours

- Remplacer l'experience transactions par operations.
- Afficher les actions par statut.
- Conserver escrow/paiement en logique interne.

### Phase 7 - Nettoyage

- Retirer les pages inutiles.
- Nettoyer les traductions.
- Simplifier profil.
- Refaire tests et build.

## 11. Critères d'acceptation

### Navigation

- L'utilisateur connecte voit uniquement les 5 entrees principales.
- Sur mobile, les 5 entrees sont accessibles en bottom nav.
- Aucun lien principal ne renvoie vers matching/offres/finance/documents.

### Trajet

- Le feed affiche des trajets voyageurs, pas des annonces colis.
- Un trajet expire n'apparait plus.
- Le detail montre prix, description, voyageur, date, CTA accepter/message.

### Enregistres

- Un utilisateur peut enregistrer et retirer un trajet.
- Un trajet expire disparait automatiquement.
- L'etat vide propose de retourner aux trajets.

### Messagerie

- Une conversation s'ouvre depuis un trajet.
- La liste ressemble a une messagerie moderne.
- Les conversations sont triees par derniere activite.
- Les messages non lus sont visibles.

### En cours

- Une acceptation de trajet cree une operation.
- L'operation apparait dans En cours.
- Les actions changent selon le statut.

### Profil

- Le profil actuel reste fonctionnel.
- Les liens complexes sont retires ou deplaces.
- Parametres reste accessible depuis Profil.

## 12. Tests minimum

Serveur:

- liste trajets ignore les expires;
- saved trips unique par user/trip;
- saved trips supprime ou masque les expires;
- creation conversation depuis trip;
- envoi message;
- acceptation trip cree operation;
- operation visible pour sender et traveler seulement.

Client:

- navigation affiche les 5 items;
- page Trajet charge;
- detail trajet CTA message/accepter;
- Enregistres vide et rempli;
- Messagerie liste + detail;
- En cours liste + detail.

Build:

- `npm test`
- `npx vite build client`

## 13. Decisions ouvertes

1. Est-ce que les voyageurs peuvent publier leurs trajets eux-memes des la V1,
   ou seulement via demo/admin au debut?
2. Est-ce que le prix est fixe par le voyageur, negociable, ou les deux?
3. Est-ce que l'acceptation declenche paiement immediat ou demande confirmation
   voyageur avant paiement?
4. Est-ce que la messagerie doit bloquer les coordonnees hors plateforme ou
   seulement les signaler?
5. Est-ce qu'on garde l'arabe/neerlandais immediatement sur la refonte, ou on
   construit d'abord en francais puis on synchronise les dictionnaires?

## 14. Recommandation Codex

Pour aller vite sans casser tout le projet, je recommande:

1. creer la nouvelle navigation;
2. reutiliser `trips` pour alimenter la page Trajet;
3. creer `savedTrips`;
4. creer `conversations` en gardant les messages existants compatibles;
5. transformer progressivement `transactions` en "operations" cote UI;
6. retirer ensuite les anciennes pages du menu.

La premiere implementation ne doit pas chercher a tout refaire en meme temps.
Elle doit livrer un squelette complet navigable avec les 5 pages, puis brancher
les vraies donnees page par page.
