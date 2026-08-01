import { OAuth2Client } from 'google-auth-library';

export function createGoogleCredentialVerifier({
  clientId = process.env.GOOGLE_CLIENT_ID,
  client,
  fetchImpl = globalThis.fetch,
} = {}) {
  const audience = String(clientId || '').trim();
  const oauthClient = client || (audience ? new OAuth2Client(audience) : null);

  if (!audience || !oauthClient) return null;

  return async function verifyGoogleCredential(credential, accessToken) {
    if (accessToken) {
      const token = String(accessToken || '').trim();
      if (!token || token.length > 10_000 || typeof fetchImpl !== 'function') {
        throw invalidCredential();
      }

      let tokenInfo;
      let payload;
      try {
        tokenInfo = await oauthClient.getTokenInfo(token);
        if (tokenInfo.aud !== audience) throw invalidCredential();
        const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw invalidCredential();
        payload = await response.json();
      } catch {
        throw invalidCredential();
      }

      const email = String(payload?.email || tokenInfo?.email || '').trim().toLowerCase();
      const subject = String(payload?.sub || tokenInfo?.sub || tokenInfo?.user_id || '').trim();
      if (!email || !subject || payload?.email_verified !== true) throw invalidCredential();
      if (tokenInfo?.sub && tokenInfo.sub !== subject) throw invalidCredential();

      return {
        subject,
        email,
        name: String(payload?.name || email.split('@')[0]).trim(),
      };
    }

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
