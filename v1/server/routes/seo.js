import { Router } from 'express';
import { SUPPORTED_LOCALES } from '../../shared/locale-routing.js';
import { SITE_ORIGIN, staticPageSeo, tripPageSeo } from '../../shared/seo-metadata.js';
import { getSeoLanding, listSeoLandings } from '../../shared/seo-landings.js';
import { loadClientTemplate, renderSeoHtml } from '../services/seo-html.js';

const SITEMAP_LIMIT = 10_000;
const PAGE_SIZE = 100;
const SUPPORTED = new Set(SUPPORTED_LOCALES);

export function createSeoRouter({ listPublicTrips, getPublicTrip, getTemplate = loadClientTemplate, logger = console }) {
  const router = Router();

  router.get('/public/sitemap.xml', async (_req, res) => {
    try {
      const trips = await collectTrips(listPublicTrips);
      const urls = [];
      for (const locale of SUPPORTED_LOCALES) {
        urls.push(
          sitemapUrl(`/${locale}/trajets`),
          sitemapUrl(`/${locale}/cgu`),
          sitemapUrl(`/${locale}/confidentialite`),
          ...listSeoLandings(locale).map((landing) => sitemapUrl(`/${locale}${landing.path}`)),
          ...trips.map((trip) => sitemapUrl(
            `/${locale}/trajets/${encodeURIComponent(trip.id)}`,
            trip.updatedAt || trip.createdAt,
          )),
        );
      }
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.send(xml);
    } catch (error) {
      logger.error('Echec de generation du sitemap', error);
      return res.status(503).send('Sitemap temporairement indisponible');
    }
  });

  router.get('/public/seo-page', async (req, res) => {
    const locale = SUPPORTED.has(req.query.locale) ? req.query.locale : 'fr';
    const page = ['trips', 'terms', 'privacy', 'trip', 'landing'].includes(req.query.page) ? req.query.page : null;
    if (!page) return res.status(404).send('Page introuvable');
    try {
      const template = await getTemplate();
      if (page === 'landing') {
        const landing = getSeoLanding(locale, String(req.query.path || ''));
        if (!landing) return res.status(404).send('Page introuvable');
        return res.status(200).type('html').set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
          .send(renderSeoHtml({ template, locale, seo: landing, page, landing }));
      }
      if (page === 'trip') {
        const result = await getPublicTrip(String(req.query.id || ''));
        if (result?.status !== 200 || !result?.body?.trip) {
          const seo = { ...staticPageSeo('trips', locale), title: 'Page introuvable | Wigolink', path: `/trajets/${encodeURIComponent(req.query.id || '')}` };
          return res.status(404).type('html').send(renderSeoHtml({ template, locale, seo, page, status: 404 }));
        }
        const trip = result.body.trip;
        return res.status(200).type('html').set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
          .send(renderSeoHtml({ template, locale, seo: tripPageSeo(trip, locale), page, trip }));
      }
      const seo = staticPageSeo(page, locale);
      const trips = page === 'trips' ? (await listPublicTrips({ limit: 40, offset: 0 }))?.trips || [] : [];
      return res.status(200).type('html').set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
        .send(renderSeoHtml({ template, locale, seo, page, trips }));
    } catch (error) {
      logger.error('Echec de rendu SEO', error);
      return res.status(503).send('Page temporairement indisponible');
    }
  });

  return router;
}

async function collectTrips(listPublicTrips) {
  const trips = [];
  let offset = 0;
  while (trips.length < SITEMAP_LIMIT) {
    const page = await listPublicTrips({ limit: PAGE_SIZE, offset });
    const items = page?.trips || [];
    trips.push(...items);
    if (!page?.page?.hasMore || items.length === 0) break;
    offset += items.length;
  }
  return trips.slice(0, SITEMAP_LIMIT);
}

function sitemapUrl(path, lastModified) {
  const lastmod = lastModified ? `\n    <lastmod>${escapeXml(new Date(lastModified).toISOString())}</lastmod>` : '';
  return `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc>${lastmod}\n  </url>`;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
