export function adminOnly(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Réservé aux admins' });
  return next();
}
