# PRD - Paiements et versements Wigolink

## Decision produit

Wigolink utilise Stripe Checkout pour encaisser l'expediteur. Les versements
voyageurs sont traites manuellement par l'equipe apres confirmation de la
livraison. Stripe Connect, les comptes connectes et les transferts automatiques
ne font pas partie du parcours actif.

## Parcours expediteur

1. Le voyageur confirme la demande et possede un compte de versement verifie.
2. L'expediteur voit le prix du transport, les frais Wigolink et le total.
3. Il est redirige vers Stripe Checkout pour payer.
4. Le webhook signe confirme le paiement et debloque la remise.
5. Un echec, une expiration ou un litige conserve un historique auditable.

Wigolink ne collecte et ne stocke aucune donnee de carte.

## Parcours voyageur

1. Le voyageur enregistre son pays, le titulaire et ses coordonnees bancaires.
2. Les donnees bancaires sont chiffrees cote serveur; seules les informations
   masquees sont retournees au navigateur.
3. Apres livraison, une demande de versement est creee une seule fois.
4. L'equipe effectue le virement et saisit sa reference dans l'administration.
5. Le voyageur voit le statut sans acceder aux outils internes.

## Regles financieres

Le devis fige le prix accepte, les frais factures a chaque partie, le montant
encaisse et le net voyageur. Le serveur recalcule ces montants et n'accepte
jamais un total fourni par le navigateur. La politique de frais est versionnee
dans chaque paiement afin de conserver un historique exact.

## Securite et conformite

- webhook Stripe signe et deduplique;
- Checkout cree avec une cle d'idempotence;
- coordonnees bancaires chiffrees avec une cle serveur distincte;
- aucune coordonnee bancaire dans les logs ou les audits;
- autorisation serveur sur chaque paiement, versement et remboursement;
- versement admin journalise avec operateur, date et reference;
- aucune promesse de sequestre reglemente dans l'interface ou les contrats.

## Donnees historiques

Les colonnes `stripe_transfer_id`, certains etats `transfer_status`, la table
`stripe_connected_accounts` et le champ operationnel `escrow` peuvent rester
dans le schema pour relire les anciens dossiers. Le nouveau code ne cree plus de
compte connecte ni de transfert Stripe. Leur suppression physique necessitera
une migration de donnees separee et verifiee.

## Critere de mise en production

- paiement Stripe test complet et webhook valide;
- livraison creant exactement une demande de versement;
- affichage admin des donnees bancaires uniquement pour un administrateur;
- reference obligatoire pour marquer un virement comme envoye;
- remboursement refuse apres virement tant que les fonds ne sont pas recuperes;
- tests, lint, i18n et build verts.
