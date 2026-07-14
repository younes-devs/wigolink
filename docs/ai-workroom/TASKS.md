# Tasks

Convention:

- `[todo]`: pas commence.
- `[doing: codex]` ou `[doing: claude]`: en cours.
- `[review]`: termine par un agent, attend validation ou reprise.
- `[done]`: termine, verifie, resume dans `DONE.md`.

## File principale

- [todo] Continuer l'audit produit global et identifier les prochains gros manques.
- [todo] Stabiliser les flux critiques apres chaque merge: auth, annonces, matching, offres, transactions, admin.
- [todo] Ajouter des tests quand un nouveau comportement met en jeu argent, escrow, litige, KYC ou donnees personnelles.
- [todo] Garder les pages mobile sans overflow.

## Idees de gros chantiers

- [todo] Notifications et relances plus fines pour transactions bloquees.
- [todo] Tableau de bord admin avec actions rapides plus poussees.
- [todo] Revue UX complete du parcours creation annonce -> matching -> transaction.
- [done: claude] Durcir la strategie i18n fr/ar/nl sur les nouvelles pages produit.
  nl.js resynchronise a 840/840/840 cles avec fr.js/ar.js (378 cles ajoutees,
  parite verifiee au script). Voir `DONE.md` 2026-07-14.
- [todo] Les textes de notification generes cote serveur (`notify()` dans
  `index.js`) sont crees en francais au moment de l'evenement et ne passent
  pas par le dictionnaire client — meme un compte en `ar`/`nl` les voit en
  francais dans le centre de notifications. A traiter en meme temps que
  `errors.js` (meme pattern Accept-Language) si prochaine passe i18n.
