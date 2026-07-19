const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUPPORTED_LANGS = new Set(['fr', 'nl', 'ar']);

const EMAIL_COPY = {
  fr: {
    reset: ['Reinitialisez votre mot de passe', 'Utilisez ce code Wigofly pour reinitialiser votre mot de passe : {code}'],
    change_email: ['Confirmez votre nouvelle adresse email', 'Utilisez ce code Wigofly pour confirmer votre nouvelle adresse email : {code}'],
    delete_account: ['Confirmez la suppression de votre compte', 'Utilisez ce code Wigofly pour confirmer la suppression de votre compte : {code}'],
    verify: ['Confirmez votre adresse email', 'Utilisez ce code Wigofly pour confirmer votre adresse email : {code}'],
    footer: "Ce code expire dans 15 minutes. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
  },
  nl: {
    reset: ['Stel uw wachtwoord opnieuw in', 'Gebruik deze Wigofly-code om uw wachtwoord opnieuw in te stellen: {code}'],
    change_email: ['Bevestig uw nieuwe e-mailadres', 'Gebruik deze Wigofly-code om uw nieuwe e-mailadres te bevestigen: {code}'],
    delete_account: ['Bevestig de verwijdering van uw account', 'Gebruik deze Wigofly-code om de verwijdering van uw account te bevestigen: {code}'],
    verify: ['Bevestig uw e-mailadres', 'Gebruik deze Wigofly-code om uw e-mailadres te bevestigen: {code}'],
    footer: 'Deze code verloopt over 15 minuten. Hebt u dit niet aangevraagd, negeer dan deze e-mail.',
  },
  ar: {
    reset: ['أعد تعيين كلمة المرور', 'استخدم رمز Wigofly هذا لإعادة تعيين كلمة المرور: {code}'],
    change_email: ['أكد عنوان بريدك الإلكتروني الجديد', 'استخدم رمز Wigofly هذا لتأكيد عنوان بريدك الإلكتروني الجديد: {code}'],
    delete_account: ['أكد حذف حسابك', 'استخدم رمز Wigofly هذا لتأكيد حذف حسابك: {code}'],
    verify: ['أكد عنوان بريدك الإلكتروني', 'استخدم رمز Wigofly هذا لتأكيد عنوان بريدك الإلكتروني: {code}'],
    footer: 'تنتهي صلاحية هذا الرمز خلال 15 دقيقة. إذا لم تطلب ذلك، فتجاهل هذه الرسالة.',
  },
};

export function emailConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    from: String(env.EMAIL_FROM || '').trim(),
    appUrl: String(env.APP_URL || '').replace(/\/$/, ''),
  };
}

export function verificationEmailCopy({ code, purpose, lang = 'fr' }) {
  const locale = SUPPORTED_LANGS.has(lang) ? lang : 'fr';
  const copy = EMAIL_COPY[locale];
  const [title, bodyTemplate] = copy[purpose] || copy.verify;
  return {
    lang: locale,
    title,
    body: bodyTemplate.replace('{code}', code),
    footer: copy.footer,
  };
}

export async function sendVerificationEmail({ to, code, purpose, lang = 'fr', env = process.env }) {
  const config = emailConfig(env);
  if (!config.apiKey || !config.from) throw new Error('Service email indisponible');
  const { lang: locale, title, body, footer } = verificationEmailCopy({ code, purpose, lang });
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `wigofly-${purpose}-${to}-${code}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [to],
      subject: title,
      text: `${body}\n\n${footer}`,
      html: `<main lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h1>${title}</h1><p>${body.replace(code, `<strong style="font-size:28px;letter-spacing:4px">${code}</strong>`)}</p><p style="color:#5d6470">${footer}</p></main>`,
    }),
  });
  if (!response.ok) throw new Error('Impossible d envoyer l email de verification');
}

export { EMAIL_COPY };
