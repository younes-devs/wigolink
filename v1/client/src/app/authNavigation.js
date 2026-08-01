export function loginPath(returnTo = '/trajets') {
  const safePath = safeReturnPath(returnTo);
  return `/connexion?retour=${encodeURIComponent(safePath)}`;
}

export function safeReturnPath(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/connexion')) {
    return '/trajets';
  }
  return path;
}
