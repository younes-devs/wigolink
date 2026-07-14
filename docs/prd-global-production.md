# PRD Global Production - Wigofly V1

Version: 2026-07-14  
Statut: document de pilotage pour terminer le MVP  
Audience: proprietaire, Codex, Claude, futur developpeur backend/frontend

## 1. Vision produit

Wigofly permet a un expediteur d'envoyer un colis Maroc <-> Belgique via un
voyageur verifie, avec paiement securise, preuve video, regles douanieres,
notifications, litiges et validation finale. Le produit doit inspirer confiance a
des utilisateurs peu techniques, y compris sur mobile.

Le site ne doit pas seulement etre beau: il doit permettre de boucler une vraie
transaction de bout en bout, sans intervention manuelle invisible.

## 2. Objectifs V1

- Un nouvel utilisateur comprend en moins de 2 minutes s'il veut envoyer ou
  transporter.
- Un expediteur peut publier une annonce sans aide externe.
- Un voyageur peut declarer un trajet, recevoir des propositions, negocier puis
  accepter un transport.
- Une transaction peut aller de l'annonce jusqu'au paiement libere ou rembourse.
- Un admin peut traiter KYC, categories grises, litiges, fraude et transactions
  bloquees.
- Le projet peut etre deploye proprement avec une vraie base de donnees, de vrais
  emails et une strategie paiement preparee.

## 3. Definition de "termine pour V1"

Le MVP est considere pret quand:

- Le build frontend passe en production.
- Les tests serveur passent.
- Les donnees metier ne dependent plus d'un fichier JSON local.
- L'authentification, la verification email et le reset password sont reels.
- Les photos, videos et documents sont stockes dans un storage persistant.
- Le parcours annonce -> matching/offre -> transaction -> scellage -> pickup ->
  livraison -> paiement est executable en demo de bout en bout.
- L'admin peut voir et traiter les urgences operationnelles.
- Les notifications critiques existent en in-app et par email.
- Les actions sensibles sont auditees.
- Les pages principales sont utilisables sur mobile 375px sans overflow.
- Les erreurs, loading states et etats vides sont geres.

## 4. Architecture cible recommandee

### Frontend

- Vercel pour l'app React/Vite.
- Build statique, variables d'environnement publiques prefixees proprement.
- Monitoring frontend via Sentry.

### Backend

Option A recommandee pour V1:

- Garder Express sur Render, Fly.io ou Railway.
- Vercel sert uniquement le frontend.
- Avantage: moins de friction avec l'API existante, les tests et les futurs jobs.

Option B possible:

- Migrer progressivement vers Vercel Functions.
- Avantage: hebergement unifie.
- Risque: refactor Express et limites serverless.

### Base de donnees

- Supabase Postgres.
- Row Level Security plus tard si le frontend accede directement a Supabase.
- Pour V1, l'API Express peut rester l'unique point d'acces a la base.

### Fichiers

- Supabase Storage pour photos annonces, preuves KYC, videos de scellage,
  preuves de litige et documents exportables.

### Emails

- Resend pour verification email, reset password, notifications critiques et
  emails transactionnels.

### Paiement

- Stripe Connect, Mangopay ou Lemonway.
- Pour une V1 testable: garder un escrow simule, mais modeliser les champs
  provider des maintenant pour brancher un prestataire sans casser le domaine.

## 5. P0 - Bloquants avant lancement

### P0.1 Migration Supabase

Probleme actuel: la persistance JSON suffit pour une demo locale, pas pour un
site heberge.

Tables minimales:

- `users`
- `profiles`
- `sessions` ou provider auth externe
- `listings`
- `trips`
- `matching_offers`
- `transactions`
- `transaction_events`
- `messages`
- `notifications`
- `settings`
- `kyc_submissions`
- `kyc_decisions`
- `disputes`
- `documents`
- `audit_logs`
- `custom_whitelist`

Critere d'acceptation:

- Aucun flux critique ne depend de `server/data.json`.
- Les tests peuvent tourner sur une base isolee ou un adaptateur test.
- Une migration SQL documente le schema initial.

### P0.2 Auth production

Probleme actuel: le mode demo et les codes visibles ne doivent jamais exister en
production.

Exigences:

- Verification email par Resend.
- Reset password par email.
- Sessions securisees.
- Expiration/revocation de session.
- Suppression ou verrouillage strict des endpoints `/api/dev/*`.
- Variables `DEMO`, `DATABASE_URL`, `RESEND_API_KEY`, `APP_URL`.

Critere d'acceptation:

- En production, aucun code OTP n'est renvoye dans la reponse API.
- Un utilisateur non verifie ne peut pas agir sur les flux sensibles.

### P0.3 Parcours transaction complet

Chaque transaction doit afficher clairement:

- Etat courant.
- Prochaine action.
- Qui doit agir.
- Delai ou SLA.
- Montant escrow.
- Commission.
- Preuves disponibles.
- Chat.
- Litige possible.
- Historique.

Critere d'acceptation:

- Un utilisateur ne peut pas rester bloque sans explication visible.
- Les roles expediteur, voyageur et destinataire voient chacun leur action.

### P0.4 Paiement/escrow pret pour provider

Exigences domaine:

- `paymentProvider`
- `paymentIntentId`
- `escrowStatus`
- `escrowAmount`
- `commissionAmount`
- `releasedAt`
- `refundedAt`
- audit des actions paiement

Critere d'acceptation:

- L'escrow simule continue de fonctionner.
- Le modele est pret pour Stripe Connect/Mangopay/Lemonway.

### P0.5 Storage photos/videos/documents

Probleme actuel: les data URLs en JSON ne conviennent pas a la production.

Exigences:

- Upload vers Supabase Storage.
- Limites taille/type.
- URLs privees ou signees pour KYC/litiges.
- URLs publiques uniquement pour assets non sensibles.

Critere d'acceptation:

- Les photos annonces survivent au redeploiement.
- Les preuves sensibles ne sont pas publiquement accessibles.

### P0.6 Notifications critiques

In-app existe deja, mais il faut ajouter les relances metier:

- Offre bientot expiree.
- Offre expiree.
- Scellage attendu.
- Pickup attendu.
- Livraison attend validation.
- KYC decide.
- Litige ouvert/decide.
- Paiement libere/rembourse.

Critere d'acceptation:

- Les actions critiques ne dependent pas du hasard ou du retour manuel dans
  l'app.

### P0.7 Admin operations

L'admin doit voir en priorite:

- Transactions bloquees.
- KYC en retard.
- Litiges ouverts.
- Escrow geles.
- Offres expirees.
- Categories grises.
- Messages signales.
- Comptes a risque.

Critere d'acceptation:

- L'admin sait quoi traiter en moins de 30 secondes.

### P0.8 Securite et audit

Exigences:

- Audit log pour actions admin.
- Rate limiting auth.
- Detection coordonnees hors app.
- Detection comptes lies.
- Protection IDOR sur toutes les ressources.
- Tests sur endpoints sensibles.

Critere d'acceptation:

- Toute action sensible est tracee.
- Les tests couvrent les acces tiers interdits.

## 6. P1 - Gros chantiers produit

### P1.1 Dashboard par role

Le dashboard doit devenir contextuel:

- Expediteur: annonces, offres, colis a sceller, livraisons a valider.
- Voyageur: trajets, colis compatibles, pickup, livraison, revenus.
- Destinataire: colis attendus, QR/livraison.
- Admin: urgences operationnelles.

Critere d'acceptation:

- La home dit clairement "quoi faire maintenant".

### P1.2 Mode voyageur

Exigences:

- Declarer un trajet.
- Capacite restante.
- Colis compatibles.
- Revenus estimes.
- Checklist avant depart.
- Formation obligatoire si premier transport.

Critere d'acceptation:

- Le voyageur peut utiliser Wigofly comme outil pour rentabiliser un trajet.

### P1.3 Creation annonce

Ameliorations:

- Resume final avant publication.
- Aide prix plus claire.
- Estimation commission.
- Checklist photos.
- Liste interdite tres visible.
- Validation dates/poids/valeur stricte.

Critere d'acceptation:

- Un utilisateur peu technique publie sans documentation externe.

### P1.4 Matching et offres

Ameliorations:

- Score de compatibilite.
- Raisons du match.
- Poids restant voyageur.
- Risque douane.
- Proposition, contre-proposition, expiration.

Critere d'acceptation:

- L'expediteur comprend pourquoi un voyageur est recommande.

### P1.5 Support/litiges

Ameliorations:

- Types de litige.
- Preuves demandees.
- Deadline visible.
- Decision admin structuree.
- Remboursement/paiement relie a la decision.

Critere d'acceptation:

- Un litige ne se resume pas a un champ texte libre.

### P1.6 Documents et douane

Chaque dossier colis doit contenir:

- Recap douane.
- Photos annonce.
- Video scellage.
- QR transaction.
- Recu paiement.
- Historique evenements.

Critere d'acceptation:

- En cas de controle ou litige, tout est disponible au meme endroit.

### P1.7 Emails transactionnels

Emails a brancher avec Resend:

- Verification email.
- Reset password.
- Offre recue.
- Offre acceptee/refusee.
- Scellage attendu.
- Pickup confirme.
- Livraison validee.
- Litige ouvert/decide.

Critere d'acceptation:

- Les emails completent les notifications in-app.

## 7. P2 - Differenciation

### P2.1 Score de confiance

Le score doit expliquer:

- KYC.
- Transactions reussies.
- Avis.
- Litiges.
- Annulations.
- Anciennete.

Critere d'acceptation:

- L'utilisateur comprend comment augmenter sa confiance.

### P2.2 SEO public

Pages publiques:

- Envoyer colis Maroc Belgique.
- Transporter colis legalement.
- Produits autorises.
- Guide douane.
- Paiement securise.

Critere d'acceptation:

- Acquisition organique possible avant login.

### P2.3 Analytics produit

Evenements:

- `signup_started`
- `signup_completed`
- `listing_started`
- `listing_created`
- `trip_declared`
- `offer_sent`
- `offer_accepted`
- `transaction_accepted`
- `seal_uploaded`
- `pickup_confirmed`
- `delivery_released`
- `dispute_opened`

Critere d'acceptation:

- L'equipe sait ou les utilisateurs abandonnent.

### P2.4 Monitoring production

Outils:

- Sentry frontend/backend.
- Logs serveur.
- Alertes erreurs 5xx.
- Suivi jobs/relances.

Critere d'acceptation:

- Une erreur production importante est detectee sans attendre un message client.

## 8. Roadmap conseillee

### Phase 1 - Fondation production

1. Schema Supabase.
2. Adaptateur persistence DB.
3. Auth/email production.
4. Storage fichiers.
5. Variables environnement et documentation deploy.

### Phase 2 - Flux argent et transaction

1. Modele paiement pret provider.
2. Transaction detail durci.
3. Relances critiques.
4. Documents colis.
5. Litiges structures.

### Phase 3 - Admin et risque

1. Dashboard operations.
2. Audit logs.
3. Fraude.
4. KYC workflows.
5. Categories grises.

### Phase 4 - Acquisition et polish

1. SEO public.
2. Emails transactionnels complets.
3. Analytics.
4. Monitoring.
5. Audit mobile final.

## 9. Regles de collaboration Codex/Claude

- Toujours pull/fetch avant de commencer.
- Ne pas faire uniquement un audit si un correctif direct est possible.
- Un chantier livre doit mettre a jour `docs/ai-workroom/DONE.md`.
- Les reprises entre agents passent par `INBOX_CODEX.md` et `INBOX_CLAUDE.md`.
- Chaque changement argent/KYC/litige/donnees personnelles doit avoir un test.
- Avant push: `npm test` et `npx vite build client` quand le client est touche.

## 10. Prochain chantier recommande

Commencer par la migration production:

1. Ajouter `docs/supabase-schema.sql`.
2. Definir les tables principales.
3. Creer une couche repository/adaptateur derriere l'API existante.
4. Garder les tests existants en isolant la base de test.
5. Ne pas casser le mode demo local tant que la migration n'est pas complete.

Raison: tant que les donnees critiques restent dans `server/data.json`, Wigofly
reste une demo locale, meme si l'interface est avancee.
