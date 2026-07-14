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
- [done: codex] Rendre l'onboarding premier lancement persistant par compte, pas
  seulement par navigateur. Voir `DONE.md`.
- [done: claude] Garder les pages mobile sans overflow. Audit 2026-07-14 sur
  375px (13 routes produit + onglets admin KPIs/Fraude denses en grilles) :
  scrollWidth === clientWidth partout, document et `.content`, aucun
  correctif necessaire. A re-verifier si de nouveaux composants larges
  (tableaux, grilles fixes) sont ajoutes. Voir `DONE.md`.

## Idees de gros chantiers

- [todo] Notifications et relances plus fines pour transactions bloquees.
- [todo] Tableau de bord admin avec actions rapides plus poussees.
- [todo] Revue UX complete du parcours creation annonce -> matching -> transaction.
- [done: claude] Durcir la strategie i18n fr/ar/nl sur les nouvelles pages produit.
  nl.js resynchronise a 840/840/840 cles avec fr.js/ar.js (378 cles ajoutees,
  parite verifiee au script). Voir `DONE.md` 2026-07-14.
- [done: claude+codex] Les notifications serveur sont traduites a la lecture
  selon `Accept-Language` en fr/ar/nl. Claude a ajoute `notify-i18n.js` et la
  traduction de `/api/notifications`; Codex a etendu la meme regle aux
  notifications renvoyees par `/api/dashboard`.
