import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  alternateLinks, INDEXABLE_ROBOTS, PRIVATE_ROBOTS, SITE_ORIGIN, SOCIAL_IMAGE,
  staticPageSeo, tripPageSeo,
} from '../../../shared/seo-metadata.js';

export { SITE_ORIGIN };
const DEFAULT_SEO = staticPageSeo('trips', 'fr');

function ensureMeta(name) {
  let element = document.head.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  return element;
}

function ensurePropertyMeta(property) {
  let element = document.head.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
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
  if (/^\/(envoyer-colis|envoyer-document|send-parcel|send-document|enviar-paquete|enviar-documento|pakket-versturen|document-versturen|sift-colis|sift-watiqa)\//.test(pathname)) return true;
  return /^\/trajets\/[^/]+$/.test(pathname) && pathname !== '/trajets/nouveau';
}

export function RouteSeoPolicy() {
  const { pathname } = useLocation();
  useEffect(() => {
    ensureMeta('robots').setAttribute('content', isPublicSearchPage(pathname) ? INDEXABLE_ROBOTS : PRIVATE_ROBOTS);
  }, [pathname]);
  return null;
}

export function usePageSeo({ title, description, canonicalPath, path, alternates, jsonLd } = {}) {
  useEffect(() => {
    const pageTitle = title || DEFAULT_SEO.title;
    const pageDescription = description || DEFAULT_SEO.description;
    const lang = document.documentElement.lang || 'fr';
    const pagePath = canonicalPath || path || '/trajets';
    const canonicalUrl = `${SITE_ORIGIN}/${lang}${pagePath}`;
    document.title = pageTitle;
    ensureMeta('description').setAttribute('content', pageDescription);
    ensureCanonical().setAttribute('href', canonicalUrl);

    document.head.querySelectorAll('link[data-wigolink-seo="alternate"]').forEach((element) => element.remove());
    for (const alternate of alternates || alternateLinks(pagePath)) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = alternate.locale;
      link.href = alternate.href;
      link.dataset.wigolinkSeo = 'alternate';
      document.head.appendChild(link);
    }

    ensurePropertyMeta('og:type').setAttribute('content', jsonLd?.['@type'] === 'Offer' ? 'product' : 'website');
    ensurePropertyMeta('og:site_name').setAttribute('content', 'Wigolink');
    ensurePropertyMeta('og:title').setAttribute('content', pageTitle);
    ensurePropertyMeta('og:description').setAttribute('content', pageDescription);
    ensurePropertyMeta('og:url').setAttribute('content', canonicalUrl);
    ensurePropertyMeta('og:image').setAttribute('content', SOCIAL_IMAGE);
    ensureMeta('twitter:card').setAttribute('content', 'summary_large_image');
    ensureMeta('twitter:title').setAttribute('content', pageTitle);
    ensureMeta('twitter:description').setAttribute('content', pageDescription);
    ensureMeta('twitter:image').setAttribute('content', SOCIAL_IMAGE);

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
    return () => document.head.querySelector('script[data-wigolink-seo="json-ld"]')?.remove();
  }, [alternates, canonicalPath, description, jsonLd, path, title]);
}

export function tripSeo(trip, locale = 'fr') {
  const seo = tripPageSeo(trip, locale);
  return { ...seo, canonicalPath: seo.path };
}
