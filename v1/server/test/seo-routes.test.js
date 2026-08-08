import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createSeoRouter } from '../routes/seo.js';

test('sitemap publie les pages publiques et pagine les trajets', async () => {
  const calls = [];
  const app = express();
  app.use('/api', createSeoRouter({
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
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/sitemap.xml`);
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/xml/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets<\/loc>/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets\/t-1<\/loc>/);
    assert.match(xml, /https:\/\/wigolink\.com\/fr\/trajets\/t%203<\/loc>/);
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
