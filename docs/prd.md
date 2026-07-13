# PRD — Plateforme de transport collaboratif Belgique/France ↔ Maroc
### Product Requirements Document · v1.0 · Juillet 2026
*Nom de marque : « Wigofly »*

---

## 1. Vision et contexte

### 1.1 Problème
La diaspora marocaine de Belgique et de France (2M+ de personnes) échange déjà quotidiennement des produits avec le Maroc via des voyageurs, de façon informelle (groupes Facebook, WhatsApp, bouche-à-oreille) : sans sécurité, sans paiement garanti, sans traçabilité, et avec un risque réel pour le voyageur qui transporte sans vérifier.

### 1.2 Solution
Une plateforme mobile qui **formalise et sécurise ce comportement existant** : mise en relation expéditeurs ↔ voyageurs, paiement séquestré (escrow), vérification d'identité, preuve vidéo du contenu, double validation à chaque étape, et résolution de litiges encadrée.

### 1.3 Positionnement
- **Corridor unique au lancement** : Bruxelles ↔ Casablanca (extension ensuite : Paris, Lille, Anvers ↔ Rabat, Tanger, Agadir).
- **Sens prioritaire** : Maroc → Europe (produits de terroir : argan, miel, épices, safran).
- **Catégorie** : produits naturels/terroir sur liste blanche stricte. Pas de compléments alimentaires vers le Maroc en V1 (risque ONSSA).
- **Statut** : intermédiaire pur (marketplace). La plateforme ne manipule jamais la marchandise ni les fonds (escrow via prestataire agréé).

### 1.4 Ce que le produit N'EST PAS (non-goals V1)
- Pas un transporteur ni un transitaire.
- Pas de livraison à domicile, pas de points relais (phase 2+).
- Pas de multi-corridors ni de couverture mondiale.
- Pas d'envoi "à l'aveugle" : tout contenu est vu, décrit, filmé et vérifié.
- Pas de gestion directe des fonds : escrow porté par un prestataire de paiement agréé (Mangopay / Stripe Connect).

---

## 2. Personas

**P1 — L'expéditrice (Fatima, 52 ans, Casablanca)**
Veut envoyer des produits du terroir à ses enfants en Belgique. Peu tech, utilise WhatsApp. A besoin de simplicité et de confiance ("est-ce que mon colis arrivera ?").

**P2 — Le voyageur (Karim, 28 ans, Bruxelles, étudiant)**
Fait Bruxelles-Casa 4×/an. Veut amortir ses billets. A besoin de : gain clair, zéro risque légal, garantie d'être payé, droit de refuser sans pénalité.

**P3 — Le destinataire/payeur (Mehdi, 30 ans, Bruxelles)**
Commande et paie souvent pour la famille. Veut du suivi, une preuve du contenu, un recours si problème.

---

## 3. Parcours utilisateur principal (happy path)

### Phase 0 — Onboarding (une fois)
| # | Étape | Exigence |
|---|---|---|
| 0.1 | Inscription email/téléphone + OTP | Obligatoire |
| 0.2 | KYC : pièce d'identité + selfie liveness (via prestataire : Onfido, Ubble, ou KYC Mangopay) | Bloquant avant toute transaction |
| 0.3 | Plafonds progressifs : nouveau compte = max 100 € de valeur, 1 transaction active | Automatique, relevé avec l'historique |

### Phase 1 — Création de la demande d'envoi
| # | Étape | Exigence |
|---|---|---|
| 1.1 | Formulaire : produit, photos, poids, valeur déclarée, villes, dates | Champs obligatoires |
| 1.2 | **Filtre liste blanche/noire automatique** : catégorie autorisée → publication ; inconnue → revue humaine ; interdite → refus avec explication | Bloquant |
| 1.3 | Écran dédié : franchise douanière applicable, quantité max "usage personnel", responsabilités — acceptation explicite (pas une checkbox CGU) | Bloquant |
| 1.4 | Prix : rémunération voyageur proposée + commission plateforme (15-20 %) affichée en transparence | |

### Phase 2 — Matching et accord
| # | Étape | Exigence |
|---|---|---|
| 2.1 | Les voyageurs avec trajet/dates compatibles voient l'annonce (feed filtré par trajet déclaré) | |
| 2.2 | Le voyageur voit TOUT avant d'accepter : produit, photos, valeur, identité vérifiée, notes de l'expéditeur | |
| 2.3 | Acceptation → **paiement immédiatement séquestré** (escrow prestataire). Aucun contact direct débloqué avant l'accord | Coordonnées masquées avant accord |
| 2.4 | Messagerie in-app pour organiser le rendez-vous. Détection des tentatives de désintermédiation (numéros de tel, "whatsapp") → avertissement | |

### Phase 3 — Remise du colis (moment critique n°1)
| # | Étape | Exigence |
|---|---|---|
| 3.1 | Rendez-vous physique, lieu public suggéré par l'app | |
| 3.2 | **Vidéo de scellage in-app** : produit + emballage en cours de fermeture + code transaction visible dans le cadre. Horodatée, géolocalisée, caméra in-app uniquement (pas d'upload galerie) | Bloquant |
| 3.3 | **Vérification physique par le voyageur** : il ouvre, inspecte, compare. Règle affichée : *"Ne transportez jamais ce que vous n'avez pas vu ouvert."* Refus possible sans pénalité à ce stade | Éducatif + contractuel |
| 3.4 | **Double validation** : scan QR croisé entre les deux téléphones → statut "en transit". Bascule contractuelle de responsabilité sur le voyageur | Bloquant |

### Phase 4 — Transport
| # | Étape | Exigence |
|---|---|---|
| 4.1 | Récapitulatif "douane" généré : description, valeur, vidéo, identité expéditeur — montrable en cas de contrôle | PDF/écran accessible hors ligne |
| 4.2 | Notification au destinataire à la date de vol déclarée | Optionnel |

### Phase 5 — Livraison (moment critique n°2)
| # | Étape | Exigence |
|---|---|---|
| 5.1 | Rendez-vous voyageur ↔ destinataire, lieu public | |
| 5.2 | Inspection par le destinataire, comparaison avec la vidéo de scellage (accessible dans l'app) | |
| 5.3 | **Double validation finale** : scan QR croisé | Bloquant |
| 5.4 | **Libération automatique de l'escrow** vers le voyageur (minutes) | |
| 5.5 | Notation mutuelle des trois parties | Dans les 7 jours |

### Phase 6 — Litiges (unhappy paths)
| Cas | Traitement |
|---|---|
| Destinataire conteste | Ne valide pas → litige sous 48h + photos. Escrow gelé. Arbitrage : état ≠ vidéo = responsabilité voyageur ; conforme vidéo mais ≠ annonce = responsabilité expéditeur |
| Voyageur no-show | Remboursement intégral escrow + pénalité score |
| Expéditeur no-show | Annulation sans frais pour le voyageur + pénalité score expéditeur |
| Saisie douane | Documentation in-app (photo PV). Risque porté par l'expéditeur si produit conforme à la déclaration (CGU) |
| Non-réponse >72h après date de livraison prévue | Escalade support, gel prolongé, procédure de contact |

**Workflow litige** : ouverture (48h) → soumission de preuves des deux parties (72h) → arbitrage humain selon grille écrite → décision + libération/remboursement. Décisions loggées pour cohérence.

---

## 4. Fonctionnalités par module

### 4.1 Identité & confiance
- KYC obligatoire (prestataire spécialisé, détection faux documents + liveness)
- Corrélation appareil / téléphone / moyen de paiement (anti multi-comptes)
- Score de fiabilité public : transactions réussies, taux d'annulation, notes
- Plafonds progressifs (valeur, transactions simultanées)
- Badge "voyageur confirmé" (5+ livraisons réussies)

### 4.2 Catalogue & conformité
- **Liste blanche V1** (exemples) : huile d'argan scellée, miel conditionné, épices emballées d'origine, safran, amlou, huiles essentielles scellées, dattes, cosmétiques naturels scellés — quantités "usage personnel" plafonnées par transaction
- **Liste noire** : compléments alimentaires/gélules, médicaments, produits frais/périssables non scellés, liquides non scellés d'origine, tabac, alcool, électronique, tout produit non identifiable, argent/valeurs, documents officiels
- **Zone grise** → revue humaine obligatoire avant publication
- Affichage automatique des franchises douanières par corridor
- Moteur de règles mis à jour côté serveur (pas de release app nécessaire)

### 4.3 Paiement & escrow
- Intégration Mangopay ou Stripe Connect (la plateforme ne détient jamais les fonds)
- Séquestre à l'accord, libération à la double validation finale
- Commission plateforme 15-20 % prélevée à la libération
- Anti-fraude paiement du prestataire + plafonds nouveaux comptes
- Remboursements automatisés selon l'issue du litige

### 4.4 Preuve & traçabilité
- Caméra in-app exclusive pour la vidéo de scellage (blocage galerie)
- Horodatage + géolocalisation + code transaction incrusté
- QR codes de transaction uniques, scan croisé aux deux remises
- Journal d'événements immuable par transaction (audit trail)
- Stockage vidéo chiffré, rétention alignée RGPD (durée litige + délai légal)

### 4.5 Messagerie & notifications
- Chat in-app, coordonnées masquées jusqu'à l'accord
- Détection de désintermédiation (patterns : numéros, emails, "hors app")
- Notifications push aux transitions d'état

### 4.6 Litiges & support
- Ouverture in-app avec upload de preuves
- Back-office d'arbitrage avec grille de décision et historique
- SLA : première réponse < 24h, résolution cible < 7 jours

### 4.7 Back-office (interne)
- File de revue humaine (produits zone grise, KYC douteux, litiges)
- Dashboard fraude : comptes liés, patterns anormaux, transactions atypiques
- Gestion listes blanche/noire
- Modération des annonces et des avis

---

## 5. Sécurité & anti-contournement (design principles)

1. **Aucune transition d'état unilatérale** : chaque étape (accord → remise → transit → livraison → paiement) exige les deux parties présentes.
2. **L'argent ne bouge qu'au dernier maillon**, jamais avant.
3. **Superposition des couches** : KYC + escrow + vidéo + vérification humaine + scoring + plafonds. Aucune couche n'est censée être étanche seule.
4. **Le voyageur est la dernière ligne de défense** : le produit doit le responsabiliser (messages, formation courte obligatoire au premier transport), jamais l'endormir avec un faux "tout est vérifié".
5. **Menaces couvertes** : substitution post-vidéo (parade : vérification à la remise + responsabilité), contenu dissimulé (parade : liste blanche de produits simples + éducation), faux KYC (prestataire spécialisé + corrélations), désintermédiation (valeur verrouillée dans l'app + détection), collusion/fausses contestations (double validation + détection comptes liés + fenêtre courte), fraude paiement (prestataire + plafonds).

---

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Plateformes | iOS + Android (React Native ou Flutter) ; V0 possible en web app responsive |
| Langues | Français (V1), arabe/darija (V1.1), néerlandais (V2) |
| RGPD | Registre des traitements, minimisation, droit à l'effacement, DPO si volume ; données KYC chez le prestataire, pas en propre |
| Disponibilité | Best effort V1 ; fonctionnement offline du récapitulatif douane |
| Accessibilité | Public peu tech : parcours ≤ 3 écrans par action, gros boutons, vocabulaire simple |
| Juridique | CGU rédigées par avocat (statut intermédiaire, transfert responsabilité douanière, arbitrage) ; cohérence CGU ↔ pratique réelle |

---

## 7. Phasage

### V0 — "Concierge" (0-3 mois, budget ~300-500 €)
Pas d'app. Landing page + formulaire + groupe WhatsApp. Matching, escrow (liens de paiement) et arbitrage gérés manuellement par l'équipe. Objectif : 20-50 transactions, apprentissage terrain, preuve de demande.

### V1 — MVP (3-9 mois)
App (ou web app) avec : KYC, annonces + liste blanche, matching, chat, escrow prestataire, vidéo de scellage, QR double validation, litiges basiques, back-office minimal. Corridor unique Bruxelles↔Casablanca, sens Maroc→Europe.

### V1.1
Arabe/darija, notation avancée, badge voyageur, sens Europe→Maroc sur liste blanche restreinte (hors compléments).

### V2
Nouveaux corridors (Paris, Lille, Anvers ↔ Tanger, Rabat, Agadir), points relais partenaires (pesée/vérification optionnelle), assurance premium, API partenaires (épiceries, vendeurs de terroir).

---

## 8. KPIs

| KPI | Cible 6 mois post-V1 |
|---|---|
| Transactions complétées / mois | 150+ |
| Taux de litige | < 5 % |
| Taux de résolution litige < 7 jours | > 90 % |
| Voyageurs récurrents (2+ transports) | > 40 % |
| Taux de désintermédiation estimé | < 15 % |
| NPS | > 50 |
| Délai moyen matching (annonce → accord) | < 72 h |

*Vanity metrics à ignorer : téléchargements, inscriptions sans transaction.*

---

## 9. Risques produit majeurs

| Risque | Impact | Mitigation |
|---|---|---|
| Requalification juridique (ONSSA/douanes) | Critique | Liste blanche stricte, quantités usage personnel, conseil juridique BE+MA avant lancement |
| Incident grave médiatisé (saisie, contenu illicite) | Critique | Couches de sécurité, éducation voyageur, réaction de crise préparée |
| Pas de masse critique (œuf/poule) | Élevé | Corridor unique, recrutement manuel des voyageurs, lancement pendant le pic estival (Marhaba) |
| Désintermédiation massive | Moyen | Escrow + assurance exclusifs in-app, friction minimale sur la commission |
| Dépendance au prestataire de paiement | Moyen | Contrat cadré, architecture permettant la migration |

---

## 10. Questions ouvertes (à trancher avant V1)

1. Nom et marque (vérification INPI/BOIP + disponibilité .ma/.be).
2. Mangopay vs Stripe Connect (fonctionnement au Maroc côté payout ? — point juridique/technique clé à valider en premier).
3. Payout des voyageurs résidant au Maroc : virement local, portefeuille, partenaire de transfert ?
4. Assurance partenaire dès V1 ou V1.1 ?
5. Politique exacte des quantités max par catégorie (à valider avec transitaire).
6. Statut fiscal des gains des voyageurs (information à fournir aux utilisateurs, BE/FR/MA).

---

*Document de travail. Les volets juridiques (CGU, ONSSA, douanes, paiement) doivent être validés par des conseils qualifiés avant tout développement de la V1.*
