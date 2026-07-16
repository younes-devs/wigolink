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
  const title = purpose === 'reset' ? 'Reinitialisez votre mot de passe' : 'Confirmez votre adresse email';
  const body = purpose === 'reset'
    ? `Utilisez ce code Wigofly pour reinitialiser votre mot de passe : ${code}`
    : `Utilisez ce code Wigofly pour confirmer votre adresse email : ${code}`;
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
