# PRD — Excellence UI/UX Wigofly (« passer à 100 % »)
### Product Requirements Document · v1.0 · Juillet 2026
*Basé sur un audit visuel et code de l'app V1 (desktop 1280, tablette, mobile 375) et sur les heuristiques de Nielsen + WCAG 2.1 AA.*

---

## 1. Contexte et état des lieux

L'app a déjà reçu plusieurs passes UX cette phase : design system « liquid glass » cohérent
(cards, pills, dégradés), responsive 3 paliers (mobile / tablette ≥640 / desktop ≥900 avec
sidebar + SideRail contextuel ≥1200), toasts, skeleton loaders, `:focus-visible`,
`prefers-reduced-motion`, hero de marque sur la connexion (contraste AA vérifié au calcul),
badges de compte proactifs sur les onglets admin, notifications badgées, scroll reset entre
pages, alt sur toutes les images.

**Score honnête estimé : ~75 %.** Ce qui manque n'est plus du polish de surface mais des
écarts structurels : pas d'onboarding, pas de PWA, pas de mode sombre, incohérences
résiduelles (dialogues natifs), micro-accessibilité mobile, et un public cible (« peu tech »,
PRD §6) qui n'est pas encore servi à la hauteur de l'exigence « parcours ≤ 3 écrans, gros
boutons, vocabulaire simple ».

### 1.1 Audit par écran (constats réels, pas théoriques)

| Écran | Forces | Faiblesses constatées |
|---|---|---|
| Connexion | Hero de marque, badges de confiance, modes contextuels | Aucune faiblesse bloquante restante |
| Feed | Matching par trajet lisible, pill trajet supprimable, photos affichées quand présentes | Pas de chips de catégories rapides ; la recherche ne couvre que le titre ; wrap de texte serré sur la méta-ligne mobile (« valeur 60 € » coupé) |
| Nouvel envoi | 3 étapes, validation temps réel, bouton test | Dots d'étapes **sans libellés** (on ne sait pas ce qui vient) ; hint « Interdits : … » **tronqué par ellipsis** (l'info légale la plus importante du formulaire est illisible) ; pas d'aide à la tarification (quel « prix voyageur » mettre ?) |
| Détail annonce | Bloc expéditeur avec badges de confiance, galerie photos | Rémunération + CTA d'acceptation **sous la ligne de flottaison** ; pas de rappel de compatibilité trajet sur cette page |
| Transaction | Timeline 4 étapes exemplaire, avertissement d'inspection, QR réels | Action courante parfois sous la ligne de flottaison ; pas d'indication du **temps écoulé/attendu** par étape ; pas de bouton de partage du récap douane |
| Mes envois | Actions retrait/édition | **`confirm()` natif** pour le retrait — rupture brutale avec le design system |
| Profil | Bannière, stats, avis reçus, RGPD complet | Rien de bloquant |
| Admin | 5 onglets, badges proactifs, skeletons | **`confirm()` natif** pour le retrait de catégorie |
| Global | Design cohérent, transitions | **Pas d'onboarding** (nouvel inscrit → jeté dans le feed sans explication du rôle expéditeur/voyageur) ; **pas de PWA** (aucun manifest — pas d'installation écran d'accueil ni d'icône maskable) ; **pas de mode sombre** ; **pas d'i18n** (public diaspora : FR seulement, ni arabe ni néerlandais) ; cibles tactiles mobiles limites (bottom nav 10.5px de libellé) |

### 1.2 Ce qui est déjà conforme (ne pas re-livrer)

Contraste AA du hero (vérifié au calcul), alt systématiques, `prefers-reduced-motion`,
focus visible clavier, skeletons partout, toasts de confirmation d'action, badge de
notifications, badges d'onglets admin, offline du récap douane + export PDF.

---

## 2. Objectif

Passer de ~75 % à un niveau où **un nouvel utilisateur peu tech complète son premier envoi
sans aide extérieure**, où l'app est **installable et utilisable comme une app native**
(PWA), et où **aucun composant ne casse le langage visuel** (zéro dialogue natif, zéro texte
tronqué, zéro action invisible sans scroll).

---

## 3. Exigences

### P0 — écarts qui font échouer de vrais utilisateurs

| # | Exigence | Critère d'acceptation |
|---|---|---|
| U1 | **Onboarding premier lancement** : 3 écrans max après inscription — « Vous voulez envoyer ou transporter ? », explication du parcours en 4 étapes (escrow → scellage → double validation → paiement), CTA direct vers l'action choisie | Un compte neuf voit l'onboarding une seule fois ; skippable ; le choix route vers `/envois/nouveau` ou la déclaration de trajet |
| U2 | **Libellés d'étapes** sur le formulaire d'envoi (remplacer les dots anonymes) : « Contenu → Photos → Trajet & prix » | Chaque étape nommée, étape courante mise en évidence, étapes passées cliquables pour revenir |
| U3 | **Fin du texte tronqué** : le hint « Interdits : … » devient un lien « Voir la liste complète » ouvrant la liste noire en bottom-sheet/modal | Aucune ellipsis sur du contenu réglementaire ; liste noire complète consultable sans quitter le formulaire |
| U4 | **CTA au-dessus de la ligne de flottaison** sur détail d'annonce et transaction : bloc rémunération + bouton principal sticky en bas d'écran mobile | Sur 375×667 (petit mobile), l'action principale est visible sans scroll |
| U5 | **Remplacer les 2 `confirm()` natifs** (retrait d'annonce, retrait de catégorie) par le composant modal du design system avec bouton destructif explicite | Zéro `confirm(`/`alert(`/`prompt(` dans src/ |
| U6 | **Cibles tactiles ≥ 44×44 px** sur mobile (bottom nav, pwd-toggle, croix de pill trajet, étoiles de notation) | Audit tactile passé sur tous les éléments interactifs ; libellés bottom nav ≥ 11px |
| U7 | **Aide à la tarification** : suggestion de fourchette de rémunération voyageur basée sur le poids (règle simple côté client, ex. 2–4 €/kg), affichée sous le champ | Le champ prix n'est plus un choix à l'aveugle |

### P1 — passage au niveau « app native »

| # | Exigence | Critère d'acceptation |
|---|---|---|
| U8 | **PWA installable** : manifest.json (nom, icônes 192/512 maskable, theme_color, display standalone) + service worker minimal (cache statique app-shell) | Lighthouse PWA installable ; « Ajouter à l'écran d'accueil » propose la vraie icône Wigofly |
| U9 | **Mode sombre** : variables CSS dupliquées sous `prefers-color-scheme: dark` + toggle manuel persisté ; le glass design s'adapte (fonds sombres translucides) | Tous les écrans lisibles en sombre, contrastes AA re-vérifiés au calcul comme pour le hero |
| U10 | **Temporalité visible sur les transactions** : « il y a 2 h » sur chaque étape franchie de la timeline, et rappel du SLA litige déjà existant remonté au niveau de la card | Un utilisateur sait depuis combien de temps sa transaction attend l'autre partie |
| U11 | **Recherche élargie + chips de catégories** dans le feed : la recherche couvre titre + description + catégorie ; rangée de chips (Argan, Safran, Miel…) au-dessus des résultats | Filtrer par catégorie = 1 tap |
| U12 | **États vides actionnables** partout : chaque état vide propose le CTA qui le résout (feed vide → « Déclarer un trajet », envois vide → « Publier un envoi ») | Zéro état vide sans action |
| U13 | **Partage du récap douane** : bouton partage natif (`navigator.share`) en plus du PDF, pour l'envoyer au voyageur en un tap | Fonctionne sur mobile ; fallback copie de lien sinon |

### P2 — finitions différenciantes

| # | Exigence | Critère d'acceptation |
|---|---|---|
| U14 | **i18n socle** : mécanisme t() + bascule FR/AR (RTL) — l'arabe d'abord, le public cible étant la diaspora marocaine ; NL ensuite (Belgique) | Layout RTL non cassé sur les 5 écrans principaux. **Livré (socle)** : mécanisme t() sans dépendance, dictionnaires FR/AR, sélecteur de langue persisté, dir=rtl appliqué avant le rendu, et surfaces de premier contact traduites (onboarding, navigation, en-tête, réglages). **Suivi** : extraction des chaînes écran par écran de l'app authentifiée (feed, formulaires, transactions, admin) + NL. |
| U15 | **Photos sur les annonces de démo** : le seed n'a pas de photos, donc la démo montre des icônes de catégorie au lieu du vrai rendu photo du feed — trompeur en présentation | Les annonces seed ont 1–2 photos réalistes |
| U16 | **Micro-animations de progression** : confettis/checkmark animé à la libération de l'escrow (le moment de gratification du produit), transition de la timeline à chaque étape franchie | Respecte `prefers-reduced-motion` |
| U17 | **Undo sur actions réversibles** : le retrait d'annonce affiche un toast « Annonce retirée — Annuler » (5 s) au lieu d'être définitif immédiatement | Pattern toast-undo disponible dans Toast.jsx |
| U18 | **Page 404 in-app** habillée (actuellement redirect silencieux vers `/`) | Une URL invalide explique et propose de revenir |

---

## 4. Mesure (avant/après)

| Métrique | Comment | Cible |
|---|---|---|
| Taux de complétion premier envoi sans abandon | Instrumentation événements (création commencée → publiée) | > 80 % |
| Temps médian de première publication | idem | < 4 min |
| Lighthouse Accessibility | CI ou audit manuel | ≥ 95 |
| Lighthouse PWA | idem | Installable |
| Zéro dialogue natif / texte tronqué | grep + revue visuelle | 0 |
| Cibles tactiles < 44px | audit | 0 |

---

## 5. Non-objectifs

- Refonte du design system (le liquid glass reste — il est cohérent et apprécié)
- App mobile native (React Native) — la PWA couvre le besoin V1
- Notifications push serveur (nécessite une infra web-push ; V2)
- Traduction complète AR/NL du contenu marketing statique (seule l'app est concernée par U14)

---

## 6. Séquencement recommandé

1. **Sprint 1 (P0)** : U5 puis U3 (petits, nettoient les ruptures), U2, U6, U7, U4, U1
2. **Sprint 2 (P1)** : U8 (PWA d'abord — dépendance des icônes déjà prêtes), U12, U11, U10, U13, U9 (mode sombre en dernier du sprint : le plus gros chantier CSS)
3. **Sprint 3 (P2)** : U15, U18, U17, U16, U14 (i18n en dernier — le plus structurant)

Chaque exigence livrée avec vérification visuelle mobile + desktop et, quand c'est mesurable
au calcul (contrastes, tailles tactiles), vérifiée au calcul — pas à l'œil.

---

*Document dérivé de l'audit UI/UX de juillet 2026. À mettre à jour après chaque sprint.*
