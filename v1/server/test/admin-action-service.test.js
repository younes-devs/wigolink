import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminActionService } from '../services/admin-actions.js';

const NOW = 1_000_000;

function createHarness({
  users = [],
  safetyAppeals = [],
  submissions = [],
  decisions = [],
  rejectedCount = 0,
  sessionUserId = null,
  whitelist = [],
  trips = [],
  transactions = [],
  adminMemberMutations = null,
  safetyAppealRepository = null,
} = {}) {
  const audits = [];
  const notifications = [];
  const queue = [];
  let saves = 0;
  const db = { users, safetyAppeals, trips, transactions, savedTrips: [] };
  const service = createAdminActionService({
    db,
    findUser: (id) => users.find((user) => user.id === id),
    activeSession: async (token) =>
      token && sessionUserId ? { userId: sessionUserId } : null,
    userView: (user) => user && ({
      id: user.id,
      isAdmin: !!user.isAdmin,
      suspendedUntil: user.suspendedUntil || null,
    }),
    reviewQueue: {
      append(item) {
        queue.push({ id: `q-${queue.length + 1}`, ...item });
      },
      open() {
        return queue.filter((item) => !item.closed);
      },
      close(item, decision) {
        item.closed = decision;
      },
    },
    customWhitelist: {
      remove(id) {
        const index = whitelist.findIndex((item) => item.id === id);
        return index >= 0 ? whitelist.splice(index, 1)[0] : null;
      },
    },
    kycRepository: {
      findSubmission: (id) => submissions.find(
        (submission) => submission.id === id,
      ),
      rejectedCountForUser: () => rejectedCount,
      appendDecision(decision) {
        decisions.push(decision);
      },
    },
    maxKycAttempts: 3,
    async notify(...args) {
      notifications.push(args);
    },
    async audit(...args) {
      audits.push(args);
    },
    save() {
      saves += 1;
    },
    newId: (prefix) => `${prefix}-1`,
    adminMemberMutations,
    safetyAppealRepository,
    now: () => NOW,
  });
  return {
    service,
    audits,
    notifications,
    queue,
    decisions,
    saves: () => saves,
  };
}

test('accès dossier admin est audité avant sauvegarde', async () => {
  const users = [{ id: 'admin' }, { id: 'member' }];
  const { service, audits, saves } = createHarness({ users });

  const result = await service.recordCaseAccess(
    users[0],
    'member',
    { section: 'messages'.repeat(10) },
  );

  assert.equal(result.status, 200);
  assert.equal(audits[0][1], 'admin.member_case.view');
  assert.equal(audits[0][4].section.length, 40);
  assert.equal(saves(), 1);
  assert.equal(
    (await service.recordCaseAccess(users[0], 'missing')).status,
    404,
  );
});

test('recours peut etre delegue au stockage relationnel', async () => {
  const calls = [];
  const appeal = {
    id: 'appeal-rel',
    userId: 'member',
    status: 'open',
  };
  const safetyAppealRepository = {
    async submit(input) {
      calls.push(['submit', input]);
      return { kind: 'ok', appeal };
    },
    async review(input) {
      calls.push(['review', input]);
      return {
        kind: 'ok',
        appeal: { ...appeal, status: 'accepted' },
      };
    },
  };
  const member = { id: 'member' };
  const harness = createHarness({
    users: [member],
    sessionUserId: member.id,
    safetyAppealRepository,
  });
  const submitted = await harness.service.submitAppeal('session', {
    reason: 'Une explication suffisamment longue',
  });
  const reviewed = await harness.service.reviewAppeal(
    { id: 'admin' },
    appeal.id,
    { decision: 'approve', reason: 'Recours accepte' },
  );

  assert.equal(submitted.status, 200);
  assert.equal(reviewed.body.appeal.status, 'accepted');
  assert.deepEqual(calls.map(([type]) => type), ['submit', 'review']);
  assert.equal(harness.saves(), 0);
  assert.equal(harness.audits.length, 0);
});

test('actions membres peuvent etre deleguees au stockage relationnel', async () => {
  const member = { id: 'member', isAdmin: true };
  const calls = [];
  const adminMemberMutations = {
    async recordCaseAccess(input) {
      calls.push(['access', input]);
      return true;
    },
    async changeRole(input) {
      calls.push(['role', input]);
      return { kind: 'ok', user: member };
    },
    async moderateUser(input) {
      calls.push(['safety', input]);
      return {
        kind: 'ok',
        user: { id: 'member', suspendedUntil: NOW + 3600e3 },
      };
    },
  };
  const harness = createHarness({ adminMemberMutations });
  const actor = { id: 'admin', isAdmin: true };

  assert.equal(
    (await harness.service.recordCaseAccess(actor, 'member')).status,
    200,
  );
  assert.equal(
    (await harness.service.changeRole(actor, 'member', {
      role: 'admin',
    })).status,
    200,
  );
  assert.equal(
    (await harness.service.moderateUser(actor, 'member', {
      action: 'suspend',
      reason: 'Comportement dangereux',
      durationHours: 1,
    })).status,
    200,
  );
  assert.deepEqual(calls.map(([type]) => type), [
    'access',
    'role',
    'safety',
  ]);
  assert.equal(harness.saves(), 0);
  assert.equal(harness.audits.length, 0);
});

test('un admin retire seulement un trajet actif sans operation', async () => {
  const admin = { id: 'admin' };
  const member = { id: 'member' };
  const removable = {
    id: 'trip-open', travelerId: member.id, status: 'published',
    departureDate: '2099-08-20', from: 'Oujda', to: 'Paris',
  };
  const completed = {
    id: 'trip-done', travelerId: member.id, status: 'cancelled',
    departureDate: '2099-08-20', from: 'Rabat', to: 'Bruxelles',
  };
  const busy = {
    id: 'trip-busy', travelerId: member.id, status: 'published',
    departureDate: '2099-08-20', from: 'Fes', to: 'Lille',
  };
  const harness = createHarness({
    users: [admin, member],
    trips: [removable, completed, busy],
    transactions: [{ id: 'operation-1', tripId: busy.id, status: 'paid' }],
  });

  const removed = await harness.service.removeMemberTrip(admin, member.id, removable.id, {
    reason: 'Ce trajet enfreint les regles de publication.',
  });

  assert.equal(removed.status, 200);
  assert.equal(removable.status, 'removed');
  assert.equal(harness.audits[0][1], 'trip.admin_remove');
  assert.equal(harness.notifications[0][0][0], member.id);
  assert.equal(harness.notifications[0][1].key, 'trip.removedByAdmin');
  assert.equal((await harness.service.removeMemberTrip(admin, member.id, completed.id, {
    reason: 'Ce trajet enfreint les regles de publication.',
  })).status, 409);
  assert.equal((await harness.service.removeMemberTrip(admin, member.id, busy.id, {
    reason: 'Ce trajet enfreint les regles de publication.',
  })).status, 409);
});

test('rôles protègent auto-destitution et dernier admin', async () => {
  const admin = { id: 'admin', isAdmin: true };
  const member = { id: 'member', isAdmin: false };
  const harness = createHarness({ users: [admin, member] });

  assert.equal(
    (await harness.service.changeRole(admin, 'admin', {
      role: 'member',
    })).status,
    400,
  );
  assert.equal(
    (await harness.service.changeRole(admin, 'member', {
      role: 'member',
    })).body.unchanged,
    true,
  );
  const promoted = await harness.service.changeRole(
    admin,
    'member',
    { role: 'admin' },
  );

  assert.equal(promoted.status, 200);
  assert.equal(member.isAdmin, true);
  assert.equal(member.roleChangedAt, NOW);
  assert.equal(harness.audits.at(-1)[1], 'role.admin.grant');
  assert.equal(harness.saves(), 1);
});

test('modération refuse admin puis suspend et restaure un membre', async () => {
  const admin = { id: 'admin', isAdmin: true };
  const member = { id: 'member', isAdmin: false };
  const harness = createHarness({ users: [admin, member] });

  assert.equal(
    (await harness.service.moderateUser(admin, 'admin', {
      action: 'suspend',
      reason: 'raison',
    })).status,
    400,
  );
  const suspended = await harness.service.moderateUser(
    admin,
    'member',
    {
      action: 'suspend',
      reason: 'Comportement dangereux',
      durationHours: 2,
    },
  );

  assert.equal(suspended.status, 200);
  assert.equal(member.suspendedUntil, NOW + 2 * 3600e3);
  assert.equal(member.suspendedBy, 'admin');

  await harness.service.moderateUser(admin, 'member', {
    action: 'restore',
  });
  assert.equal(member.suspendedUntil, null);
  assert.equal(member.restoredBy, 'admin');
  assert.equal(harness.saves(), 2);
});

test('recours suspendu est créé une fois puis peut être accepté', async () => {
  const admin = { id: 'admin', isAdmin: true };
  const member = {
    id: 'member',
    suspendedUntil: NOW + 1000,
    suspensionReason: 'raison',
    messageSafetyBlockedUntil: NOW + 1000,
  };
  const harness = createHarness({
    users: [admin, member],
    sessionUserId: 'member',
  });

  assert.equal(
    (await harness.service.submitAppeal(undefined, {
      reason: 'Une explication suffisamment longue',
    })).status,
    401,
  );
  const submitted = await harness.service.submitAppeal(
    'session',
    { reason: 'Une explication suffisamment longue' },
  );

  assert.equal(submitted.status, 200);
  assert.equal(harness.queue[0].type, 'safety_appeal');
  assert.equal(
    (await harness.service.submitAppeal('session', {
      reason: 'Une autre explication suffisamment longue',
    })).status,
    409,
  );

  const reviewed = await harness.service.reviewAppeal(
    admin,
    submitted.body.appeal.id,
    { decision: 'approve', reason: 'Recours accepté' },
  );
  assert.equal(reviewed.status, 200);
  assert.equal(submitted.body.appeal.status, 'accepted');
  assert.equal(member.suspendedUntil, null);
  assert.equal(member.messageSafetyBlockedUntil, null);
  assert.equal(harness.queue[0].closed, 'approve');
});

test('retrait whitelist est audité et absent retourne 404', async () => {
  const admin = { id: 'admin' };
  const whitelist = [{ id: 'rare', label: 'Objet rare' }];
  const harness = createHarness({ users: [admin], whitelist });

  assert.equal(
    (await harness.service.removeWhitelist(admin, 'missing')).status,
    404,
  );
  const removed = await harness.service.removeWhitelist(admin, 'rare');

  assert.equal(removed.status, 200);
  assert.equal(whitelist.length, 0);
  assert.equal(harness.audits[0][1], 'custom_whitelist.remove');
  assert.equal(harness.saves(), 1);
});

test('retrait whitelist peut etre delegue au stockage relationnel', async () => {
  const calls = [];
  const harness = createHarness({
    adminMemberMutations: {
      async removeWhitelist(input) {
        calls.push(input);
        return input.categoryId === 'documents'
          ? { id: 'documents' }
          : null;
      },
    },
  });

  assert.equal(
    (await harness.service.removeWhitelist(
      { id: 'admin' },
      'documents',
    )).status,
    200,
  );
  assert.deepEqual(calls, [{
    actorId: 'admin',
    categoryId: 'documents',
  }]);
  assert.equal(harness.saves(), 0);
  assert.equal(harness.audits.length, 0);
});

test('décision KYC approuve ou refuse définitivement à la limite', async () => {
  const admin = { id: 'admin' };
  const approvedUser = { id: 'approved-user', kycStatus: 'pending' };
  const refusedUser = { id: 'refused-user', kycStatus: 'pending' };
  const approved = {
    id: 'approved',
    userId: approvedUser.id,
    status: 'pending',
  };
  const rejected = {
    id: 'rejected',
    userId: refusedUser.id,
    status: 'pending',
  };
  const approvedHarness = createHarness({
    users: [admin, approvedUser],
    submissions: [approved],
  });
  const rejectedHarness = createHarness({
    users: [admin, refusedUser],
    submissions: [rejected],
    rejectedCount: 3,
  });

  const approval = await approvedHarness.service.decideKyc(
    admin,
    'approved',
    { decision: 'approve' },
  );
  const rejection = await rejectedHarness.service.decideKyc(
    admin,
    'rejected',
    {
      decision: 'reject',
      reason: 'Photo illisible',
    },
  );

  assert.equal(approval.body.status, 'verified');
  assert.equal(approved.status, 'approved');
  assert.equal(approvedHarness.notifications[0][1].key, 'kyc.verified');
  assert.equal(rejection.body.status, 'refused');
  assert.equal(rejected.status, 'rejected');
  assert.equal(
    rejectedHarness.notifications[0][1].key,
    'kyc.refusedFinal',
  );
  assert.equal(rejectedHarness.decisions[0].decision, 'reject');
  assert.equal(rejectedHarness.audits[0][1], 'kyc.reject');
});
