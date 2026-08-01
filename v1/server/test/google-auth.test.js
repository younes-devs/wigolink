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

test('google auth valide un jeton d acces avant de charger le profil', async () => {
  const requests = [];
  const verify = createGoogleCredentialVerifier({
    clientId: 'public-client-id',
    client: {
      async getTokenInfo(token) {
        assert.equal(token, 'google-access-token');
        return {
          aud: 'public-client-id',
          sub: 'google-subject',
          email: 'member@example.test',
          scopes: ['openid', 'email', 'profile'],
        };
      },
    },
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            sub: 'google-subject',
            email: ' MEMBER@Example.test ',
            email_verified: true,
            name: 'Membre Google',
          };
        },
      };
    },
  });

  assert.deepEqual(await verify('', 'google-access-token'), {
    subject: 'google-subject',
    email: 'member@example.test',
    name: 'Membre Google',
  });
  assert.deepEqual(requests, [{
    url: 'https://openidconnect.googleapis.com/v1/userinfo',
    options: { headers: { Authorization: 'Bearer google-access-token' } },
  }]);
});

test('google auth refuse un jeton d acces destine a une autre application', async () => {
  const verify = createGoogleCredentialVerifier({
    clientId: 'public-client-id',
    client: {
      async getTokenInfo() {
        return { aud: 'another-client-id' };
      },
    },
    async fetchImpl() {
      assert.fail('le profil ne doit pas etre charge');
    },
  });

  await assert.rejects(verify('', 'foreign-access-token'), /Authentification Google invalide/);
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
