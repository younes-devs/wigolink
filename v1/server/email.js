const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function emailConfig(env = process.env) {
  return {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    from: String(env.EMAIL_FROM || '').trim(),
    appUrl: String(env.APP_URL || '').replace(/\/$/, ''),
  };
}

export async function sendVerificationEmail({ to, code, purpose, env = process.env }) {
  const config = emailConfig(env);
  if (!config.apiKey || !config.from) throw new Error('Service email indisponible');
  const content = {
    reset: ['Reinitialisez votre mot de passe', `Utilisez ce code Wigofly pour reinitialiser votre mot de passe : ${code}`],
    change_email: ['Confirmez votre nouvelle adresse email', `Utilisez ce code Wigofly pour confirmer votre nouvelle adresse email : ${code}`],
    delete_account: ['Confirmez la suppression de votre compte', `Utilisez ce code Wigofly pour confirmer la suppression de votre compte : ${code}`],
    verify: ['Confirmez votre adresse email', `Utilisez ce code Wigofly pour confirmer votre adresse email : ${code}`],
  }[purpose] || ['Confirmez votre adresse email', `Utilisez ce code Wigofly pour confirmer votre adresse email : ${code}`];
  const [title, body] = content;
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
      text: `${body}\n\nCe code expire dans 15 minutes. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.`,
      html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h1>${title}</h1><p>${body.replace(code, `<strong style="font-size:28px;letter-spacing:4px">${code}</strong>`)}</p><p style="color:#5d6470">Ce code expire dans 15 minutes. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p></main>`,
    }),
  });
  if (!response.ok) throw new Error('Impossible d envoyer l email de verification');
}
