import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createSeoRouter } from '../routes/seo.js';

test('index sitemap publie un sitemap distinct par langue', async () => {
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => '',
    getPublicTrip: async () => ({ status: 404, body: {} }),
    listPublicTrips: async () => ({ trips: [], page: { hasMore: false } }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/sitemap.xml`);
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(xml, /<sitemapindex/);
    assert.match(xml, /https:\/\/wigolink\.com\/sitemap-fr\.xml/);
    assert.match(xml, /https:\/\/wigolink\.com\/sitemap-ar\.xml/);
    assert.doesNotMatch(xml, /<urlset/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('sitemap localise publie les pages publiques et pagine les trajets', async () => {
  const calls = [];
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => '<html><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="default" /><title>Default</title></head><body><div id="root"></div></body></html>',
    getPublicTrip: async () => ({ status: 404, body: {} }),
    async listPublicTrips(query) {
      calls.push(query);
      if (query.offset === 0) {
        return {
          trips: [{ id: 't-1' }, { id: 't-2' }],
          page: { hasMore: true },
        };
      }
      return {
        trips: [{ id: 't 3' }],
        page: { hasMore: false },
      };
    },
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/sitemap.xml?locale=fr`);
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/xml/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets<\/loc>/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets\/t-1<\/loc>/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets\/t%203<\/loc>/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/envoyer-colis\/maroc-belgique<\/loc>/);
    assert.doesNotMatch(xml, /https:\/\/wigolink\.com\/en\//);
    assert.deepEqual(calls, [
      { limit: 100, offset: 0 },
      { limit: 100, offset: 2 },
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
});

test('guide SEO darija contient contenu utile, hreflang localise et liens vers les trajets', async () => {
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => '<html><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="default" /><title>Default</title></head><body><div id="root"></div></body></html>',
    listPublicTrips: async () => ({ trips: [], page: { hasMore: false } }),
    getPublicTrip: async () => ({ status: 404, body: {} }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const path = encodeURIComponent('/sift-colis/maghrib-belgique');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/seo-page?locale=ar&page=landing&path=${path}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /صيفط كولية من المغرب لبلجيكا/);
    assert.match(html, /href="\/ar\/trajets"/);
    assert.match(html, /hreflang="fr" href="https:\/\/wigolink\.com\/fr\/envoyer-colis\/maroc-belgique"/);
    assert.match(html, /hreflang="en" href="https:\/\/wigolink\.com\/en\/send-parcel\/morocco-belgium"/);
    assert.match(html, /FAQPage/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('guide France vers Maroc repond a une intention inverse avec cinq alternates', async () => {
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => '<html><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="default" /><title>Default</title></head><body><div id="root"></div></body></html>',
    listPublicTrips: async () => ({ trips: [], page: { hasMore: false } }),
    getPublicTrip: async () => ({ status: 404, body: {} }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const path = encodeURIComponent('/envoyer-colis/france-maroc');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/seo-page?locale=fr&page=landing&path=${path}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Envoyer un colis de France au Maroc avec un voyageur/);
    assert.match(html, /href="\/fr\/trajets"/);
    assert.match(html, /hreflang="nl" href="https:\/\/wigolink\.com\/nl\/pakket-versturen\/frankrijk-marokko"/);
    assert.match(html, /BreadcrumbList/);
    assert.match(html, /FAQPage/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('page SEO trajet contient contenu, canonical, langues et donnees structurees', async () => {
  const template = '<html><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="default" /><title>Default</title></head><body><div id="root"></div></body></html>';
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => template,
    listPublicTrips: async () => ({ trips: [], page: { hasMore: false } }),
    getPublicTrip: async (id) => ({
      status: 200,
      body: { trip: {
        id, from: 'Oujda', to: 'Paris', departureDate: '2026-09-20',
        capacityKg: 4, price: 18, currency: 'EUR', description: 'Petit colis.',
        conditions: 'Colis conforme.', traveler: { name: 'Aya' },
      } },
    }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/seo-page?locale=fr&page=trip&id=t-1`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.match(html, /<link rel="canonical" href="https:\/\/wigolink\.com\/fr\/trajets\/t-1">/);
    assert.match(html, /hreflang="en" href="https:\/\/wigolink\.com\/en\/trajets\/t-1"/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /type="application\/ld\+json"/);
    assert.match(html, /<h1>Oujda - Paris<\/h1>/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('page SEO trajet absente retourne un vrai 404 non indexable', async () => {
  const app = express();
  app.use('/api', createSeoRouter({
    getTemplate: async () => '<html><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="default" /><title>Default</title></head><body><div id="root"></div></body></html>',
    listPublicTrips: async () => ({ trips: [], page: { hasMore: false } }),
    getPublicTrip: async () => ({ status: 404, body: {} }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/seo-page?locale=fr&page=trip&id=missing`);
    const html = await response.text();
    assert.equal(response.status, 404);
    assert.match(html, /noindex, nofollow/);
    assert.match(html, /Page introuvable/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
