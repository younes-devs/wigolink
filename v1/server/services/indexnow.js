import { SITE_ORIGIN } from '../../shared/seo-metadata.js';
import { SUPPORTED_LOCALES } from '../../shared/locale-routing.js';

export const INDEXNOW_KEY = '86e478f064a649f7869ac72d50497c25';

export function createIndexNowNotifier({ fetchImpl = fetch, logger = console } = {}) {
  return async function notifyPublicTrip(tripId) {
    if (!tripId || process.env.NODE_ENV === 'test') return;
    const urlList = SUPPORTED_LOCALES.map(
      (locale) => `${SITE_ORIGIN}/${locale}/trajets/${encodeURIComponent(tripId)}`,
    );
    try {
      const response = await fetchImpl('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: new URL(SITE_ORIGIN).host,
          key: INDEXNOW_KEY,
          keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok && response.status !== 202) {
        logger.warn('IndexNow a refuse la notification', { status: response.status, tripId });
      }
    } catch (error) {
      logger.warn('Notification IndexNow indisponible', { tripId, message: error.message });
    }
  };
}
