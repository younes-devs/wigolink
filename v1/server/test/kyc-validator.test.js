import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAge, validateKycSubmission } from '../validators/kyc.js';

const NOW = new Date('2026-07-25T12:00:00Z');
const validPhotos = (photos) => photos.every((photo) => photo === 'valid-photo');

test('KYC validator calcule la majorite autour de la date anniversaire', () => {
  assert.equal(computeAge('2008-07-25', NOW), 18);
  assert.equal(computeAge('2008-07-26', NOW), 17);
  assert.equal(computeAge('date-invalide', NOW), null);
});

test('KYC validator conserve l ordre historique des erreurs de saisie', () => {
  assert.deepEqual(
    validateKycSubmission({}, { validPhotos, now: NOW }),
    { status: 400, error: 'Nom légal complet requis' },
  );
  assert.deepEqual(
    validateKycSubmission({
      legalName: 'Membre Test',
      documentType: 'license',
    }, { validPhotos, now: NOW }),
    { status: 400, error: 'Type de document invalide' },
  );
  assert.deepEqual(
    validateKycSubmission({
      legalName: 'Membre Test',
      documentType: 'passport',
      birthDate: '2010-01-01',
    }, { validPhotos, now: NOW }),
    { status: 400, error: 'Vous devez avoir 18 ans ou plus' },
  );
});

test('KYC validator exige chaque photo requise selon le document', () => {
  const common = {
    legalName: 'Membre Test',
    birthDate: '1990-01-01',
    documentType: 'id_card',
    selfiePhoto: 'valid-photo',
    idFrontPhoto: 'valid-photo',
  };

  assert.deepEqual(
    validateKycSubmission(common, { validPhotos, now: NOW }),
    {
      status: 400,
      error: 'Photo du verso invalide (obligatoire pour une carte d\'identité)',
    },
  );
});

test('KYC validator normalise le nom et retire le verso d un passeport', () => {
  const longName = `  ${'A'.repeat(130)}  `;
  const result = validateKycSubmission({
    legalName: longName,
    birthDate: '1990-01-01',
    documentType: 'passport',
    selfiePhoto: 'valid-photo',
    idFrontPhoto: 'valid-photo',
    idBackPhoto: 'valid-photo',
  }, { validPhotos, now: NOW });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.value, {
    legalName: 'A'.repeat(120),
    birthDate: '1990-01-01',
    age: 36,
    documentType: 'passport',
    selfiePhoto: 'valid-photo',
    idFrontPhoto: 'valid-photo',
    idBackPhoto: null,
  });
});
