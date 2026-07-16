# Deploiement production

## Architecture recommandee

- Frontend React/Vite et API Express sur Vercel, sous le meme domaine.
- Base Postgres Supabase et email Resend.

Les routes `/api/*` sont executees par la fonction Vercel `api/[...path].js`; le frontend les appelle donc sur le meme domaine. Les fonctions Vercel ont un disque en lecture seule: `server/data.json` reste strictement local et Supabase devient obligatoire avant ouverture publique.

## Variables a renseigner

Copier `.env.example`, puis definir les secrets dans le tableau de bord Vercel. Ne jamais commiter `.env`.

Pour Resend, creer une cle API et verifier le domaine utilise dans `EMAIL_FROM`; Resend exige un expediteur provenant d'un domaine verifie. Voir la [documentation Resend](https://resend.com/docs/send-with-express/).

## Etapes de publication

1. Dans Supabase SQL Editor, executer le contenu de `supabase/schema.sql`.
2. Le script initialise une base vide. Recuperer ensuite la chaine "Connect > Transaction pooler" de Supabase (port `6543`, adaptee aux fonctions Vercel); ne jamais la coller dans un chat ni la commiter. La commande `npm run migrate:supabase -- --empty` reste disponible pour reinitialiser explicitement une base de test.
3. Renseigner `DATABASE_URL` dans les variables Vercel, puis redeployer.
4. Configurer Resend: domaine, cle API, puis `RESEND_API_KEY` et `EMAIL_FROM`.
5. Deployer le dossier `v1` sur Vercel avec `npm run build` et la sortie `client/dist`.
6. Definir `NODE_ENV=production`, `APP_ORIGIN` et `APP_URL` avec le domaine final dans Vercel.
7. Tester inscription, verification email, reinitialisation de mot de passe, creation de trajet, paiement et messagerie depuis le domaine final.

## Gate de securite

En production, l'API refuse de demarrer sans `RESEND_API_KEY` et `EMAIL_FROM`; `DEMO=true` est egalement refuse. Les CORS sont limites a `APP_ORIGIN` et des en-tetes de securite sont poses par l'API.

## Base de donnees

La connexion privee `DATABASE_URL` active un etat transactionnel Supabase pour l'ensemble des collections : utilisateurs, sessions, trajets, annonces, conversations, messages, operations, KYC, litiges et notifications. Les requetes d'ecriture verrouillent l'etat, le mettent a jour et valident la transaction avant la reponse HTTP. Le fichier `server/data.json` reste reserve au developpement local.
