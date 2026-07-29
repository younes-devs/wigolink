import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessageMediaService } from '../services/message-media.js';

test('message media reste inactif sans configuration serveur', async () => {
  const service = createMessageMediaService({});
  assert.equal(service.enabled, false);
  assert.equal(await service.storeDataUrl({}), null);
  assert.equal(await service.download('path'), null);
});

test('message media cree un bucket prive puis stocke et relit une image', async () => {
  const calls = [];
  const storageClient = {
    async getBucket(name) {
      calls.push(['getBucket', name]);
      return { data: null, error: { statusCode: 404, message: 'Bucket not found' } };
    },
    async createBucket(name, options) {
      calls.push(['createBucket', name, options]);
      return { data: { name }, error: null };
    },
    from(name) {
      return {
        async createSignedUploadUrl(path) {
          calls.push(['createSignedUploadUrl', name, path]);
          return {
            data: {
              path,
              token: 'signed-token',
              signedUrl: 'https://storage.example.test/upload',
            },
            error: null,
          };
        },
        async info(path) {
          calls.push(['info', name, path]);
          return {
            data: {
              size: 512,
              contentType: 'image/png',
            },
            error: null,
          };
        },
        async upload(path, body, options) {
          calls.push(['upload', name, path, body, options]);
          return { data: { path }, error: null };
        },
        async download(path) {
          calls.push(['download', name, path]);
          return {
            data: new Blob([Buffer.from('image-bytes')], { type: 'image/png' }),
            error: null,
          };
        },
      };
    },
  };
  const service = createMessageMediaService({
    bucket: 'media',
    storageClient,
  });

  const stored = await service.storeDataUrl({
    conversationId: 'conv-1',
    attachmentId: 'att-1',
    dataUrl: 'data:image/png;base64,aW1hZ2U=',
  });
  assert.deepEqual(stored, {
    storagePath: 'conversations/conv-1/att-1.png',
    mime: 'image/png',
    size: 5,
  });
  assert.deepEqual(calls[1], ['createBucket', 'media', {
    public: false,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    fileSizeLimit: 700 * 1024,
  }]);
  assert.equal(calls[2][0], 'upload');
  assert.equal(Buffer.isBuffer(calls[2][3]), true);

  const downloaded = await service.download(stored.storagePath);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.contentType, 'image/png');
  assert.equal(downloaded.etag, null);
  assert.equal(downloaded.body.toString(), 'image-bytes');

  const upload = await service.createSignedUpload({
    conversationId: 'conv-1',
    attachmentId: 'att-direct',
    mime: 'image/png',
  });
  assert.deepEqual(upload, {
    attachmentId: 'att-direct',
    storagePath: 'conversations/conv-1/att-direct.png',
    signedUrl: 'https://storage.example.test/upload',
    token: 'signed-token',
  });
  assert.deepEqual(await service.info(upload.storagePath), {
    mime: 'image/png',
    size: 512,
  });
});
