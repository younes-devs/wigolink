function bearerToken(req) {
  return req.headers.authorization?.replace('Bearer ', '');
}

export function createSessionAuth({
  getPersistentSession,
  deletePersistentSession,
  findUser,
  persistUser = null,
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

  async function denyDeletedSession(req, res) {
    const token = bearerToken(req);
    await deletePersistentSession(token);
    save();
    return res.status(401).json({
      code: 'account_deleted',
      error: 'Ce compte a été supprimé.',
    });
  }

  async function auth(req, res, next) {
    try {
      const token = bearerToken(req);
      const userId = (await activeSession(token))?.userId;
      if (!userId) return res.status(401).json({ error: 'Non authentifié' });
      req.user = await findUser(userId);
      if (!req.user) return res.status(401).json({ error: 'Utilisateur inconnu' });
      if (req.user.deletedAt) return denyDeletedSession(req, res);
      if (req.user.suspendedUntil && req.user.suspendedUntil > now()) {
        return res.status(403).json({
          code: 'account_suspended',
          error: 'Votre compte est temporairement suspendu. Vous pouvez contester cette decision depuis votre profil.',
        });
      }
      if (!canAccessApp(req.user)) return denyUnverifiedSession(req, res);
      attachUserPersistence({
        req,
        res,
        user: req.user,
        persistUser,
        logger,
      });
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
    req.user = await findUser(session?.userId);
    if (req.user?.deletedAt) return denyDeletedSession(req, res);
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

function attachUserPersistence({
  req,
  res,
  user,
  persistUser,
  logger,
}) {
  if (typeof persistUser !== 'function' || req.userPersistenceAttached) return;
  req.userPersistenceAttached = true;
  const before = structuredClone(user);
  const nativeJson = res.json.bind(res);
  const nativeSend = res.send.bind(res);
  let settled = false;

  const settle = async (deliver) => {
    if (settled) return;
    settled = true;
    try {
      await persistUser(user, before);
      deliver();
    } catch (error) {
      logger.error('Echec de persistance utilisateur', error);
      if (!res.headersSent) {
        res.statusCode = 503;
        res.send = nativeSend;
        nativeJson({
          error: 'Sauvegarde du compte temporairement indisponible.',
        });
      }
    }
  };

  res.json = (body) => {
    void settle(() => {
      res.send = nativeSend;
      nativeJson(body);
    });
    return res;
  };
  res.send = (body) => {
    void settle(() => nativeSend(body));
    return res;
  };
}
