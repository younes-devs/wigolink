import { stripLocalePrefix } from '../../../shared/locale-routing.js';

export function loginPath(returnTo = '/trajets') {
  const safePath = safeReturnPath(returnTo);
  return `/connexion?retour=${encodeURIComponent(safePath)}`;
}

export function safeReturnPath(value) {
  const rawPath = String(value || '');
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return '/trajets';
  }
  const path = stripLocalePrefix(rawPath);
  if (path.startsWith('/connexion')) {
    return '/trajets';
  }
  return path;
}
