# Deploiement production

## Architecture recommandee

- Frontend React/Vite et API Express sur Vercel, sous le meme domaine.
- Base Postgres Supabase et email Resend.

Les routes `/api/*` sont executees par la fonction Vercel `api/[...path].js`; le frontend les appelle donc sur le meme domaine. Les fonctions Vercel ont un disque en lecture seule: `server/data.json` reste strictement local et Supabase devient obligatoire avant ouverture publique.

## Variables a renseigner

Copier `.env.example`, puis definir les secrets dans le tableau de bord Vercel. Ne jamais commiter `.env`.

Pour Resend, creer une cle API et verifier le domaine utilise dans `EMAIL_FROM`; Resend exige un expediteur provenant d'un domaine verifie. Voir la [documentation Resend](https://resend.com/docs/send-with-express/).

## Etapes de publication

1. Dans Supabase SQL Editor, executer le contenu de `supabase/schema.sql`, puis `supabase/relational-backfill.sql`. Les deux scripts sont idempotents : executez-les a nouveau apres chaque mise a jour qui ajoute une table, un index ou une migration.
2. Le script initialise une base vide. Recuperer ensuite la chaine "Connect > Transaction pooler" de Supabase (port `6543`, adaptee aux fonctions Vercel); ne jamais la coller dans un chat ni la commiter. La commande `npm run migrate:supabase -- --empty` reste disponible pour reinitialiser explicitement une base de test.
3. Renseigner `DATABASE_URL` dans les variables Vercel, puis redeployer.
4. Configurer Resend: domaine, cle API, puis `RESEND_API_KEY` et `EMAIL_FROM`.
5. Deployer le dossier `v1` sur Vercel avec `npm run build` et la sortie `client/dist`.
6. Definir `NODE_ENV=production`, `APP_ORIGIN`, `APP_URL` et `PERSISTENCE_DRIVER=postgres` avec le domaine final dans Vercel.
7. Ouvrir `/api/health` depuis le domaine final : la reponse doit indiquer `ok: true`, `database: "connected"` et `email: "configured"`. Une reponse `503` precise quelle dependance doit etre configuree sans faire tomber toute la fonction.
8. Avant de basculer les routes relationnelles, lancer `npm run migrate:relational:plan`, puis `npm run migrate:relational` depuis un environnement ayant `DATABASE_URL`. La migration est idempotente et peut etre relancee sans doublons.
9. Apres avoir verifie les comptes importes dans Supabase, definir `RELATIONAL_TRIP_READS=true` dans Vercel. Le flux de recherche et "Mes trajets" utilisera alors les tables indexees et paginees; ne l'activer qu'apres l'import.
10. Tester inscription, verification email, reinitialisation de mot de passe, creation de trajet, paiement et messagerie depuis le domaine final.

## Gate de securite

En production, `DEMO=true` est refuse. Les CORS sont limites a `APP_ORIGIN` et des en-tetes de securite sont poses par l'API. Si `RESEND_API_KEY` ou `EMAIL_FROM` manque, l'API reste observable mais `/api/health` repond `503` et les routes qui envoient un email repondent clairement que la verification doit etre configuree : aucun compte ne contourne cette verification.

Ne definissez jamais `TEST_EMAIL_BYPASS` en production : l'API refusera de demarrer afin qu'aucun compte ne contourne la verification d'e-mail.

## Base de donnees

La connexion privee `DATABASE_URL` active un etat transactionnel Supabase pour les donnees metier pendant la transition. Les sessions, messages de transaction, notifications et journal d'audit sont des tables PostgreSQL indexees, donc elles ne chargent plus le document JSON global a chaque consultation. Le schema comprend aussi les tables relationnelles indexees pour utilisateurs, trajets, annonces, operations, favoris, conversations, litiges, KYC et offres de matching. La migration idempotente `npm run migrate:relational` recopie les donnees existantes vers ces tables avant le basculement progressif des routes. Le fichier `server/data.json` reste reserve au developpement local.
