import app from '../server/index.js';

// Vercel ne réévalue pas une destination de route contre la règle générique /api/*.
// Ce point d'entrée conserve l'URL publique /sitemap.xml tout en déléguant à Express.
export default function sitemap(req, res) {
  req.url = '/api/public/sitemap.xml';
  return app(req, res);
}
