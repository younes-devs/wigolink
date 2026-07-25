import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidanceCenterService } from '../services/guidance-centers.js';

const EVIDENCE_WINDOW = 72 * 3600e3;

function createHarness({
  transactions = [],
  listings = [],
  disputes = [],
  kyc = [],
  reviewItems = [],
} = {}) {
  const allowed = [{
    id: 'argan',
    label: 'Argan',
  }];
  const forbidden = [{
    id: 'weapon',
    label: 'Arme',
  }];
  const db = {
    transactions,
    listings,
    disputes,
  };
  const service = createGuidanceCenterService({
    db,
    isParty: (transaction, userId) => [
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].includes(userId),
    kycRepository: {
      listForUser: (userId) => kyc.filter(
        (submission) => submission.userId === userId,
      ),
    },
    evidenceWindowMs: EVIDENCE_WINDOW,
    localizeCustoms: (_customs, lang) => ({
      'MA-EU': {
        label: `${lang}:MA-EU`,
        franchise: `${lang}:430`,
        rules: ['rule'],
      },
      'EU-MA': {
        label: `${lang}:EU-MA`,
        franchise: `${lang}:185`,
        rules: ['rule'],
      },
    }),
    customs: {},
    combinedWhitelist: () => allowed,
    blacklist: forbidden,
    localizeCategory: (category, lang) => ({
      ...category,
      label: `${lang}:${category.label}`,
    }),
    reviewQueue: {
      open: () => reviewItems,
    },
    disputeView: (dispute) => ({
      ...dispute,
      evidenceDeadline: dispute.createdAt + EVIDENCE_WINDOW,
    }),
  });
  return { service };
}

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    listingId: 'listing-1',
    senderId: 'u-1',
    travelerId: 'u-2',
    recipientId: 'u-1',
    status: 'accepted',
    createdAt: 100,
    escrow: { state: 'held', amount: 10 },
    ...overrides,
  };
}

test('documents reste scopé et assemble preuves, scellage et KYC', () => {
  const transactions = [
    transaction({
      sealingVideo: {
        recordedAt: 200,
        simulated: true,
        dataUrl: 'video',
        geo: 'Paris',
      },
    }),
    transaction({
      id: 'tx-other',
      senderId: 'u-3',
      travelerId: 'u-4',
      recipientId: 'u-3',
    }),
  ];
  const listings = [{
    id: 'listing-1',
    title: 'Colis',
    from: 'Paris',
    to: 'Bruxelles',
    valueEur: 50,
    categoryId: 'argan',
  }];
  const disputes = [{
    id: 'd-1',
    txId: 'tx-1',
    status: 'open',
    createdAt: 300,
    evidence: [{ by: 'u-1' }, { by: 'u-2' }],
  }];
  const kyc = [{
    id: 'kyc-1',
    userId: 'u-1',
    status: 'verified',
    submittedAt: 10,
    documentType: 'passport',
  }];
  const { service } = createHarness({
    transactions,
    listings,
    disputes,
    kyc,
  });

  const result = service.documents({ id: 'u-1' });
  const dossier = result.dossiers[0];

  assert.equal(result.dossiers.length, 1);
  assert.equal(dossier.role, 'sender');
  assert.equal(
    dossier.docs.find((document) => document.id === 'sealing').status,
    'ready',
  );
  assert.equal(
    dossier.docs.find((document) => document.id === 'escrow').status,
    'held',
  );
  const dispute = dossier.docs.find(
    (document) => document.id === 'dispute',
  );
  assert.equal(dispute.meta.myEvidenceCount, 1);
  assert.equal(dispute.meta.evidenceDeadline, 300 + EVIDENCE_WINDOW);
  assert.equal(result.kyc[0].retainedByProvider, true);
});

test('conformité localise et priorise revue puis dépassement', () => {
  const listings = [{
    id: 'gray',
    senderId: 'u-1',
    title: 'Objet rare',
    categoryId: 'other',
    categoryLabel: 'Autre',
    from: 'Casablanca',
    valueEur: 20,
    status: 'pending_review',
    whitelistVerdict: 'gray',
    createdAt: 200,
  }, {
    id: 'over',
    senderId: 'u-1',
    title: 'Argan',
    categoryId: 'argan',
    from: 'Casablanca',
    valueEur: 500,
    status: 'published',
    createdAt: 100,
  }, {
    id: 'other-user',
    senderId: 'u-2',
    title: 'Invisible',
    categoryId: 'argan',
    from: 'Casablanca',
    valueEur: 500,
    status: 'published',
    createdAt: 300,
  }];
  const { service } = createHarness({
    listings,
    reviewItems: [{ id: 'queue-1', refId: 'gray' }],
  });

  const result = service.compliance({ id: 'u-1' }, 'nl');

  assert.equal(result.totals.listings, 2);
  assert.equal(result.totals.reviewPending, 1);
  assert.equal(result.totals.overFranchise, 1);
  assert.equal(result.catalogue.allowed[0].label, 'nl:Argan');
  assert.equal(result.corridors[0].franchise, 'nl:430');
  assert.deepEqual(
    result.actions.map((action) => action.action.id),
    ['wait_review', 'customs_value'],
  );
  assert.equal(result.items[0].queueId, 'queue-1');
});

test('assistance choisit actions par rôle et état du litige', () => {
  const transactions = [
    transaction({
      id: 'accepted',
      listingId: 'accepted-listing',
      createdAt: 400,
    }),
    transaction({
      id: 'disputed',
      listingId: 'disputed-listing',
      status: 'disputed',
      createdAt: 300,
    }),
    transaction({
      id: 'transit',
      listingId: 'transit-listing',
      status: 'in_transit',
      createdAt: 200,
    }),
  ];
  const listings = transactions.map((item) => ({
    id: item.listingId,
    title: item.id,
  }));
  const disputes = [{
    id: 'd-1',
    txId: 'disputed',
    status: 'open',
    createdAt: 100,
    evidence: [],
  }];
  const { service } = createHarness({
    transactions,
    listings,
    disputes,
  });

  const result = service.support({ id: 'u-1' });

  assert.equal(
    result.cases.find((item) => item.txId === 'accepted').action.id,
    'seal_first',
  );
  assert.equal(
    result.cases.find((item) => item.txId === 'disputed').action.id,
    'add_evidence',
  );
  assert.equal(
    result.cases.find((item) => item.txId === 'transit').action.id,
    'open_dispute',
  );
  assert.deepEqual(
    result.urgent.slice(0, 2).map((item) => item.action.id),
    ['seal_first', 'add_evidence'],
  );
  assert.equal(result.totals.openDisputes, 1);
  assert.equal(result.guide.at(-1).id, 'evidence_72h');
});
