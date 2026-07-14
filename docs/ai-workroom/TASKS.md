# Tasks

Convention:

- `[todo]`: pas commence.
- `[doing: codex]` ou `[doing: claude]`: en cours.
- `[review]`: termine par un agent, attend validation ou reprise.
- `[done]`: termine, verifie, resume dans `DONE.md`.

## File principale

- [doing: claude->codex] Fondation production (PRD P0.1/P0.4/P0.8). Premiere brique
  livree par Claude: schema `docs/supabase-schema.sql`, escrow provider-ready
  (`v1/server/escrow.js`), `.env.example` + `docs/deploiement.md`. Reste:
  adaptateur de persistance repository derriere l'API, collection par collection.
  Codex a ajoute le runtime audit log JSON + endpoint admin pour P0.8, extrait
  `auditLogs`, `notifications`, `messages`, `settings`, KYC, `reviewQueue` et
  `customWhitelist` derriere des repositories JSON, puis ajoute le point
  d'entree `persistence.js` avec garde-fou `PERSISTENCE_DRIVER=postgres`, puis
  branche des repositories Postgres partiels pour `auditLogs`, `notifications`
  et `messages`, puis l'outil de migration JSON -> Postgres pour ces trois
  collections. Prochain candidat: migrer une collection plus centrale
  (`matchingOffers` ou `trips`), toujours avant `transactions`/`listings`. Voir
  `DONE.md` 2026-07-15.
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
- [done: claude] Revue UX complete du parcours creation annonce -> matching ->
  transaction, avec correction directe d'un point bloquant trouve. Bug reel
  trouve et corrige: carte `.shipment-card-head` dans `styles.css`, un pill de
  statut long ecrasait le titre/route a 0px de largeur (mots empiles un par
  un) sur les cartes etroites de la grille 2 colonnes de "Mes envois". Voir
  `DONE.md` 2026-07-14.
- [done: claude] Durcir la strategie i18n fr/ar/nl sur les nouvelles pages produit.
  nl.js resynchronise a 840/840/840 cles avec fr.js/ar.js (378 cles ajoutees,
  parite verifiee au script). Voir `DONE.md` 2026-07-14.
- [done: claude+codex] Les notifications serveur sont traduites a la lecture
  selon `Accept-Language` en fr/ar/nl. Claude a ajoute `notify-i18n.js` et la
  traduction de `/api/notifications`; Codex a etendu la meme regle aux
  notifications renvoyees par `/api/dashboard`.
