import app from '../server/index.js';

export default function seoPage(req, res) {
  const queryIndex = req.url.indexOf('?');
  req.url = `/api/public/seo-page${queryIndex >= 0 ? req.url.slice(queryIndex) : ''}`;
  return app(req, res);
}
