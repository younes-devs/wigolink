# CloudKilo (nom provisoire)

Plateforme de transport collaboratif Belgique/France ↔ Maroc — mise en relation sécurisée entre expéditeurs et voyageurs, avec paiement séquestré, vérification d'identité et preuve vidéo.

Voir [docs/prd.md](docs/prd.md) pour le PRD complet et [docs/plan-projet.md](docs/plan-projet.md) pour le plan de projet et le phasage.

## Structure du dépôt

```
docs/       Documents de cadrage (PRD, plan de projet, notes juridiques)
legal/      Suivi des décisions juridiques de la Phase A (statut, CGU, ONSSA, paiement)
v0/         V0 "Concierge" — landing page + formulaire (pas d'app)
v1/         V1 MVP — application mobile (à démarrer après validation V0 + Phase A)
```

## État actuel

V1 MVP fonctionnel (web app responsive, mode démo) — le volet juridique (Phase A) reste à traiter avant tout lancement public.

## Lancer l'app (v1)

Prérequis : Node ≥ 20 (installé ici via nvm).

```bash
cd v1
npm install
npm run dev     # API sur :4517 + web sur :5173
```

Ouvrir http://localhost:5173. Comptes de démo (mot de passe : `demo1234`) :

| Rôle | Email |
|---|---|
| Fatima — expéditrice (Casablanca) | `fatima@demo.cloudkilo.app` |
| Karim — voyageur (Bruxelles) | `karim@demo.cloudkilo.app` |
| Mehdi — destinataire (Bruxelles) | `mehdi@demo.cloudkilo.app` |
| Admin — back-office | `admin@demo.cloudkilo.app` |

Authentification complète : inscription email + mot de passe (hash scrypt), vérification
d'email par code (démo : `123456`), connexion Google (simulée), mot de passe oublié
(code démo : `424242`, invalide les sessions existantes), déconnexion serveur,
anti-brute-force sur le login.

Parcours complet : Fatima publie un envoi (photos obligatoires + liste blanche + écran douane) → l'annonce apparaît dans le feed des voyageurs dont le **trajet déclaré** correspond (sens, dates, capacité kg) → Karim accepte (formation obligatoire au premier transport, puis escrow séquestré) → Fatima filme le scellage (caméra in-app) → double validation QR à la remise → transit (récap douane) → double validation à la livraison → escrow libéré → notation. Notifications in-app à chaque transition (cloche dans l'en-tête). Litiges, détection de désintermédiation dans le chat, zone grise et arbitrage sont gérés dans le back-office (onglet Admin).

**Mode test intégré** : bouton flottant (étincelles, en bas à droite) pour basculer de
compte en un clic ou créer un utilisateur jetable ; boutons « Remplir (test) » sur les
formulaires d'annonce et d'inscription ; « Code auto (test) » pour les validations QR.
Désactivable avec `DEMO=false` côté serveur.

**Simulé en démo (prestataires réels requis en prod)** : envoi d'emails (codes affichés à l'écran), OAuth Google (sélecteur simulé), KYC, escrow (Mangopay/Stripe Connect), QR scannables.
