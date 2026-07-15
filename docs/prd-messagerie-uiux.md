# PRD - Messagerie Wigofly 2.0

**Version:** 2.0  
**Date:** 2026-07-15  
**Statut:** Pret a designer puis implementer  
**Perimetre:** `/messages`, `/messages/:id`, liens depuis trajets, operations, profil et notifications  
**Decision produit:** la messagerie devient une vraie surface centrale de coordination, pas une page secondaire.

---

## 1. Probleme a regler

La messagerie actuelle donne encore l'impression d'un prototype. Elle a des conversations, des messages et un champ d'envoi, mais elle ne ressemble pas assez a une application de messagerie moderne. L'utilisateur ne comprend pas instantanement:

- quelle conversation est importante;
- qui attend une reponse;
- pour quel trajet ou quelle operation on parle;
- quel est le statut de l'echange;
- quelle action il doit faire ensuite.

Sur Wigofly, une conversation n'est pas juste un chat. C'est l'endroit ou deux personnes se mettent d'accord sur un trajet, un prix, un colis, une remise, un paiement et une livraison. Si la messagerie parait faible, tout le produit parait moins fiable.

La refonte doit donc transformer la messagerie en espace de coordination clair, rapide, rassurant et tres mobile.

---

## 2. Vision cible

Quand l'utilisateur ouvre la messagerie, il doit avoir la sensation d'une interface proche de WhatsApp pour la rapidite, mais plus structuree pour Wigofly:

- une liste de conversations dense, claire, triee par importance;
- des statuts visibles sans ouvrir chaque conversation;
- une conversation detaillee qui montre qui parle, de quoi on parle et quelle action est possible;
- un fil lisible, calme, sans cartes inutiles;
- un composer solide avec brouillon, piece jointe, erreur, retry et etat d'envoi;
- une experience mobile excellente, car la majorite des messages seront probablement envoyes sur telephone.

La phrase produit:

> "Je trouve la bonne discussion, je comprends le contexte et je peux agir sans quitter la conversation."

---

## 3. Objectifs mesurables

| Objectif | Cible |
|---|---:|
| Comprendre le contexte d'une conversation | moins de 3 secondes |
| Identifier une conversation non lue | instantane |
| Envoyer ou reessayer un message | moins de 2 actions |
| Ouvrir trajet/operation depuis la conversation | 1 action |
| Overflow horizontal mobile | 0 a 320, 375, 430 px |
| Messages ou boutons qui se chevauchent | 0 |
| Etats vides, erreur, chargement | 100 % definis |
| Build + tests API apres implementation | 100 % verts |

---

## 4. Non-objectifs

Cette refonte ne doit pas essayer de tout faire:

- pas d'appel audio/video;
- pas de groupe a plus de deux participants;
- pas de reseau social;
- pas de reactions type emoji en V1;
- pas de chiffrement de bout en bout dans ce chantier;
- pas de refonte globale de tout Wigofly;
- pas de WebSocket obligatoire en premiere livraison si un polling propre suffit.

---

## 5. Utilisateurs et besoins

### 5.1 Expediteur

Il cherche quelqu'un qui voyage et veut envoyer un colis. Il a besoin de:

- verifier que le voyage est toujours disponible;
- negocier ou confirmer le prix;
- expliquer le colis;
- fixer le lieu de remise;
- suivre l'etape de l'operation.

### 5.2 Voyageur

Il propose un trajet et recoit des demandes. Il a besoin de:

- voir rapidement les demandes serieuses;
- savoir qui attend une reponse;
- confirmer prix, disponibilite, lieu et date;
- ne pas melanger plusieurs demandes.

### 5.3 Utilisateur en operation

Il a deja accepte ou paye. Il a besoin de:

- garder l'historique;
- suivre les etapes;
- contacter l'autre personne rapidement;
- ouvrir l'operation sans chercher dans le menu.

### 5.4 Utilisateur inquiet

Il veut etre rassure. Il a besoin de:

- voir que les messages restent dans Wigofly;
- signaler un comportement;
- comprendre les avertissements sur les coordonnees;
- ne pas perdre ses preuves.

---

## 6. Architecture UX

### 6.1 Navigation principale

Le menu principal contient:

- Trajet
- En cours
- Enregistres / Wishlist
- Messagerie
- Profil

La messagerie est une destination principale, pas une sous-page cachee.

### 6.2 Routes

| Route | Role |
|---|---|
| `/messages` | Liste des conversations |
| `/messages/:id` | Detail d'une conversation |
| `/trajets/:id` | Source possible d'une conversation |
| `/operations/:id` | Contexte operationnel d'une conversation |
| `/profil` | Acces profil, preferences et donnees |

Sur desktop, `/messages` peut afficher une conversation selectionnee dans la meme page. Sur mobile, la liste et le detail restent deux vues separees.

---

## 7. Inbox - Liste des conversations

### 7.1 Intention

La liste doit fonctionner comme un centre de tri. L'utilisateur doit voir en un coup d'oeil:

- les conversations non lues;
- les operations qui demandent une action;
- le dernier message utile;
- le trajet ou l'operation associe;
- qui est l'autre personne.

### 7.2 Layout desktop

Desktop a partir de 1024 px:

```text
┌──────────────────────────────────────────────────────────────┐
│ Messagerie                         Recherche                 │
├──────────────────────────────┬───────────────────────────────┤
│ Filtres                      │ Etat accueil ou conversation  │
│ ┌ Conversation 1 ┐           │                               │
│ ┌ Conversation 2 ┐           │                               │
│ ┌ Conversation 3 ┐           │                               │
└──────────────────────────────┴───────────────────────────────┘
```

Largeur recommandee:

- colonne liste: 380 a 440 px;
- colonne detail: le reste;
- pas de carte flottante enorme;
- separateur vertical discret.

### 7.3 Layout mobile

Mobile:

```text
┌─────────────────────┐
│ Messagerie          │
│ Recherche           │
│ Filtres horizontaux │
│ Conversation        │
│ Conversation        │
│ Conversation        │
└─────────────────────┘
```

Contraintes:

- aucune colonne secondaire;
- aucune zone vide;
- actions secondaires cachees dans un menu;
- ligne conversation tactile de 72 a 88 px;
- pas de texte coupe de maniere incomprehensible.

### 7.4 Header inbox

Elements:

- titre `Messagerie`;
- compteur non lus;
- bouton actualiser;
- bouton optionnel `Nouveau` seulement si une vraie creation de conversation existe.

Interdit:

- gros hero;
- bloc marketing;
- texte long expliquant toute la fonctionnalite;
- bouton qui ne fait rien.

### 7.5 Recherche

Recherche sur:

- nom du participant;
- ville de depart;
- ville d'arrivee;
- titre operation;
- dernier message;
- statut.

Comportement:

- saisie immediate;
- bouton effacer;
- etat aucun resultat;
- conservation du filtre actif.

### 7.6 Filtres

Filtres obligatoires:

- `Toutes`
- `Non lues`
- `A traiter`
- `En cours`
- `Terminees`
- `Archivees` en option secondaire

`A traiter` est plus important que `En cours`: il contient les conversations ou l'utilisateur doit faire quelque chose maintenant.

### 7.7 Ligne conversation

Une ligne conversation doit contenir:

1. avatar;
2. badge verification si disponible;
3. nom;
4. contexte court;
5. dernier message;
6. heure;
7. badge non lu;
8. badge action si necessaire;
9. menu rapide.

Structure:

```text
[Avatar]  Nom utilisateur        12:45
          Oujda -> Bruxelles     Action requise
          Dernier message sur deux lignes...
```

### 7.8 Hierarchie visuelle

Priorite des elements:

1. Non lu
2. Action requise
3. Nom
4. Route/operation
5. Dernier message
6. Heure
7. Actions secondaires

Le badge non lu doit etre petit mais tres visible. L'action requise doit etre ambre/orange, pas rouge sauf danger.

### 7.9 Actions sur une ligne

Desktop:

- hover/focus affiche actions rapides;
- marquer lu/non lu;
- epingler;
- archiver;
- signaler.

Mobile:

- menu `...`;
- pas de boutons minuscules colles;
- action principale reste l'ouverture de la conversation.

---

## 8. Etat accueil desktop

Quand aucune conversation n'est selectionnee sur desktop, afficher un panneau utile, pas une grande carte vide.

Contenu:

- icone simple;
- titre: `Choisissez une conversation`;
- texte: `Vos echanges lies aux trajets et operations apparaissent ici.`;
- 3 petites lignes:
  - `Gardez les preuves dans Wigofly`;
  - `Suivez les operations sans changer de page`;
  - `Repondez rapidement aux demandes`;
- CTA discret: `Voir les trajets`.

Ce panneau ne doit pas ressembler a une page d'accueil marketing.

---

## 9. Detail conversation

### 9.1 Intention

L'ecran detail doit repondre a cinq questions:

- avec qui je parle;
- le profil est-il fiable;
- pour quel trajet ou operation;
- ou en est l'operation;
- que puis-je faire maintenant.

### 9.2 Layout desktop

```text
┌──────────────────────────────────────────────┐
│ Header: avatar, nom, contexte, actions       │
├──────────────────────────────────────────────┤
│ Carte contexte trajet/operation              │
├──────────────────────────────────────────────┤
│ Fil de messages                              │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ Composer                                     │
└──────────────────────────────────────────────┘
```

### 9.3 Layout mobile

```text
┌─────────────────────┐
│ Retour Nom       ...│
│ Oujda -> Bruxelles  │
├─────────────────────┤
│ Contexte compact    │
├─────────────────────┤
│ Messages            │
│                     │
├─────────────────────┤
│ +  Ecrire...   Send │
└─────────────────────┘
```

Contraintes mobile:

- header sticky;
- composer sticky en bas;
- compatibilite clavier;
- zone de messages scrollable seule;
- bouton retour toujours visible;
- action principale accessible au pouce.

---

## 10. Header conversation

### 10.1 Elements obligatoires

- retour vers la liste;
- avatar;
- nom;
- badge verification;
- contexte court;
- bouton vers trajet/operation;
- menu actions.

### 10.2 Menu actions

Le menu contient:

- Voir le profil;
- Rechercher dans la conversation;
- Voir le trajet;
- Voir l'operation;
- Marquer non lu;
- Archiver;
- Signaler;
- Bloquer si cette fonctionnalite existe.

### 10.3 Regles UI

- Le header ne doit pas depasser deux lignes sur mobile.
- Les boutons iconographiques doivent avoir `aria-label`.
- Le CTA contexte doit devenir une icone ou un bouton court sur petit ecran.
- Le nom long doit etre tronque proprement.

---

## 11. Carte contexte

### 11.1 Pourquoi elle existe

Dans Wigofly, le message depend du trajet ou de l'operation. Sans contexte, l'utilisateur relit l'historique pour comprendre. La carte contexte evite cela.

### 11.2 Version trajet

Afficher:

- route;
- date de billet;
- prix propose;
- capacite ou note utile;
- bouton `Voir trajet`.

Exemple:

```text
Trajet
Oujda -> Bruxelles
18 juillet - 25 EUR proposes
[Voir trajet]
```

### 11.3 Version operation

Afficher:

- titre ou route;
- statut operation;
- prix;
- prochaine etape;
- bouton `Voir operation`.

Exemple:

```text
Operation en cours
Oujda -> Bruxelles
Paiement attendu - 25 EUR
[Voir operation]
```

### 11.4 Etats de la carte

| Etat | Rendu |
|---|---|
| Normal | bord neutre |
| Action requise | accent ambre |
| Termine | accent vert discret |
| Probleme | accent rouge + texte court |
| Archive | gris + action limitee |

---

## 12. Fil de messages

### 12.1 Types de messages

| Type | Usage | Style |
|---|---|---|
| Entrant | message de l'autre personne | bulle claire, gauche |
| Sortant | message de l'utilisateur | bulle accent, droite |
| Systeme | changement de statut | centre, petit |
| Warning | moderation ou coordonnees | bulle alerte, texte clair |
| Piece jointe | image/document | preview + nom |

### 12.2 Groupement

Regles:

- meme auteur + moins de 5 minutes = groupe;
- avatar affiche au debut d'un groupe entrant;
- heure sur le dernier message du groupe;
- statut seulement sur les messages sortants;
- separateur de date au changement de jour.

### 12.3 Messages systeme

Evenements a afficher:

- conversation ouverte;
- operation creee;
- prix confirme;
- paiement attendu;
- paiement recu;
- rendez-vous planifie;
- colis remis;
- livraison confirmee;
- operation terminee;
- conversation archivee;
- signalement envoye.

### 12.4 Bouton nouveaux messages

Si l'utilisateur est loin du bas:

- ne pas forcer le scroll;
- afficher `Nouveaux messages`;
- clic descend au dernier message.

### 12.5 Lisibilite

Contraintes:

- bulle mobile max 82 % de largeur;
- bulle desktop max 62 % de largeur;
- texte long coupe proprement;
- lien long ne casse pas la page;
- image limitee en taille;
- fond du fil calme et stable.

---

## 13. Composer

### 13.1 Elements

- bouton piece jointe;
- textarea multi-ligne;
- compteur discret ou limite invisible jusqu'a 900 caracteres;
- bouton envoyer;
- etat envoi;
- etat erreur;
- brouillon conserve.

### 13.2 Etats

| Etat | Comportement |
|---|---|
| Pret | champ actif, bouton disabled tant que vide |
| Saisie | bouton envoyer actif |
| Envoi | message optimiste + spinner |
| Reussi | statut envoye |
| Echec | message reste visible + bouton reessayer |
| Termine | champ disabled + lien operation |
| Archive | champ disabled + option restaurer si disponible |
| Hors ligne | brouillon conserve, envoi bloque ou mis en attente |

### 13.3 Pieces jointes

V1:

- image uniquement;
- preview avant envoi;
- suppression avant envoi;
- limite taille;
- erreur claire si type refuse.

V2:

- documents PDF;
- compression;
- anti-virus ou moderation fichier;
- telechargement securise.

### 13.4 Raccourcis

Desktop:

- `Enter` envoie si le produit valide ce comportement;
- `Shift+Enter` nouvelle ligne.

Mobile:

- bouton envoyer obligatoire;
- le clavier ne doit pas masquer le composer.

---

## 14. Suggestions intelligentes

Les suggestions doivent aider, pas polluer.

Regles:

- visibles seulement au debut ou quand la conversation est vide;
- jamais envoyer automatiquement;
- clic remplit le composer;
- adapte au contexte.

### Trajet

- `Le trajet est-il toujours disponible ?`
- `Quel prix proposez-vous ?`
- `Ou peut-on faire la remise ?`

### Operation - paiement

- `Je vais verifier le paiement.`
- `Pouvez-vous confirmer les details ?`
- `Quel lieu de remise vous arrange ?`

### Operation - collecte

- `Je confirme le rendez-vous.`
- `Je suis disponible a cette heure.`
- `Pouvez-vous envoyer le lieu exact ?`

### Operation - livraison

- `La livraison est-elle bien effectuee ?`
- `Merci, je confirme la reception.`

---

## 15. Signalement et securite

### 15.1 Coordonnees hors app

Si le systeme detecte un numero, email ou contact externe:

- le message reste lisible;
- il recoit un style warning;
- un texte explique: `Pour votre securite, gardez les echanges importants dans Wigofly.`;
- pas de ton agressif.

### 15.2 Signaler une conversation

Parcours:

1. ouvrir menu;
2. cliquer `Signaler`;
3. choisir raison:
   - comportement suspect;
   - demande hors plateforme;
   - insultes;
   - paiement externe;
   - autre;
4. ajouter commentaire optionnel;
5. confirmation.

Le signalement doit apparaitre dans l'admin moderation, avec contexte, participants et derniers messages.

---

## 16. Notifications

### 16.1 Dans l'app

- badge global dans le menu;
- badge dans inbox;
- badge sur ligne conversation;
- toast seulement si l'utilisateur est deja dans l'app et pas dans la conversation concernee.

### 16.2 Etat lu/non lu

Regles:

- ouvrir une conversation marque comme lu apres chargement reussi;
- marquer non lu disponible;
- archiver ne supprime pas l'historique;
- le compteur global doit rester coherent.

---

## 17. API et contrat donnees

### 17.1 Conversation

Champs requis:

```json
{
  "id": "conv_123",
  "other": {},
  "contextType": "trip",
  "context": {
    "label": "Oujda -> Bruxelles",
    "detail": "18 juillet - 25 EUR",
    "href": "/trajets/trip_123"
  },
  "status": "waiting_user",
  "actionRequired": true,
  "actionLabel": "Voir l'operation",
  "actionHref": "/operations/op_123",
  "lastMessagePreview": "Je confirme...",
  "lastMessageAt": 1720000000000,
  "unreadCount": 2,
  "pinned": false,
  "archived": false
}
```

### 17.2 Message

Champs requis:

```json
{
  "id": "msg_123",
  "clientId": "client_abc",
  "from": "user_1",
  "type": "text",
  "text": "Bonjour",
  "attachments": [],
  "at": 1720000000000,
  "deliveryStatus": "sent",
  "readBy": ["user_1", "user_2"],
  "flagged": false,
  "flagReason": null
}
```

### 17.3 Endpoints

| Endpoint | Besoin |
|---|---|
| `GET /api/conversations?filter=&q=&cursor=` | inbox |
| `GET /api/conversations/:id` | header/contexte |
| `GET /api/conversations/:id/messages?before=&q=` | fil pagine |
| `POST /api/conversations/:id/messages` | envoi idempotent |
| `POST /api/conversations/:id/read` | lu |
| `POST /api/conversations/:id/unread` | non lu |
| `POST /api/conversations/:id/archive` | archiver |
| `POST /api/conversations/:id/pin` | epingler |
| `POST /api/conversations/:id/report` | signalement |

---

## 18. Responsive obligatoire

### 18.1 Breakpoints

| Largeur | Experience |
|---:|---|
| 320 | mobile extreme, aucune action coupee |
| 375 | mobile standard |
| 430 | grand mobile |
| 768 | tablette portrait |
| 1024 | desktop compact, 2 colonnes |
| 1280+ | desktop confortable |

### 18.2 Regles

- pas de `100vh` rigide qui casse avec clavier mobile;
- utiliser `dvh` ou calcul adapte si disponible;
- composer avec `safe-area-inset-bottom`;
- header sticky;
- fil scrollable;
- pas d'overflow horizontal;
- boutons tactiles min 44 px;
- texte dans boutons jamais coupe.

---

## 19. Accessibilite

Obligatoire:

- focus visible;
- navigation clavier;
- `aria-label` sur boutons icones;
- contrastes WCAG AA;
- support RTL;
- messages d'erreur lisibles par lecteur d'ecran;
- aucune information uniquement par couleur;
- `prefers-reduced-motion`.

---

## 20. Direction UI

### 20.1 Style

La messagerie doit etre:

- dense mais respirable;
- calme;
- rassurante;
- moderne;
- moins "carte partout";
- plus "application utile".

### 20.2 Couleurs

- accent principal: action;
- vert: confirme;
- ambre: attente/action;
- rouge: danger uniquement;
- gris: archive/inactif;
- pas de palette mono-couleur;
- pas de gros gradients decoratifs.

### 20.3 Formes

- surfaces 8 a 12 px radius;
- bulles plus arrondies mais sobres;
- pas de cartes dans des cartes;
- separateurs fins;
- ombres legeres ou absentes.

---

## 21. Etats obligatoires

Chaque etat doit etre design et implemente.

| Etat | Inbox | Detail | Composer |
|---|---|---|---|
| Chargement | skeleton lignes | skeleton header + bulles | disabled |
| Erreur API | bloc reessayer | bloc reessayer | disabled |
| Vide | CTA trajets | suggestions | actif |
| Aucun resultat | reset filtres | reset recherche | actif |
| Non lu | badge + gras | lu apres ouverture | actif |
| Action requise | badge ambre | carte contexte ambre | actif |
| Termine | filtre terminees | historique | disabled |
| Archive | masque ou filtre | bandeau archive | disabled |
| Signale | badge moderation | warning | actif selon statut |
| Hors ligne | derniere donnees | banner | brouillon conserve |

---

## 22. Backlog priorise

### P0 - rendre la messagerie vraiment utilisable

| ID | Travail | Acceptance criteria |
|---|---|---|
| MSG-P0-01 | Refaire layout inbox mobile/desktop | 2 colonnes desktop, 1 colonne mobile, zero overflow |
| MSG-P0-02 | Refaire ligne conversation | contexte, non lu, action, preview, heure visibles |
| MSG-P0-03 | Ajouter filtre `A traiter` | conversations avec actionRequired visibles |
| MSG-P0-04 | Refaire header conversation | identite, contexte, menu, CTA disponibles |
| MSG-P0-05 | Refaire carte contexte | trajet/operation comprehensible sans scroller |
| MSG-P0-06 | Refaire fil messages | bulles, dates, groupes, systeme, warning |
| MSG-P0-07 | Composer robuste | brouillon, retry, piece jointe image, disabled |
| MSG-P0-08 | Etats complets | vide, erreur, loading, no result, termine |
| MSG-P0-09 | Tests API | read/unread/send/archive/report/idempotence |
| MSG-P0-10 | Audit visuel | 320, 375, 430, 768, 1024, 1280 |

### P1 - niveau produit solide

| ID | Travail | Acceptance criteria |
|---|---|---|
| MSG-P1-01 | Epingler conversations | persistent par utilisateur |
| MSG-P1-02 | Recherche dans conversation | q serveur + highlight ou liste resultats |
| MSG-P1-03 | Menu signalement complet | raisons, commentaire, confirmation |
| MSG-P1-04 | Moderation admin | conversation signalee visible admin |
| MSG-P1-05 | Notifications plus propres | badge global coherent + deep links |
| MSG-P1-06 | Messages modeles | suggestions par etape operationnelle |

### P2 - experience premium

| ID | Travail | Acceptance criteria |
|---|---|---|
| MSG-P2-01 | Temps reel | WebSocket/SSE, reconnexion |
| MSG-P2-02 | Presence | actif recemment si fiable |
| MSG-P2-03 | Documents | PDF/images avec moderation |
| MSG-P2-04 | Traduction aidee | modeles multilingues |

---

## 23. Plan de chantier recommande

### Phase 1 - Design structurel

1. figer les routes;
2. figer le contrat conversation/message;
3. dessiner inbox mobile et desktop;
4. dessiner detail mobile et desktop;
5. valider les etats obligatoires.

### Phase 2 - Backend

1. enrichir `conversationView`;
2. ajouter filtres serveur;
3. ajouter read/unread/archive/pin/report;
4. idempotence `clientId`;
5. pagination messages;
6. tests API.

### Phase 3 - Frontend inbox

1. nouveau shell;
2. filtres;
3. recherche;
4. conversation row;
5. skeletons/empty/error;
6. responsive.

### Phase 4 - Frontend detail

1. header;
2. carte contexte;
3. fil groupe;
4. messages systeme/warning;
5. composer;
6. retry/piece jointe;
7. mobile keyboard.

### Phase 5 - Polish produit

1. microcopy;
2. i18n FR/AR/NL;
3. RTL;
4. dark mode;
5. visual QA;
6. tests finaux.

---

## 24. Criteres d'acceptation finaux

La messagerie est acceptee seulement si:

- elle ressemble a une vraie messagerie moderne;
- la liste des conversations est lisible et rapide;
- le detail conversation ne parait plus vide ou amateur;
- mobile 375 px est excellent;
- desktop 1280 px ne gaspille pas l'espace;
- l'utilisateur comprend le trajet ou l'operation sans chercher;
- envoyer, reessayer et joindre une image sont clairs;
- un signalement est possible;
- les etats erreur/vide/loading sont propres;
- FR, AR et NL restent coherents;
- `npm test` passe;
- build client passe;
- audit visuel manuel fait.

---

## 25. Definition du "pas null"

La messagerie ne sera plus consideree "null" quand elle aura ces impressions immediates:

1. **Ca ressemble a un vrai produit.**  
   La liste, le detail, les bulles, le composer et les menus sont coherents.

2. **Je comprends sans lire toute la page.**  
   Nom, trajet, statut, dernier message et action sont visibles.

3. **Je peux agir vite.**  
   Repondre, ouvrir operation, signaler, archiver, rechercher.

4. **Je suis rassure.**  
   Historique clair, avertissements propres, erreurs recuperables.

5. **Sur mobile, ca tient.**  
   Rien ne depasse, rien ne se chevauche, le clavier ne casse pas l'ecran.

---

## 26. Prompt de lancement pour implementation Codex

```text
Travaille uniquement sur la refonte UI/UX de la messagerie Wigofly selon docs/prd-messagerie-uiux.md.

Priorite absolue:
1. Inbox /messages: layout mobile et desktop, filtres, recherche, lignes conversation riches, etats loading/empty/error.
2. Detail /messages/:id: header, carte contexte, fil messages groupe, messages systeme/warning, composer robuste.
3. Responsive: 320, 375, 430, 768, 1024, 1280 px sans overflow.
4. Tests: API conversations + build client.

Ne refais pas tout le site. Ne change pas les routes globales hors besoin messagerie. Garde les conventions existantes du repo. Apres chaque lot, lance les tests disponibles et note ce qui reste a faire.
```
