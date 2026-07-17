import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStateToRelational, relationalMigrationPlan } from '../migrate-relational-state.js';

test('migration relationnelle : le plan couvre les collections metier et les donnees temporaires', () => {
  const plan = relationalMigrationPlan({
    users: [{ id: 'u-1' }], trips: [{ id: 't-1' }], messages: [{ id: 'm-1' }],
    pendingVerifications: { 'u-1': { expiresAt: Date.now() } },
  });
  assert.equal(plan.arrays.find((item) => item.collection === 'users').count, 1);
  assert.equal(plan.arrays.find((item) => item.collection === 'trips').count, 1);
  assert.equal(plan.maps.find((item) => item.collection === 'pendingVerifications').count, 1);
  assert.equal(plan.messages, 1);
});

test('migration relationnelle : ecrit les entites et messages en upsert', async () => {
  const queries = [];
  const pool = { query(sql, params) { queries.push({ sql, params }); return Promise.resolve({}); } };
  const state = {
    users: [{ id: 'u-1', email: 'u@example.com', createdAt: 1000 }],
    trips: [{ id: 't-1', travelerId: 'u-1', date: '2026-08-01' }],
    pendingVerifications: { 'u-1': { code: '123456', expiresAt: 2000 } },
    messages: [{ id: 'm-1', conversationId: 'c-1', from: 'u-1', text: 'Bonjour', at: 3000 }],
    notifications: [{ id: 'n-1', userId: 'u-1', type: 'messages', at: 4000 }],
  };
  const result = await migrateStateToRelational({ state, pool, dryRun: false });
  assert.equal(result.inserted.users, 1);
  assert.equal(result.inserted.runtime, 1);
  assert.equal(result.inserted.messages, 1);
  assert.equal(result.inserted.notifications, 1);
  assert.ok(queries.some(({ sql }) => sql.includes('wigofly_users')));
  assert.ok(queries.some(({ sql }) => sql.includes('wigofly_runtime_records')));
  assert.ok(queries.some(({ sql }) => sql.includes('public.messages')));
});
