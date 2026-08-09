import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relationalAdminKpis,
  relationalAdminOperationState,
} from '../relational-admin-operations.js';

test('etat admin relationnel utilise agregats et files bornees', async () => {
  const calls = [];
  const responses = [
    {
      rows: [{
        users: 250,
        listings: 90,
        transactions: 1200,
        released: 700,
        disputed: 12,
        open_disputes: 4,
        flagged_messages: 8,
        escrow_held: 345.5,
      }],
    },
    { rows: [{ data: { id: 'd-1', status: 'open' } }] },
    {
      rows: [{
        item: { id: 'rq-1', type: 'dispute', refId: 'd-1' },
        dispute: { id: 'd-1', status: 'open' },
      }],
    },
    {
      rows: [{
        data: { id: 'kyc-1', userId: 'u-1', status: 'pending' },
        member: { id: 'u-1', name: 'Alice', email: 'alice@example.test' },
      }],
    },
    { rows: [{ data: { id: 'documents' } }] },
    {
      rows: [{
        count: 2,
        incidents: 1,
        charged_cents: 6450,
        gross_cents: 900,
        stripe_fee_cents: 125,
        net_cents: 775,
      }],
    },
    {
      rows: [{
        operation_id: 'tx-1',
        currency: 'EUR',
        traveler_price_cents: 5000,
        sender_fee_cents: 300,
        traveler_fee_cents: 300,
        charged_amount_cents: 5300,
        traveler_transfer_cents: 4700,
        platform_gross_cents: 600,
        stripe_fee_cents: 105,
        payment_status: 'paid',
        transfer_status: 'not_ready',
        stripe_payment_intent_id: 'pi_12345678901234567890',
        stripe_transfer_id: null,
        stripe_refund_id: null,
        fee_policy_version: '2026-08-tiered-v1',
        paid_at: new Date('2026-08-09T12:00:00Z'),
        transferred_at: null,
        refunded_at: null,
        updated_at: new Date('2026-08-09T12:00:00Z'),
        operation: { id: 'tx-1', title: 'Oujda -> Bruxelles' },
      }],
    },
    {
      rows: [{
        stripe_event_id: 'evt_12345678901234567890',
        event_type: 'checkout.session.completed',
        processing_status: 'processed',
        attempts: 1,
        last_error: null,
        processed_at: new Date('2026-08-09T12:00:01Z'),
        created_at: new Date('2026-08-09T12:00:00Z'),
      }],
    },
  ];
  const result = await relationalAdminOperationState({
    pool: {
      async query(sql) {
        calls.push(sql);
        return responses.shift();
      },
    },
  });

  assert.deepEqual(result.stats, {
    users: 250,
    listings: 90,
    transactions: 1200,
    released: 700,
    disputed: 12,
    openDisputes: 4,
    flaggedMessages: 8,
    escrowHeld: 345.5,
  });
  assert.equal(result.disputes[0].id, 'd-1');
  assert.equal(result.reviewQueue[0].id, 'rq-1');
  assert.equal(result.reviewQueue[0].dispute.id, 'd-1');
  assert.equal(result.pendingKyc[0].user.email, 'alice@example.test');
  assert.equal(result.customWhitelist[0].id, 'documents');
  assert.equal(result.payments.netCents, 775);
  assert.equal(result.payments.recent[0].refundable, true);
  assert.equal(result.payments.recent[0].paymentIntentRef, 'pi_12345...7890');
  assert.equal(result.payments.webhooks[0].eventRef, 'evt_1234...7890');
  assert.equal(result.payments.webhooks[0].status, 'processed');
  assert.match(calls[0], /count\(\*\)/);
  assert.match(calls[1], /wigolink_disputes/);
  assert.match(calls[2], /wigolink_review_queue/);
});

test('kpis admin relationnels agregent sans charger les collections', async () => {
  const calls = [];
  const now = Date.UTC(2026, 6, 29);
  const responses = [
    {
      rows: [{
        users: 100,
        transactions: 40,
        released: 20,
        disputes: 2,
        disputable: 25,
        resolved: 2,
        resolved_fast: 1,
        traveler_count: 10,
        recurring_travelers: 4,
        messages: 1000,
        flagged_messages: 20,
        first_transaction_at: now - 60 * 86_400_000,
        avg_match_hours: 12.5,
      }],
    },
    {
      rows: Array.from({ length: 6 }, (_, index) => ({
        bucket: 5 - index,
        count: index,
      })),
    },
  ];
  const result = await relationalAdminKpis({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return responses.shift();
      },
    },
    locale: 'fr-FR',
    now,
  });

  assert.equal(result.totals.users, 100);
  assert.equal(result.kpis.transactionsPerMonth.monthly.length, 6);
  assert.equal(result.kpis.disputeRate.value, 0.08);
  assert.equal(result.kpis.resolutionRate.value, 0.5);
  assert.equal(result.kpis.recurringTravelers.value, 0.4);
  assert.equal(result.kpis.desintermediationRate.value, 0.02);
  assert.equal(result.kpis.avgMatchHours.value, 12.5);
  assert.match(calls[0].sql, /avg_match_hours/);
  assert.match(calls[1].sql, /generate_series/);
});
