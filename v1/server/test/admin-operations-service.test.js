import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminOperationsService } from '../services/admin-operations.js';

function createHarness() {
  const currentTime = Date.UTC(2026, 6, 28);
  const users = [
    { id: 'u-1', name: 'Sender', email: 'sender@example.test' },
    { id: 'u-2', name: 'Traveler', email: 'traveler@example.test' },
  ];
  const db = {
    users,
    listings: [{ id: 'l-1', title: 'Document', createdAt: currentTime - 4 * 864e5 }],
    conversations: [{ id: 'c-1' }],
    transactions: [
      {
        id: 'tx-1',
        listingId: 'l-1',
        travelerId: 'u-2',
        status: 'released',
        createdAt: currentTime - 3 * 864e5,
        escrow: { state: 'held', amount: 7, releasedAt: currentTime - 864e5 },
      },
    ],
    disputes: [{ id: 'd-1', status: 'open', reason: 'Test', createdAt: currentTime - 2 * 864e5 }],
  };
  const reviewItems = [
    { id: 'r-1', type: 'dispute', refId: 'd-1', createdAt: currentTime - 100 },
    { id: 'r-2', type: 'conversation', refId: 'c-1', createdAt: currentTime - 50 },
  ];
  const repositories = {
    reviewQueue: { open: () => [...reviewItems] },
    kyc: {
      pending: () => [{
        id: 'kyc-1',
        userId: 'u-1',
        legalName: 'Sender Legal',
        submittedAt: currentTime - 25 * 3600e3,
      }],
    },
    messages: {
      flagged: async () => [{ id: 'm-1' }],
      count: async () => 10,
    },
    customWhitelist: { all: () => [{ id: 'documents' }] },
  };
  const service = createAdminOperationsService({
    db,
    repositories,
    adminFraud: {
      summary: async () => ({
        linkedAccounts: 1,
        repeatPairs: 0,
        flaggedMessaging: 0,
        abnormalCancel: 0,
        disputeProne: 0,
        kycRepeatRejections: 0,
      }),
    },
    findUser: (id) => users.find((user) => user.id === id),
    adminConversationModerationView: () => ({ reports: [{ reason: 'Signalement' }] }),
    disputeView: (dispute) => ({ ...dispute, projected: true }),
    localeForLang: () => 'fr-FR',
    kycSlaMs: 24 * 3600e3,
    now: () => currentTime,
  });
  return { service };
}

test('admin operations summary calcule priorites et montants simules sans ancien matching', async () => {
  const { service } = createHarness();
  const summary = await service.summary();

  assert.equal(summary.health.status, 'critical');
  assert.equal(summary.health.kycOverdue, 1);
  assert.equal(summary.health.escrowHeld, 7);
  assert.equal(summary.latest.reviewQueue[0].label, 'Signalement');
  assert.equal(summary.tasks.some((task) => task.id === 'offer-watch'), false);
});

test('admin operations overview conserve dossiers, statistiques et listes historiques', async () => {
  const { service } = createHarness();
  const overview = await service.overview();

  assert.equal(overview.reviewQueue.length, 2);
  assert.equal(overview.reviewQueue[0].dispute.projected, true);
  assert.equal(overview.reviewQueue[1].conversation.reports[0].reason, 'Signalement');
  assert.deepEqual(overview.customWhitelist, [{ id: 'documents' }]);
  assert.equal(overview.stats.flaggedMessages, 1);
});

test('admin operations kpis garde les calculs bornes et la langue demandee', async () => {
  const { service } = createHarness();
  const result = await service.kpis('fr');

  assert.equal(result.totals.transactions, 1);
  assert.equal(result.totals.released, 1);
  assert.equal(result.kpis.transactionsPerMonth.monthly.length, 6);
  assert.equal(result.kpis.desintermediationRate.value, 0.1);
  assert.equal(result.kpis.avgMatchHours.value, 24);
});

test('admin operations kpis prefere le calcul relationnel', async () => {
  const expected = { totals: { users: 50 }, kpis: {} };
  const relationalService = createAdminOperationsService({
    db: {},
    repositories: {},
    adminFraud: {},
    findUser: () => null,
    adminConversationModerationView: () => null,
    disputeView: (value) => value,
    localeForLang: () => 'fr-FR',
    kycSlaMs: 24 * 3600e3,
    loadRelationalKpis: async (lang) => {
      assert.equal(lang, 'fr');
      return expected;
    },
  });

  assert.deepEqual(await relationalService.kpis('fr'), expected);
});
