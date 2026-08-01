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
10. Definir ensuite `RELATIONAL_MESSAGE_READS=true` dans Vercel. La liste des conversations et les pages de messages seront alors lues depuis les tables indexees `wigofly_conversations` et `messages`. Les ecritures continuent de se synchroniser dans la meme transaction que l'etat historique.
11. Apres avoir applique la colonne `messages.client_id`, son index unique et verifie les lectures admin, definir `RELATIONAL_MESSAGE_WRITES=true`. Les envois, suppressions visuelles, recus de lecture, archives et epingles sont alors ecrits directement par conversation, sans verrouiller `wigofly_app_state`.
11a. Appliquer `wigofly_conversation_members`, executer son backfill puis verifier que chaque participant possede une ligne. Definir ensuite `RELATIONAL_CONVERSATION_MEMBERS=true`; les lus/non-lus et preferences ne reecrivent plus les messages ni la ligne partagee de conversation.
12. Definir `RELATIONAL_OPERATION_READS=true` pour servir les listes et details d'operations depuis les tables indexees. Definir `RELATIONAL_TRIP_WRITES=true` pour ecrire les favoris directement dans `wigofly_saved_trips`.
13. Apres validation du parcours demande, confirmation, paiement simule, remise, livraison et litige, definir `RELATIONAL_OPERATION_WRITES=true`. Chaque mutation verrouille uniquement le trajet ou l'operation concernee et les retries d'acceptation sont idempotents.
14. Executer `npm run migrate:relational:verify`. Le resultat doit contenir `"ready": true`.
15. Executer les quatre garde-fous de `docs/OPERATIONS.md` avant chaque mise en production.
16. Tester inscription, verification email, reinitialisation de mot de passe, creation de trajet, simulation de paiement et messagerie depuis le domaine final.

La suppression d'un message en mode relationnel est logique: le membre ne le voit plus, mais le contenu et les medias restent conserves dans la table et dans le bucket prive pour le dossier admin et les obligations de preuve.

## Gate de securite

En production, `DEMO=true` est refuse. Les CORS sont limites a `APP_ORIGIN` et des en-tetes de securite sont poses par l'API. Si `RESEND_API_KEY` ou `EMAIL_FROM` manque, l'API reste observable mais `/api/health` repond `503` et les routes qui envoient un email repondent clairement que la verification doit etre configuree : aucun compte ne contourne cette verification.

Ne definissez jamais `TEST_EMAIL_BYPASS` en production : l'API refusera de demarrer afin qu'aucun compte ne contourne la verification d'e-mail.

## Base de donnees

La connexion privee `DATABASE_URL` active un etat transactionnel Supabase pour les donnees metier pendant la transition. Les sessions, messages de conversation, notifications et journaux d'audit sont stockes dans des tables PostgreSQL indexees afin d'eviter le chargement du document JSON global a chaque consultation. Le schema relationnel couvre les utilisateurs, trajets, operations, favoris, conversations, litiges et dossiers KYC. Les tables d'annonces et d'offres de matching sont conservees uniquement pour les dossiers historiques et l'administration. La migration idempotente `npm run migrate:relational` recopie les donnees existantes vers ces tables avant le basculement progressif des routes. Le fichier `server/data.json` reste reserve au developpement local.

Sur Vercel, le pool PostgreSQL utilise par defaut 2 connexions par instance,
un delai de requete de 10 secondes et recycle une connexion apres 5 000 usages.
`DB_POOL_MAX` (1 a 20) et `DB_QUERY_TIMEOUT_MS` (1 000 a 30 000) permettent un
reglage mesure, mais ne doivent etre augmentes qu'apres observation conjointe
des connexions Supabase et de la latence Vercel.

## Medias de messagerie

Les photos de conversation sont stockees dans un bucket Supabase prive au lieu d'etre repetees en base64 dans chaque reponse JSON. Renseigner `SUPABASE_URL` et `SUPABASE_SECRET_KEY`; le serveur cree au premier envoi le bucket `wigofly-message-media`, ou le nom defini par `SUPABASE_MESSAGE_MEDIA_BUCKET`. Le navigateur ne recoit jamais la cle ni le chemin interne: il charge le fichier via une route API authentifiee, avec un cache prive de 24 heures.

Les anciennes images inline restent compatibles. L'API les sert par la meme route authentifiee sans les inclure dans la liste des conversations ou des messages.

## Medias KYC et profil

En production, le navigateur reserve des URLs d'upload signees puis envoie les
captures KYC et l'avatar directement dans Supabase Storage. L'API ne recoit que
les references, controle le proprietaire, le type MIME et la taille reelle, puis
finalise la reservation. Une reservation expire apres 15 minutes et le cron
retire les objets abandonnes. Le fallback base64 est limite au developpement
local.
