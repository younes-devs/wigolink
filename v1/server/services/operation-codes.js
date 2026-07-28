import crypto from 'node:crypto';

const CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function createOperationCodeService({ secret, now = Date.now }) {
  function hash(txId, kind, code) {
    return crypto.createHmac('sha256', secret).update(`${txId}:${kind}:${code}`).digest('hex');
  }

  function issue(tx, kind, recipientId) {
    const code = crypto.randomInt(10_000_000, 100_000_000).toString();
    tx.securityCodes = tx.securityCodes || {};
    tx.securityCodes[kind] = {
      hash: hash(tx.id, kind, code),
      recipientId,
      issuedAt: now(),
      expiresAt: now() + CODE_TTL_MS,
      attempts: 0,
      lockedAt: null,
    };
    return code;
  }

  function publicState(code) {
    if (!code) return { issued: false, locked: false };
    return {
      issued: true,
      locked: !!code.lockedAt,
      expiresAt: code.expiresAt,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - Number(code.attempts || 0)),
    };
  }

  function verify(tx, kind, enteredCode) {
    const record = tx.securityCodes?.[kind];
    if (!record) return { ok: false, error: 'Le code de securite n est pas encore disponible.', status: 400 };
    if (record.lockedAt) return { ok: false, error: 'Ce code est verrouille apres trop de tentatives. Signalez un probleme pour continuer.', status: 429 };
    if (record.expiresAt <= now()) return { ok: false, error: 'Ce code a expire. Son titulaire doit en generer un nouveau.', status: 400 };

    const candidate = String(enteredCode || '').trim();
    const expected = Buffer.from(record.hash, 'hex');
    const actual = Buffer.from(hash(tx.id, kind, candidate), 'hex');
    const matches = /^\d{8}$/.test(candidate)
      && expected.length === actual.length
      && crypto.timingSafeEqual(expected, actual);
    if (matches) return { ok: true };

    record.attempts = Number(record.attempts || 0) + 1;
    if (record.attempts >= MAX_ATTEMPTS) record.lockedAt = now();
    return {
      ok: false,
      error: record.lockedAt
        ? 'Ce code est verrouille apres trop de tentatives. Signalez un probleme pour continuer.'
        : 'Code invalide.',
      status: record.lockedAt ? 429 : 400,
    };
  }

  return { issue, publicState, verify };
}
