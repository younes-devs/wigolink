const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUPPORTED_LANGS = new Set(['fr', 'nl', 'ar', 'en', 'es']);

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
  en: {
    reset: ['Reset your password', 'Use this Wigolink code to reset your password: {code}'],
    change_email: ['Confirm your new email address', 'Use this Wigolink code to confirm your new email address: {code}'],
    delete_account: ['Confirm account deletion', 'Use this Wigolink code to confirm the deletion of your account: {code}'],
    verify: ['Confirm your email address', 'Use this Wigolink code to confirm your email address: {code}'],
    footer: 'This code expires in 15 minutes. If you did not request it, you can ignore this email.',
  },
  es: {
    reset: ['Restablece tu contraseña', 'Utiliza este código de Wigolink para restablecer tu contraseña: {code}'],
    change_email: ['Confirma tu nueva dirección de correo', 'Utiliza este código de Wigolink para confirmar tu nueva dirección de correo: {code}'],
    delete_account: ['Confirma la eliminación de tu cuenta', 'Utiliza este código de Wigolink para confirmar la eliminación de tu cuenta: {code}'],
    verify: ['Confirma tu dirección de correo', 'Utiliza este código de Wigolink para confirmar tu dirección de correo: {code}'],
    footer: 'Este código caduca en 15 minutos. Si no lo solicitaste, puedes ignorar este correo.',
  },
};

const SUPPORT_COPY = {
  fr: { request: 'Demande de support', subject: 'Sujet', member: 'Membre', memberId: 'ID membre', language: 'Langue', received: 'Reçu le' },
  nl: { request: 'Supportaanvraag', subject: 'Onderwerp', member: 'Lid', memberId: 'Lid-ID', language: 'Taal', received: 'Ontvangen op' },
  ar: { request: 'طلب دعم', subject: 'الموضوع', member: 'العضو', memberId: 'معرّف العضو', language: 'اللغة', received: 'تاريخ الاستلام' },
  en: { request: 'Support request', subject: 'Subject', member: 'Member', memberId: 'Member ID', language: 'Language', received: 'Received at' },
  es: { request: 'Solicitud de soporte', subject: 'Asunto', member: 'Miembro', memberId: 'ID de miembro', language: 'Idioma', received: 'Recibido el' },
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
  const labels = SUPPORT_COPY[locale];
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
        `${labels.member} : ${userName}`,
        `Email : ${userEmail}`,
        `${labels.memberId} : ${user?.id || ''}`,
        `${labels.language} : ${locale}`,
        `${labels.received} : ${receivedAt}`,
        '',
        message,
      ].join('\n'),
      html: `<main lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#17191d"><h1 style="font-size:22px">${labels.request} ${escapeHtml(ticketId)}</h1><p><strong>${labels.subject} :</strong> ${escapeHtml(subject)}</p><p><strong>${labels.member} :</strong> ${escapeHtml(userName)} (${escapeHtml(userEmail)})</p><p><strong>${labels.memberId} :</strong> ${escapeHtml(user?.id || '')}</p><p><strong>${labels.language} :</strong> ${escapeHtml(locale)}</p><hr style="border:0;border-top:1px solid #dfe3e8;margin:20px 0"><p>${safeMessage}</p></main>`,
    }),
  });
  if (!response.ok) throw new Error('Support email delivery failed');
  const payload = await response.json().catch(() => ({}));
  return { id: payload.id || null };
}

export { EMAIL_COPY };
