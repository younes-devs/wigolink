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
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/storage/v1/bucket/media')) {
      return new Response('', { status: 404 });
    }
    if (url.endsWith('/storage/v1/bucket')) {
      return new Response('{}', { status: 200 });
    }
    if (url.includes('/storage/v1/object/authenticated/')) {
      return new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/png', etag: '"media-1"' },
      });
    }
    return new Response('{}', { status: 200 });
  };
  const service = createMessageMediaService({
    url: 'https://project.supabase.co',
    secretKey: 'secret',
    bucket: 'media',
    fetchImpl,
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
  assert.equal(calls[1].options.body.includes('"public":false'), true);
  assert.equal(calls[2].options.headers.authorization, 'Bearer secret');
  assert.equal(Buffer.isBuffer(calls[2].options.body), true);

  const downloaded = await service.download(stored.storagePath);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.contentType, 'image/png');
  assert.equal(downloaded.etag, '"media-1"');
  assert.equal(downloaded.body.toString(), 'image-bytes');
});
