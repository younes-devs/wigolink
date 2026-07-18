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

// This runs on the server. Normalization catches punctuation, accents, Arabic
// digits and simple obfuscation before a message is persisted.
const EXTERNAL_CONTACT = [
  'whatsapp', 'telegram', 'signal', 'viber', 'wechat', 'line', 'instagram', 'insta',
  'facebook', 'messenger', 'snapchat', 'tiktok', 'linkedin', 'discord', 'telefono',
  'telefon', 'telephone', 'tel', 'numero', 'nummer', 'call me', 'appelle moi',
  'llamame', 'ruf mich an', 'schreib mir', 'escribeme', 'contact me', 'outside the app',
  'off platform', 'hors app', 'en dehors de l app', 'fuera de la app', 'ausserhalb der app',
  'buiten de app', 'واتساب', 'تلغرام', 'تيليجرام', 'سيغنال', 'رقمي', 'رقم الهاتف', 'اتصل بي',
  'راسلني', 'خارج التطبيق', 'خارج المنصة', 'انستغرام', 'فيسبوك',
];
const EXTERNAL_PAYMENT = [
  'paypal', 'pay pal', 'revolut', 'wise', 'western union', 'moneygram', 'money gram',
  'bank transfer', 'wire transfer', 'cashapp', 'cash app', 'venmo', 'zelle', 'crypto',
  'bitcoin', 'usdt', 'binance', 'virement', 'vire moi', 'especes', 'cash', 'pago fuera',
  'transferencia bancaria', 'efectivo', 'transferencia', 'uberweisung', 'bankuberweisung',
  'barzahlung', 'krypto', 'overschrijving', 'bankoverschrijving', 'contant', 'تحويل بنكي',
  'حوالة', 'كاش', 'نقدا', 'بيتكوين', 'عملات رقمية', 'بايبال',
];
const WORD_DIGITS = [
  'zero', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'one', 'two', 'three', 'four', 'five', 'seven', 'eight', 'nine', 'cero', 'uno', 'dos',
  'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'null', 'eins', 'zwei',
  'drei', 'vier', 'funf', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'nul', 'een', 'twee',
  'drie', 'vijf', 'zes', 'zeven', 'negen', 'صفر', 'واحد', 'اثنان', 'اثنين', 'ثلاثة',
  'اربعة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
];
const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

export function normalizeSafetyText(value) {
  return String(value || '')
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] || digit)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[^\p{L}\p{N}@+]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function containsKeyword(normalized, compact, keywords) {
  return keywords.some((keyword) => {
    const value = normalizeSafetyText(keyword);
    return normalized.includes(value) || compact.includes(value.replace(/\s+/g, ''));
  });
}
function wordDigitRun(normalized) {
  let run = 0;
  for (const token of normalized.split(' ').filter(Boolean)) {
    if (WORD_DIGITS.includes(token)) { run += 1; if (run >= 5) return true; } else run = 0;
  }
  return false;
}
export function analyzeMessageSafety(text) {
  const raw = String(text || '');
  const normalized = normalizeSafetyText(raw);
  const compact = normalized.replace(/\s+/g, '');
  const categories = [];
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(raw)) categories.push('email');
  if (/(?:https?:\/\/|www\.|\.(?:com|net|org|io|me)\b)/i.test(raw)) categories.push('url');
  if (/@[a-z0-9_.]{3,}/i.test(raw)) categories.push('social_handle');
  if (/\+?\d(?:[\s().-]*\d){7,}/.test(normalized) || /\d{8,}/.test(compact)) categories.push('phone');
  if (wordDigitRun(normalized)) categories.push('phone_words');
  if (containsKeyword(normalized, compact, EXTERNAL_CONTACT)) categories.push('off_platform_contact');
  if (containsKeyword(normalized, compact, EXTERNAL_PAYMENT)) categories.push('external_payment');
  const unique = [...new Set(categories)];
  return { blocked: unique.length > 0, categories: unique, severity: unique.some((item) => ['external_payment', 'phone', 'email'].includes(item)) ? 'high' : unique.length ? 'medium' : 'none' };
}
export function detectLeak(text) { return analyzeMessageSafety(text).blocked; }
