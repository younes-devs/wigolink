import { OAuth2Client } from 'google-auth-library';

export function createGoogleCredentialVerifier({
  clientId = process.env.GOOGLE_CLIENT_ID,
  client,
} = {}) {
  const audience = String(clientId || '').trim();
  const oauthClient = client || (audience ? new OAuth2Client(audience) : null);

  if (!audience || !oauthClient) return null;

  return async function verifyGoogleCredential(credential) {
    const idToken = String(credential || '').trim();
    if (!idToken || idToken.length > 10_000) {
      throw invalidCredential();
    }

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw invalidCredential();
    }

    const email = String(payload?.email || '').trim().toLowerCase();
    const subject = String(payload?.sub || '').trim();
    if (!email || !subject || payload?.email_verified !== true) {
      throw invalidCredential();
    }

    return {
      subject,
      email,
      name: String(payload?.name || email.split('@')[0]).trim(),
    };
  };
}

function invalidCredential() {
  const error = new Error('Authentification Google invalide.');
  error.code = 'invalid_google_credential';
  return error;
}
