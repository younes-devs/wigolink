import assert from 'node:assert/strict';
import test from 'node:test';
import { createKycMediaService } from '../services/kyc-media.js';

function storageHarness({ missingBucket = true } = {}) {
  const uploads = [];
  const removals = [];
  const buckets = [];
  const storageClient = {
    async getBucket() {
      return missingBucket
        ? { error: { statusCode: 404, message: 'not found' } }
        : { data: { id: 'wigolink-kyc-media' }, error: null };
    },
    async createBucket(name, options) {
      buckets.push({ name, options });
      return { data: {}, error: null };
    },
    from(name) {
      return {
        async upload(path, bytes, options) {
          uploads.push({ name, path, bytes, options });
          return { data: { path }, error: null };
        },
        async remove(paths) {
          removals.push({ name, paths });
          return { data: {}, error: null };
        },
        async createSignedUrl(path, expiresIn) {
          return {
            data: { signedUrl: `https://storage.test/${path}?ttl=${expiresIn}` },
            error: null,
          };
        },
      };
    },
  };
  return { storageClient, uploads, removals, buckets };
}

test('KYC media cree un bucket prive et remplace les images inline', async () => {
  const harness = storageHarness();
  const service = createKycMediaService({
    storageClient: harness.storageClient,
  });
  const image = 'data:image/png;base64,QUJD';
  const stored = await service.storeSubmission({
    userId: 'u-1',
    photos: {
      selfiePhoto: image,
      idFrontPhoto: image,
      idBackPhoto: null,
    },
  });

  assert.equal(harness.buckets.length, 1);
  assert.equal(harness.buckets[0].options.public, false);
  assert.equal(harness.uploads.length, 2);
  assert.equal(stored.selfiePhoto.mime, 'image/png');
  assert.equal(stored.selfiePhoto.size, 3);
  assert.match(stored.selfiePhoto.storagePath, /^users\/u-1\/.+\/selfiePhoto\.png$/);
  assert.equal(stored.idBackPhoto, null);

  const url = await service.viewUrl(stored.selfiePhoto);
  assert.match(url, /^https:\/\/storage\.test\//);
  assert.match(url, /ttl=300$/);
});

test('KYC media conserve les anciens data URLs pendant la migration', async () => {
  const service = createKycMediaService({
    storageClient: storageHarness({ missingBucket: false }).storageClient,
  });
  const legacy = 'data:image/jpeg;base64,QUJD';
  assert.equal(await service.viewUrl(legacy), legacy);
});

test('KYC media reste inactif sans secret serveur', async () => {
  const service = createKycMediaService({});
  const photos = { selfiePhoto: 'inline' };
  assert.equal(service.enabled, false);
  assert.equal(await service.storeSubmission({ userId: 'u-1', photos }), photos);
});
