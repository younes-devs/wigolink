# PRD - Navigation mobile adaptative

## 1. Contexte

La navigation mobile principale de Wigofly reste visible en permanence afin de
garantir un accès direct à Trajets, En cours, Enregistrés, Messagerie et Profil.
Sa hauteur normale prend toutefois une place importante pendant la lecture des
listes et des pages longues.

## 2. Objectif

Gagner de l'espace utile pendant le défilement sans cacher la navigation, sans
déplacer le contenu et sans réduire la taille des zones tactiles sous 44 px.

## 3. Comportement retenu

- État normal au chargement, après un changement de page et près du haut ou du
  bas du contenu.
- Passage en mode compact après 24 px cumulés de défilement vers le bas.
- En mode compact, les cinq icônes et leurs badges restent visibles; seuls les
  libellés sont repliés.
- Retour immédiat à l'état normal après 12 px cumulés vers le haut.
- Retour automatique à l'état normal après 600 ms sans défilement.
- Aucun comportement adaptatif sur desktop à partir de 900 px.
- Aucun repli sur une page trop courte pour défiler.

Cette approche est préférable à un menu entièrement masqué: l'utilisateur garde
ses repères, les notifications restent visibles et chaque destination demeure
accessible en une pression.

## 4. Cas de protection

Le menu reste normal ou suit les règles existantes de masquage pendant:

- l'ouverture d'une fenêtre modale ou de l'onboarding;
- l'utilisation des filtres de trajets en plein écran;
- la publication guidée d'un trajet;
- la vérification KYC;
- une conversation ouverte;
- l'ouverture du clavier virtuel.

Un focus clavier dans la navigation la rétablit également dans son état normal.

## 5. UI et accessibilité

- Cinq zones stables de largeur égale.
- Cible tactile minimale de 44 x 44 px dans les deux états.
- Badges non masqués et positionnés sur leur icône.
- Libellé accessible conservé sur chaque lien, même en mode compact.
- Prise en charge du français, de l'arabe RTL et du néerlandais.
- Animation courte de 180 ms, supprimée avec `prefers-reduced-motion`.
- Réserve basse calculée sur la hauteur normale pour éviter tout saut de page.
- Respect de `env(safe-area-inset-bottom)` sur les appareils iOS.

## 6. Contraintes techniques

- Écoute passive du conteneur `.content`.
- Calcul regroupé avec `requestAnimationFrame`.
- Seuils et machine d'intention isolés dans un module pur testable.
- `ResizeObserver` pour les changements de hauteur du contenu.
- Détection du clavier avec `visualViewport`.
- Nettoyage de tous les timers, observers et listeners au démontage.

## 7. Critères d'acceptation

1. Le menu ne réagit pas à un petit tremblement de défilement.
2. Il se compacte après un mouvement volontaire vers le bas.
3. Il se rouvre vers le haut ou après 600 ms d'arrêt.
4. Il ne se compacte ni en haut, ni en bas, ni sur une page courte.
5. Les cinq destinations et badges restent utilisables dans les deux états.
6. Aucun contenu final n'est caché derrière le menu.
7. Le desktop conserve exactement sa navigation latérale.
8. Les modes clair, sombre, RTL et mouvement réduit restent fonctionnels.

## 8. Mesure après publication

Surveiller pendant deux semaines:

- les clics par destination dans chaque état;
- les retours arrière juste après un changement de page;
- les erreurs JavaScript liées au scroll;
- les retours utilisateurs sur la lisibilité et l'espace gagné.

Un test A/B n'est pas nécessaire avant d'avoir un trafic significatif. Le
comportement pourra être ajusté en changeant uniquement les constantes de seuil.
