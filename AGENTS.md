# Guide de contribution

## Portee

L'application active est dans `v1`. Les changements fonctionnels doivent suivre
les modules de domaine existants dans `v1/client/src/features` et
`v1/server`.

## Regles

- Ne jamais commiter de secret, de fichier `.env`, de donnees KYC ou de copie
  locale de `server/data.json`.
- Conserver la compatibilite avec les donnees historiques lors d'une migration.
- Une nouvelle fonctionnalite doit utiliser les routes et services modulaires,
  pas ajouter de logique metier directement dans `server/index.js`.
- Ajouter ou adapter les tests selon le risque.
- Maintenir les traductions francaise, arabe et neerlandaise ensemble.

## Validation

Executer depuis `v1`:

```text
npm run check:i18n
npm test
npm run build
```

Pour une livraison production, executer aussi `npm run audit:production` et
suivre `v1/docs/DEPLOYMENT.md`.
