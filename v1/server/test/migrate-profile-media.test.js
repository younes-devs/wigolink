import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateInlineProfileMedia } from '../migrate-profile-media.js';

test('migration profil remplace uniquement les avatars inline', async () => {
  const state = {
    users: [
      { id: 'u-1', photoUrl: 'data:image/png;base64,YQ==' },
      { id: 'u-2', photoUrl: 'https://cdn.test/existing.jpg' },
      { id: 'u-3', photoUrl: null },
    ],
  };
  const profileMedia = {
    enabled: true,
    async storeDataUrl({ userId }) {
      return `https://cdn.test/${userId}.jpg`;
    },
  };

  const first = await migrateInlineProfileMedia({ state, profileMedia });
  const second = await migrateInlineProfileMedia({ state, profileMedia });

  assert.equal(first.migrated, 1);
  assert.equal(first.skipped, 2);
  assert.equal(second.migrated, 0);
  assert.equal(state.users[0].photoUrl, 'https://cdn.test/u-1.jpg');
});
