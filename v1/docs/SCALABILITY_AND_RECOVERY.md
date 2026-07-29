# Scalabilite et reprise de Wigofly

Ce document fixe les garde-fous d'exploitation. Il ne remplace pas les tests de
charge ni une restauration reelle.

## Etat actuel

- Vercel sert le frontend et des fonctions API sans etat.
- PostgreSQL stocke les comptes, sessions, trajets, operations, conversations,
  messages, notifications et journaux deja migres.
- Supabase Storage stocke les medias hors de PostgreSQL.
- Les images de messagerie sont envoyees directement vers Storage par URL signee.
- Le pool PostgreSQL est borne par instance Vercel.
- Le cron quotidien supprime les reservations d'upload abandonnees, sessions,
  codes temporaires et notifications expirees.
- `GET /api/admin/maintenance/capacity` expose uniquement aux administrateurs la
  taille, les volumes estimes, les connexions et les alertes de capacite.

Le document global `wigofly_app_state` est encore charge au demarrage pour les
domaines historiques. KYC, suppression de compte et certains ecrans admin
doivent encore etre migres ensemble avant de supprimer cette dependance.

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

## Capacite de lancement

Le plan Supabase Free convient au developpement, pas a une ouverture commerciale :
500 MiB de base, 1 Go de fichiers, ressources partagees et aucune sauvegarde
automatique garantie. Avant les premiers vrais colis :

1. passer l'organisation Supabase en Pro;
2. regler `DB_CAPACITY_BYTES=8589934592`;
3. regler `DB_CONNECTION_BUDGET` sur la limite du pooler du projet;
4. verifier les sauvegardes quotidiennes dans `Database > Backups`;
5. conserver un export chiffre hors du compte Supabase.

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

Activer l'interface S3 Supabase et synchroniser les trois buckets prives avec
`rclone` ou AWS CLI vers un stockage chiffre distinct :

- `wigofly-message-media`;
- `wigofly-kyc-media`;
- `wigofly-profile-media`.

Ne jamais rendre ces sauvegardes publiques. Les documents KYC exigent des acces
restreints, une journalisation et une politique de conservation juridique
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
