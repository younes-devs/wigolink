import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileMediaService } from '../services/profile-media.js';

function storageHarness() {
  const uploads = [];
  const removals = [];
  const storageClient = {
    async getBucket() {
      return { error: { statusCode: 404, message: 'not found' } };
    },
    async createBucket(name, options) {
      return { data: { name, options }, error: null };
    },
    from(bucket) {
      return {
        async upload(path, bytes, options) {
          uploads.push({ bucket, path, bytes, options });
          return { data: {}, error: null };
        },
        async remove(paths) {
          removals.push({ bucket, paths });
          return { data: {}, error: null };
        },
        getPublicUrl(path) {
          return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
        },
      };
    },
  };
  return { storageClient, uploads, removals };
}

test('profile media stocke un avatar public cacheable sans base64', async () => {
  const harness = storageHarness();
  const service = createProfileMediaService({
    storageClient: harness.storageClient,
  });
  const url = await service.storeDataUrl({
    userId: 'u-1',
    dataUrl: 'data:image/webp;base64,QUJD',
  });

  assert.match(url, /^https:\/\/cdn\.test\/wigofly-profile-media\/users\/u-1\/avatar\.webp\?v=/);
  assert.equal(harness.uploads[0].options.cacheControl, '31536000');
  assert.equal(harness.uploads[0].bytes.length, 3);
  assert.deepEqual(harness.removals[0].paths, [
    'users/u-1/avatar.jpg',
    'users/u-1/avatar.png',
  ]);
});
