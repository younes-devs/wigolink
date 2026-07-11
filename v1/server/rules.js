// Moteur de règles catalogue (PRD §4.2) — côté serveur, modifiable sans release app.

export const WHITELIST = [
  { id: 'argan', label: "Huile d'argan scellée", maxQty: '5 L', icon: '🫒' },
  { id: 'miel', label: 'Miel conditionné', maxQty: '5 kg', icon: '🍯' },
  { id: 'epices', label: "Épices emballées d'origine", maxQty: '3 kg', icon: '🌶️' },
  { id: 'safran', label: 'Safran', maxQty: '100 g', icon: '🌸' },
  { id: 'amlou', label: 'Amlou', maxQty: '3 kg', icon: '🥜' },
  { id: 'huiles-essentielles', label: 'Huiles essentielles scellées', maxQty: '1 L', icon: '💧' },
  { id: 'dattes', label: 'Dattes', maxQty: '5 kg', icon: '🌴' },
  { id: 'cosmetiques', label: 'Cosmétiques naturels scellés', maxQty: '3 kg', icon: '🧴' },
];

export const BLACKLIST = [
  { id: 'complements', label: 'Compléments alimentaires / gélules', reason: 'Risque ONSSA — interdit en V1' },
  { id: 'medicaments', label: 'Médicaments', reason: 'Interdit — produit réglementé' },
  { id: 'frais', label: 'Produits frais / périssables non scellés', reason: 'Risque sanitaire et douanier' },
  { id: 'liquides-non-scelles', label: "Liquides non scellés d'origine", reason: 'Contenu non vérifiable' },
  { id: 'tabac', label: 'Tabac', reason: 'Produit réglementé' },
  { id: 'alcool', label: 'Alcool', reason: 'Produit réglementé' },
  { id: 'electronique', label: 'Électronique', reason: 'Hors périmètre V1 (valeur, contrefaçon)' },
  { id: 'argent', label: 'Argent / objets de valeur', reason: 'Interdit absolu' },
  { id: 'documents', label: 'Documents officiels', reason: 'Interdit absolu' },
];

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
