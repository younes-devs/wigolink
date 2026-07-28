import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateInlineKycMedia } from '../migrate-kyc-media.js';

test('migration KYC remplace les images inline et reste relancable', async () => {
  const uploads = [];
  const state = {
    kycSubmissions: [{
      id: 'kyc-1',
      userId: 'u-1',
      selfiePhoto: 'data:image/png;base64,YQ==',
      idFrontPhoto: 'data:image/jpeg;base64,Yg==',
      idBackPhoto: null,
    }],
  };
  const kycMedia = {
    enabled: true,
    async storeSubmission(input) {
      uploads.push(input);
      return {
        selfiePhoto: { storagePath: 'users/u-1/kyc/selfie.png' },
        idFrontPhoto: { storagePath: 'users/u-1/kyc/front.jpg' },
        idBackPhoto: null,
      };
    },
  };

  const first = await migrateInlineKycMedia({ state, kycMedia });
  const second = await migrateInlineKycMedia({ state, kycMedia });

  assert.equal(first.migrated, 2);
  assert.equal(first.skipped, 0);
  assert.equal(second.migrated, 0);
  assert.equal(second.skipped, 1);
  assert.equal(uploads.length, 1);
  assert.equal(state.kycSubmissions[0].selfiePhoto.storagePath, 'users/u-1/kyc/selfie.png');
});
