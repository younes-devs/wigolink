import generatedTranslations from './i18n/generated-en-es.js';

// Traduction des notifications in-app.
//
// Différence clé avec les erreurs API : une notification est PERSISTÉE au moment de
// l'événement (db.notifications), puis lue plus tard — potentiellement par un compte qui
// a changé de langue entretemps, ou consultée par un tiers (admin) dans une autre langue.
// On ne peut donc pas figer le texte en français à la création : notify() stocke une clé
// de template + des paramètres structurés, et la traduction se fait à la LECTURE
// (GET /api/notifications) selon req.lang.
//
// Les notifications déjà persistées avant ce changement n'ont pas de `key` (juste `text`,
// en français) — translateNotification les laisse passer telles quelles, jamais cassées.

const TEMPLATES = {
  'offer.expiring': {
    fr: (p) => `Rappel : la proposition « ${p.title} » expire bientôt.`,
    ar: (p) => `تذكير: العرض « ${p.title} » سينتهي قريباً.`,
    nl: (p) => `Herinnering: het voorstel « ${p.title} » verloopt binnenkort.`,
  },
  'offer.expired': {
    fr: (p) => `La proposition « ${p.title} » a expiré.`,
    ar: (p) => `انتهت صلاحية العرض « ${p.title} ».`,
    nl: (p) => `Het voorstel « ${p.title} » is verlopen.`,
  },
  'offer.received': {
    fr: (p) => `${p.name} vous propose de transporter « ${p.title} ».`,
    ar: (p) => `${p.name} يقترح عليك نقل « ${p.title} ».`,
    nl: (p) => `${p.name} stelt voor om « ${p.title} » te vervoeren.`,
  },
  'offer.declined': {
    fr: (p) => `${p.name} a décliné la proposition.`,
    ar: (p) => `${p.name} رفض العرض.`,
    nl: (p) => `${p.name} heeft het voorstel geweigerd.`,
  },
  'offer.refused': {
    fr: () => 'Le voyageur a refuse la demande. Aucun paiement n a ete pris.',
    ar: () => 'رفض المسافر الطلب. لم يتم أخذ أي دفعة.',
    nl: () => 'De reiziger heeft de aanvraag geweigerd. Er is geen betaling genomen.',
  },
  'offer.withdrawn': {
    fr: (p) => `${p.name} a retiré sa proposition.`,
    ar: (p) => `${p.name} سحب عرضه.`,
    nl: (p) => `${p.name} heeft zijn voorstel ingetrokken.`,
  },
  'offer.countered': {
    fr: (p) => `${p.name} a envoyé une contre-proposition.`,
    ar: (p) => `${p.name} أرسل عرضاً مضاداً.`,
    nl: (p) => `${p.name} heeft een tegenvoorstel verstuurd.`,
  },
  'tx.accepted': {
    fr: (p) => `${p.name} transporte « ${p.title} ». Opération confirmée.`,
    ar: (p) => `${p.name} ينقل « ${p.title} ». تم تأكيد العملية.`,
    nl: (p) => `${p.name} vervoert « ${p.title} ». Operatie bevestigd.`,
  },
  'tx.pickedUp': {
    fr: () => 'Colis pris en charge par le voyageur — en transit.',
    ar: () => 'استلم المسافر الطرد — قيد النقل.',
    nl: () => 'Pakket overgenomen door de reiziger — onderweg.',
  },
  'tx.refused': {
    fr: () => 'Le voyageur a refusé le transport. L’opération est annulée sans pénalité.',
    ar: () => 'رفض المسافر النقل. أُلغيت العملية دون عقوبة.',
    nl: () => 'De reiziger heeft het vervoer geweigerd. De operatie is zonder boete geannuleerd.',
  },
  'tx.delivered.traveler': {
    fr: () => 'Livraison validée. L’opération est terminée.',
    ar: () => 'تم تأكيد التسليم. اكتملت العملية.',
    nl: () => 'Levering bevestigd. De operatie is voltooid.',
  },
  'tx.delivered.sender': {
    fr: () => 'Colis livré et validé par le destinataire. Pensez à noter vos partenaires.',
    ar: () => 'تم تسليم الطرد وتأكيده من طرف المستلم. لا تنسَ تقييم شركائك.',
    nl: () => 'Pakket geleverd en bevestigd door de ontvanger. Vergeet niet uw partners te beoordelen.',
  },
  'dispute.opened': {
    fr: () => 'Litige ouvert. Soumettez vos preuves sous 72 h.',
    ar: () => 'فُتح نزاع. قدّم أدلتك خلال 72 ساعة.',
    nl: () => 'Geschil geopend. Dien uw bewijzen in binnen 72 u.',
  },
  'chat.message': {
    fr: (p) => `${p.name} vous a envoyé un message.`,
    ar: (p) => `أرسل لك ${p.name} رسالة.`,
    nl: (p) => `${p.name} heeft u een bericht gestuurd.`,
  },
  'kyc.verified': {
    fr: () => 'Votre identité a été vérifiée. Vous pouvez maintenant envoyer et transporter.',
    ar: () => 'تم التحقق من هويتك. يمكنك الآن الإرسال والنقل.',
    nl: () => 'Uw identiteit is geverifieerd. U kunt nu versturen en vervoeren.',
  },
  'kyc.refusedFinal': {
    fr: () => 'Votre vérification a été refusée définitivement après plusieurs tentatives. Contactez le support.',
    ar: () => 'رُفض توثيقك نهائياً بعد عدة محاولات. تواصل مع الدعم.',
    nl: () => 'Uw verificatie is definitief geweigerd na meerdere pogingen. Contacteer de support.',
  },
  'kyc.rejected': {
    fr: (p) => `Votre vérification a été rejetée : ${p.reason}. Vous pouvez soumettre à nouveau.`,
    ar: (p) => `رُفض توثيقك: ${p.reason}. يمكنك الإرسال من جديد.`,
    nl: (p) => `Uw verificatie is geweigerd: ${p.reason}. U kunt opnieuw indienen.`,
  },
  'kyc.refused': {
    fr: (p) => `Votre vérification a été définitivement refusée : ${p.reason}. Contactez le support.`,
    ar: (p) => `رُفض توثيقك نهائياً: ${p.reason}. تواصل مع الدعم.`,
    nl: (p) => `Uw verificatie is definitief geweigerd: ${p.reason}. Contacteer de support.`,
  },
  'dispute.resolved.traveler': {
    fr: () => 'Litige tranché : paiement versé au voyageur.',
    ar: () => 'حُسم النزاع: تم الدفع للمسافر.',
    nl: () => 'Geschil beslecht: betaling uitgevoerd aan de reiziger.',
  },
  'dispute.resolved.sender': {
    fr: () => 'Litige tranché : expéditeur remboursé.',
    ar: () => 'حُسم النزاع: تم استرداد المبلغ للمرسل.',
    nl: () => 'Geschil beslecht: verzender terugbetaald.',
  },
};

function interpolate(template, params = {}) {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => params[key] ?? `{${key}}`);
}

for (const [key, translations] of Object.entries(generatedTranslations.notifications)) {
  if (!TEMPLATES[key]) continue;
  TEMPLATES[key].en = (params) => interpolate(translations.en, params);
  TEMPLATES[key].es = (params) => interpolate(translations.es, params);
}

// Rend le texte d'une notification. `n` doit porter soit {key, params}, soit un `text`
// déjà en clair (notifications persistées avant l'introduction des clés — jamais cassées,
// simplement pas traduites).
function renderNotification(lang, n) {
  const tpl = n.key && TEMPLATES[n.key];
  if (!tpl) return renderLegacyNotification(lang, n.text || '');
  const fn = tpl[lang] || tpl.fr;
  try { return fn(n.params || {}); } catch { return (tpl.fr)(n.params || {}); }
}

const LEGACY_PATTERNS = [
  {
    re: /^(.+) vous propose de transporter « (.+) »\.$/,
    ar: (m) => `${m[1]} يقترح عليك نقل « ${m[2]} ».`,
    nl: (m) => `${m[1]} stelt voor om « ${m[2]} » te vervoeren.`,
    en: (m) => `${m[1]} offers to carry “${m[2]}”.`,
    es: (m) => `${m[1]} se ofrece a transportar «${m[2]}».`,
  },
  {
    re: /^(.+) a décliné la proposition\.$/,
    ar: (m) => `${m[1]} رفض العرض.`,
    nl: (m) => `${m[1]} heeft het voorstel geweigerd.`,
    en: (m) => `${m[1]} declined the offer.`,
    es: (m) => `${m[1]} rechazó la propuesta.`,
  },
  {
    re: /^(.+) a retiré sa proposition\.$/,
    ar: (m) => `${m[1]} سحب عرضه.`,
    nl: (m) => `${m[1]} heeft zijn voorstel ingetrokken.`,
    en: (m) => `${m[1]} withdrew their offer.`,
    es: (m) => `${m[1]} retiró su propuesta.`,
  },
  {
    re: /^(.+) a envoyé une contre-proposition\.$/,
    ar: (m) => `${m[1]} أرسل عرضا مضادا.`,
    nl: (m) => `${m[1]} heeft een tegenvoorstel verstuurd.`,
    en: (m) => `${m[1]} sent a counter-offer.`,
    es: (m) => `${m[1]} envió una contrapropuesta.`,
  },
  {
    re: /^(.+) transporte « (.+) »\. Paiement séquestré\.$/,
    ar: (m) => `${m[1]} ينقل « ${m[2]} ». الدفع محجوز.`,
    nl: (m) => `${m[1]} vervoert « ${m[2]} ». Betaling in bewaring.`,
    en: (m) => `${m[1]} is carrying “${m[2]}”. Payment is held in escrow.`,
    es: (m) => `${m[1]} transporta «${m[2]}». El pago está en depósito.`,
  },
  {
    re: /^(.+) vous a envoyé un message\.$/,
    ar: (m) => `أرسل لك ${m[1]} رسالة.`,
    nl: (m) => `${m[1]} heeft u een bericht gestuurd.`,
    en: (m) => `${m[1]} sent you a message.`,
    es: (m) => `${m[1]} te envió un mensaje.`,
  },
];

function renderLegacyNotification(lang, text) {
  if (!text || lang === 'fr') return text;
  for (const template of Object.values(TEMPLATES)) {
    try {
      if (template.fr({}) === text) return (template[lang] || template.fr)({});
    } catch {
      // Les modèles dynamiques sont couverts par les motifs ci-dessous.
    }
  }
  for (const pattern of LEGACY_PATTERNS) {
    const match = text.match(pattern.re);
    if (match && pattern[lang]) return pattern[lang](match);
  }
  return text;
}

export { LEGACY_PATTERNS, TEMPLATES, renderLegacyNotification, renderNotification };
