export function createRelationalReadAuth({
  enabled,
  getPool,
  findUserFromSession,
  getSession,
  canAccessApp,
  logger = console,
}) {
  return async function relationalReadAuth(req, res, next) {
    if (!enabled()) return next('route');

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({
        error: 'Base de donnees temporairement indisponible.',
      });
    }

    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const user = await findUserFromSession({ token, getSession, pool });
      if (!user) {
        return res.status(401).json({
          error: 'Utilisateur inconnu ou session expiree',
        });
      }
      if (!canAccessApp(user)) {
        return res.status(403).json({
          needsVerification: true,
          pendingEmail: user.email,
          error: 'Verifiez votre adresse email avant d acceder a l application.',
        });
      }
      req.user = user;
      return next();
    } catch (error) {
      logger.error('Echec de lecture relationnelle des trajets', error);
      return res.status(503).json({
        error: 'Recherche temporairement indisponible. Reessayez.',
      });
    }
  };
}
