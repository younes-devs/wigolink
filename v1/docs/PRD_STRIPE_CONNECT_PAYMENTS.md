# PRD - Paiements Stripe Connect Wigolink

Statut: implemente. Mode pilote de versement manuel retenu pour le Maroc,
la Belgique et la France; Stripe Connect reste disponible comme rail futur.

## Decision pilote: encaissement Stripe, versement manuel

Stripe encaisse toujours le paiement de l'expediteur et confirme la charge par
webhook. Apres confirmation de la livraison, Wigolink cree une demande de
versement interne au lieu de lancer automatiquement un transfert Connect.

Le voyageur enregistre avant le paiement:

- son pays de versement;
- le nom du titulaire identique au KYC;
- sa banque;
- un RIB marocain de 24 chiffres et son telephone, ou un IBAN et un BIC pour
  la Belgique et la France.

Les coordonnees completes sont chiffrees en AES-256-GCM. Le voyageur ne revoit
que les quatre derniers caracteres. Un administrateur authentifie consulte la
file apres livraison, effectue le virement depuis un compte professionnel puis
enregistre la reference bancaire. Cette derniere action marque le versement
comme effectue et clot l'operation dans une seule transaction SQL.

Ce pilote ne constitue pas un portefeuille utilisateur, un retrait a la
demande ou un service de sequestre. Il doit etre valide juridiquement et
comptablement avant les premiers paiements reels.

## 1. Objectif

Remplacer le paiement simule de Wigolink par un paiement reel Stripe Connect
pour une marketplace. L'expediteur paie le prix demande par le voyageur plus
les frais de service de sa tranche. Le voyageur recoit le prix demande moins
les memes frais. Wigolink conserve donc deux fois les frais de la tranche avant
les frais Stripe, les remboursements, les litiges et les taxes.

Le paiement doit rester sous le controle du serveur. Le voyageur n'est paye
qu'apres la validation de la livraison. Wigolink ne doit jamais presenter ce
fonctionnement comme un compte sequestre reglemente ou un service bancaire.
Le libelle utilisateur recommande est "paiement protege".

## 2. Regle tarifaire

Tous les calculs sont effectues en centimes entiers.

La tranche est determinee uniquement a partir du prix accepte par le voyageur,
avant ajout des frais Wigolink:

| Prix accepte `x` | Frais expediteur | Frais voyageur | Revenu brut Wigolink |
| --- | ---: | ---: | ---: |
| `x < 50 EUR` | 1,50 EUR | 1,50 EUR | 3,00 EUR |
| `50 EUR <= x < 100 EUR` | 3,00 EUR | 3,00 EUR | 6,00 EUR |
| `x >= 100 EUR` | 6,00 EUR | 6,00 EUR | 12,00 EUR |

```text
prix_voyageur       = prix accepte entre les deux membres
frais_par_personne  = 150 si prix_voyageur < 5000 centimes
                       300 si 5000 <= prix_voyageur < 10000 centimes
                       600 si prix_voyageur >= 10000 centimes
frais_expediteur    = frais_par_personne
frais_voyageur      = frais_par_personne
montant_encaisse    = prix_voyageur + frais_expediteur
montant_transfere   = prix_voyageur - frais_voyageur
revenu_brut_wigolink = frais_expediteur + frais_voyageur
revenu_net_wigolink = revenu_brut_wigolink - frais Stripe
                      - couts de remboursement/litige
```

Exemples:

| Prix accepte | L'expediteur paie | Le voyageur recoit | Wigolink brut |
| ---: | ---: | ---: | ---: |
| 10 EUR | 11,50 EUR | 8,50 EUR | 3,00 EUR |
| 50 EUR | 53,00 EUR | 47,00 EUR | 6,00 EUR |
| 100 EUR | 106,00 EUR | 94,00 EUR | 12,00 EUR |

Le prix minimum accepte doit etre superieur a 1,50 EUR. Pour un document vendu
3 EUR, l'expediteur paierait 4,50 EUR et le voyageur ne recevrait que 1,50 EUR.
Cette consequence doit etre explicitement acceptee avant la mise en production.

## 3. Choix Stripe

### 3.1 Configuration retenue

- Stripe Connect en mode Marketplace.
- Comptes connectes de type recipient pour les voyageurs.
- Capacite minimale demandee: reception de transferts.
- Onboarding heberge par Stripe pour les coordonnees bancaires et les exigences
  reglementaires.
- Paiement par Stripe Checkout ou Payment Element, cree exclusivement par le
  serveur Wigolink.
- Flux financier "Separate charges and transfers".
- Wigolink supporte les frais Stripe, remboursements, litiges et soldes negatifs.

Le modele Marketplace est deja active dans l'environnement de test Stripe. Un
compte connecte de test a ete initialise. Aucun paiement reel ni code de
production n'a ete active par ce document.

### 3.2 Pourquoi ne pas utiliser une destination charge

Une destination charge transfere normalement la part du voyageur des la
capture du paiement. Wigolink doit au contraire attendre la remise et la
livraison. Le paiement est donc encaisse sur le compte plateforme, puis un
transfert de la part voyageur est cree seulement apres la confirmation finale.

Stripe indique que les frais de traitement, remboursements et litiges sont
debites du solde plateforme avec ce flux. Cela correspond a la demande que les
frais Stripe soient absorbes par la marge Wigolink.

### 3.3 Limite importante: Maroc

Le compte plateforme est belge. Stripe permet en libre-service les transferts
Connect entre les Etats-Unis, le Royaume-Uni, l'EEE, le Canada et la Suisse.
Les versements Connect vers des voyageurs domicilies au Maroc ne doivent pas
etre declares disponibles tant que Stripe n'a pas confirme leur eligibilite
pour ce compte. La disponibilite de Global Payouts au Maroc ne garantit pas que
le meme flux Connect marketplace soit automatiquement autorise.

Le lancement doit donc prevoir l'un des deux perimetres suivants:

1. voyageurs payes dans une zone Connect autorisee au lancement;
2. Maroc active uniquement apres confirmation ecrite de Stripe.

## 4. Parcours utilisateur

### 4.1 Voyageur

1. Le voyageur accepte une demande.
2. Avant de pouvoir recevoir de l'argent, il ouvre "Configurer mes versements".
3. Wigolink cree ou retrouve son compte connecte Stripe.
4. Stripe collecte les informations bancaires et reglementaires dans un
   composant securise integre a Wigolink. Une page Stripe hebergee reste
   disponible uniquement en solution de secours.
5. Wigolink n'autorise l'acceptation payable que lorsque la capacite de
   transfert est active.
6. Apres livraison validee, le voyageur voit "Versement de 8,50 EUR en cours".
7. Les statuts suivants sont visibles: a configurer, en verification, pret,
   transfert en cours, verse, echec.

Le KYC Wigolink ne remplace pas l'onboarding financier Stripe.

### 4.2 Expediteur

1. La page de paiement affiche une decomposition avant confirmation:
   prix voyageur, frais de service Wigolink et total.
2. Stripe collecte le paiement de 11,50 EUR.
3. L'operation ne passe a "payee" qu'apres un webhook Stripe verifie.
4. Apres paiement, le parcours de remise et de livraison existant continue.
5. En cas d'annulation eligible avant transfert, le remboursement est lance
   depuis le serveur et son statut est affiche.

## 5. Cycle financier

```text
demande_acceptee
  -> paiement_requis
  -> paiement_en_cours
  -> paiement_confirme
  -> remise_confirmee
  -> en_transport
  -> livraison_confirmee
  -> transfert_en_attente
  -> transfert_envoye
  -> versement_confirme
```

Etats d'exception:

- paiement_echoue;
- paiement_expire;
- remboursement_en_cours;
- rembourse;
- transfert_echoue;
- litige_ouvert;
- fonds_geles;
- litige_gagne;
- litige_perdu.

Le transfert n'est jamais declenche par le navigateur. Il est declenche par une
commande serveur idempotente apres validation de la livraison et verification
de l'absence de litige bloquant.

## 6. Regles de fonds

- Le PaymentIntent ou la Checkout Session encaisse le total expediteur.
- La charge reste rattachee a une seule operation Wigolink.
- Le transfert final envoie exactement la part voyageur au compte connecte.
- Le transfert reference la charge d'origine avec `source_transaction`.
- Les versements automatiques du compte plateforme ne doivent pas vider le
  solde necessaire aux transferts futurs.
- Une reserve operationnelle couvre remboursements, chargebacks et soldes
  negatifs.
- Avant transfert: remboursement direct depuis le compte plateforme.
- Apres transfert: tentative de reversal du transfert, puis remboursement.
- En litige: aucun nouveau transfert; les fonds de l'operation sont marques
  geles dans le registre Wigolink.

## 7. Modele de donnees cible

Les valeurs monetaires reelles ne doivent plus utiliser les nombres decimaux
JavaScript du module d'escrow simule. Elles sont stockees en centimes entiers.

### 7.1 Compte de versement

```text
stripe_connected_accounts
- user_id unique
- stripe_account_id chiffre ou protege cote serveur
- country
- onboarding_status
- transfers_capability_status
- requirements_due_count
- payouts_enabled
- last_synced_at
- created_at
- updated_at
```

### 7.2 Paiement d'operation

```text
operation_payments
- operation_id unique
- currency
- traveler_price_cents
- sender_fee_cents
- traveler_fee_cents
- charged_amount_cents
- traveler_transfer_cents
- platform_gross_cents
- stripe_payment_intent_id unique
- stripe_checkout_session_id unique nullable
- stripe_charge_id unique nullable
- stripe_transfer_id unique nullable
- stripe_refund_id unique nullable
- payment_status
- transfer_status
- fee_policy_version
- pricing_snapshot_json
- paid_at
- transferred_at
- refunded_at
- created_at
- updated_at
```

### 7.3 Evenements Stripe

```text
stripe_webhook_events
- stripe_event_id unique
- event_type
- livemode
- connected_account_id nullable
- payload_hash
- processing_status
- attempts
- processed_at
- last_error
- created_at
```

Ce registre garantit l'idempotence et empeche un webhook rejoue de payer deux
fois le meme voyageur.

## 8. API serveur

- `POST /api/stripe/connect/account`: cree ou retrouve le compte voyageur.
- `POST /api/stripe/connect/account-session`: cree une session ephemere liee
  au seul compte connecte du membre authentifie pour l'onboarding integre.
- `POST /api/stripe/connect/onboarding-link`: genere un lien Stripe a usage
  unique avec URL de retour et de rafraichissement HTTPS.
- `GET /api/stripe/connect/status`: retourne uniquement un statut applicatif,
  jamais les donnees bancaires.
- `POST /api/operations/:id/pay`: recalcule les montants depuis la base et
  cree le paiement Stripe.
- `POST /api/stripe/webhook`: verifie la signature avant toute mutation.
- `POST /api/admin/operations/:id/refund`: action admin auditee et idempotente.
- Le transfert de livraison est un service interne, pas une route publique.

Le client n'envoie jamais le montant faisant foi. Il envoie seulement
l'identifiant de l'operation; le serveur relit le prix accepte et applique la
version de tarification en vigueur.

## 9. Webhooks requis

Plateforme:

- `checkout.session.completed` si Checkout est retenu;
- `payment_intent.succeeded`;
- `payment_intent.payment_failed`;
- `charge.refunded`;
- `charge.dispute.created`;
- `charge.dispute.closed`;
- `transfer.created`;
- `transfer.failed`;
- `transfer.reversed`;
- `payout.paid`;
- `payout.failed`.

Comptes connectes / Accounts v2:

- mise a jour des exigences du compte;
- mise a jour de la capacite de transfert;
- mise a jour du compte bancaire ou du versement lorsque disponible.

Chaque evenement est signe, deduplique, traite dans une transaction SQL et
journalise. Un traitement echoue doit pouvoir etre rejoue sans double debit ni
double transfert.

## 10. Securite et conformite

- Cle secrete Stripe uniquement dans Vercel, jamais dans le client ni dans Git.
- Secret de webhook distinct pour test et production.
- Verification stricte de la signature sur le corps brut de la requete.
- Cle d'idempotence stable par operation et action financiere.
- Controle serveur du role expediteur, du role voyageur et de l'etat precedent.
- Aucune donnee de carte ou bancaire stockee par Wigolink.
- Journal d'audit immuable pour paiement, remboursement, transfert et litige.
- Separation explicite des evenements `livemode=true` et `livemode=false`.
- Politique de conservation, CGU et confidentialite mises a jour avant le reel.
- Consultation juridique necessaire sur le statut de marketplace, les taxes,
  les remboursements et la formulation "paiement protege".

## 11. UX et contenu

Avant paiement:

```text
Prix du transport       10,00 EUR
Frais de service         1,50 EUR
Total                   11,50 EUR
```

Cote voyageur:

```text
Prix accepte            10,00 EUR
Frais de service         1,50 EUR
Vous recevrez            8,50 EUR
```

Le bouton de paiement indique le total exact. Aucune phrase ne promet un
versement instantane. Le voyageur voit une estimation de versement fournie par
Stripe lorsque cette information est disponible.

## 12. Administration

L'admin peut consulter sans modifier les montants historiques:

- montant facture;
- part voyageur;
- revenu brut Wigolink;
- frais Stripe reels recuperes depuis le Balance Transaction;
- revenu net;
- identifiants Stripe tronques;
- historique des webhooks et transitions;
- remboursement, reversal, litige et versement.

Les actions sensibles demandent une confirmation explicite, un motif et une
trace d'audit. Aucun bouton admin ne peut marquer manuellement un paiement
comme reussi sans evenement Stripe correspondant.

## 13. Tests d'acceptation

1. Pour un prix de 10 EUR, Stripe debite 11,50 EUR en test.
2. Pour 49,99 EUR, chaque membre paie 1,50 EUR de frais.
3. Pour 50 EUR, chaque membre paie 3 EUR de frais.
4. Pour 99,99 EUR, chaque membre paie 3 EUR de frais.
5. Pour 100 EUR, chaque membre paie 6 EUR de frais.
6. L'operation reste non payee avant le webhook signe.
7. Le voyageur ne recoit aucun transfert avant livraison.
8. Une livraison validee cree un seul transfert de 8,50 EUR pour l'exemple a
   10 EUR.
9. Deux requetes simultanees ne creent ni double paiement ni double transfert.
10. Un webhook rejoue ne change pas deux fois l'etat.
11. Un paiement echoue ne debloque pas la remise.
12. Une annulation avant transfert rembourse selon la politique validee.
13. Un litige bloque le transfert et alerte l'administration.
14. Un compte voyageur non eligible ne peut pas accepter une operation payante.
15. Les parcours clair/sombre, mobile/desktop et FR/EN/AR/ES/NL sont verifies.
16. Les donnees test et production restent totalement separees.

## 14. Deploiement propose

### Phase 1 - Sandbox

- installer le SDK Stripe serveur;
- creer les tables et migrations;
- integrer l'onboarding des voyageurs;
- integrer Checkout et les webhooks;
- remplacer le paiement simule derriere un feature flag;
- tester paiements, remboursements, litiges et transferts.

### Phase 2 - Pilote ferme

- activer uniquement des voyageurs eligibles dans une zone confirmee;
- limiter les montants et le nombre d'operations;
- surveiller erreurs, fraudes, remboursements et marge nette;
- conserver une reserve de securite.

### Phase 3 - Production

- confirmer les choix d'integration Stripe;
- creer les destinations webhook de production;
- ajouter les variables Vercel de production;
- effectuer un paiement reel de faible montant de bout en bout;
- ouvrir progressivement les pays confirmes par Stripe.

## 15. Points a valider avant implementation

Le bareme progressif est valide: 1,50 EUR par membre sous 50 EUR, 3 EUR par
membre de 50 EUR inclus a 100 EUR exclu, puis 6 EUR par membre a partir de
100 EUR inclus.

1. Definir qui supporte les frais Stripe non restitues lors d'un remboursement.
2. Definir les regles d'annulation avant remise, pendant le transport et apres
   livraison.
3. Definir le delai de transfert apres confirmation de livraison.
4. Obtenir la confirmation Stripe pour les versements aux voyageurs marocains.
5. Valider le lancement initial en EUR et les pays autorises.

## 16. Estimation de marge

Au tarif standard belge affiche par Stripe, une carte EEE coute actuellement
1,5 % + 0,25 EUR. Stripe Connect indique aussi un tarif de depart de 0,25 % pour
les plateformes qui controlent leur propre tarification. Radar Standard ajoute
le cas echeant 0,05 EUR par transaction.

Ordres de grandeur pour une carte EEE standard:

| Prix accepte | Total debite | Wigolink brut | Wigolink estime avant taxes |
| ---: | ---: | ---: | ---: |
| 10 EUR | 11,50 EUR | 3,00 EUR | environ 2,50 EUR |
| 50 EUR | 53,00 EUR | 6,00 EUR | environ 4,77 EUR |
| 100 EUR | 106,00 EUR | 12,00 EUR | environ 9,85 EUR |

Cette estimation n'est pas une garantie. Les cartes hors EEE, conversions,
litiges, remboursements et conditions contractuelles peuvent augmenter le cout.
Le montant reel doit etre lu dans les Balance Transactions Stripe et affiche
dans l'administration.

## 17. References Stripe officielles

- Separate charges and transfers:
  https://docs.stripe.com/connect/separate-charges-and-transfers
- Comptes marketplace:
  https://docs.stripe.com/connect/marketplace/tasks/create
- Onboarding des comptes connectes:
  https://docs.stripe.com/connect/marketplace/tasks/onboard
- Webhooks Connect:
  https://docs.stripe.com/connect/webhooks
- Versements transfrontaliers:
  https://docs.stripe.com/connect/cross-border-payouts
- Tarifs Belgique:
  https://stripe.com/en-be/pricing

## 18. Etat d'implementation - sandbox

Implemente:

- bareme progressif en centimes avec instantane tarifaire versionne;
- tables Stripe privees, indexees et non accessibles aux roles Supabase publics;
- comptes Connect Express et onboarding Stripe heberge;
- Checkout cree cote serveur avec idempotence par operation;
- verification de signature sur corps brut et deduplication des webhooks;
- paiement confirme uniquement par webhook;
- transfert unique apres confirmation de livraison;
- reprise automatique idempotente des transferts echoues ou interrompus;
- reversal puis remboursement admin avec motif et audit;
- ventilation expediteur/voyageur et supervision financiere admin;
- identifiants Stripe tronques dans les reponses d'administration;
- feature flag `PAYMENT_PROVIDER` et controle `/api/health`;
- traductions FR, EN, ES, NL et AR.

Avant activation reelle:

- valider juridiquement annulations, chargebacks, fiscalite et reserve;
- recevoir la confirmation Stripe des pays de versement definitifs;
- effectuer les tests d'acceptation de bout en bout en sandbox;
- remplacer les cles et le webhook test par leurs equivalents live distincts;
- effectuer un pilote ferme avec des montants limites.
