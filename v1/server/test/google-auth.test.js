import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleCredentialVerifier } from '../google-auth.js';

test('google auth reste desactive sans identifiant client', () => {
  assert.equal(createGoogleCredentialVerifier({ clientId: '' }), null);
});

test('google auth normalise une identite verifiee par Google', async () => {
  const calls = [];
  const verify = createGoogleCredentialVerifier({
    clientId: 'public-client-id',
    client: {
      async verifyIdToken(options) {
        calls.push(options);
        return {
          getPayload: () => ({
            sub: 'google-subject',
            email: ' MEMBER@Example.test ',
            email_verified: true,
            name: 'Membre Google',
          }),
        };
      },
    },
  });

  assert.deepEqual(await verify('signed-google-token'), {
    subject: 'google-subject',
    email: 'member@example.test',
    name: 'Membre Google',
  });
  assert.deepEqual(calls, [{
    idToken: 'signed-google-token',
    audience: 'public-client-id',
  }]);
});

test('google auth refuse les jetons invalides et les emails non verifies', async () => {
  const invalid = createGoogleCredentialVerifier({
    clientId: 'public-client-id',
    client: { verifyIdToken: async () => { throw new Error('signature'); } },
  });
  await assert.rejects(invalid('invalid'), /Authentification Google invalide/);

  const unverified = createGoogleCredentialVerifier({
    clientId: 'public-client-id',
    client: {
      verifyIdToken: async () => ({
        getPayload: () => ({
          sub: 'google-subject',
          email: 'member@example.test',
          email_verified: false,
        }),
      }),
    },
  });
  await assert.rejects(unverified('signed-token'), /Authentification Google invalide/);
});
