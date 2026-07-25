import { Router } from 'express';

const DEFAULT_CODE_TTL_MS = 15 * 60 * 1000;

export function createAuthAccessRouter({
  auth,
  users,
  verifications,
  resets,
  normalizeEmail,
  rateLimit,
  verifyPassword,
  newToken,
  createSession,
  sessionDurationMs,
  canAccessApp,
  newCode,
  deliverCode,
  save,
  demoHint,
  hashPassword,
  clearUserSessions,
  openSession,
  deleteSession,
  now = Date.now,
  codeTtlMs = DEFAULT_CODE_TTL_MS,
}) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (rateLimit(`login:${email}`)) {
      return res.status(429).json({
        error: 'Trop de tentatives — réessayez dans 10 minutes',
      });
    }
    const user = users.findByEmail(email);
    if (!user || !verifyPassword(req.body.password || '', user.passwordHash)) {
      return res.status(401).json({
        error: 'Email ou mot de passe incorrect',
      });
    }
    if (user.suspendedUntil && user.suspendedUntil > now()) {
      const token = newToken();
      await createSession({
        token,
        userId: user.id,
        expiresAt: now() + sessionDurationMs,
      });
      return res.status(403).json({
        code: 'account_suspended',
        token,
        suspended: true,
        suspendedUntil: user.suspendedUntil,
        reason: user.suspensionReason || null,
        error: 'Votre compte est temporairement suspendu. Vous pouvez envoyer un recours.',
      });
    }
    if (!canAccessApp(user)) {
      const code = newCode();
      try {
        await deliverCode(email, code, 'verify', req.lang);
      } catch (error) {
        return res.status(503).json({ error: error.message });
      }
      verifications.set(email, {
        code,
        expires: now() + codeTtlMs,
        rememberMe: req.body.rememberMe === true,
      });
      save();
      return res.json({
        needsVerification: true,
        pendingEmail: email,
        message: 'Un code de verification vient d etre envoye.',
        demoHint: demoHint(code, req.lang),
      });
    }
    return openSession(res, user, req, {
      rememberMe: req.body.rememberMe === true,
    });
  });

  router.post('/forgot', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (rateLimit(`forgot:${email}`)) {
      return res.status(429).json({
        error: 'Trop de demandes — réessayez plus tard',
      });
    }
    const user = users.findByEmail(email);
    let code = null;
    if (user) {
      code = newCode();
      try {
        await deliverCode(email, code, 'reset', req.lang);
      } catch (error) {
        return res.status(503).json({ error: error.message });
      }
      resets.set(email, {
        code,
        expires: now() + codeTtlMs,
      });
      save();
    }
    return res.json({
      ok: true,
      demoHint: demoHint(code || '—', req.lang),
    });
  });

  router.post('/reset', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (rateLimit(`reset:${email}`)) {
      return res.status(429).json({
        error: 'Trop de tentatives — refaites une demande',
      });
    }
    const reset = resets.get(email);
    if (!reset || reset.expires < now()) {
      return res.status(400).json({
        error: 'Code expiré — refaites une demande',
      });
    }
    if (reset.code !== String(req.body.code || '').trim()) {
      return res.status(400).json({ error: 'Code incorrect' });
    }
    if (!req.body.password || req.body.password.length < 8) {
      return res.status(400).json({
        error: 'Mot de passe : 8 caractères minimum',
      });
    }
    const user = users.findByEmail(email);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });

    user.passwordHash = hashPassword(req.body.password);
    resets.remove(email);
    await clearUserSessions(user.id);
    if (!canAccessApp(user)) {
      save();
      return res.json({
        needsVerification: true,
        pendingEmail: email,
        message: 'Mot de passe mis a jour. Verifiez maintenant votre adresse email pour acceder a l application.',
      });
    }
    return openSession(res, user, req);
  });

  router.post('/logout', auth, async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await deleteSession(token);
    save();
    return res.json({ ok: true });
  });

  return router;
}
