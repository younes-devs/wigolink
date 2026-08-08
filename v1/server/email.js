const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUPPORTED_LANGS = new Set(['fr', 'nl', 'ar']);

const EMAIL_COPY = {
  fr: {
    reset: ['Reinitialisez votre mot de passe', 'Utilisez ce code Wigolink pour reinitialiser votre mot de passe : {code}'],
    change_email: ['Confirmez votre nouvelle adresse email', 'Utilisez ce code Wigolink pour confirmer votre nouvelle adresse email : {code}'],
    delete_account: ['Confirmez la suppression de votre compte', 'Utilisez ce code Wigolink pour confirmer la suppression de votre compte : {code}'],
    verify: ['Confirmez votre adresse email', 'Utilisez ce code Wigolink pour confirmer votre adresse email : {code}'],
    footer: "Ce code expire dans 15 minutes. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
  },
  nl: {
    reset: ['Stel uw wachtwoord opnieuw in', 'Gebruik deze Wigolink-code om uw wachtwoord opnieuw in te stellen: {code}'],
    change_email: ['Bevestig uw nieuwe e-mailadres', 'Gebruik deze Wigolink-code om uw nieuwe e-mailadres te bevestigen: {code}'],
    delete_account: ['Bevestig de verwijdering van uw account', 'Gebruik deze Wigolink-code om de verwijdering van uw account te bevestigen: {code}'],
    verify: ['Bevestig uw e-mailadres', 'Gebruik deze Wigolink-code om uw e-mailadres te bevestigen: {code}'],
    footer: 'Deze code verloopt over 15 minuten. Hebt u dit niet aangevraagd, negeer dan deze e-mail.',
  },
  ar: {
    reset: ['أعد تعيين كلمة المرور', 'استخدم رمز Wigolink هذا لإعادة تعيين كلمة المرور: {code}'],
    change_email: ['أكد عنوان بريدك الإلكتروني الجديد', 'استخدم رمز Wigolink هذا لتأكيد عنوان بريدك الإلكتروني الجديد: {code}'],
    delete_account: ['أكد حذف حسابك', 'استخدم رمز Wigolink هذا لتأكيد حذف حسابك: {code}'],
    verify: ['أكد عنوان بريدك الإلكتروني', 'استخدم رمز Wigolink هذا لتأكيد عنوان بريدك الإلكتروني: {code}'],
    footer: 'تنتهي صلاحية هذا الرمز خلال 15 دقيقة. إذا لم تطلب ذلك، فتجاهل هذه الرسالة.',
  },
};

export function emailConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    from: String(env.EMAIL_FROM || '').trim(),
    appUrl: String(env.APP_URL || '').replace(/\/$/, ''),
    supportEmail: String(env.SUPPORT_EMAIL || 'support@wigolink.com').trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

export async function sendVerificationEmail({
  to,
  code,
  purpose,
  lang = 'fr',
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = emailConfig(env);
  if (!config.apiKey || !config.from) throw new Error('Service email indisponible');
  const { lang: locale, title, body, footer } = verificationEmailCopy({ code, purpose, lang });
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `wigolink-${purpose}-${to}-${code}`,
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

export async function sendSupportEmail({
  ticketId,
  user,
  subject,
  message,
  lang = 'fr',
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = emailConfig(env);
  if (!config.apiKey || !config.from || !config.supportEmail) {
    throw new Error('Service email indisponible');
  }

  const locale = SUPPORTED_LANGS.has(lang) ? lang : 'fr';
  const userName = String(user?.name || 'Membre Wigolink').trim();
  const userEmail = String(user?.email || '').trim().toLowerCase();
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br>');
  const receivedAt = new Date().toISOString();
  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `wigolink-support-${ticketId}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.supportEmail],
      reply_to: userEmail,
      subject: `[Support ${ticketId}] ${subject}`,
      text: [
        `Ticket : ${ticketId}`,
        `Membre : ${userName}`,
        `Email : ${userEmail}`,
        `ID membre : ${user?.id || ''}`,
        `Langue : ${locale}`,
        `Recu le : ${receivedAt}`,
        '',
        message,
      ].join('\n'),
      html: `<main lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#17191d"><h1 style="font-size:22px">Demande de support ${escapeHtml(ticketId)}</h1><p><strong>Sujet :</strong> ${escapeHtml(subject)}</p><p><strong>Membre :</strong> ${escapeHtml(userName)} (${escapeHtml(userEmail)})</p><p><strong>ID membre :</strong> ${escapeHtml(user?.id || '')}</p><p><strong>Langue :</strong> ${escapeHtml(locale)}</p><hr style="border:0;border-top:1px solid #dfe3e8;margin:20px 0"><p>${safeMessage}</p></main>`,
    }),
  });
  if (!response.ok) throw new Error('Support email delivery failed');
  const payload = await response.json().catch(() => ({}));
  return { id: payload.id || null };
}

export { EMAIL_COPY };
