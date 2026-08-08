import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_ORIGIN = 'https://wigolink.com';
const DEFAULT_TITLE = 'Wigolink - Trajets pour colis et documents';
const DEFAULT_DESCRIPTION = 'Trouvez des voyageurs vérifiés pour transporter vos colis et documents entre le Maroc et l’Europe avec Wigolink.';
const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1';

function ensureMeta(name) {
  let element = document.head.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  return element;
}

function ensureCanonical() {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  return element;
}

function isPublicSearchPage(pathname) {
  if (['/trajets', '/cgu', '/confidentialite'].includes(pathname)) return true;
  return /^\/trajets\/[^/]+$/.test(pathname) && pathname !== '/trajets/nouveau';
}

export function RouteSeoPolicy() {
  const { pathname } = useLocation();

  useEffect(() => {
    ensureMeta('robots').setAttribute(
      'content',
      isPublicSearchPage(pathname) ? INDEXABLE_ROBOTS : 'noindex, nofollow',
    );
  }, [pathname]);

  return null;
}

export function usePageSeo({ title, description, canonicalPath, jsonLd } = {}) {
  useEffect(() => {
    document.title = title || DEFAULT_TITLE;
    ensureMeta('description').setAttribute('content', description || DEFAULT_DESCRIPTION);

    const lang = document.documentElement.lang || 'fr';
    const path = canonicalPath || '/trajets';
    ensureCanonical().setAttribute('href', `${SITE_ORIGIN}/${lang}${path}`);

    let script = document.head.querySelector('script[data-wigolink-seo="json-ld"]');
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.wigolinkSeo = 'json-ld';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else {
      script?.remove();
    }

    return () => {
      document.head.querySelector('script[data-wigolink-seo="json-ld"]')?.remove();
    };
  }, [canonicalPath, description, jsonLd, title]);
}

export function tripSeo(trip, locale = 'fr') {
  if (!trip) return {};
  const route = `${trip.from} vers ${trip.to}`;
  const formattedDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${trip.departureDate}T00:00:00Z`));
  const title = `${route} le ${formattedDate} | Wigolink`;
  const description = `${route} le ${formattedDate}. ${trip.capacityKg} kg disponibles à ${trip.price} ${trip.currency}. ${trip.description || ''}`.trim();
  const url = `${SITE_ORIGIN}/${locale}/trajets/${trip.id}`;

  return {
    title,
    description,
    canonicalPath: `/trajets/${trip.id}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Offer',
      name: title,
      description,
      url,
      price: trip.price,
      priceCurrency: trip.currency,
      availability: 'https://schema.org/InStock',
      validThrough: trip.departureDate,
      itemOffered: {
        '@type': 'Service',
        name: `Transport de colis et documents de ${trip.from} à ${trip.to}`,
        serviceType: 'Transport collaboratif de colis et documents',
        provider: trip.traveler?.name ? {
          '@type': 'Person',
          name: trip.traveler.name,
        } : undefined,
      },
    },
  };
}
