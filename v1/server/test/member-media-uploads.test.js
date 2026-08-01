import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemberMediaUploadService } from '../services/member-media-uploads.js';

function harness() {
  const records = new Map();
  const removed = [];
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('insert into public.wigofly_runtime_records')) {
        records.set(params[0], JSON.parse(params[1]));
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('update public.wigofly_runtime_records')) {
        const data = records.get(params[0]);
        if (!data || data.claimed || data.userId !== params[1] || data.mediaType !== params[2]) {
          return { rowCount: 0, rows: [] };
        }
        data.claimed = true;
        return { rowCount: 1, rows: [{ data }] };
      }
      if (normalized.startsWith('select data from public.wigofly_runtime_records')) {
        const data = records.get(params[0]);
        return { rows: data ? [{ data }] : [], rowCount: data ? 1 : 0 };
      }
      if (normalized.startsWith('delete from public.wigofly_runtime_records')) {
        return { rowCount: records.delete(params[0]) ? 1 : 0, rows: [] };
      }
      throw new Error(`SQL inattendu: ${normalized}`);
    },
  };
  const media = (type) => ({
    enabled: true,
    async createSignedUpload({ userId, uploadId, field = 'photo', mime }) {
      const storagePath = `users/${userId}/${uploadId}/${field}.jpg`;
      return { field, mime, storagePath, signedUrl: `https://upload.test/${storagePath}` };
    },
    async info() {
      return { mime: 'image/jpeg', size: 1234 };
    },
    async removePaths(paths) {
      removed.push([type, ...paths]);
    },
    publicUrl(path) {
      return `https://cdn.test/${path}`;
    },
  });
  const service = createMemberMediaUploadService({
    getPool: () => pool,
    kycMedia: media('kyc'),
    profileMedia: media('profile'),
    now: () => 1_000,
  });
  return { service, records, removed };
}

test('uploads membre reserve, verifie et consomme un lot KYC une seule fois', async () => {
  const { service, records } = harness();
  const reserved = await service.reserveKyc({
    userId: 'u-1',
    photos: {
      selfiePhoto: { mime: 'image/jpeg', size: 1200 },
      idFrontPhoto: { mime: 'image/jpeg', size: 1300 },
    },
  });
  assert.equal(reserved.uploads.length, 2);
  assert.equal(records.get(reserved.uploadId).claimed, false);

  const claimed = await service.claimKyc({
    userId: 'u-1',
    uploadId: reserved.uploadId,
    fields: ['selfiePhoto', 'idFrontPhoto'],
  });
  assert.equal(claimed.photos.selfiePhoto.size, 1234);
  await assert.rejects(() => service.claimKyc({
    userId: 'u-1',
    uploadId: reserved.uploadId,
    fields: ['selfiePhoto', 'idFrontPhoto'],
  }), /invalide ou expiree/);
  await service.complete(reserved.uploadId);
  assert.equal(records.has(reserved.uploadId), false);
});

test('uploads membre refuse un fichier trop lourd et nettoie un profil abandonne', async () => {
  const { service, records, removed } = harness();
  await assert.rejects(() => service.reserveProfile({
    userId: 'u-1', mime: 'image/jpeg', size: 800 * 1024,
  }), /trop lourde/);

  const reserved = await service.reserveProfile({
    userId: 'u-1', mime: 'image/jpeg', size: 1200,
  });
  const data = records.get(reserved.uploadId);
  await service.cleanupData(data);
  assert.deepEqual(removed[0], ['profile', data.uploads[0].storagePath]);
});
