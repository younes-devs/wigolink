import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealtimeService } from '../services/realtime.js';

function createHarness(overrides = {}) {
  const users = new Map();
  const requests = [];
  const errors = [];
  const service = createRealtimeService({
    url: 'https://project.supabase.co',
    publishableKey: 'public-key',
    secretKey: 'secret-key',
    newToken: () => 'channel-token',
    findUser: (id) => users.get(id) || null,
    async fetchImpl(url, options) {
      requests.push({ url, options });
      return { ok: true };
    },
    logger: {
      error(...args) {
        errors.push(args);
      },
    },
    ...overrides,
  });
  return {
    errors,
    requests,
    service,
    users,
  };
}

test('realtime expose uniquement la configuration publique', () => {
  const { service } = createHarness();

  assert.deepEqual(service.publicConfig(), {
    url: 'https://project.supabase.co',
    publishableKey: 'public-key',
  });
  assert.equal(JSON.stringify(service.publicConfig()).includes('secret-key'), false);

  const disabled = createHarness({ secretKey: '' });
  assert.equal(disabled.service.publicConfig(), null);
});

test('realtime attribue un canal stable sans remplacer un canal existant', () => {
  const { service } = createHarness();
  const freshUser = { id: 'u-1' };
  const existingUser = { id: 'u-2', realtimeChannel: 'wigofly:existing' };

  assert.equal(service.ensureChannel(freshUser), 'wigofly:channel-token');
  assert.equal(service.ensureChannel(freshUser), 'wigofly:channel-token');
  assert.equal(service.ensureChannel(existingUser), 'wigofly:existing');
});

test('realtime publie un evenement sur le canal Supabase encode', async () => {
  const { requests, service, users } = createHarness();
  users.set('u-1', {
    id: 'u-1',
    realtimeChannel: 'wigofly:member/channel',
  });
  const payload = { type: 'message', conversationId: 'conv-1' };

  assert.equal(await service.publish('u-1', payload), true);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    'https://project.supabase.co/realtime/v1/api/broadcast/wigofly%3Amember%2Fchannel/events/update',
  );
  assert.deepEqual(requests[0].options, {
    method: 'POST',
    headers: {
      apikey: 'secret-key',
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
});

test('realtime ignore les membres sans canal et absorbe une panne reseau', async () => {
  const failure = new Error('Supabase indisponible');
  const { errors, requests, service, users } = createHarness({
    async fetchImpl() {
      throw failure;
    },
  });

  users.set('u-1', { id: 'u-1' });
  assert.equal(await service.publish('u-1', { type: 'message' }), false);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);

  users.get('u-1').realtimeChannel = 'wigofly:ready';
  assert.equal(await service.publish('u-1', { type: 'message' }), false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], 'Echec de diffusion temps reel');
  assert.equal(errors[0][1], failure);
});

test('realtime conserve la diffusion locale et les indicateurs de presence', () => {
  const { service } = createHarness({ secretKey: '' });
  const writes = [];
  service.clients.set('u-1', [{
    write(value) {
      writes.push(value);
    },
  }]);
  service.lastSeenByUser.set('u-1', 1234);

  service.sendLocal('u-1', { type: 'read' });

  assert.deepEqual(writes, [
    'event: update\ndata: {"type":"read"}\n\n',
  ]);
  assert.equal(service.isOnline('u-1'), true);
  assert.equal(service.lastSeenAt('u-1'), 1234);
  assert.equal(service.isOnline('missing'), false);
  assert.equal(service.lastSeenAt('missing'), null);
});
