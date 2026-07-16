# Deploiement production

## Architecture recommandee

- Frontend React/Vite sur Vercel.
- API Express sur Render ou Railway, derriere `https://api.votredomaine.com`.
- Base Postgres Supabase et email Resend.

Le frontend utilise `VITE_API_BASE_URL` pour joindre l'API. Cette separation est volontaire: les fonctions Vercel ont un disque en lecture seule et ne conviennent pas au fichier JSON local ni a une connexion SSE longue duree.

## Variables a renseigner

Copier `.env.example`, puis definir les secrets dans les tableaux de bord Vercel et de l'hebergeur API. Ne jamais commiter `.env`.

Pour Resend, creer une cle API et verifier le domaine utilise dans `EMAIL_FROM`; Resend exige un expediteur provenant d'un domaine verifie. Voir la [documentation Resend](https://resend.com/docs/send-with-express/).

## Etapes de publication

1. Creer la base Supabase Postgres et renseigner `DATABASE_URL` sur l'API.
2. Configurer Resend: domaine, cle API, puis `RESEND_API_KEY` et `EMAIL_FROM`.
3. Deployer l'API Node avec `NODE_ENV=production`, `APP_ORIGIN` et `APP_URL` definis sur le domaine final.
4. Deployer le dossier `v1` sur Vercel avec `npm run build`, sortie `client/dist`, et `VITE_API_BASE_URL=https://api.votredomaine.com/api`.
5. Tester inscription, verification email, reinitialisation de mot de passe, creation de trajet, paiement et messagerie depuis le domaine final.

## Gate de securite

En production, l'API refuse de demarrer sans `RESEND_API_KEY` et `EMAIL_FROM`; `DEMO=true` est egalement refuse. Les CORS sont limites a `APP_ORIGIN` et des en-tetes de securite sont poses par l'API.

## Base de donnees

Le projet contient actuellement une couche Postgres partielle pour les messages, notifications et journaux. Avant ouverture publique, terminer la migration des autres collections JSON (utilisateurs, trajets, transactions, conversations et KYC) dans Supabase. Cette etape est volontairement bloquante: ne publiez pas une application transactionnelle avec le fichier `server/data.json`.
