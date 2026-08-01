# Wigolink

Wigolink met en relation des voyageurs et des expediteurs pour transporter des
documents ou des colis sur un trajet publie.

Le produit actif suit ce parcours:

1. un voyageur publie son trajet et sa capacite;
2. un expediteur choisit document ou colis et envoie une demande;
3. le voyageur accepte ou refuse;
4. l'expediteur confirme le paiement;
5. deux codes temporaires securisent la remise et la livraison;
6. chaque partie peut suivre l'operation, discuter et ouvrir un litige.

Le paiement est encore simule. Aucun encaissement reel ni service de sequestre
n'est execute tant qu'un prestataire agree n'a pas ete integre.

## Application

Le code deployable se trouve dans [`v1`](v1).

- Frontend: React 19, React Router et Vite
- API: Express expose sous `/api`
- Donnees: PostgreSQL sur Supabase
- Emails transactionnels: Resend
- Deploiement: Vercel, frontend et fonction API sur le meme domaine
- Temps reel: Supabase Realtime pour la messagerie
- KYC: capture guidee avec MediaPipe, validation administrative

## Demarrage local

Prerequis: Node.js 24 et une copie de `v1/.env.example` nommee
`v1/.env.local`.

```text
cd v1
npm install
npm run dev
```

Le client est disponible sur `http://localhost:5173` et l'API locale sur le
port `4517`.

## Verification

Depuis `v1`:

```text
npm run check:i18n
npm test
npm run build
```

Avant une publication, executer aussi:

```text
npm run audit:production
```

## Documentation

- [`v1/docs/ARCHITECTURE.md`](v1/docs/ARCHITECTURE.md): organisation et flux actifs
- [`v1/docs/DEPLOYMENT.md`](v1/docs/DEPLOYMENT.md): configuration Vercel, Supabase et Resend
- [`v1/docs/OPERATIONS.md`](v1/docs/OPERATIONS.md): controles, migrations et exploitation
- [`v1/docs/data-sources.md`](v1/docs/data-sources.md): provenance des donnees geographiques

Les anciens PRD et espaces de coordination ont ete retires. Leur historique
reste consultable dans Git.
