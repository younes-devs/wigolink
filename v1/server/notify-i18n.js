// Traduction des notifications in-app (suite du pattern i18n serveur de errors.js).
//
// Différence clé avec les erreurs API : une notification est PERSISTÉE au moment de
// l'événement (db.notifications), puis lue plus tard — potentiellement par un compte qui
// a changé de langue entretemps, ou consultée par un tiers (admin) dans une autre langue.
// On ne peut donc pas figer le texte en français à la création : notify() stocke une clé
// de template + des paramètres structurés, et la traduction se fait à la LECTURE
// (GET /api/notifications) selon req.lang, comme errors.js le fait pour body.error.
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
    fr: (p) => `${p.name} transporte « ${p.title} ». Paiement séquestré.`,
    ar: (p) => `${p.name} ينقل « ${p.title} ». الدفع محجوز.`,
    nl: (p) => `${p.name} vervoert « ${p.title} ». Betaling in bewaring.`,
  },
  'tx.sealed': {
    fr: (p) => `Colis scellé et filmé pour « ${p.title} ». Organisez la remise.`,
    ar: (p) => `تم ختم الطرد وتصويره لـ « ${p.title} ». نظّم التسليم.`,
    nl: (p) => `Pakket verzegeld en gefilmd voor « ${p.title} ». Regel de overdracht.`,
  },
  'tx.pickedUp': {
    fr: () => 'Colis pris en charge par le voyageur — en transit.',
    ar: () => 'استلم المسافر الطرد — قيد النقل.',
    nl: () => 'Pakket overgenomen door de reiziger — onderweg.',
  },
  'tx.refused': {
    fr: () => "Le voyageur a refusé le transport (sans pénalité). Votre annonce est republiée et remboursée.",
    ar: () => 'رفض المسافر النقل (دون عقوبة). أُعيد نشر إعلانك وتم استرداد المبلغ.',
    nl: () => 'De reiziger heeft het vervoer geweigerd (zonder boete). Uw zoekertje is opnieuw gepubliceerd en terugbetaald.',
  },
  'tx.delivered.traveler': {
    fr: (p) => `Livraison validée — ${p.amount} € versés sur votre compte.`,
    ar: (p) => `تم تأكيد التسليم — تم تحويل ${p.amount} € إلى حسابك.`,
    nl: (p) => `Levering bevestigd — ${p.amount} € gestort op uw rekening.`,
  },
  'tx.delivered.sender': {
    fr: () => 'Colis livré et validé par le destinataire. Pensez à noter vos partenaires.',
    ar: () => 'تم تسليم الطرد وتأكيده من طرف المستلم. لا تنسَ تقييم شركائك.',
    nl: () => 'Pakket geleverd en bevestigd door de ontvanger. Vergeet niet uw partners te beoordelen.',
  },
  'dispute.opened': {
    fr: () => 'Litige ouvert — escrow gelé. Soumettez vos preuves sous 72 h.',
    ar: () => 'فُتح نزاع — الضمان مجمّد. قدّم أدلتك خلال 72 ساعة.',
    nl: () => 'Geschil geopend — escrow bevroren. Dien uw bewijzen in binnen 72 u.',
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

// Rend le texte d'une notification. `n` doit porter soit {key, params}, soit un `text`
// déjà en clair (notifications persistées avant l'introduction des clés — jamais cassées,
// simplement pas traduites).
function renderNotification(lang, n) {
  const tpl = n.key && TEMPLATES[n.key];
  if (!tpl) return n.text || '';
  const fn = tpl[lang] || tpl.fr;
  try { return fn(n.params || {}); } catch { return (tpl.fr)(n.params || {}); }
}

export { TEMPLATES, renderNotification };
