export function createDatabaseAvailability({
  isProduction,
  databaseHealth,
  healthPath = '/api/health',
}) {
  return function databaseAvailability(req, res, next) {
    if (isProduction && databaseHealth() === 'unavailable' && req.path !== healthPath) {
      return res.status(503).json({
        error: 'Base de donnees indisponible. Reessayez plus tard.',
      });
    }
    return next();
  };
}
