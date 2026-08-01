# Scalabilite et reprise de Wigofly

Ce document fixe les garde-fous d'exploitation. Il ne remplace pas les tests de
charge ni une restauration reelle.

## Etat actuel

- Vercel sert le frontend et des fonctions API sans etat.
- PostgreSQL stocke les comptes, sessions, trajets, operations, conversations,
  messages, notifications et journaux deja migres.
- Supabase Storage stocke les medias hors de PostgreSQL.
- Les images de messagerie, les captures KYC et les photos de profil sont
  envoyees directement vers Storage par URL signee. Les fonctions Vercel ne
  transportent donc plus les fichiers binaires de production.
- Les fils de messages, boites de reception, listes de trajets, favoris et
  operations sont pagines et ne chargent jamais l'historique complet dans une
  seule reponse.
- Les pages suivantes des trajets, conversations, favoris et operations
  utilisent un curseur de tri stable; leur cout ne grandit pas avec le numero
  de page.
- Les corps JSON sont limites a 1 Mo. L'ancienne exception KYC de 3 Mo reste
  uniquement compatible avec le developpement local; la production utilise des
  reservations signees de 15 minutes, liees au membre et verifiees cote serveur.
- Le pool PostgreSQL est borne par instance Vercel.
- Le cron quotidien supprime les reservations d'upload abandonnees, sessions,
  codes temporaires et notifications expirees. Les objets Storage sont retires
  par lots et jusqu'a quatre pages de 500 reservations sont drainees par
  execution afin d'eviter un retard de maintenance.
- `GET /api/admin/maintenance/capacity` expose uniquement aux administrateurs la
  taille, les volumes estimes, les connexions et les alertes de capacite.

Le document global `wigofly_app_state` est charge paresseusement uniquement pour
les domaines historiques qui ne sont pas encore relationnels. Les parcours
membres, KYC, export et suppression de compte ainsi que les lectures et
decisions d'administration n'en dependent plus. La table reste temporairement
conservee pour la compatibilite et les migrations historiques; aucun nouveau
parcours ne doit y etre ajoute.

## Mesure de reference

Mesure production du 29 juillet 2026, apres prechauffage initial, avec 30
requetes par parcours et une concurrence de 5 :

| Parcours | p50 | p95 | Erreurs |
| --- | ---: | ---: | ---: |
| Navigation | 104 ms | 806 ms | 0 % |
| Trajets | 120 ms | 206 ms | 0 % |
| Conversations | 135 ms | 239 ms | 0 % |
| Messages | 113 ms | 317 ms | 0 % |
| Operations | 99 ms | 124 ms | 0 % |

Le p95 navigation inclut le demarrage de fonctions supplementaires : un seul
appel etait prechauffe avant une mesure de concurrence 5. L'outil
`npm run load:authenticated` prechauffe maintenant chaque niveau de concurrence
avant la mesure stable. Conserver separement :

- la latence froide du premier appel;
- le p95 stabilise sous concurrence;
- le taux d'erreur et le debit.

Au moment de cette mesure, PostgreSQL occupait environ 15,7 Mo, Storage 0,8 Mo,
avec 13 connexions actives. La latence observee ne vient donc pas d'un manque
d'espace disque.

## Seuils

Configurer `DB_CAPACITY_BYTES` selon le plan reel. Le cron journalise une alerte
a 70 % et une alerte critique a 85 %. Il signale aussi :

- les connexions a 70 % et 85 % de `DB_CONNECTION_BUDGET`;
- toute requete en attente dans le pool local;
- une table d'au moins 1 000 lignes dont 20 % des lignes sont mortes.

Actions :

| Alerte | Action |
| --- | --- |
| 70 % espace | Examiner la croissance, la retention et planifier l'upgrade |
| 85 % espace | Augmenter la capacite avant toute nouvelle campagne |
| 70 % connexions | Verifier les requetes lentes et le nombre d'instances |
| Pool en attente | Identifier la requete lente, ne pas augmenter le pool a l'aveugle |
| Lignes mortes | Verifier autovacuum et les mutations frequentes |
| p95 API > 1 s | Examiner Vercel Logs et les plans `EXPLAIN ANALYZE` |
| Erreurs > 1 % | Suspendre le deploiement ou revenir au commit stable |

Objectifs avant ouverture :

- p95 stabilise des lectures principales inferieur a 500 ms;
- p95 froid inferieur a 1,5 s;
- erreurs inferieures a 1 %;
- aucune attente dans le pool PostgreSQL;
- test authentifie apres chaque migration structurelle.

## Capacite de lancement

Le plan Supabase Free convient au developpement, pas a une ouverture commerciale :
le compute Nano est partage et recommande pour une base de 500 Mo maximum.
Avant les premiers vrais colis :

1. passer l'organisation Supabase en Pro;
2. regler `DB_CAPACITY_BYTES=8589934592`;
3. regler `DB_CONNECTION_BUDGET` sur la limite du pooler du projet;
4. verifier les sauvegardes quotidiennes dans `Database > Backups`;
5. conserver un export chiffre hors du compte Supabase.

Le projet Vercel est deja configure avec Fluid Compute et la region `cdg1`,
proche de la base Supabase a Paris. Le plan Hobby est reserve a un usage
personnel non commercial. Passer a Pro avant le lancement payant afin d'eviter
la suspension aux limites d'usage et d'obtenir une exploitation adaptee.

Le PITR devient obligatoire avant des paiements reels ou quand perdre jusqu'a
24 heures de donnees n'est plus acceptable.

## Objectifs de reprise

Phase de lancement :

- RPO : 24 heures maximum;
- RTO : 4 heures maximum;
- exercice de restauration : mensuel jusqu'a trois succes, puis trimestriel;
- restauration toujours dans un projet Supabase distinct.

Avec paiements reels :

- PITR 7 jours;
- RPO cible : 2 minutes;
- RTO cible : 2 heures;
- export logique chiffre hebdomadaire conserve hors Supabase.

## Sauvegarde

### PostgreSQL

Les sauvegardes Supabase couvrent la base, pas le contenu binaire de Storage.
Pour un export logique :

```text
supabase db dump --db-url "$DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$DATABASE_URL" -f schema.sql
supabase db dump --db-url "$DATABASE_URL" -f data.sql --use-copy --data-only
```

Chiffrer les fichiers, les stocker sur un compte distinct et noter le hash
SHA-256, la date, le commit et le projet source.

### Storage

Activer l'interface S3 Supabase et synchroniser les trois buckets avec
`rclone` ou AWS CLI vers un stockage chiffre distinct :

- `wigofly-message-media`;
- `wigofly-kyc-media`;
- `wigofly-profile-media`.

Les buckets de messagerie et KYC restent prives. Le bucket des avatars est
public, mais sa sauvegarde ne doit pas l'etre. Les documents KYC exigent des
acces restreints, une journalisation et une politique de conservation juridique
validee.

## Exercice de restauration

1. creer un projet Supabase temporaire dans la meme region;
2. restaurer roles, schema puis donnees;
3. restaurer les objets Storage et verifier leur correspondance avec les chemins
   conserves en base;
4. deployer une Preview Vercel branchee uniquement au projet temporaire;
5. tester connexion, trajet, conversation, image, KYC admin et audit;
6. executer `npm run migrate:relational:verify`;
7. noter duree, pertes constatees et corrections;
8. supprimer le projet temporaire apres validation et selon la politique KYC.

## Sources de reference

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/storage/management/download-objects
- https://supabase.com/pricing
- https://supabase.com/docs/reference/cli/supabase-db-dump
