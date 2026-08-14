import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateTripProfilePhotos } from '../services/profile-photo-recovery.js';

test('recupere une ancienne photo inline puis la persiste pour le catalogue public', async () => {
  const result = {
    trips: [{ traveler: { id: 'u-1', name: 'Karim', photoUrl: null } }],
  };
  const persisted = [];
  await hydrateTripProfilePhotos({
    result,
    pool: {
      async query() {
        return { rows: [{ id: 'u-1', photo_url: 'data:image/png;base64,YQ==' }] };
      },
    },
    profileMedia: {
      async storeDataUrl() { return 'https://cdn.test/u-1.png'; },
      async recoverPublicUrl() { return null; },
    },
    async persistUser(user, before) { persisted.push({ user, before }); },
  });

  assert.equal(result.trips[0].traveler.photoUrl, 'https://cdn.test/u-1.png');
  assert.equal(persisted[0].before.photoUrl, null);
});

test('retrouve un fichier storage orphelin si l ancien etat ne contient rien', async () => {
  const result = {
    status: 200,
    body: { trip: { traveler: { id: 'u-2', name: 'Aya', photoUrl: null } } },
  };
  await hydrateTripProfilePhotos({
    result,
    pool: { async query() { return { rows: [] }; } },
    profileMedia: {
      async storeDataUrl() { return null; },
      async recoverPublicUrl() { return 'https://cdn.test/u-2.webp'; },
    },
    async persistUser() {},
  });

  assert.equal(result.body.trip.traveler.photoUrl, 'https://cdn.test/u-2.webp');
});

test('conserve la photo publique meme si le backfill relationnel echoue', async () => {
  const result = {
    trips: [{ traveler: { id: 'u-3', name: 'Nora', photoUrl: null } }],
  };
  await hydrateTripProfilePhotos({
    result,
    pool: { async query() { return { rows: [] }; } },
    profileMedia: {
      async storeDataUrl() { return null; },
      async recoverPublicUrl() { return 'https://cdn.test/u-3.webp'; },
    },
    async persistUser() { throw new Error('backfill indisponible'); },
  });

  assert.equal(result.trips[0].traveler.photoUrl, 'https://cdn.test/u-3.webp');
});
