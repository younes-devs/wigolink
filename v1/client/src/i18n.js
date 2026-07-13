// Socle i18n (PRD UI/UX U14). Mécanisme minimal, sans dépendance : un dictionnaire par
// langue et une fonction t(). Portée V1 : surfaces de premier contact (onboarding,
// navigation, connexion) — l'arabe d'abord (diaspora marocaine), RTL géré via dir="rtl".
// La traduction écran par écran de l'app authentifiée reste un chantier de suivi.
import { useSyncExternalStore } from 'react';

const RTL_LANGS = new Set(['ar']);
const KEY = 'wigofly_lang';

const DICT = {
  fr: {
    'nav.trips': 'Trajets',
    'nav.shipments': 'Mes envois',
    'nav.transactions': 'En cours',
    'nav.profile': 'Profil',
    'nav.admin': 'Admin',
    'header.tagline': 'Envoyez avec confiance · Bruxelles ↔ Casablanca',
    'onboard.welcome': 'Bienvenue sur Wigofly',
    'onboard.intro': 'Envoyer entre la Belgique et le Maroc, en sécurité — voici comment on vous protège à chaque étape.',
    'onboard.escrow.t': 'Paiement séquestré',
    'onboard.escrow.d': "L'argent est bloqué dès l'accord, jamais versé avant la livraison confirmée.",
    'onboard.video.t': 'Preuve vidéo',
    'onboard.video.d': 'Le contenu du colis est filmé au moment de la remise au voyageur.',
    'onboard.validation.t': 'Double validation',
    'onboard.validation.d': 'Chaque remise et livraison est confirmée par les deux parties, par QR.',
    'onboard.pay.t': 'Versement automatique',
    'onboard.pay.d': 'Le voyageur est payé automatiquement une fois la livraison validée.',
    'onboard.continue': 'Continuer',
    'onboard.skip': 'Passer',
    'onboard.back': 'Retour',
    'onboard.q': 'Que voulez-vous faire ?',
    'onboard.q.sub': 'Vous pourrez faire les deux à tout moment.',
    'onboard.send.t': 'Envoyer un colis',
    'onboard.send.d': 'Publiez ce que vous voulez faire livrer au Maroc ou en Belgique.',
    'onboard.carry.t': 'Transporter et gagner',
    'onboard.carry.d': 'Déclarez votre trajet et transportez des colis contre rémunération.',
    'appearance.title': 'Apparence',
    'appearance.light': 'Clair',
    'appearance.dark': 'Sombre',
    'lang.title': 'Langue',
  },
  ar: {
    'nav.trips': 'الرحلات',
    'nav.shipments': 'شحناتي',
    'nav.transactions': 'الجارية',
    'nav.profile': 'الملف',
    'nav.admin': 'الإدارة',
    'header.tagline': 'أرسل بثقة · بروكسل ↔ الدار البيضاء',
    'onboard.welcome': 'مرحباً بك في Wigofly',
    'onboard.intro': 'الإرسال بين بلجيكا والمغرب بأمان — إليك كيف نحميك في كل خطوة.',
    'onboard.escrow.t': 'دفع مضمون',
    'onboard.escrow.d': 'يُحجز المبلغ فور الاتفاق، ولا يُدفع أبداً قبل تأكيد التسليم.',
    'onboard.video.t': 'إثبات بالفيديو',
    'onboard.video.d': 'يتم تصوير محتوى الطرد لحظة تسليمه للمسافر.',
    'onboard.validation.t': 'تأكيد مزدوج',
    'onboard.validation.d': 'كل تسليم واستلام يؤكده الطرفان عبر رمز QR.',
    'onboard.pay.t': 'دفع تلقائي',
    'onboard.pay.d': 'يُدفع للمسافر تلقائياً بمجرد تأكيد التسليم.',
    'onboard.continue': 'متابعة',
    'onboard.skip': 'تخطّي',
    'onboard.back': 'رجوع',
    'onboard.q': 'ماذا تريد أن تفعل؟',
    'onboard.q.sub': 'يمكنك القيام بالأمرين في أي وقت.',
    'onboard.send.t': 'إرسال طرد',
    'onboard.send.d': 'انشر ما تريد إيصاله إلى المغرب أو بلجيكا.',
    'onboard.carry.t': 'انقل واربح',
    'onboard.carry.d': 'صرّح برحلتك وانقل الطرود مقابل أجر.',
    'appearance.title': 'المظهر',
    'appearance.light': 'فاتح',
    'appearance.dark': 'داكن',
    'lang.title': 'اللغة',
  },
};

export const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
];

let current = document.documentElement.lang === 'ar' ? 'ar' : 'fr';
const listeners = new Set();

export function getLang() { return current; }

export function setLang(lang) {
  if (!DICT[lang]) return;
  current = lang;
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  listeners.forEach((l) => l());
}

export function t(key, vars) {
  let s = (DICT[current] && DICT[current][key]) || DICT.fr[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// Hook React : re-rend les composants qui utilisent t() quand la langue change.
export function useLang() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
