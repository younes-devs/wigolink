import { Router } from 'express';

const SITE_ORIGIN = 'https://wigolink.com';
const SITEMAP_LIMIT = 10_000;
const PAGE_SIZE = 100;

export function createSeoRouter({ listPublicTrips, logger = console }) {
  const router = Router();

  router.get('/public/sitemap.xml', async (_req, res) => {
    try {
      const trips = [];
      let offset = 0;
      while (trips.length < SITEMAP_LIMIT) {
        const page = await listPublicTrips({ limit: PAGE_SIZE, offset });
        const items = page?.trips || [];
        trips.push(...items);
        if (!page?.page?.hasMore || items.length === 0) break;
        offset += items.length;
      }

      const urls = [
        sitemapUrl('/fr/trajets'),
        sitemapUrl('/fr/cgu'),
        sitemapUrl('/fr/confidentialite'),
        ...trips.slice(0, SITEMAP_LIMIT).map((trip) => sitemapUrl(
          `/fr/trajets/${encodeURIComponent(trip.id)}`,
          trip.updatedAt || trip.createdAt,
        )),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.send(xml);
    } catch (error) {
      logger.error('Echec de generation du sitemap', error);
      return res.status(503).send('Sitemap temporairement indisponible');
    }
  });

  return router;
}

function sitemapUrl(path, lastModified) {
  const lastmod = lastModified
    ? `\n    <lastmod>${escapeXml(new Date(lastModified).toISOString())}</lastmod>`
    : '';
  return `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc>${lastmod}\n  </url>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
