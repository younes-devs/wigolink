# Sources de données

## Référentiel géographique

Les localités marocaines, françaises et belges utilisées par la recherche Wigolink proviennent de
[GeoNames](https://www.geonames.org/), distribué sous licence
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

- Exports pays : `MA.zip`, `FR.zip` et `BE.zip`
- Sélection : lieux habités de 500 habitants ou plus et sièges administratifs
- Alias complémentaires : variantes usuelles maintenues par Wigolink
- Mise à jour : relancer `scripts/import-geonames-country.mjs` avec le nouvel export

Wigolink ajoute une normalisation, des alias et un classement de pertinence. Ces
transformations ne signifient pas que GeoNames approuve ou certifie Wigolink.
