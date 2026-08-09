import crypto from 'node:crypto';

const VERSION = 'v1';

export function createManualPayoutCipher(secret) {
  const key = parseKey(secret);

  return {
    ready: !!key,
    encrypt(value) {
      if (!key) throw new Error('MANUAL_PAYOUT_ENCRYPTION_KEY is not configured');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return [VERSION, iv, cipher.getAuthTag(), encrypted]
        .map((part) => Buffer.isBuffer(part) ? part.toString('base64url') : part)
        .join('.');
    },
    decrypt(payload) {
      if (!key) throw new Error('MANUAL_PAYOUT_ENCRYPTION_KEY is not configured');
      const [version, ivText, tagText, encryptedText] = String(payload || '').split('.');
      if (version !== VERSION || !ivText || !tagText || !encryptedText) {
        throw new Error('Invalid encrypted payout payload');
      }
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      const clear = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(clear.toString('utf8'));
    },
  };
}

function parseKey(secret) {
  const value = String(secret || '').trim();
  if (!value) return null;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 ? decoded : null;
}
