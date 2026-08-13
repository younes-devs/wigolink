import { resolveRequestLocale } from '../shared/locale-routing.js';

export default function localeEntry(req, res) {
  const locale = resolveRequestLocale({
    cookieHeader: req.headers.cookie,
    acceptLanguage: req.headers['accept-language'],
  });

  const requestedPath = ['trajets', 'cgu', 'confidentialite'].includes(req.query?.path)
    ? `/${req.query.path}`
    : '/trajets';
  res.statusCode = 307;
  res.setHeader('Location', `/${locale}${requestedPath}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie, Accept-Language');
  res.end();
}
