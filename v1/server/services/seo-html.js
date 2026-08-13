import { readFile } from 'node:fs/promises';
import {
  alternateLinks, INDEXABLE_ROBOTS, localizedUrl, seoCopy, SOCIAL_IMAGE,
} from '../../shared/seo-metadata.js';
import { listSeoLandings } from '../../shared/seo-landings.js';

let templatePromise;

export async function loadClientTemplate() {
  templatePromise ||= readFile(new URL('../../client/dist/index.html', import.meta.url), 'utf8');
  return templatePromise;
}

export function renderSeoHtml({ template, locale, seo, page, trips = [], trip = null, landing = null, status = 200 }) {
  const canonical = localizedUrl(locale, seo.path);
  const jsonLd = seo.jsonLd || websiteJsonLd(canonical);
  const head = [
    `<link rel="canonical" href="${escapeAttribute(canonical)}">`,
    ...(seo.alternates || alternateLinks(seo.path)).map(({ locale: code, href }) => (
      `<link rel="alternate" hreflang="${escapeAttribute(code)}" href="${escapeAttribute(href)}">`
    )),
    propertyMeta('og:type', trip ? 'product' : 'website'),
    propertyMeta('og:site_name', 'Wigolink'),
    propertyMeta('og:title', seo.title),
    propertyMeta('og:description', seo.description),
    propertyMeta('og:url', canonical),
    propertyMeta('og:image', SOCIAL_IMAGE),
    nameMeta('twitter:card', 'summary_large_image'),
    nameMeta('twitter:title', seo.title),
    nameMeta('twitter:description', seo.description),
    nameMeta('twitter:image', SOCIAL_IMAGE),
    `<script type="application/ld+json" data-wigolink-seo="json-ld">${safeJson(jsonLd)}</script>`,
  ].join('\n    ');
  const content = status === 404
    ? `<main><h1>Page introuvable</h1><p>Cette page n existe pas ou n est plus disponible.</p></main>`
    : renderPageContent({ locale, page, trips, trip, landing });

  return template
    .replace(/<html\b[^>]*>/i, `<html lang="${escapeAttribute(locale)}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/i, `<meta name="robots" content="${status === 404 ? 'noindex, nofollow' : INDEXABLE_ROBOTS}" />`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${escapeAttribute(seo.description)}" />`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(seo.title)}</title>\n    ${head}`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}

function renderPageContent({ locale, page, trips, trip, landing }) {
  const copy = seoCopy(locale);
  if (page === 'trip' && trip) {
    return `<main data-seo-prerender="trip">
      <h1>${escapeHtml(trip.from)} - ${escapeHtml(trip.to)}</h1>
      <p>${escapeHtml(trip.departureDate)} · ${escapeHtml(trip.capacityKg)} kg · ${escapeHtml(trip.price)} ${escapeHtml(trip.currency)}</p>
      <p>${escapeHtml(trip.description)}</p>
      <p>${escapeHtml(trip.conditions)}</p>
    </main>`;
  }
  if (page === 'trips') {
    const links = trips.map((item) => (
      `<li><a href="/${escapeAttribute(locale)}/trajets/${encodeURIComponent(item.id)}">${escapeHtml(item.from)} - ${escapeHtml(item.to)}</a>`
      + ` <span>${escapeHtml(item.departureDate)} · ${escapeHtml(item.capacityKg)} kg · ${escapeHtml(item.price)} ${escapeHtml(item.currency)}</span></li>`
    )).join('');
    const guides = listSeoLandings(locale).map((item) => (
      `<li><a href="/${escapeAttribute(locale)}${escapeAttribute(item.path)}">${escapeHtml(item.h1)}</a></li>`
    )).join('');
    return `<main data-seo-prerender="trips"><h1>${escapeHtml(copy.feedHeading)}</h1><p>${escapeHtml(copy.feedIntro)}</p><ul>${links}</ul><nav aria-label="Guides"><ul>${guides}</ul></nav></main>`;
  }
  if (page === 'landing' && landing) {
    const steps = landing.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
    const faqs = landing.faqs.map(([question, answer]) => (
      `<section><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></section>`
    )).join('');
    return `<main data-seo-prerender="landing">
      <p>${escapeHtml(landing.eyebrow)}</p>
      <h1>${escapeHtml(landing.h1)}</h1>
      <p>${escapeHtml(landing.intro)}</p>
      <p><a href="/${escapeAttribute(locale)}/trajets">${escapeHtml(landing.cta)}</a></p>
      <h2>${escapeHtml(landing.howTitle)}</h2><ol>${steps}</ol>
      <h2>${escapeHtml(landing.detailsTitle)}</h2><p>${escapeHtml(landing.details)}</p>
      <h2>${escapeHtml(landing.faqTitle)}</h2>${faqs}
      <p><a href="/${escapeAttribute(locale)}/trajets">${escapeHtml(landing.cta)}</a></p>
    </main>`;
  }
  return `<main data-seo-prerender="legal"><h1>${escapeHtml(page === 'terms' ? copy.termsTitle : copy.privacyTitle)}</h1><p>${escapeHtml(page === 'terms' ? copy.termsDescription : copy.privacyDescription)}</p></main>`;
}

function websiteJsonLd(url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Wigolink',
    url,
  };
}

function nameMeta(name, content) {
  return `<meta name="${escapeAttribute(name)}" content="${escapeAttribute(content)}">`;
}

function propertyMeta(property, content) {
  return `<meta property="${escapeAttribute(property)}" content="${escapeAttribute(content)}">`;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
