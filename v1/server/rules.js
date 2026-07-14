// Moteur de règles catalogue (PRD §4.2) — côté serveur, modifiable sans release app.

// `label`/`reason` (français) restent la référence stockée dans les données ;
// `i18n` porte les variantes affichées, servies par /api/rules selon Accept-Language.
export const WHITELIST = [
  { id: 'argan', label: "Huile d'argan scellée", maxQty: '5 L', icon: '🫒', i18n: { ar: 'زيت أركان مختوم', nl: 'Verzegelde arganolie' } },
  { id: 'miel', label: 'Miel conditionné', maxQty: '5 kg', icon: '🍯', i18n: { ar: 'عسل معبأ', nl: 'Verpakte honing' } },
  { id: 'epices', label: "Épices emballées d'origine", maxQty: '3 kg', icon: '🌶️', i18n: { ar: 'توابل بتغليف أصلي', nl: 'Origineel verpakte kruiden' } },
  { id: 'safran', label: 'Safran', maxQty: '100 g', icon: '🌸', i18n: { ar: 'زعفران', nl: 'Saffraan' } },
  { id: 'amlou', label: 'Amlou', maxQty: '3 kg', icon: '🥜', i18n: { ar: 'أملو', nl: 'Amlou' } },
  { id: 'huiles-essentielles', label: 'Huiles essentielles scellées', maxQty: '1 L', icon: '💧', i18n: { ar: 'زيوت أساسية مختومة', nl: 'Verzegelde essentiële oliën' } },
  { id: 'dattes', label: 'Dattes', maxQty: '5 kg', icon: '🌴', i18n: { ar: 'تمور', nl: 'Dadels' } },
  { id: 'cosmetiques', label: 'Cosmétiques naturels scellés', maxQty: '3 kg', icon: '🧴', i18n: { ar: 'مستحضرات تجميل طبيعية مختومة', nl: 'Verzegelde natuurlijke cosmetica' } },
];

export const BLACKLIST = [
  { id: 'complements', label: 'Compléments alimentaires / gélules', reason: 'Risque ONSSA — interdit en V1',
    i18n: { ar: 'مكمّلات غذائية / كبسولات', nl: 'Voedingssupplementen / capsules' },
    reasonI18n: { ar: 'خطر ONSSA — ممنوع في V1', nl: 'ONSSA-risico — verboden in V1' } },
  { id: 'medicaments', label: 'Médicaments', reason: 'Interdit — produit réglementé',
    i18n: { ar: 'أدوية', nl: 'Medicijnen' },
    reasonI18n: { ar: 'ممنوع — منتج منظَّم', nl: 'Verboden — gereglementeerd product' } },
  { id: 'frais', label: 'Produits frais / périssables non scellés', reason: 'Risque sanitaire et douanier',
    i18n: { ar: 'منتجات طازجة / قابلة للتلف غير مختومة', nl: 'Verse / bederfelijke niet-verzegelde producten' },
    reasonI18n: { ar: 'خطر صحي وجمركي', nl: 'Sanitair en douanerisico' } },
  { id: 'liquides-non-scelles', label: "Liquides non scellés d'origine", reason: 'Contenu non vérifiable',
    i18n: { ar: 'سوائل غير مختومة أصلياً', nl: 'Niet origineel verzegelde vloeistoffen' },
    reasonI18n: { ar: 'محتوى غير قابل للتحقق', nl: 'Inhoud niet verifieerbaar' } },
  { id: 'tabac', label: 'Tabac', reason: 'Produit réglementé',
    i18n: { ar: 'تبغ', nl: 'Tabak' },
    reasonI18n: { ar: 'منتج منظَّم', nl: 'Gereglementeerd product' } },
  { id: 'alcool', label: 'Alcool', reason: 'Produit réglementé',
    i18n: { ar: 'كحول', nl: 'Alcohol' },
    reasonI18n: { ar: 'منتج منظَّم', nl: 'Gereglementeerd product' } },
  { id: 'electronique', label: 'Électronique', reason: 'Hors périmètre V1 (valeur, contrefaçon)',
    i18n: { ar: 'إلكترونيات', nl: 'Elektronica' },
    reasonI18n: { ar: 'خارج نطاق V1 (قيمة، تقليد)', nl: 'Buiten scope V1 (waarde, namaak)' } },
  { id: 'argent', label: 'Argent / objets de valeur', reason: 'Interdit absolu',
    i18n: { ar: 'نقود / أشياء ثمينة', nl: 'Geld / waardevolle voorwerpen' },
    reasonI18n: { ar: 'ممنوع منعاً باتاً', nl: 'Absoluut verboden' } },
  { id: 'documents', label: 'Documents officiels', reason: 'Interdit absolu',
    i18n: { ar: 'وثائق رسمية', nl: 'Officiële documenten' },
    reasonI18n: { ar: 'ممنوع منعاً باتاً', nl: 'Absoluut verboden' } },
];

// Variante localisée pour l'affichage (/api/rules). Le français reste la référence :
// les catégories promues dynamiquement (customWhitelist) n'ont pas de i18n → repli FR.
export function localizeCategory(cat, lang) {
  const { i18n, reasonI18n, ...rest } = cat;
  if (!lang || lang === 'fr') return rest;
  return {
    ...rest,
    label: (i18n && i18n[lang]) || cat.label,
    ...(cat.reason ? { reason: (reasonI18n && reasonI18n[lang]) || cat.reason } : {}),
  };
}

// Renvoie { verdict: 'whitelisted' | 'blacklisted' | 'gray', ...info }
export function evaluateCategory(categoryId) {
  const white = WHITELIST.find((c) => c.id === categoryId);
  if (white) return { verdict: 'whitelisted', category: white };
  const black = BLACKLIST.find((c) => c.id === categoryId);
  if (black) return { verdict: 'blacklisted', category: black };
  return { verdict: 'gray' };
}

// Franchise douanière par corridor (PRD §4.2) — valeurs indicatives V1.
export const CUSTOMS = {
  'MA-EU': {
    label: 'Maroc → Europe (Belgique)',
    franchise: '430 € par voyageur (voie aérienne)',
    rules: [
      "Quantités limitées à un usage personnel — pas de quantités commerciales.",
      "Produits alimentaires d'origine animale très restreints (le miel conditionné ≤ 2 kg est toléré).",
      "La valeur totale transportée par le voyageur ne doit pas dépasser la franchise.",
    ],
  },
  'EU-MA': {
    label: 'Europe → Maroc',
    franchise: '2 000 MAD (~185 €) en franchise',
    rules: [
      'Quantités usage personnel uniquement.',
      'Pas de compléments alimentaires (ONSSA) en V1.',
    ],
  },
};

// Détection de désintermédiation (PRD §4.5)
const LEAK_PATTERNS = [
  /\b0[567]\d{8}\b/, // numéros FR/BE/MA
  /\+\d{9,}/,
  /\b\d{2}[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}\b/,
  /whats?app/i,
  /t[ée]l[ée]phone|appelle[- ]moi|mon num/i,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /hors app|en dehors de l'app/i,
];

export function detectLeak(text) {
  return LEAK_PATTERNS.some((re) => re.test(text));
}
