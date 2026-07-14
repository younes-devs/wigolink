// Traduction des messages d'erreur de l'API (suite du chantier i18n U14).
// Principe : les messages restent écrits en français dans le code (lisibilité, grep),
// et un middleware traduit `body.error` à la SORTIE selon l'en-tête Accept-Language
// envoyé par le client (fr/ar/nl). Aucun site d'appel à modifier ; tout message absent
// de la table part tel quel (français) — jamais d'erreur cassée.

// Messages exacts → traductions. La clé est le texte français du code.
const ERRORS = {
  // Auth & session
  'Nom trop court': { ar: 'الاسم قصير جداً', nl: 'Naam te kort' },
  'Adresse email invalide': { ar: 'عنوان بريد إلكتروني غير صالح', nl: 'Ongeldig e-mailadres' },
  'Mot de passe : 8 caractères minimum': { ar: 'كلمة المرور: 8 أحرف على الأقل', nl: 'Wachtwoord: minimaal 8 tekens' },
  'Un compte existe déjà avec cet email': { ar: 'يوجد حساب بهذا البريد الإلكتروني', nl: 'Er bestaat al een account met dit e-mailadres' },
  "Vous devez accepter les Conditions Générales d'Utilisation": { ar: 'يجب أن توافق على شروط الاستخدام العامة', nl: 'U moet de Algemene Gebruiksvoorwaarden aanvaarden' },
  'Email ou mot de passe incorrect': { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', nl: 'E-mail of wachtwoord onjuist' },
  'Email Google invalide': { ar: 'بريد Google غير صالح', nl: 'Ongeldig Google-e-mailadres' },
  'Code incorrect': { ar: 'رمز غير صحيح', nl: 'Onjuiste code' },
  'Code expiré — demandez un nouvel envoi': { ar: 'انتهت صلاحية الرمز — اطلب إرسالاً جديداً', nl: 'Code verlopen — vraag een nieuwe aan' },
  'Code expiré — refaites une demande': { ar: 'انتهت صلاحية الرمز — أعد الطلب', nl: 'Code verlopen — dien opnieuw in' },
  'Compte introuvable': { ar: 'الحساب غير موجود', nl: 'Account niet gevonden' },
  'Compte inconnu': { ar: 'حساب غير معروف', nl: 'Onbekend account' },
  'Trop de tentatives — demandez un nouveau code': { ar: 'محاولات كثيرة — اطلب رمزاً جديداً', nl: 'Te veel pogingen — vraag een nieuwe code aan' },
  'Trop de tentatives — réessayez dans 10 minutes': { ar: 'محاولات كثيرة — أعد المحاولة بعد 10 دقائق', nl: 'Te veel pogingen — probeer over 10 minuten opnieuw' },
  'Trop de tentatives — refaites une demande': { ar: 'محاولات كثيرة — أعد الطلب', nl: 'Te veel pogingen — dien opnieuw in' },
  'Trop de demandes — réessayez plus tard': { ar: 'طلبات كثيرة — أعد المحاولة لاحقاً', nl: 'Te veel aanvragen — probeer later opnieuw' },
  'Non authentifié': { ar: 'غير مسجّل الدخول', nl: 'Niet aangemeld' },
  'Non autorisé': { ar: 'غير مصرّح', nl: 'Niet toegestaan' },
  'Utilisateur inconnu': { ar: 'مستخدم غير معروف', nl: 'Onbekende gebruiker' },
  'Utilisateur introuvable': { ar: 'المستخدم غير موجود', nl: 'Gebruiker niet gevonden' },
  'Réservé aux admins': { ar: 'مخصص للمشرفين فقط', nl: 'Enkel voor admins' },
  'Introuvable': { ar: 'غير موجود', nl: 'Niet gevonden' },
  'Champs obligatoires manquants': { ar: 'حقول إلزامية ناقصة', nl: 'Verplichte velden ontbreken' },

  // Annonces & trajets
  'Annonce indisponible': { ar: 'الإعلان غير متاح', nl: 'Zoekertje niet beschikbaar' },
  'Annonce introuvable': { ar: 'الإعلان غير موجود', nl: 'Zoekertje niet gevonden' },
  'Catégorie introuvable': { ar: 'الفئة غير موجودة', nl: 'Categorie niet gevonden' },
  'Cette annonce ne peut plus être modifiée (déjà acceptée)': { ar: 'لا يمكن تعديل هذا الإعلان (تم قبوله)', nl: 'Dit zoekertje kan niet meer bewerkt worden (al aanvaard)' },
  'Cette annonce ne peut plus être retirée (déjà acceptée)': { ar: 'لا يمكن سحب هذا الإعلان (تم قبوله)', nl: 'Dit zoekertje kan niet meer ingetrokken worden (al aanvaard)' },
  'Vous ne pouvez pas transporter votre propre annonce': { ar: 'لا يمكنك نقل إعلانك الخاص', nl: 'U kunt uw eigen zoekertje niet vervoeren' },
  'Au moins une photo du produit est obligatoire': { ar: 'صورة واحدة على الأقل للمنتج إلزامية', nl: 'Minstens één productfoto is verplicht' },
  'Au moins une photo est obligatoire': { ar: 'صورة واحدة على الأقل إلزامية', nl: 'Minstens één foto is verplicht' },
  'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)': { ar: 'صور غير صالحة (JPEG/PNG/WebP، 3 كحد أقصى، 500 ك.ب لكل صورة)', nl: "Ongeldige foto's (JPEG/PNG/WebP, max 3, elk 500 KB)" },
  'Poids invalide': { ar: 'وزن غير صالح', nl: 'Ongeldig gewicht' },
  'Valeur déclarée invalide': { ar: 'قيمة مصرّح بها غير صالحة', nl: 'Ongeldige aangegeven waarde' },
  'Rémunération voyageur invalide': { ar: 'أجر المسافر غير صالح', nl: 'Ongeldige vergoeding voor de reiziger' },
  'Acceptation explicite des règles douanières requise': { ar: 'الموافقة الصريحة على القواعد الجمركية مطلوبة', nl: 'Uitdrukkelijke aanvaarding van de douaneregels vereist' },
  'Trajet introuvable': { ar: 'الرحلة غير موجودة', nl: 'Reis niet gevonden' },
  'Trajet, sens et date requis': { ar: 'الرحلة والاتجاه والتاريخ مطلوبة', nl: 'Reis, richting en datum vereist' },
  'Départ et arrivée identiques': { ar: 'نقطتا الانطلاق والوصول متطابقتان', nl: 'Vertrek en aankomst zijn identiek' },
  'La date est déjà passée': { ar: 'التاريخ قد مضى', nl: 'De datum is al voorbij' },

  // Transactions
  'Transaction introuvable': { ar: 'المعاملة غير موجودة', nl: 'Transactie niet gevonden' },
  'Réservé aux parties de la transaction': { ar: 'مخصص لأطراف المعاملة فقط', nl: 'Enkel voor de partijen van de transactie' },
  'Étape invalide': { ar: 'خطوة غير صالحة', nl: 'Ongeldige stap' },
  "Seul l'expéditeur filme le scellage": { ar: 'المرسل وحده يصوّر الختم', nl: 'Enkel de verzender filmt de verzegeling' },
  'Seul le voyageur valide la prise en charge': { ar: 'المسافر وحده يؤكد الاستلام', nl: 'Enkel de reiziger bevestigt de overname' },
  'Seul le destinataire valide la livraison': { ar: 'المستلم وحده يؤكد التسليم', nl: 'Enkel de ontvanger bevestigt de levering' },
  'Réservé au voyageur': { ar: 'مخصص للمسافر فقط', nl: 'Enkel voor de reiziger' },
  "Code invalide — scannez le QR de l'expéditeur": { ar: 'رمز غير صالح — امسح رمز QR الخاص بالمرسل', nl: 'Ongeldige code — scan de QR van de verzender' },
  'Code invalide — scannez le QR du voyageur': { ar: 'رمز غير صالح — امسح رمز QR الخاص بالمسافر', nl: 'Ongeldige code — scan de QR van de reiziger' },
  'Formation voyageur requise': { ar: 'تدريب المسافر مطلوب', nl: 'Reizigersopleiding vereist' },
  'Certaines réponses sont incorrectes — relisez les règles.': { ar: 'بعض الإجابات غير صحيحة — أعد قراءة القواعد.', nl: 'Sommige antwoorden zijn onjuist — herlees de regels.' },
  'Notation après livraison uniquement': { ar: 'التقييم بعد التسليم فقط', nl: 'Beoordelen kan enkel na levering' },
  'Note invalide (1 à 5)': { ar: 'تقييم غير صالح (من 1 إلى 5)', nl: 'Ongeldige score (1 tot 5)' },
  'Déjà noté': { ar: 'تم التقييم مسبقاً', nl: 'Al beoordeeld' },
  'Cible invalide': { ar: 'هدف غير صالح', nl: 'Ongeldig doelwit' },
  "L'avis ne peut pas contenir de coordonnées de contact (téléphone, email, WhatsApp…)": { ar: 'لا يمكن أن يحتوي التقييم على بيانات اتصال (هاتف، بريد، واتساب…)', nl: 'De beoordeling mag geen contactgegevens bevatten (telefoon, e-mail, WhatsApp…)' },

  // Litiges
  'Litige impossible à ce stade': { ar: 'لا يمكن فتح نزاع في هذه المرحلة', nl: 'Geschil onmogelijk in dit stadium' },
  'Litige clos ou introuvable': { ar: 'النزاع مغلق أو غير موجود', nl: 'Geschil gesloten of niet gevonden' },
  'Aucun litige pour cette transaction': { ar: 'لا نزاع لهذه المعاملة', nl: 'Geen geschil voor deze transactie' },
  'Réservé aux parties du litige': { ar: 'مخصص لأطراف النزاع فقط', nl: 'Enkel voor de partijen van het geschil' },
  'Merci de détailler le motif (10 caractères minimum)': { ar: 'يرجى تفصيل السبب (10 أحرف على الأقل)', nl: 'Gelieve de reden toe te lichten (minimaal 10 tekens)' },
  'Ajoutez un commentaire ou une photo': { ar: 'أضف تعليقاً أو صورة', nl: 'Voeg een opmerking of foto toe' },
  'Photo invalide (JPEG/PNG/WebP, 500 Ko max)': { ar: 'صورة غير صالحة (JPEG/PNG/WebP، 500 ك.ب كحد أقصى)', nl: 'Ongeldige foto (JPEG/PNG/WebP, max 500 KB)' },
  'Décision invalide': { ar: 'قرار غير صالح', nl: 'Ongeldige beslissing' },

  // Profil & RGPD
  "Format d'image invalide (JPEG, PNG ou WebP)": { ar: 'صيغة صورة غير صالحة (JPEG أو PNG أو WebP)', nl: 'Ongeldig afbeeldingsformaat (JPEG, PNG of WebP)' },
  'Image trop lourde (500 Ko max après compression)': { ar: 'الصورة ثقيلة جداً (500 ك.ب كحد أقصى بعد الضغط)', nl: 'Afbeelding te groot (max 500 KB na compressie)' },

  // KYC
  "Vérification d'identité requise": { ar: 'التحقق من الهوية مطلوب', nl: 'Identiteitsverificatie vereist' },
  'Votre identité est déjà vérifiée': { ar: 'هويتك موثّقة بالفعل', nl: 'Uw identiteit is al geverifieerd' },
  'Une demande est déjà en cours de vérification': { ar: 'يوجد طلب قيد التحقق بالفعل', nl: 'Er loopt al een verificatieaanvraag' },
  'Vérification définitivement refusée — contactez le support': { ar: 'رُفض التحقق نهائياً — تواصل مع الدعم', nl: 'Verificatie definitief geweigerd — contacteer de support' },
  'Nombre maximum de tentatives atteint — contactez le support': { ar: 'بلغت الحد الأقصى للمحاولات — تواصل مع الدعم', nl: 'Maximum aantal pogingen bereikt — contacteer de support' },
  'Nom légal complet requis': { ar: 'الاسم القانوني الكامل مطلوب', nl: 'Volledige wettelijke naam vereist' },
  'Date de naissance invalide': { ar: 'تاريخ ميلاد غير صالح', nl: 'Ongeldige geboortedatum' },
  'Vous devez avoir 18 ans ou plus': { ar: 'يجب أن يكون عمرك 18 عاماً أو أكثر', nl: 'U moet 18 jaar of ouder zijn' },
  'Type de document invalide': { ar: 'نوع وثيقة غير صالح', nl: 'Ongeldig documenttype' },
  'Selfie invalide (JPEG/PNG/WebP, 500 Ko max)': { ar: 'سيلفي غير صالح (JPEG/PNG/WebP، 500 ك.ب كحد أقصى)', nl: 'Ongeldige selfie (JPEG/PNG/WebP, max 500 KB)' },
  'Photo du recto invalide': { ar: 'صورة الوجه الأمامي غير صالحة', nl: 'Ongeldige foto van de voorkant' },
  "Photo du verso invalide (obligatoire pour une carte d'identité)": { ar: 'صورة الوجه الخلفي غير صالحة (إلزامية لبطاقة الهوية)', nl: 'Ongeldige foto van de achterkant (verplicht voor een identiteitskaart)' },
  'Demande introuvable': { ar: 'الطلب غير موجود', nl: 'Aanvraag niet gevonden' },
  'Cette demande a déjà été traitée': { ar: 'عولج هذا الطلب بالفعل', nl: 'Deze aanvraag is al behandeld' },
  'Motif obligatoire (5 caractères minimum)': { ar: 'السبب إلزامي (5 أحرف على الأقل)', nl: 'Reden verplicht (minimaal 5 tekens)' },
};

// Messages dynamiques (template literals côté code) : motifs avec groupes capturés,
// réinjectés dans la traduction via $1.
const PATTERNS = [
  {
    re: /^Impossible : (\d+) transaction\(s\) encore en cours\. Terminez-les d'abord\.$/,
    ar: 'غير ممكن: $1 معاملة لا تزال جارية. أنهِها أولاً.',
    nl: 'Onmogelijk: $1 transactie(s) nog lopend. Rond ze eerst af.',
  },
  {
    re: /^Plafond dépassé : votre compte est limité à (\d+(?:\.\d+)?) € par envoi$/,
    ar: 'تجاوزت السقف: حسابك محدود بـ $1 € لكل شحنة',
    nl: 'Plafond overschreden: uw account is beperkt tot $1 € per zending',
  },
  {
    re: /^Catégorie refusée : (.+)$/,
    ar: 'فئة مرفوضة: $1',
    nl: 'Categorie geweigerd: $1',
  },
  {
    re: /^Plafond atteint : (\d+) transaction\(s\) active\(s\) max$/,
    ar: 'بلغت السقف: $1 معاملة نشطة كحد أقصى',
    nl: 'Plafond bereikt: max $1 actieve transactie(s)',
  },
];

function translateError(lang, msg) {
  if (!msg || lang === 'fr' || typeof msg !== 'string') return msg;
  const exact = ERRORS[msg];
  if (exact && exact[lang]) return exact[lang];
  for (const p of PATTERNS) {
    const m = msg.match(p.re);
    if (m && p[lang]) return msg.replace(p.re, p[lang]);
  }
  return msg; // repli : français
}

// Middleware : pose req.lang depuis Accept-Language (fr/ar/nl, défaut fr) et wrappe
// res.json pour traduire body.error à la volée. Les autres champs (données) ne sont
// pas touchés.
const SUPPORTED = new Set(['fr', 'ar', 'nl']);

export function langMiddleware(req, res, next) {
  const raw = String(req.headers['accept-language'] || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  req.lang = SUPPORTED.has(raw) ? raw : 'fr';
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && typeof body.error === 'string') {
      body = { ...body, error: translateError(req.lang, body.error) };
    }
    return originalJson(body);
  };
  next();
}

export { translateError, ERRORS, PATTERNS };
