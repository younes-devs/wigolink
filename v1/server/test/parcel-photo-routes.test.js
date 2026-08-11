import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createParcelPhotosRouter } from '../routes/parcel-photos.js';

async function withServer(options, run) {
  const app = express();
  app.use(express.json());
  app.use('/api', createParcelPhotosRouter({
    auth(req, _res, next) { req.user = options.user || { id: 'u-sender' }; next(); },
    getPool: () => options.pool,
    db: options.db || { transactions: [] },
    parcelMedia: options.parcelMedia,
    memberMediaUploads: options.memberMediaUploads,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('photos colis reserve 1 a 5 uploads pour le membre', async () => {
  let received;
  await withServer({
    memberMediaUploads: {
      async reserveParcel(value) {
        received = value;
        return { uploadId: 'media-1', uploads: [{ signedUrl: 'https://upload.test' }] };
      },
    },
  }, async (base) => {
    const response = await fetch(`${base}/trip-requests/parcel-photos/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos: [{ mime: 'image/jpeg', size: 1234 }] }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).uploadId, 'media-1');
  });
  assert.equal(received.userId, 'u-sender');
  assert.equal(received.photos.length, 1);
});

test('photo colis est privee aux participants et administrateurs', async () => {
  const transaction = {
    id: 'tx-1', senderId: 'u-sender', travelerId: 'u-traveler', recipientId: 'u-sender',
    parcelPhotos: [{ id: 'parcel-1', storagePath: 'requests/u/one.jpg' }],
  };
  const parcelMedia = {
    async download(path) {
      assert.equal(path, 'requests/u/one.jpg');
      return { status: 200, body: Buffer.from('image'), contentType: 'image/jpeg' };
    },
  };
  await withServer({ db: { transactions: [transaction] }, parcelMedia }, async (base) => {
    const response = await fetch(`${base}/operations/tx-1/parcel-photos/parcel-1`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
  });
  await withServer({ user: { id: 'u-other' }, db: { transactions: [transaction] }, parcelMedia }, async (base) => {
    const response = await fetch(`${base}/operations/tx-1/parcel-photos/parcel-1`);
    assert.equal(response.status, 404);
  });
});
