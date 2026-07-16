# Deploiement production

## Architecture recommandee

- Frontend React/Vite et API Express sur Vercel, sous le meme domaine.
- Base Postgres Supabase et email Resend.

Les routes `/api/*` sont executees par la fonction Vercel `api/[...path].js`; le frontend les appelle donc sur le meme domaine. Les fonctions Vercel ont un disque en lecture seule: `server/data.json` reste strictement local et Supabase devient obligatoire avant ouverture publique.

## Variables a renseigner

Copier `.env.example`, puis definir les secrets dans le tableau de bord Vercel. Ne jamais commiter `.env`.

Pour Resend, creer une cle API et verifier le domaine utilise dans `EMAIL_FROM`; Resend exige un expediteur provenant d'un domaine verifie. Voir la [documentation Resend](https://resend.com/docs/send-with-express/).

## Etapes de publication

1. Creer la base Supabase Postgres et renseigner `DATABASE_URL` dans les variables Vercel.
2. Configurer Resend: domaine, cle API, puis `RESEND_API_KEY` et `EMAIL_FROM`.
3. Deployer le dossier `v1` sur Vercel avec `npm run build` et la sortie `client/dist`.
4. Definir `NODE_ENV=production`, `APP_ORIGIN` et `APP_URL` avec le domaine final dans Vercel.
5. Tester inscription, verification email, reinitialisation de mot de passe, creation de trajet, paiement et messagerie depuis le domaine final.

## Gate de securite

En production, l'API refuse de demarrer sans `RESEND_API_KEY` et `EMAIL_FROM`; `DEMO=true` est egalement refuse. Les CORS sont limites a `APP_ORIGIN` et des en-tetes de securite sont poses par l'API.

## Base de donnees

Le projet contient actuellement une couche Postgres partielle pour les messages, notifications et journaux. Avant ouverture publique, terminer la migration des autres collections JSON (utilisateurs, trajets, transactions, conversations et KYC) dans Supabase. Cette etape est volontairement bloquante: ne publiez pas une application transactionnelle avec le fichier `server/data.json`.
