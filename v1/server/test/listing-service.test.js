import assert from 'node:assert/strict';
import test from 'node:test';
import { createListingService } from '../services/listings.js';

const NOW = Date.parse('2026-07-25T12:00:00.000Z');
const PHOTO = 'data:image/png;base64,AAAA';

function createHarness({
  listings = [],
  trips = [],
  users = [],
} = {}) {
  const events = [];
  const db = {
    listings,
    trips,
    users,
  };
  const service = createListingService({
    db,
    matchesTrip(listing, trip) {
      return (
        listing.from === trip.from
        && listing.to === trip.to
        && listing.weightKg <= trip.capacityKg
      );
    },
    listingView(listing, lang) {
      return { ...listing, lang };
    },
    publicUser(user) {
      return user ? { id: user.id, name: user.name } : null;
    },
    findUser(id) {
      return db.users.find((user) => user.id === id);
    },
    validPhotos(photos) {
      return (
        Array.isArray(photos)
        && photos.every((photo) => photo.startsWith('data:image/'))
      );
    },
    positiveNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    },
    slugify(value) {
      return String(value).toLowerCase().replaceAll(' ', '-');
    },
    evaluateCategory(id) {
      if (id === 'blocked') {
        return {
          verdict: 'blacklisted',
          category: { id, reason: 'Interdit' },
        };
      }
      if (id !== 'miel') {
        return {
          verdict: 'gray',
          category: { id, reason: 'À vérifier' },
        };
      }
      return {
        verdict: 'whitelisted',
        category: { id, label: 'Miel' },
      };
    },
    combinedWhitelist() {
      return [{ id: 'miel', label: 'Miel', icon: 'jar' }];
    },
    localizeCategory(category, lang) {
      return {
        ...category,
        label: `${category.label || category.id}:${lang}`,
      };
    },
    localizeCustoms(_customs, lang) {
      return {
        'MA-EU': { id: `MA-EU:${lang}` },
        'EU-MA': { id: `EU-MA:${lang}` },
      };
    },
    customs: {},
    reviewQueue: {
      append(item) {
        events.push(['review', item]);
      },
    },
    async auditChange(payload) {
      events.push(['audit', payload]);
    },
    save() {
      events.push(['save']);
    },
    newId(prefix) {
      return `${prefix}-new`;
    },
    now() {
      return NOW;
    },
  });
  return { db, service, events };
}

function verifiedUser(overrides = {}) {
  return {
    id: 'u-sender',
    name: 'Sender',
    kycStatus: 'verified',
    maxValue: 500,
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return {
    title: 'Diplôme',
    categoryId: 'miel',
    description: 'Document protégé',
    weightKg: 1,
    valueEur: 100,
    from: 'Oujda',
    to: 'Bruxelles',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-10',
    travelerPay: 15,
    customsAccepted: true,
    photos: [PHOTO],
    ...overrides,
  };
}

test('listing service filtre le feed selon recherche et trajets actifs', () => {
  const { service } = createHarness({
    users: [
      { id: 'u-a', name: 'A' },
      { id: 'u-b', name: 'B' },
    ],
    trips: [{
      id: 't-1',
      travelerId: 'u-viewer',
      from: 'Oujda',
      to: 'Bruxelles',
      capacityKg: 3,
      date: '2026-08-03',
      status: 'published',
    }],
    listings: [
      {
        id: 'l-1',
        senderId: 'u-a',
        status: 'published',
        title: 'Diplôme',
        description: 'Original',
        categoryId: 'miel',
        categoryLabel: 'Documents',
        travelerPay: 15,
        weightKg: 1,
        from: 'Oujda',
        to: 'Bruxelles',
      },
      {
        id: 'l-2',
        senderId: 'u-b',
        status: 'published',
        title: 'Colis',
        categoryId: 'miel',
        categoryLabel: 'Miel',
        travelerPay: 30,
        weightKg: 5,
        from: 'Oujda',
        to: 'Bruxelles',
      },
    ],
  });

  const result = service.list(
    { id: 'u-viewer' },
    { q: 'diplôme', maxPrice: '20' },
    'nl',
  );

  assert.equal(result.filteredByTrip, true);
  assert.equal(result.tripCount, 1);
  assert.equal(result.totalOpen, 1);
  assert.deepEqual(result.listings.map((listing) => listing.id), ['l-1']);
  assert.equal(result.listings[0].matched, true);
  assert.deepEqual(result.listings[0].sender, { id: 'u-a', name: 'A' });
  assert.equal(result.listings[0].lang, 'nl');
});

test('listing service sert uniquement les annonces du membre', () => {
  const { service } = createHarness({
    listings: [
      { id: 'l-1', senderId: 'u-sender' },
      { id: 'l-2', senderId: 'u-other' },
    ],
  });

  assert.deepEqual(
    service.mine(verifiedUser(), 'ar').listings,
    [{ id: 'l-1', senderId: 'u-sender', lang: 'ar' }],
  );
});

test('listing preflight expose blocages, revue et corridor localisé', () => {
  const { service } = createHarness();
  const result = service.preflight(
    verifiedUser(),
    validBody({ categoryId: 'unknown', valueEur: 450 }),
    'nl',
  );

  assert.equal(result.status, 'pending_review');
  assert.equal(result.canSubmit, true);
  assert.ok(result.warnings.includes('review'));
  assert.ok(result.warnings.includes('customs-value'));
  assert.equal(result.category.verdict, 'gray');
  assert.deepEqual(result.customs.corridor, { id: 'EU-MA:nl' });
  assert.deepEqual(result.costs, {
    travelerPay: 15,
    commission: 2.7,
    total: 17.7,
  });
});

test('listing service refuse KYC, catégorie interdite et plafond', async () => {
  const { service, db, events } = createHarness();

  assert.equal(
    (await service.create(
      verifiedUser({ kycStatus: 'none' }),
      validBody(),
    )).status,
    403,
  );
  assert.equal(
    (await service.create(
      verifiedUser(),
      validBody({ categoryId: 'blocked' }),
    )).body.verdict,
    'blacklisted',
  );
  assert.match(
    (await service.create(
      verifiedUser({ maxValue: 50 }),
      validBody(),
    )).body.error,
    /Plafond dépassé/,
  );
  assert.equal(db.listings.length, 0);
  assert.deepEqual(events, []);
});

test('listing service crée, met en revue, audite puis sauvegarde', async () => {
  const { service, db, events } = createHarness();
  const result = await service.create(
    verifiedUser(),
    validBody({
      categoryId: 'autre',
      categoryLabel: 'Objet rare',
    }),
    'ar',
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.listing.id, 'l-new');
  assert.equal(result.body.listing.status, 'pending_review');
  assert.equal(result.body.listing.categoryId, 'objet-rare');
  assert.equal(result.body.listing.lang, 'ar');
  assert.equal(db.listings.length, 1);
  assert.deepEqual(events.map(([type]) => type), [
    'review',
    'audit',
    'save',
  ]);
  assert.equal(events[1][1].action, 'listing.create');
});

test('listing update est atomique lorsque la validation échoue', async () => {
  const listing = {
    id: 'l-1',
    senderId: 'u-sender',
    status: 'published',
    title: 'Avant',
    valueEur: 50,
    photos: [PHOTO],
  };
  const { service, events } = createHarness({ listings: [listing] });

  const result = await service.update(
    listing.id,
    verifiedUser(),
    { title: 'Après', valueEur: 999 },
  );

  assert.equal(result.status, 400);
  assert.equal(listing.title, 'Avant');
  assert.deepEqual(events, []);
});

test('listing update et retrait conservent audit puis sauvegarde', async () => {
  const listing = {
    id: 'l-1',
    senderId: 'u-sender',
    status: 'published',
    title: 'Avant',
    valueEur: 50,
    travelerPay: 10,
    photos: [PHOTO],
  };
  const { service, events } = createHarness({ listings: [listing] });

  const updated = await service.update(
    listing.id,
    verifiedUser(),
    { title: 'Après', travelerPay: 12 },
    'fr',
  );
  const cancelled = await service.cancel(
    listing.id,
    verifiedUser(),
    'fr',
  );

  assert.equal(updated.status, 200);
  assert.equal(updated.body.listing.title, 'Après');
  assert.equal(cancelled.body.listing.status, 'cancelled');
  assert.deepEqual(events.map(([type]) => type), [
    'audit',
    'save',
    'audit',
    'save',
  ]);
  assert.equal(events[0][1].action, 'listing.update');
  assert.equal(events[2][1].action, 'listing.cancel');
});
