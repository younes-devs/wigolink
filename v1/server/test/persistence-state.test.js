import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  createPersistenceState,
  isRelationalAuthRequest,
  isRelationalAccountRequest,
  isRelationalMaintenanceRequest,
  isRelationalKycRequest,
  isRelationalAdminMembersRequest,
  isRelationalAdminActionRequest,
  isRelationalMessageRead,
  isRelationalMessageWrite,
  isRelationalNavigationRead,
  isRelationalPublicProfileRequest,
  isRelationalOperationRead,
  isRelationalOperationWrite,
  isRelationalTripWrite,
  isRelationalTripMutation,
  isRelationalTripRead,
} from '../middleware/persistence-state.js';

function createResponse(events = []) {
  let resolveCompletion;
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve;
  });
  const res = new EventEmitter();
  res.headersSent = false;
  res.statusCode = 200;
  res.headers = {};
  res.body = undefined;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.setHeader = function setHeader(name, value) {
    this.headers[name] = value;
  };
  res.json = function json(body) {
    events.push('json');
    this.body = body;
    this.headersSent = true;
    resolveCompletion();
    return this;
  };
  res.send = function send(body) {
    events.push('send');
    this.body = body;
    this.headersSent = true;
    resolveCompletion();
    return this;
  };
  res.end = function end(body) {
    events.push('end');
    this.body = body;
    this.headersSent = true;
    resolveCompletion();
    return this;
  };
  res.completion = completion;
  return res;
}

function createMiddleware(overrides = {}) {
  const events = [];
  const db = { users: [] };
  const dependencies = {
    db,
    usesDatabase: () => true,
    refreshDatabaseState: async () => {
      events.push('refresh');
    },
    acquireDatabaseState: async ({ write }) => {
      events.push(`acquire:${write}`);
      return { client: 'pool-client' };
    },
    releaseDatabaseState: async (_lock, { commit }) => {
      events.push(`release:${commit}`);
    },
    relationalTripReadsEnabled: () => false,
    relationalMessageReadsEnabled: () => false,
    snapshotRelationalTripState: () => {
      events.push('snapshot');
      return { trips: [] };
    },
    syncRelationalTripState: async ({ pool, before, after }) => {
      events.push('sync');
      assert.equal(pool, 'pool-client');
      assert.deepEqual(before, { trips: [] });
      assert.equal(after, db);
    },
    logger: {
      error(message) {
        events.push(`error:${message}`);
      },
    },
    ...overrides,
  };

  return {
    db,
    events,
    middleware: createPersistenceState(dependencies),
  };
}

test('persistence state reconnait uniquement les lectures relationnelles attendues', () => {
  const enabled = () => true;

  assert.equal(isRelationalTripRead({ method: 'GET', path: '/api/trips' }, enabled), true);
  assert.equal(isRelationalTripRead({ method: 'POST', path: '/api/trips' }, enabled), false);
  assert.equal(isRelationalTripRead({ method: 'GET', path: '/api/trips/t-1' }, enabled), true);
  assert.equal(
    isRelationalMessageRead({ method: 'GET', path: '/api/conversations/c-1/messages' }, enabled),
    true,
  );
  assert.equal(
    isRelationalOperationRead({
      method: 'GET',
      path: '/api/operations/tx-1',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalOperationRead({
      method: 'POST',
      path: '/api/operations/tx-1/pay',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalOperationWrite({
      method: 'POST',
      path: '/api/operations/tx-1/pay',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalOperationWrite({
      method: 'POST',
      path: '/api/trips/t-1/accept',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalOperationWrite({
      method: 'DELETE',
      path: '/api/operations/tx-1/pay',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalNavigationRead({
      method: 'GET',
      path: '/api/navigation-summary',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalPublicProfileRequest(
      { method: 'GET', path: '/api/users/u-1/reviews' },
      enabled,
      () => false,
    ),
    true,
  );
  assert.equal(
    isRelationalPublicProfileRequest(
      { method: 'POST', path: '/api/transactions/tx-1/rate' },
      () => false,
      enabled,
    ),
    true,
  );
  assert.equal(
    isRelationalTripWrite({
      method: 'POST',
      path: '/api/saved-trips/t-1',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalTripWrite({
      method: 'PATCH',
      path: '/api/trips/t-1',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalTripMutation({
      method: 'POST',
      path: '/api/trips',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalKycRequest({
      method: 'POST',
      path: '/api/kyc/submit',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAdminMembersRequest({
      method: 'GET',
      path: '/api/admin/users/u-1/case-file',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAdminActionRequest({
      method: 'POST',
      path: '/api/admin/users/u-1/role',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAdminActionRequest({
      method: 'GET',
      path: '/api/admin/users/u-1/role',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalKycRequest({
      method: 'POST',
      path: '/api/admin/kyc/kyc-1/decide',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalTripMutation({
      method: 'PATCH',
      path: '/api/trips/t-1',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalMessageRead({ method: 'GET', path: '/api/conversations/c-1/delete' }, enabled),
    false,
  );
  assert.equal(
    isRelationalMessageWrite({
      method: 'POST',
      path: '/api/conversations/c-1/messages',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAuthRequest({
      method: 'POST',
      path: '/api/profile',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalAccountRequest({
      method: 'POST',
      path: '/api/profile/email/change/confirm',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalAccountRequest({
      method: 'POST',
      path: '/api/profile/delete',
    }, enabled),
    false,
  );
  assert.equal(
    isRelationalMaintenanceRequest({
      method: 'GET',
      path: '/api/cron/maintenance',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalMessageWrite({
      method: 'DELETE',
      path: '/api/conversations/c-1/messages/m-1',
    }, enabled),
    true,
  );
  assert.equal(
    isRelationalMessageWrite({
      method: 'POST',
      path: '/api/conversations/c-1/archive',
    }, enabled),
    true,
  );
});

test('persistence state laisse passer le stockage local immediatement', () => {
  let nextCalled = false;
  const { events, middleware } = createMiddleware({
    usesDatabase: () => false,
  });

  middleware({ method: 'GET', path: '/api/trips' }, createResponse(events), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(events, []);
});

test('persistence state contourne le document global pour les lectures relationnelles', () => {
  let nextCalls = 0;
  const { events, middleware } = createMiddleware({
    relationalTripReadsEnabled: () => true,
    relationalMessageReadsEnabled: () => true,
  });

  middleware({ method: 'GET', path: '/api/trips/mine' }, createResponse(events), () => {
    nextCalls += 1;
  });
  middleware(
    { method: 'GET', path: '/api/conversations/c-1/messages' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 2);
  assert.deepEqual(events, []);
});

test('persistence state contourne le document global pour les ecritures de messages relationnelles', () => {
  let nextCalls = 0;
  const { events, middleware } = createMiddleware({
    relationalMessageWritesEnabled: () => true,
  });

  middleware(
    { method: 'POST', path: '/api/conversations/c-1/messages' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );
  middleware(
    { method: 'DELETE', path: '/api/conversations/c-1/messages/m-1' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 2);
  assert.deepEqual(events, []);
});

test('persistence state contourne le verrou global pour les operations relationnelles', () => {
  let nextCalls = 0;
  const { events, middleware } = createMiddleware({
    relationalOperationWritesEnabled: () => true,
  });

  middleware(
    { method: 'POST', path: '/api/operations/tx-1/confirm-delivery' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 1);
  assert.deepEqual(events, []);
});

test('persistence state contourne le document global pour les lectures d operations relationnelles', () => {
  let nextCalls = 0;
  const { events, middleware } = createMiddleware({
    relationalOperationReadsEnabled: () => true,
  });

  middleware(
    { method: 'GET', path: '/api/operations' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );
  middleware(
    { method: 'GET', path: '/api/operations/tx-1' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 2);
  assert.deepEqual(events, []);
});

test('persistence state contourne le document global pour les favoris relationnels', () => {
  let nextCalls = 0;
  const { events, middleware } = createMiddleware({
    relationalTripReadsEnabled: () => true,
    relationalTripWritesEnabled: () => true,
  });

  middleware(
    { method: 'GET', path: '/api/saved-trips' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );
  middleware(
    { method: 'POST', path: '/api/saved-trips/t-1' },
    createResponse(events),
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(nextCalls, 2);
  assert.deepEqual(events, []);
});

test('persistence state rafraichit une lecture avant de poursuivre', async () => {
  const { events, middleware } = createMiddleware();
  await new Promise((resolve) => {
    middleware({ method: 'GET', path: '/api/profile' }, createResponse(events), () => {
      events.push('next');
      resolve();
    });
  });

  assert.deepEqual(events, ['refresh', 'next']);
});

test('persistence state renvoie 503 si le rafraichissement echoue', async () => {
  const { events, middleware } = createMiddleware({
    refreshDatabaseState: async () => {
      throw new Error('offline');
    },
  });
  const res = createResponse(events);

  middleware({ method: 'GET', path: '/api/profile' }, res, () => {
    assert.fail('next ne doit pas etre appele');
  });
  await res.completion;

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Base de donnees temporairement indisponible.',
  });
  assert.deepEqual(events, ['error:Echec de lecture Supabase', 'json']);
});

test('persistence state valide une ecriture avant de livrer la reponse', async () => {
  const { events, middleware } = createMiddleware({
    relationalTripReadsEnabled: () => true,
  });
  const res = createResponse(events);

  middleware({ method: 'POST', path: '/api/trips' }, res, () => {
    events.push('next');
    res.json({ ok: true });
  });
  await res.completion;

  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(events, [
    'acquire:true',
    'snapshot',
    'next',
    'sync',
    'release:true',
    'json',
  ]);
});

test('persistence state remplace la reponse si la sauvegarde echoue', async () => {
  const { events, middleware } = createMiddleware({
    releaseDatabaseState: async () => {
      throw new Error('write failed');
    },
  });
  const res = createResponse(events);

  middleware({ method: 'PATCH', path: '/api/profile' }, res, () => {
    res.json({ ok: true });
  });
  await res.completion;

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(res.body), {
    error: 'Sauvegarde temporairement indisponible. Reessayez.',
  });
  assert.deepEqual(events, [
    'acquire:true',
    'error:Echec de persistance Supabase',
    'end',
  ]);
});

test('persistence state serialise deux ecritures concurrentes', async () => {
  let acquireCalls = 0;
  let firstNext;
  let secondNext;
  const firstStarted = new Promise((resolve) => {
    firstNext = resolve;
  });
  const secondStarted = new Promise((resolve) => {
    secondNext = resolve;
  });
  const { events, middleware } = createMiddleware({
    acquireDatabaseState: async () => {
      acquireCalls += 1;
      events.push(`acquire:${acquireCalls}`);
      return { client: `client-${acquireCalls}` };
    },
  });
  const firstResponse = createResponse(events);
  const secondResponse = createResponse(events);

  middleware({ method: 'POST', path: '/api/trips' }, firstResponse, firstNext);
  middleware({ method: 'POST', path: '/api/trips' }, secondResponse, secondNext);

  await firstStarted;
  assert.equal(acquireCalls, 1);

  firstResponse.json({ request: 1 });
  await firstResponse.completion;
  await secondStarted;
  assert.equal(acquireCalls, 2);

  secondResponse.json({ request: 2 });
  await secondResponse.completion;
  assert.deepEqual(firstResponse.body, { request: 1 });
  assert.deepEqual(secondResponse.body, { request: 2 });
});
