# Plan de projet — « Salama » (nom provisoire)
### Basé sur PRD v1.0 · Juillet 2026

---

## 0. Objectif de ce document

Traduire le PRD en un plan exécutable : jalons, séquencement, dépendances critiques, ressources, budget indicatif et backlog priorisé. Portée : de la décision de lancement jusqu'à la fin du V1 (MVP).

---

## 1. Principe de séquencement

Trois contraintes structurent l'ordre des tâches, indépendamment des envies produit :

1. **Le juridique bloque le technique.** Le PRD le dit explicitement (§10, §9) : le statut ONSSA/douanes et le fonctionnement du prestataire de paiement au Maroc doivent être validés *avant* d'écrire du code V1. Lancer le dev en parallèle du juridique est le risque n°1 du projet.
2. **Le paiement bloque l'architecture.** Le choix Mangopay vs Stripe Connect (payout Maroc) détermine des pans entiers du backend (KYC, wallets, webhooks). À trancher en premier parmi les décisions techniques.
3. **V0 précède V1 et n'est pas optionnel.** Le PRD prévoit un concierge manuel (landing + WhatsApp) pour valider la demande avant d'investir dans l'app. Sauter cette étape revient à parier le budget V1 sans preuve de traction.

---

## 2. Vue d'ensemble du calendrier (indicatif)

| Phase | Durée | Fenêtre cible | Condition de sortie |
|---|---|---|---|
| Phase A — Cadrage juridique & décisions clés | 3-4 semaines | Juil.–Août 2026 | Statut juridique confirmé BE+MA, prestataire paiement choisi |
| Phase B — V0 Concierge | 6-10 semaines | Août–Oct 2026 | 20-50 transactions manuelles complétées |
| Phase C — V1 MVP (build) | 4-6 mois | Nov 2026–Avr 2027 | App déployée, corridor Bxl↔Casa live |
| Phase D — Lancement V1 & stabilisation | 4-6 semaines | Avr–Mai 2027 | KPIs §8 du PRD suivis en prod |

Le lancement V1 pendant le pic estival (Marhaba, juin–septembre) mentionné en §9 du PRD implique idéalement de viser une sortie **avant juin 2027** — à rebalancer si Phase A prend du retard.

---

## 3. Phase A — Cadrage juridique & décisions clés (bloquant, à faire en premier)

**Ne pas démarrer la Phase B tant que ces points ne sont pas tranchés :**

| # | Décision | Qui | Livrable |
|---|---|---|---|
| A1 | Statut intermédiaire pur : confirmation juridique BE + MA (requalification transporteur/transitaire) | Avocat BE + avocat MA | Note juridique écrite |
| A2 | Liste blanche produits + quantités "usage personnel" par catégorie | Avocat + transitaire douane | Grille de règles validée (source du moteur §4.2) |
| A3 | ONSSA — confirmation exclusion compléments alimentaires en V1 | Conseil réglementaire MA | Note écrite |
| A4 | Mangopay vs Stripe Connect — capacité de payout vers comptes marocains | Analyse technique + juridique | Décision documentée + POC payout |
| A5 | Statut fiscal des gains voyageurs (BE/FR/MA) — ce qui doit être communiqué aux users | Fiscaliste | Texte à intégrer dans CGU/onboarding |
| A6 | Nom de marque définitif — dispo INPI/BOIP + .ma/.be | Fondateurs | Nom validé, domaines réservés |
| A7 | Rédaction CGU (statut intermédiaire, transfert de responsabilité douanière, arbitrage) | Avocat | CGU v1 |

**Dépendances** : A4 conditionne toute l'architecture paiement (Phase C). A2/A3 conditionnent le moteur de règles catalogue (§4.2). Ne pas complexifier : ce sont les seuls blocages durs avant le code.

---

## 4. Phase B — V0 "Concierge" (0-3 mois, budget ~300-500 €)

Objectif du PRD : 20-50 transactions, apprentissage terrain, preuve de demande. Aucune app.

| # | Tâche | Détail |
|---|---|---|
| B1 | Landing page + formulaire de demande | Expéditeur/voyageur remplissent un formulaire simple (Typeform/Tally ou page statique) |
| B2 | Groupe WhatsApp / Telegram de coordination | Canal de matching manuel opéré par l'équipe |
| B3 | Process manuel de "KYC léger" | Vérification pièce d'identité par visio/photo, à la main |
| B4 | Escrow manuel via liens de paiement | Stripe Payment Links ou équivalent, déblocage manuel par l'équipe après confirmation double |
| B5 | Reproduction manuelle du parcours PRD §3 | Vidéo de scellage = vidéo WhatsApp envoyée à l'équipe ; double validation = confirmation manuelle des deux parties |
| B6 | Grille d'arbitrage litige (V0, humaine) | Premier jet de la grille §3 Phase 6, à affiner avec les cas réels |
| B7 | Recrutement manuel des premiers voyageurs | Réseau diaspora, groupes Facebook existants (le PRD identifie ces groupes comme le comportement actuel à capter) |
| B8 | Suivi des métriques V0 | Nombre de transactions, taux de litige, frictions observées, feedback qualitatif |

**Sortie de phase** : rapport d'apprentissage — quels produits posent problème, où les litiges apparaissent, quel % de désintermédiation informelle, quelles frictions dans le parcours. Ce rapport nourrit directement le backlog V1 (§6 ci-dessous).

---

## 5. Phase C — V1 MVP (build)

### 5.1 Décisions techniques préalables (début de phase)

| # | Décision | Dépend de |
|---|---|---|
| C1 | Stack mobile : React Native vs Flutter vs web responsive V0-app | Aucune dépendance bloquante — trancher tôt |
| C2 | Prestataire KYC : Onfido / Ubble / KYC Mangopay | A4 |
| C3 | Architecture escrow (webhooks, états de transaction, réconciliation) | A4 |
| C4 | Hébergement vidéo (stockage chiffré, rétention RGPD) | Choix infra (S3/GCS + chiffrement) |
| C5 | Moteur de règles catalogue (serveur, pas de release app) | A2, A3 |

### 5.2 Modules de build (ordre de dépendance, pas nécessairement l'ordre calendaire — le travail peut se paralléliser par équipe)

1. **Socle** : auth (email/tel + OTP), profils, KYC (§4.1), plafonds progressifs
2. **Catalogue & conformité** (§4.2) : moteur de règles serveur, liste blanche/noire, revue humaine zone grise
3. **Annonces & matching** (§3 Phase 1-2) : création demande, feed filtré par trajet, acceptation
4. **Paiement & escrow** (§4.3) : intégration prestataire, séquestre, libération, commission
5. **Messagerie** (§4.5) : chat in-app, masquage coordonnées, détection désintermédiation
6. **Preuve & traçabilité** (§4.4) : caméra in-app exclusive, horodatage/géoloc, QR double validation, journal d'audit
7. **Récapitulatif douane** (§3 Phase 4) : génération PDF/écran offline
8. **Litiges** (§4.6) : ouverture in-app, upload preuves, back-office arbitrage, SLA
9. **Back-office interne** (§4.7) : file de revue, dashboard fraude, gestion listes, modération
10. **Notifications** (§4.5)

**Note d'architecture** : les modules 4 (paiement), 6 (preuve), et 2 (catalogue) sont les plus sensibles aux décisions Phase A — les développer en dernier dans chaque sprint tant que A2/A3/A4 ne sont pas définitivement clos évite de la reprise.

### 5.3 Transverse (continu pendant Phase C)

- Rédaction/branding UX pour public peu tech (§6 NFR : parcours ≤ 3 écrans par action, gros boutons, vocabulaire simple) — tester avec de vrais utilisateurs peu tech, pas juste l'équipe
- Formation courte obligatoire au premier transport (§5.4) — contenu à écrire en parallèle du dev, pas en fin de phase
- RGPD : registre des traitements, minimisation, droit à l'effacement (§6)
- QA sécurité anti-contournement : tester activement les 5 menaces listées en §5 (substitution post-vidéo, contenu dissimulé, faux KYC, désintermédiation, collusion/fausses contestations, fraude paiement)

---

## 6. Backlog priorisé V1 (issu du PRD + à affiner avec les résultats V0)

**P0 — bloquant pour tout lancement V1**
- KYC + plafonds progressifs
- Moteur liste blanche/noire + revue zone grise
- Escrow (séquestre + libération automatique à double validation)
- Vidéo de scellage in-app + QR double validation (remise et livraison)
- CGU acceptées explicitement (écran dédié §3 Phase 1.3, pas une checkbox)
- Workflow litige basique (ouverture, preuves, arbitrage humain, SLA)

**P1 — nécessaire au lancement mais moins risqué à livrer en second**
- Chat in-app + détection désintermédiation
- Score de fiabilité + badge voyageur confirmé
- Back-office : dashboard fraude, gestion listes
- Récapitulatif douane offline

**P2 — peut suivre en itération rapide post-lancement**
- Notifications avancées
- Notation mutuelle détaillée
- Historique/plafonds affichés en détail

---

## 7. Jalons de suivi (KPIs, cible 6 mois post-V1 — §8 du PRD)

À instrumenter dès le premier jour de prod, pas après coup :

| KPI | Cible |
|---|---|
| Transactions complétées / mois | 150+ |
| Taux de litige | < 5 % |
| Résolution litige < 7 jours | > 90 % |
| Voyageurs récurrents (2+) | > 40 % |
| Désintermédiation estimée | < 15 % |
| NPS | > 50 |
| Délai moyen matching | < 72 h |

Vanity metrics à ignorer explicitement : téléchargements, inscriptions sans transaction.

---

## 8. Risques de planning (au-delà des risques produit déjà listés au PRD §9)

| Risque | Impact sur le plan | Mitigation |
|---|---|---|
| Phase A traîne (juridique lent) | Décale tout le calendrier, rate potentiellement la fenêtre Marhaba | Lancer les demandes juridiques BE+MA en parallèle dès semaine 1, fixer une date de revue à 4 semaines |
| V0 ne produit pas de signal clair (trop peu de transactions) | Ne pas lancer V1 sur budget/conviction seule | Fixer un seuil minimal explicite avant de committer le budget V1 (ex. 20 transactions réelles, pas juste des inscriptions) |
| Choix Mangopay/Stripe Connect retardé | Bloque tout le module paiement, donc une bonne partie du backend | Prioriser un POC payout Maroc en semaine 1-2 de Phase A, avant même la rédaction CGU |
| Sous-estimation du temps de rédaction CGU/juridique | Retarde l'ouverture publique même si l'app est prête | Démarrer la rédaction CGU en parallèle du dev, pas après |

---

## 9. Prochaines actions immédiates (cette semaine)

1. Lancer en parallèle : consultation avocat BE, consultation avocat/conseil MA (A1, A3), POC technique Mangopay + Stripe Connect côté payout Maroc (A4).
2. Rédiger le formulaire et la landing page V0 (B1) — ne dépend d'aucune décision juridique, peut démarrer immédiatement.
3. Identifier et contacter 5-10 voyageurs potentiels dans le réseau diaspora pour le V0 (B7).
4. Trancher le nom de marque et vérifier disponibilité domaines (A6) — non bloquant techniquement mais bloque toute communication publique.

---

*Document de planification dérivé du PRD "Salama" v1.0 (juillet 2026). À mettre à jour après chaque revue de phase.*
