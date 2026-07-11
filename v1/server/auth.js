// Authentification : email + mot de passe (scrypt), Google (simulé en démo),
// vérification d'email et réinitialisation de mot de passe.
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function sixDigitCode() {
  // Démo : code fixe pour pouvoir tester sans email réel.
  // En prod : crypto.randomInt(100000, 999999) + envoi via prestataire email/SMS.
  return '123456';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validRegistration({ name, email, password }) {
  if (!name || name.trim().length < 2) return 'Nom trop court';
  if (!EMAIL_RE.test(email || '')) return 'Adresse email invalide';
  if (!password || password.length < 8) return 'Mot de passe : 8 caractères minimum';
  return null;
}

// Anti brute-force minimal : 10 tentatives / 10 min par clé.
const attempts = new Map();
export function rateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, since: now };
  if (now - entry.since > 10 * 60e3) { entry.count = 0; entry.since = now; }
  entry.count += 1;
  attempts.set(key, entry);
  return entry.count > 10;
}
