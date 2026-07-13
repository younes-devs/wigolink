# PRD — SEO & stratégie de mots-clés
### CloudKilo · Addendum au PRD v1.0 · Juillet 2026

---

## 1. Constat technique préalable (à lire avant tout le reste)

**L'app actuelle n'est pas indexable, et ce n'est pas un détail à corriger en passant.**

CloudKilo est une SPA React 100 % côté client (Vite, pas de SSR). Le HTML livré au
navigateur — et donc à Googlebot — est :

```html
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

Aucun contenu réel n'existe avant l'exécution du JavaScript. De plus, **presque tous les
écrans exigent une connexion** (`kycStatus`, `auth` middleware) — le feed, les annonces, les
profils, tout est derrière un mur d'authentification. Un moteur de recherche ne verra jamais
ce contenu, et ce n'est **pas souhaitable** qu'il le voie : ce sont des données utilisateur,
pas du contenu marketing.

**Conséquence directe sur ce PRD** : le SEO ne peut pas porter sur l'app elle-même. Il porte
sur un **site public séparé** (landing + pages de contenu), qui redirige vers l'app pour tout
ce qui est transactionnel. C'est la même distinction que le plan de projet fait déjà entre le
« V0 Concierge » (landing publique) et le « V1 MVP » (app authentifiée) — le SEO se construit
sur la partie publique, jamais sur la partie privée.

**Non-négociable** : les pages de l'app (`/`, `/transactions`, `/profil`, `/admin`, etc.)
doivent explicitement porter `noindex` — les indexer serait à la fois inutile (contenu vide
pour un crawler) et risqué (fuite d'URLs internes, contenu dupliqué par utilisateur).

---

## 2. Objectif

Construire la présence organique de CloudKilo sur les recherches liées à l'envoi de produits
entre la Belgique/France et le Maroc, en ciblant la diaspora marocaine (2M+ de personnes,
PRD §1.1) — sans dépendre uniquement de publicité payante.

**Ce que le SEO doit accomplir concrètement** : amener un visiteur qui cherche
« envoyer huile d'argan Belgique » jusqu'à une page qui répond à sa question, explique le
fonctionnement, et le convertit vers l'inscription/V0 (formulaire de demande).

---

## 3. Ce qui est indexable (et ce qui ne l'est pas)

| Surface | Indexable ? | Traitement |
|---|---|---|
| Landing page publique (V0, hors app) | Oui | Cible principale du SEO |
| Pages corridor (« Bruxelles ↔ Casablanca ») | Oui | Contenu dédié par trajet, évolutif avec V2 |
| Pages produit/catégorie (argan, safran, miel…) | Oui | Contenu éducatif + trust, aligné liste blanche §4.2 |
| Guide/blog (douane, sécurité, témoignages) | Oui | Contenu de fond, cible longue traîne |
| CGU / Politique de confidentialité | Oui, mais faible priorité | Utile pour la confiance (E-E-A-T), peu de volume de recherche |
| App authentifiée (`/`, `/transactions`, `/profil`, `/admin`, `/annonce/:id`…) | **Non — noindex explicite** | Contenu privé/vide pour un crawler, à exclure |
| `/verification` (KYC) | **Non — noindex** | Donnée personnelle |

---

## 4. Recherche de mots-clés

### 4.1 Intentions et clusters

| Cluster | Exemples de requêtes | Intention | Volume estimé |
|---|---|---|---|
| Générique corridor | « envoyer colis Maroc Belgique », « transport collaboratif Maroc » | Découverte | Faible-moyen, peu concurrentiel |
| Produit + destination | « envoyer huile d'argan en Belgique », « acheter safran Taliouine livraison Belgique » | Intention forte, proche conversion | Faible unitaire, nombreux en cumulé (longue traîne) |
| Voyageur / rémunération | « gagner de l'argent en transportant un colis », « voyageur Bruxelles Casablanca rémunéré » | Recrutement côté offre (voyageurs) | Faible, mais cible précieuse |
| Confiance / sécurité | « comment envoyer un colis en toute sécurité au Maroc », « arnaque transport colis Maroc groupe Facebook » | Réassurance, capte la frustration du système informel actuel (PRD §1.1) | Moyen — angle éditorial fort |
| Douane / réglementation | « franchise douanière Maroc Belgique », « quantité autorisée huile d'argan douane » | Informationnel, capte tôt dans le parcours de décision | Moyen |
| Marque (une fois connue) | « CloudKilo avis », « CloudKilo application » | Navigationnel | Croît avec la notoriété |

**Priorité de lancement** : le cluster « confiance/sécurité » est le plus stratégique — il
répond directement au problème que le PRD identifie comme le moteur du produit (§1.1 :
transactions informelles sans sécurité). C'est aussi le contenu le plus facile à écrire avec
autorité, puisqu'il documente ce que le produit fait déjà (escrow, KYC, vidéo de scellage).

### 4.2 Ce qu'on ne peut pas encore cibler sérieusement

Les corridors V2 (Paris, Lille, Anvers ↔ Tanger, Rabat, Agadir — PRD §7) n'existent pas
encore fonctionnellement. Créer des pages SEO pour des corridors non lancés est le classique
piège du « contenu vide » qui nuit à l'autorité du domaine. **Une page corridor n'est publiée
qu'au lancement réel du corridor**, pas avant.

---

## 5. Exigences techniques

### 5.1 Fondations (bloquant, à faire en premier)

| # | Exigence | Détail |
|---|---|---|
| T1 | `robots.txt` | Autorise l'exploration du site public, **bloque explicitement** `/transactions`, `/profil`, `/admin`, `/verification`, `/annonce/*`, `/envois*` |
| T2 | Balise `noindex` sur l'app | Meta robots `noindex, nofollow` injectée sur toutes les routes authentifiées (via `<Route>` wrapper ou meta dynamique) |
| T3 | Rendu côté serveur ou pré-rendu pour les pages publiques | Sans ça, rien de ce qui suit n'a d'effet — Googlebot exécute le JS mais avec des limites de budget de crawl ; le pré-rendu (SSG) élimine le risque |
| T4 | `sitemap.xml` | Généré automatiquement à partir des pages publiques (landing, corridors actifs, articles), soumis à Google Search Console |
| T5 | URLs propres et stables | `/envoyer-colis/bruxelles-casablanca`, `/produits/huile-argan`, pas de paramètres techniques dans les URLs publiques |

### 5.2 Par page

| # | Exigence | Détail |
|---|---|---|
| T6 | `<title>` unique par page | 50-60 caractères, mot-clé principal en tête |
| T7 | Meta description unique | 140-160 caractères, incite au clic (pas juste descriptif) |
| T8 | Balises `<h1>` uniques et hiérarchie `<h2>`/`<h3>` cohérente | Une seule `<h1>` par page, structure logique |
| T9 | Open Graph + Twitter Card | Image, titre, description — pour le partage sur les groupes Facebook/WhatsApp de la diaspora (canal de distribution naturel identifié au PRD §9) |
| T10 | Données structurées (JSON-LD) | `Organization` (toutes pages), `FAQPage` (pages guide), `BreadcrumbList` (navigation), `Product`/`Service` sur les pages catégorie |
| T11 | Attribut `lang` correct | `fr` pour le contenu francophone ; `hreflang` réservé pour quand l'arabe/darija (PRD V1.1) et le néerlandais (V2) seront ajoutés |
| T12 | Canonical | Une URL canonique par page, évite la duplication (ex. variantes avec/sans slash final) |
| T13 | Images optimisées | `alt` descriptif, format moderne (WebP/AVIF), dimensions explicites (évite le CLS) |

### 5.3 Performance (Core Web Vitals)

Les Core Web Vitals sont un facteur de classement direct et affectent aussi la conversion.
Cible : LCP < 2,5s, CLS < 0,1, INP < 200ms sur les pages publiques (mobile en priorité — le
public cible, peu technophile selon le PRD §6, est majoritairement mobile).

- Le pré-rendu (T3) résout la majorité du LCP
- Éviter tout appel API bloquant le rendu initial des pages publiques (elles ne devraient
  dépendre d'aucune donnée dynamique de l'app)
- Charger les polices et images en priorité, différer tout script non essentiel

### 5.4 Suivi

- Google Search Console connecté dès la mise en ligne du site public (indexation, erreurs, requêtes)
- Un KPI SEO ajouté au tableau de bord existant (§7 du plan de projet) : trafic organique →
  inscriptions V0, pour éviter de suivre le SEO comme une métrique de vanité déconnectée du
  reste (le plan est explicite là-dessus : *« vanity metrics à ignorer : téléchargements,
  inscriptions sans transaction »* — même logique à appliquer au trafic SEO)

---

## 6. Architecture de l'information (pages publiques à créer)

```
/                                    Landing (proposition de valeur, comment ça marche, CTA V0)
/comment-ca-marche                   Parcours détaillé, rassurance (escrow, KYC, vidéo)
/envoyer-colis/bruxelles-casablanca  Page corridor (lancement V1)
/produits/huile-argan                Page catégorie (liste blanche §4.2), une par produit phare
/produits/safran-taliouine
/produits/miel
/guide/douane-maroc-belgique         Franchise, quantités autorisées — contenu informationnel
/guide/comment-envoyer-en-securite   Angle confiance/sécurité (cluster prioritaire §4.1)
/cgu                                 Déjà existant dans l'app, à rendre indexable séparément
/confidentialite                     Idem
/blog/                               Contenu éditorial continu (témoignages, actualités corridor)
```

Chaque page produit/guide se termine par un appel à l'action vers le formulaire V0 (ou
l'inscription V1 une fois lancée) — le SEO n'est utile que s'il convertit, pas comme
vitrine isolée.

---

## 7. Stratégie hors-page (off-page)

- **Canal naturel identifié au PRD (§9)** : les groupes Facebook/WhatsApp de la diaspora sont
  déjà le lieu où ce besoin s'exprime. Les pages guide (surtout « comment envoyer en
  sécurité ») sont conçues pour être partageables dans ces groupes — c'est un levier de
  backlinks et de trafic direct simultané.
- Annuaires et médias de la diaspora marocaine (BE/FR) — présence et liens
- Partenariats avec associations/commerces de produits du terroir marocain
- Une fois des transactions réelles complétées (V0/V1), témoignages et avis authentiques
  (attention à l'E-E-A-T : pas de faux avis, le PRD est déjà strict sur l'intégrité du
  système de notation)

---

## 8. KPIs SEO

Alignés sur la logique du plan de projet (mesurer ce qui compte, pas ce qui est facile à
mesurer) :

| KPI | Cible à 6 mois post-lancement du site public |
|---|---|
| Pages indexées (Search Console) | 100 % des pages publiques soumises |
| Position moyenne sur le cluster « confiance/sécurité » | Top 10 sur au moins 3 requêtes |
| Trafic organique → inscriptions V0/V1 | Suivi en cohorte, pas en volume brut |
| Core Web Vitals (pages publiques) | 100 % « Good » sur mobile (Search Console) |
| Backlinks de sources diaspora/thématiques | Croissance mensuelle suivie, qualité > quantité |

**Vanity metric à ignorer explicitement** : le trafic organique brut sans lien avec les
inscriptions ou transactions — même logique que le reste du plan (§8 du plan de projet).

---

## 9. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Contenu publié pour des corridors non lancés | Pages vides/trompeuses, nuit à l'autorité du domaine | Publier une page corridor uniquement au lancement réel |
| Indexation accidentelle de l'app authentifiée | Fuite d'URLs internes, contenu dupliqué par utilisateur, mauvaise expérience pour le crawler | `noindex` systématique + robots.txt (§5.1), à tester avant mise en prod |
| Marché de niche à faible volume de recherche | ROI SEO lent à mesurer | Prioriser la longue traîne et le cluster confiance/sécurité plutôt que des têtes de requêtes génériques et concurrentielles |
| Contenu douane/réglementaire inexact | Risque de désinformation + risque légal (même thème que le risque n°1 du PRD principal, §9) | Contenu réglementaire relu par le même conseil juridique que la Phase A du plan, pas improvisé côté marketing |
| Effort de contenu qui déborde sur le temps de build produit | Retarde le V1 | Le contenu SEO est un flux V0/parallèle, pas une dépendance bloquante pour le build du produit |

---

## 10. Ce que ce PRD ne couvre pas (hors périmètre)

- SEA / publicité payante (Google Ads, Meta Ads) — canal complémentaire, pas traité ici
- SEO international multi-langue (arabe/darija, néerlandais) — dépend du calendrier
  d'internationalisation du produit (PRD V1.1/V2), prématuré tant que le contenu n'existe
  qu'en français
- Réécriture de l'app en SSR (Next.js, Remix, etc.) — hors scope : seules les pages
  publiques ont besoin de pré-rendu, pas l'app authentifiée entière

---

## 11. Questions ouvertes

1. Le site public vit-il sur le même domaine que l'app (`cloudkilo.app/`) avec une séparation
   technique interne, ou sur un sous-domaine dédié (`www.cloudkilo.app` vs `app.cloudkilo.app`) ?
   Impacte l'architecture de pré-rendu (T3).
2. Qui rédige le contenu éditorial (guide, blog) — interne ou prestataire ? Impacte le rythme
   de publication.
3. Le nom de marque définitif (question A6 du plan de projet, toujours ouverte) doit être
   tranché avant toute stratégie de mots-clés de marque — inutile de optimiser sur un nom
   provisoire.

---

*Document de travail — sert de base à l'implémentation. Le volet contenu douane/réglementaire
doit être validé par un conseil juridique avant publication, comme le reste du volet légal du
projet.*
