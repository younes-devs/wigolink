function bearerToken(req) {
  return req.headers.authorization?.replace('Bearer ', '');
}

export function createSessionAuth({
  getPersistentSession,
  deletePersistentSession,
  findUser,
  canAccessApp,
  save,
  now = Date.now,
  logger = console,
}) {
  async function activeSession(token) {
    const session = await getPersistentSession(token);
    if (!session || typeof session !== 'object' || !session.userId) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= now()) {
      await deletePersistentSession(token);
      return null;
    }
    return session;
  }

  async function denyUnverifiedSession(req, res) {
    const token = bearerToken(req);
    await deletePersistentSession(token);
    save();
    return res.status(403).json({
      needsVerification: true,
      pendingEmail: req.user.email,
      error: 'Verifiez votre adresse email avant d acceder a l application.',
    });
  }

  async function auth(req, res, next) {
    try {
      const token = bearerToken(req);
      const userId = (await activeSession(token))?.userId;
      if (!userId) return res.status(401).json({ error: 'Non authentifié' });
      req.user = findUser(userId);
      if (!req.user) return res.status(401).json({ error: 'Utilisateur inconnu' });
      if (req.user.suspendedUntil && req.user.suspendedUntil > now()) {
        return res.status(403).json({
          code: 'account_suspended',
          error: 'Votre compte est temporairement suspendu. Vous pouvez contester cette decision depuis votre profil.',
        });
      }
      if (!canAccessApp(req.user)) return denyUnverifiedSession(req, res);
      return next();
    } catch (error) {
      logger.error('Echec de verification de session', error);
      return res.status(503).json({
        error: 'Service de session temporairement indisponible.',
      });
    }
  }

  async function authRealtime(req, res, next) {
    const token = bearerToken(req) || String(req.query?.token || '');
    const session = await activeSession(token);
    const userId = session?.userId;
    if (!userId) return res.status(401).json({ error: 'Non authentifie' });
    req.user = findUser(session?.userId);
    if (req.user?.suspendedUntil && req.user.suspendedUntil > now()) {
      return res.status(403).json({
        code: 'account_suspended',
        error: 'Compte temporairement suspendu.',
      });
    }
    if (req.user && !canAccessApp(req.user)) {
      return denyUnverifiedSession(req, res);
    }
    if (!req.user) return res.status(401).json({ error: 'Utilisateur inconnu' });
    return next();
  }

  return {
    activeSession,
    auth,
    authRealtime,
  };
}
