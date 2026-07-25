import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateProfilePhoto,
  validateProfileUpdate,
} from '../validators/profile.js';

test('profile validator normalise et borne les champs modifiables', () => {
  assert.deepEqual(validateProfileUpdate({
    name: `  ${'A'.repeat(70)}  `,
    city: `  ${'B'.repeat(70)}  `,
    phone: `  ${'1'.repeat(30)}  `,
    isAdmin: true,
  }), {
    value: {
      name: 'A'.repeat(60),
      city: 'B'.repeat(60),
      phone: '1'.repeat(20),
    },
  });

  assert.deepEqual(validateProfileUpdate({ name: ' ' }), {
    status: 400,
    error: 'Nom trop court',
  });
});

test('profile photo validator accepte la suppression et les formats historiques', () => {
  assert.deepEqual(validateProfilePhoto(null), { value: null });
  for (const format of ['jpeg', 'png', 'webp']) {
    const dataUrl = `data:image/${format};base64,AAAA`;
    assert.deepEqual(validateProfilePhoto(dataUrl), { value: dataUrl });
  }
});

test('profile photo validator refuse le format et la taille invalides', () => {
  assert.deepEqual(validateProfilePhoto('data:image/gif;base64,AAAA'), {
    status: 400,
    error: 'Format d\'image invalide (JPEG, PNG ou WebP)',
  });
  assert.deepEqual(
    validateProfilePhoto(`data:image/png;base64,${'A'.repeat(700 * 1024)}`),
    {
      status: 400,
      error: 'Image trop lourde (500 Ko max après compression)',
    },
  );
});
