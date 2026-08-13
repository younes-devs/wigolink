import { INDEXNOW_KEY } from '../server/services/indexnow.js';

export default function indexNowKey(_req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).send(INDEXNOW_KEY);
}
