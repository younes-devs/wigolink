import app from '../server/index.js';

// Vercel ne réévalue pas une destination de route contre la règle générique /api/*.
// Ce point d'entrée conserve l'URL publique /sitemap.xml tout en déléguant à Express.
export default function sitemap(req, res) {
  const queryIndex = req.url.indexOf('?');
  req.url = `/api/public/sitemap.xml${queryIndex >= 0 ? req.url.slice(queryIndex) : ''}`;
  return app(req, res);
}
