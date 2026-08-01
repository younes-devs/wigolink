import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalKycRepository,
  relationalKycEnabled,
} from '../relational-kyc.js';

function directPool(handler) {
  return {
    query(sql, params) {
      return handler(sql, params);
    },
  };
}

function transactionalPool(calls) {
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/returning data/.test(sql)) {
        return { rowCount: 1, rows: [{ data: JSON.parse(params[1]) }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    },
  };
  return {
    async query(sql, params) {
      return client.query(sql, params);
    },
    connect: async () => client,
  };
}

test('KYC relationnel reste desactive par defaut', () => {
  assert.equal(relationalKycEnabled({}), false);
  assert.equal(relationalKycEnabled({ RELATIONAL_KYC: 'true' }), true);
});

test('KYC relationnel liste et compte uniquement le membre demande', async () => {
  const calls = [];
  const repository = createRelationalKycRepository({
    getPool: () => directPool((sql, params) => {
      calls.push({ sql, params });
      if (/count\(\*\)/.test(sql)) return { rows: [{ count: 2 }] };
      return {
        rows: [{
          id: 'kyc-1',
          data: { userId: 'u-1', status: 'pending', submittedAt: 10 },
        }],
      };
    }),
  });

  const submissions = await repository.listForUser('u-1');
  const rejected = await repository.rejectedCountForUser('u-1', { before: 20 });

  assert.equal(submissions[0].id, 'kyc-1');
  assert.equal(rejected, 2);
  assert.deepEqual(calls[0].params, ['u-1']);
  assert.deepEqual(calls[1].params, ['u-1', 20]);
});

test('KYC relationnel agrege la file sans charger les dossiers complets', async () => {
  const calls = [];
  const repository = createRelationalKycRepository({
    getPool: () => directPool((sql, params) => {
      calls.push({ sql, params });
      return {
        rows: [{ pending: 320, overdue: 18, avg_review_ms: '7200000' }],
      };
    }),
  });

  const stats = await repository.stats({ now: 20_000, slaMs: 5_000 });

  assert.deepEqual(stats, {
    pending: 320,
    overdue: 18,
    avgReviewMs: 7_200_000,
  });
  assert.deepEqual(calls[0].params, [15_000]);
  assert.match(calls[0].sql, /count\(\*\) filter/);
  assert.doesNotMatch(calls[0].sql, /select id, data/);
});

test('KYC relationnel retire les photos de la file et borne l historique', async () => {
  const calls = [];
  const repository = createRelationalKycRepository({
    getPool: () => directPool((sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    }),
  });

  await repository.list({ filter: 'pending' });
  await repository.historyForUser('u-1');

  assert.match(calls[0].sql, /- 'selfiePhoto'/);
  assert.match(calls[0].sql, /- 'idFrontPhoto'/);
  assert.match(calls[1].sql, /limit 100/);
});

test('soumission KYC et statut membre sont atomiques', async () => {
  const calls = [];
  const repository = createRelationalKycRepository({
    getPool: () => transactionalPool(calls),
  });

  const submission = await repository.submitForUser(
    { userId: 'u-1', legalName: 'Alice' },
    { id: 'u-1', kycStatus: 'pending' },
  );

  assert.match(submission.id, /^kyc-/);
  assert.equal(submission.status, 'pending');
  assert.match(calls[0].sql, /^begin$/);
  assert.match(calls[1].sql, /wigolink_kyc_submissions/);
  assert.match(calls[2].sql, /update public\.wigolink_users/);
  assert.match(calls[3].sql, /^commit$/);
  assert.equal(calls.at(-1).sql, 'release');
});

test('decision KYC, historique et statut membre sont atomiques', async () => {
  const calls = [];
  const repository = createRelationalKycRepository({
    getPool: () => transactionalPool(calls),
  });
  const submission = {
    id: 'kyc-1',
    userId: 'u-1',
    status: 'approved',
  };

  await repository.commitDecision({
    submission,
    user: { id: 'u-1', kycStatus: 'verified' },
    decision: {
      submissionId: 'kyc-1',
      userId: 'u-1',
      adminId: 'u-admin',
      decision: 'approve',
      reason: null,
    },
  });

  assert.match(calls[1].sql, /update public\.wigolink_kyc_submissions/);
  assert.match(calls[2].sql, /update public\.wigolink_users/);
  assert.match(calls[3].sql, /insert into public\.wigolink_kyc_decisions/);
  assert.match(calls[4].sql, /^commit$/);
});
