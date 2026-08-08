import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createRulesRouter } from '../routes/rules.js';
import {
  BLACKLIST,
  CUSTOMS,
  WHITELIST,
  localizeCategory,
  localizeCustoms,
} from '../rules.js';

async function requestRules({ lang = 'fr', getWhitelist }) {
  const app = express();
  app.use((req, _res, next) => {
    req.lang = lang;
    next();
  });
  app.use('/api/rules', createRulesRouter({
    getWhitelist,
    blacklist: BLACKLIST.slice(0, 1),
    customs: CUSTOMS,
    localizeCategory,
    localizeCustoms,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/rules`);
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      vary: response.headers.get('vary'),
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('rules routes localisent le catalogue et ne revelent pas les tables i18n', async () => {
  const response = await requestRules({
    lang: 'ar',
    getWhitelist: () => WHITELIST.slice(0, 1),
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.cacheControl,
    'public, s-maxage=60, stale-while-revalidate=300',
  );
  assert.match(response.vary, /Accept-Language/i);
  assert.equal(response.body.whitelist[0].label, 'زيت أركان مختوم');
  assert.equal(response.body.blacklist[0].label, 'مكمّلات غذائية / كبسولات');
  assert.equal(response.body.customs['MA-EU'].label, 'المغرب ← أوروبا (بلجيكا)');
  assert.equal('i18n' in response.body.whitelist[0], false);
  assert.equal('reasonI18n' in response.body.blacklist[0], false);
});

test('rules routes chargent la whitelist dynamique a chaque requete publique', async () => {
  let calls = 0;
  const customCategory = {
    id: 'custom',
    label: 'Categorie validee',
    maxQty: '1 kg',
  };
  const response = await requestRules({
    async getWhitelist() {
      calls += 1;
      return [customCategory];
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(response.body.whitelist, [customCategory]);
});

test('rules routes localisent aussi anglais et espagnol', async () => {
  const english = await requestRules({ lang: 'en', getWhitelist: () => WHITELIST.slice(0, 1) });
  const spanish = await requestRules({ lang: 'es', getWhitelist: () => WHITELIST.slice(0, 1) });

  assert.equal(english.body.whitelist[0].label, 'Sealed Argan Oil');
  assert.equal(english.body.customs['MA-EU'].label, 'Morocco → Europe (Belgium)');
  assert.equal(spanish.body.whitelist[0].label, 'Aceite de argán sellado');
  assert.equal(spanish.body.customs['EU-MA'].label, 'Europa → Marruecos');
});
