import { Router } from 'express';

const DEFAULT_CODE_TTL_MS = 15 * 60 * 1000;

export function createAuthRegistrationRouter({
  users,
  verifications,
  validRegistration,
  makeUser,
  hashPassword,
  clientIp,
  newCode,
  deliverCode,
  save,
  demoHint,
  normalizeEmail,
  rateLimit,
  openSession,
  now = Date.now,
  codeTtlMs = DEFAULT_CODE_TTL_MS,
}) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const {
      name,
      email,
      phone,
      password,
      cguAccepted,
      rememberMe,
    } = req.body;
    const invalid = validRegistration({ name, email, password });
    if (invalid) return res.status(400).json({ error: invalid });
    if (!cguAccepted) {
      return res.status(400).json({
        error: 'Vous devez accepter les Conditions Générales d\'Utilisation',
      });
    }
    if (users.findByEmail(email)) {
      return res.status(400).json({
        error: 'Un compte existe déjà avec cet email',
      });
    }

    const user = makeUser({
      name,
      email,
      phone,
      provider: 'email',
      passwordHash: hashPassword(password),
      cguAcceptedAt: now(),
      registerIp: clientIp(req),
    });
    const code = newCode();
    try {
      await deliverCode(user.email, code, 'verify', req.lang);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
    users.append(user);
    verifications.set(user.email, {
      code,
      expires: now() + codeTtlMs,
      rememberMe: rememberMe === true,
    });
    save();
    return res.json({
      pendingEmail: user.email,
      message: 'Un code de verification vient d etre envoye.',
      demoHint: demoHint(code, req.lang),
    });
  });

  router.post('/verify-email', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (await rateLimit(`verify:${email}`)) {
      return res.status(429).json({
        error: 'Trop de tentatives — demandez un nouveau code',
      });
    }
    const pending = verifications.get(email);
    if (!pending || pending.expires < now()) {
      return res.status(400).json({
        error: 'Code expiré — demandez un nouvel envoi',
      });
    }
    if (pending.code !== String(req.body.code || '').trim()) {
      return res.status(400).json({ error: 'Code incorrect' });
    }
    const user = users.findByEmail(email);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });

    user.emailVerified = true;
    verifications.remove(email);
    return openSession(res, user, req, {
      rememberMe: req.body.rememberMe === true || pending.rememberMe === true,
    });
  });

  router.post('/resend-code', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (await rateLimit(`resend:${email}`)) {
      return res.status(429).json({
        error: 'Trop de demandes — réessayez plus tard',
      });
    }
    const user = users.findByEmail(email);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });

    const previous = verifications.get(email);
    const code = newCode();
    try {
      await deliverCode(email, code, 'verify', req.lang);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
    verifications.set(email, {
      code,
      expires: now() + codeTtlMs,
      rememberMe: previous?.rememberMe === true,
    });
    save();
    return res.json({
      ok: true,
      message: 'Un nouveau code vient d etre envoye.',
      demoHint: demoHint(code, req.lang),
    });
  });

  router.post('/google', (_req, res) => (
    res.status(410).json({ error: 'Connexion Google indisponible' })
  ));

  return router;
}
