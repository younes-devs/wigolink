export default function notFound(_req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Page introuvable | Wigolink</title></head><body><main><h1>Page introuvable</h1><p>Cette page n existe pas ou n est plus disponible.</p><a href="/fr/trajets">Voir les trajets</a></main></body></html>');
}
