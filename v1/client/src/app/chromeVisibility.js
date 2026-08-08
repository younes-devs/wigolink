const CHROMELESS_ROUTES = new Set([
  '/connexion',
  '/cgu',
  '/confidentialite',
  '/trajets/nouveau',
]);

export function shouldHideAppChrome(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return CHROMELESS_ROUTES.has(path)
    || /^\/trajets\/[^/]+\/demande$/.test(path);
}
