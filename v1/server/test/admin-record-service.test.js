import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminRecordService } from '../services/admin-records.js';

const NOW = 2_000_000;

function createHarness({
  users = [],
  conversations = [],
  messages = [],
  transactions = [],
  kyc = [],
  decisions = [],
  auditLogs = [],
  safetyAppeals = [],
} = {}) {
  const db = {
    users,
    conversations,
    messages,
    transactions,
    trips: [],
    listings: [],
    disputes: [],
    notifications: [],
    safetyAppeals,
  };
  const service = createAdminRecordService({
    db,
    findUser: (id) => users.find((user) => user.id === id),
    kycRepository: {
      listForUser: (id) => kyc.filter((item) => item.userId === id),
      list: ({ filter, q }) => kyc.filter((item) => {
        const user = users.find((candidate) => candidate.id === item.userId);
        return (filter === 'all' || item.status === filter)
          && (!q || `${item.legalName} ${user?.email}`.toLowerCase().includes(q));
      }),
      pending: () => kyc.filter((item) => item.status === 'pending'),
      reviewed: () => kyc.filter((item) => item.reviewedAt),
      rejectedCountForUser: (id, { before }) => kyc.filter(
        (item) => item.userId === id
          && item.status === 'rejected'
          && item.submittedAt < before,
      ).length,
      findSubmission: (id) => kyc.find((item) => item.id === id),
      historyForUser: (id) => decisions.filter((item) => item.userId === id),
    },
    auditLogsRepository: {
      list: async ({ limit }) => auditLogs.slice(0, Number(limit) || 100),
      listForMember: async (id) => auditLogs.filter(
        (item) => item.memberId === id,
      ),
    },
    messageSafetyWindowMs: 1_000,
    kycSlaMs: 5_000,
    now: () => NOW,
  });
  return { service };
}

test('admin users filtre, trie et ne projette aucun secret', () => {
  const users = [
    {
      id: 'member',
      name: 'Alice',
      email: 'alice@example.test',
      city: 'Paris',
      passwordHash: 'secret',
      sessionToken: 'token',
      createdAt: 20,
    },
    {
      id: 'admin-deleted',
      name: 'Admin',
      email: 'admin@example.test',
      city: 'Bruxelles',
      isAdmin: true,
      deletedAt: 30,
      createdAt: 10,
    },
  ];
  const { service } = createHarness({ users });

  const result = service.users();

  assert.deepEqual(result.users.map((user) => user.id), [
    'admin-deleted',
    'member',
  ]);
  assert.equal(result.adminCount, 0);
  assert.equal('passwordHash' in result.users[1], false);
  assert.equal('sessionToken' in result.users[1], false);
  assert.deepEqual(
    service.users({ q: 'paris' }).users.map((user) => user.id),
    ['member'],
  );
});

test('dossier membre conserve preuves, participants et compte supprimé', async () => {
  const users = [
    {
      id: 'u-1',
      name: 'Compte supprimé',
      email: 'deleted@example.test',
      deletedAt: 100,
      createdAt: 10,
    },
    {
      id: 'u-2',
      name: 'Destinataire',
      email: 'to@example.test',
      createdAt: 20,
    },
  ];
  const conversations = [{
    id: 'c-1',
    participantIds: ['u-1', 'u-2'],
    createdAt: 100,
  }];
  const messages = [{
    id: 'm-1',
    conversationId: 'c-1',
    from: 'u-1',
    text: 'preuve',
    at: 200,
    deletedAt: 300,
    attachments: [{
      id: 'a-1',
      name: 'preuve.jpg',
      type: 'image/jpeg',
      size: 42,
      data: 'not-projected',
    }],
    location: {
      kind: 'place',
      label: 'Gare',
      city: 'Paris',
      precision: 'exact',
      expiresAt: 999,
    },
  }];
  const kyc = [{
    id: 'kyc-1',
    userId: 'u-1',
    status: 'verified',
    submittedAt: 50,
    selfiePhoto: 'selfie',
    idFrontPhoto: 'front',
  }];
  const auditLogs = [{ id: 'log-1', memberId: 'u-1' }];
  const { service } = createHarness({
    users,
    conversations,
    messages,
    kyc,
    auditLogs,
  });

  const result = await service.caseFile('u-1', {
    offset: '-4',
    limit: '2',
  });
  const record = result.body.caseFile;

  assert.equal(result.status, 200);
  assert.equal(record.member.deletedAt, 100);
  assert.equal(record.messages[0].from.id, 'u-1');
  assert.deepEqual(record.messages[0].to.map((user) => user.id), ['u-2']);
  assert.equal(record.messages[0].deletedAt, 300);
  assert.equal(record.messages[0].attachments[0].data, undefined);
  assert.equal(record.messages[0].location.label, 'Gare');
  assert.equal(record.messagePage.offset, 0);
  assert.equal(record.messagePage.limit, 10);
  assert.equal(record.kyc[0].selfiePhoto, 'selfie');
  assert.deepEqual(record.auditLogs, auditLogs);
  assert.equal((await service.caseFile('missing')).status, 404);
});

test('file KYC calcule SLA et détail auditable', () => {
  const users = [{
    id: 'u-1',
    name: 'Alice',
    email: 'alice@example.test',
    phone: '+320000',
    city: 'Bruxelles',
    kycStatus: 'pending',
    createdAt: 1,
  }, {
    id: 'admin',
    name: 'Contrôle',
    email: 'admin@example.test',
  }];
  const kyc = [{
    id: 'kyc-old',
    userId: 'u-1',
    legalName: 'Alice',
    documentType: 'passport',
    status: 'rejected',
    submittedAt: NOW - 20_000,
    reviewedAt: NOW - 10_000,
  }, {
    id: 'kyc-new',
    userId: 'u-1',
    legalName: 'Alice',
    documentType: 'passport',
    status: 'pending',
    submittedAt: NOW - 10_000,
    selfiePhoto: 'photo',
  }];
  const decisions = [{
    id: 'decision-1',
    userId: 'u-1',
    adminId: 'admin',
  }];
  const { service } = createHarness({ users, kyc, decisions });

  const list = service.kycList({ status: 'pending', q: 'alice' });
  const detail = service.kycDetail('kyc-new');

  assert.equal(list.submissions[0].overdue, true);
  assert.equal(list.submissions[0].priorRejects, 1);
  assert.equal('selfiePhoto' in list.submissions[0], false);
  assert.equal(list.stats.pending, 1);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.submission.selfiePhoto, 'photo');
  assert.equal(detail.body.history[0].adminName, 'Contrôle');
  assert.equal(service.kycDetail('missing').status, 404);
});

test('sécurité exclut admins et enrichit les recours', () => {
  const users = [{
    id: 'admin',
    name: 'Admin',
    isAdmin: true,
    suspendedUntil: NOW + 10_000,
  }, {
    id: 'suspended',
    name: 'Suspendu',
    suspendedUntil: NOW + 10_000,
  }, {
    id: 'attempts',
    name: 'Tentatives',
    messageSafetyAttempts: [
      { at: NOW - 100 },
      { at: NOW - 200 },
      { at: NOW - 2_000 },
    ],
  }];
  const safetyAppeals = [{
    id: 'appeal-1',
    userId: 'suspended',
    createdAt: 50,
  }];
  const { service } = createHarness({ users, safetyAppeals });

  const result = service.safety();

  assert.deepEqual(result.riskyUsers.map((user) => user.id), [
    'suspended',
    'attempts',
  ]);
  assert.equal(result.riskyUsers[1].messageSafetyAttempts, 2);
  assert.equal(result.appeals[0].user.id, 'suspended');
});

test('audit admin transmet la limite au dépôt', async () => {
  const { service } = createHarness({
    auditLogs: [{ id: 'one' }, { id: 'two' }],
  });

  assert.deepEqual(
    await service.auditLogs({ limit: '1' }),
    { logs: [{ id: 'one' }] },
  );
});
