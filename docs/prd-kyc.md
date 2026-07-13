# PRD — Vérification d'identité (KYC manuel)
### Wigofly · Addendum au PRD v1.0 · Juillet 2026

---

## 1. Contexte et objectif

Le PRD v1.0 (§4.1) prévoit un KYC via prestataire externe (Onfido, Ubble, KYC Mangopay). Ce
prestataire n'est pas encore choisi (dépendance A4 du plan de projet, non tranchée). En
attendant, ce document définit un **KYC manuel** : les utilisateurs soumettent leurs documents
in-app, une équipe interne les valide depuis le back-office.

**Objectif** : donner à Wigofly une vraie barrière d'identité — pas la vérification instantanée
factice actuelle (`kycStatus = 'verified'` en un clic, sans aucun contrôle) — sans dépendre d'un
prestataire externe qui n'est pas encore sous contrat.

**Non-négociable** : ce système doit être conçu pour être **remplacé** par un prestataire réel sans
tout reconstruire. La capture des documents côté utilisateur reste identique ; seule l'étape de
décision change (revue humaine → décision automatisée du prestataire).

---

## 2. Principe : quand la vérification est-elle obligatoire ?

| Action | KYC requis ? |
|---|---|
| Parcourir le feed, consulter des annonces | Non |
| Consulter son profil, modifier ses infos | Non |
| Publier une annonce d'envoi | **Oui** |
| Déclarer un trajet (voyageur) | **Oui** |
| Accepter une annonce (transporter) | **Oui** |
| Toute autre action transactionnelle | **Oui** |

La navigation reste ouverte à tous — c'est uniquement l'entrée dans une transaction réelle
(argent, engagement, responsabilité) qui exige une identité vérifiée. C'est déjà le comportement
du code actuel (`kycStatus !== 'verified'` bloque `/listings`, `/trips`, `/listings/:id/accept`) ;
ce PRD ne change pas ces points de blocage, il remplace uniquement ce qu'il y a *derrière*
`kycStatus`.

---

## 3. Ce que l'utilisateur soumet

| Document | Détail |
|---|---|
| Selfie visage | Photo de face, prise via la caméra in-app (pas d'upload galerie — même logique anti-fraude que la vidéo de scellage) |
| Pièce d'identité — recto | Carte d'identité nationale ou passeport |
| Pièce d'identité — verso | Requis pour une carte d'identité nationale ; **non demandé** si passeport sélectionné (pas de verso pertinent) |
| Nom légal complet (déclaré) | Texte libre — sert de référence pour la comparaison visuelle par l'admin |
| Date de naissance (déclarée) | Doit correspondre à un utilisateur de 18 ans ou plus (bloquant, contrôle client + serveur) |
| Type de document | Carte d'identité / Passeport (détermine si le verso est demandé) |

**Règle anti-fraude** : les 3 photos sont capturées exclusivement via la caméra in-app
(`getUserMedia`), jamais par sélection dans la galerie — identique à la contrainte déjà appliquée
à la vidéo de scellage. Ça empêche de soumettre une photo trouvée ailleurs ou une capture d'écran.

**Limite connue (à documenter, pas à cacher)** : sans détection de vivacité (liveness) automatisée,
un selfie manuel reste spoofable par une photo imprimée présentée à la caméra. C'est une limite
assumée du KYC manuel — la mitigation est le contrôle visuel humain (comparer le selfie, la photo
du document, et son screening des tentatives suspectes), en attendant un vrai prestataire.

---

## 4. Parcours utilisateur

### 4.1 Déclenchement
Un utilisateur non vérifié qui tente de publier une annonce, déclarer un trajet, ou accepter une
annonce est redirigé vers l'écran de vérification (remplace l'actuel écran « Vérifier mon
identité » à un clic).

### 4.2 Écran de vérification (nouveau)
Parcours en étapes (cohérent avec le reste de l'app : formation voyageur, création d'annonce) :

1. **Informations déclarées** : nom légal complet, date de naissance, type de document
2. **Selfie** : instructions claires (« visage dégagé, pas de lunettes de soleil, bon éclairage »), capture caméra
3. **Pièce d'identité recto** : cadrage guidé, capture caméra
4. **Pièce d'identité verso** (si carte d'identité) : capture caméra
5. **Récapitulatif** avant envoi — les 3 photos affichées en miniature, possibilité de reprendre chacune individuellement avant soumission finale
6. **Confirmation** : statut passe à « En attente de vérification »

### 4.3 États visibles côté utilisateur

| Statut | Ce que voit l'utilisateur |
|---|---|
| `none` | Bouton « Vérifier mon identité », aucune donnée soumise |
| `pending` | « Votre identité est en cours de vérification. Délai habituel : sous 24h. » — pas de nouvelle soumission possible tant que la demande est en attente |
| `verified` | Badge « Identité vérifiée », accès complet aux transactions |
| `rejected` | Motif du rejet affiché en clair (ex. « Photo du recto illisible »), bouton pour resoumettre |
| `refused` | Compte définitivement bloqué pour le KYC — message invitant à contacter le support ; pas de resoumission automatique |

Notification in-app à chaque changement de statut (réutilise le système de notifications déjà en
place).

---

## 5. Back-office admin — file de vérification

Nouvel onglet dans le back-office (aux côtés de « File de revue », « KPIs », « Catégories »).

### 5.1 Vue liste
- File des demandes `pending`, triée par ordre d'arrivée (FIFO — la plus ancienne en premier, principe d'équité)
- Compteur en attente, temps moyen de traitement affiché (dans l'esprit des KPIs déjà en place)
- Filtres : par statut (pending / verified / rejected / refused), par date, recherche par nom/email

### 5.2 Vue détail d'une demande
- Les 3 photos affichées en grand (zoom au clic — la review doit être *faisable*, pas juste
  cosmétique), avec le nom légal et la date de naissance déclarés en regard
- Informations de compte : email, date d'inscription, statut du compte (nouveau vs ancien),
  nombre de tentatives KYC précédentes (rejets antérieurs visibles = signal d'alerte)
- Trois actions, correspondant à trois issues distinctes :

| Action | Effet | Cas d'usage |
|---|---|---|
| **Approuver** | `kycStatus = 'verified'` | Documents cohérents, lisibles, correspondance visuelle OK |
| **Rejeter** | `kycStatus = 'rejected'` + motif obligatoire | Problème corrigible : photo floue, document expiré, information illisible — l'utilisateur peut resoumettre |
| **Refuser définitivement** | `kycStatus = 'refused'` + motif obligatoire + confirmation renforcée | Suspicion de fraude, document falsifié, incohérence grave — bloque toute resoumission |

« Refuser définitivement » est une action à conséquence lourde : elle doit demander une
confirmation explicite (pattern déjà utilisé pour la suppression de compte — saisie de
confirmation), pas un simple clic.

### 5.3 Historique
- Journal complet de toutes les décisions KYC (qui a décidé, quand, quelle décision, quel motif),
  consultable par utilisateur et de façon globale
- Sert à la fois de traçabilité de conformité et de détection de patterns (un utilisateur avec 3
  rejets consécutifs est un signal différent d'un premier rejet)

---

## 6. Modèle de données (ajouts)

**Utilisateur** — champs ajoutés :
- `kycStatus` : `none | pending | verified | rejected | refused` (remplace le booléen actuel)
- `kycSubmissions` : liste des soumissions (voir ci-dessous), la plus récente = demande active

**Soumission KYC** (nouvel objet, un par tentative) :
- `id`, `userId`, `submittedAt`
- `legalName`, `birthDate`, `documentType` (`id_card` | `passport`)
- `selfiePhoto`, `idFrontPhoto`, `idBackPhoto` (null si passeport)
- `status` : `pending | approved | rejected | refused`
- `reviewedBy`, `reviewedAt`, `decisionReason` (obligatoire si rejet/refus)

**Confidentialité** : les photos de documents d'identité sont des données sensibles. Elles ne
doivent être visibles que par les admins habilités à la revue KYC, jamais exposées aux autres
utilisateurs ni incluses en clair dans l'export RGPD standard (à traiter séparément, sur demande
explicite justifiée).

---

## 7. Sécurité et anti-fraude

- Capture caméra in-app exclusive (pas de galerie), comme la vidéo de scellage
- Contrôle d'âge (18+) appliqué côté client *et* serveur — jamais une seule validation
- Limitation du nombre de resoumissions après rejet (à définir — proposition : 3 tentatives
  `rejected` avant passage automatique en `refused` avec revue admin obligatoire)
- Les photos ne sont accessibles que via les endpoints admin, protégés par le contrôle d'accès
  admin existant (`adminOnly`) — jamais exposées dans les endpoints publics/utilisateur
- Historique des décisions horodaté et attribué à l'admin qui a tranché (imputabilité)

---

## 8. Ce que ce PRD ne couvre pas (hors périmètre V1 manuel)

- Détection automatisée de faux documents (nécessite un vrai prestataire)
- Détection de vivacité (liveness) réelle
- Reconnaissance faciale automatique (comparaison selfie ↔ photo du document)
- Vérification en base de données officielle (registre national, listes de sanctions)
- Multi-langue du parcours de soumission (aligné sur le reste de l'app, français uniquement pour l'instant)

Ces points sont exactement ce qu'un vrai prestataire (Onfido/Ubble/Stripe Identity) apporterait —
raison pour laquelle ce système doit rester remplaçable sans réécrire la capture utilisateur.

---

## 9. Point à corriger ailleurs dans l'app

La politique de confidentialité actuelle (§2) affirme que *« vos documents d'identité sont
traités et conservés par notre prestataire de vérification agréé — jamais stockés sur nos propres
serveurs »*. Avec un KYC manuel, c'est **faux** : les documents sont stockés côté Wigofly. Ce
texte devra être corrigé en même temps que l'implémentation, pour rester honnête vis-à-vis des
utilisateurs (obligation légale, pas cosmétique).

---

## 10. Questions ouvertes

1. Nombre de tentatives de resoumission avant passage automatique en revue renforcée ?
2. Durée de conservation des photos KYC après vérification réussie (minimisation RGPD) ?
3. Faut-il une alerte automatique (badge visuel) sur les demandes en attente depuis plus de 24h,
   dans l'esprit du SLA déjà appliqué aux litiges ?

---

*Document de travail — sert de base à l'implémentation. À valider avant développement.*
