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

Le récapitulatif douane est mis en cache localement dès son premier chargement (localStorage) et
reste consultable sans réseau — avec un bandeau explicite « hors ligne » — plus un export PDF
téléchargeable en un clic.

**Simulé en démo (prestataires réels requis en prod)** : envoi d'emails (codes affichés à l'écran), OAuth Google (sélecteur simulé), escrow (Mangopay/Stripe Connect), QR scannables. Le KYC est un vrai flux manuel (soumission + revue admin), voir [docs/prd-kyc.md](docs/prd-kyc.md).

## Tester sur téléphone (accès caméra)

Les navigateurs bloquent l'accès caméra (`getUserMedia`) sur les origines non sécurisées —
seuls `https://` et `http://localhost` sont autorisés. Pour tester le KYC ou la vidéo de
scellage depuis un téléphone sur le même réseau Wi-Fi, il faut donc servir l'app en HTTPS :

```bash
cd v1
mkdir -p .cert
openssl req -x509 -newkey rsa:2048 -keyout .cert/key.pem -out .cert/cert.pem \
  -days 825 -nodes -subj "/CN=cloudkilo-dev" \
  -addext "subjectAltName=IP:<IP_DE_TON_PC>,IP:127.0.0.1,DNS:localhost"
```

Remplace `<IP_DE_TON_PC>` par l'IP locale de ta machine (`hostname -I`). `npm run dev`
détecte automatiquement `v1/.cert/` et bascule Vite en HTTPS. Ouvre ensuite
`https://<IP_DE_TON_PC>:5173` depuis le téléphone — le navigateur affiche un avertissement
de certificat non fiable (normal, c'est un certificat auto-signé de dev) : accepter/continuer
une fois suffit, puis la demande d'autorisation caméra fonctionne normalement.
