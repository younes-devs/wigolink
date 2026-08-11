import crypto from 'node:crypto';
import {
  centsToEuros,
  paymentSnapshot,
  quotePayment,
} from './pricing.js';

const PAID_STATUSES = new Set(['paid', 'transfer_pending', 'transferred']);

export function createStripePaymentService({
  getPool,
  stripe,
  config,
  audit = async () => {},
  manualPayouts = null,
  now = Date.now,
  logger = console,
}) {
  function availability() {
    if (!config.enabled) return failure(404, 'Paiement Stripe inactif.');
    if (!stripe || !config.secretKey || !config.webhookSecret) {
      return failure(503, 'Paiement temporairement indisponible.');
    }
    return null;
  }

  async function createCheckout({ user, operationId, lang = 'fr' }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const prepared = await prepareCheckout({
      pool: getPool(),
      user,
      operationId,
      now: now(),
    });
    if (prepared.error) return prepared.error;

    const { operation, sender, quote, attempt, existingSessionId } = prepared;
    if (existingSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(existingSessionId);
        if (existing.status === 'open' && existing.url) {
          const payment = await markCheckoutOpen(getPool(), operationId, existing.id);
          return success({ checkoutUrl: existing.url, payment: publicPayment(payment) });
        }
      } catch (error) {
        logStripeError(logger, 'stripe_checkout_retrieve_failed', error, {
          operationId,
          checkoutSessionId: existingSessionId,
        });
      }
    }

    const safeLang = supportedLang(lang);
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'auto',
        client_reference_id: operation.id,
        customer_email: sender.email || undefined,
        payment_method_types: ['card'],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: quote.currency.toLowerCase(),
            unit_amount: quote.chargedAmountCents,
            product_data: {
              name: `Transport ${operation.title || operation.id}`,
              description: checkoutDescription(operation, quote),
            },
          },
        }],
        payment_intent_data: {
          metadata: paymentMetadata(operation, quote),
        },
        metadata: paymentMetadata(operation, quote),
        success_url: `${config.appUrl}/${safeLang}/operations/${encodeURIComponent(operation.id)}?paiement=succes`,
        cancel_url: `${config.appUrl}/${safeLang}/operations/${encodeURIComponent(operation.id)}?paiement=annule`,
        expires_at: Math.floor(now() / 1000) + 30 * 60,
      }, {
        idempotencyKey: `checkout:${operation.id}:${quote.feePolicyVersion}:${attempt}`,
      });
      const payment = await markCheckoutOpen(getPool(), operation.id, session.id);
      await bestEffort(() => audit(
        user.id,
        'stripe_checkout_created',
        'transaction',
        operation.id,
        {
          chargedAmountCents: quote.chargedAmountCents,
          travelerTransferCents: quote.travelerTransferCents,
          feePolicyVersion: quote.feePolicyVersion,
        },
      ), logger);
      return success({ checkoutUrl: session.url, payment: publicPayment(payment) });
    } catch (error) {
      await markCheckoutFailed(getPool(), operation.id, error);
      logStripeError(logger, 'stripe_checkout_create_failed', error, { operationId });
      return failure(502, stripeMessage(error, 'Impossible de preparer le paiement.'));
    }
  }

  async function handleWebhook({ rawBody, signature }) {
    if (!stripe || !config.webhookSecret) {
      return failure(503, 'Webhook Stripe non configure.');
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    } catch (error) {
      logger.warn('stripe_webhook_signature_invalid', { message: error?.message });
      return failure(400, 'Signature Stripe invalide.');
    }
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const claim = await claimWebhookEvent(getPool(), event, payloadHash);
    if (claim.duplicate) return success({ received: true, duplicate: true });
    try {
      const enriched = await enrichWebhookEvent(stripe, event);
      await applyWebhookEvent({
        pool: getPool(),
        event,
        enriched,
        now: now(),
      });
      await finishWebhookEvent(getPool(), event.id, 'processed');
      return success({ received: true });
    } catch (error) {
      await finishWebhookEvent(getPool(), event.id, 'failed', error);
      logStripeError(logger, 'stripe_webhook_processing_failed', error, {
        eventId: event.id,
        eventType: event.type,
      });
      return failure(500, 'Traitement Stripe temporairement impossible.');
    }
  }

  async function releaseAfterDelivery(operationId) {
    return manualPayouts?.queueAfterDelivery(operationId)
      || failure(503, 'Versement manuel temporairement indisponible.');
  }

  async function refundOperation({ admin, operationId, reason }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 300) {
      return failure(400, 'Le motif du remboursement doit contenir entre 5 et 300 caracteres.');
    }
    const prepared = await prepareRefund(getPool(), operationId, now());
    if (prepared.error) return prepared.error;
    try {
      const refund = await stripe.refunds.create({
        payment_intent: prepared.payment.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: {
          wigolink_operation_id: operationId,
          wigolink_admin_id: admin.id,
          wigolink_reason: normalizedReason.slice(0, 200),
        },
      }, {
        idempotencyKey: `refund:${operationId}`,
      });
      const payment = await completeRefund(
        getPool(),
        operationId,
        refund.id,
        now(),
      );
      await audit(admin.id, 'stripe_refund_created', 'transaction', operationId, {
        reason: normalizedReason,
        amountCents: payment.charged_amount_cents,
      });
      return success({ payment: publicPayment(payment) });
    } catch (error) {
      await failRefund(getPool(), operationId, error);
      logStripeError(logger, 'stripe_refund_failed', error, { operationId });
      return failure(502, stripeMessage(error, 'Remboursement impossible pour le moment.'));
    }
  }

  return {
    availability,
    createCheckout,
    handleWebhook,
    releaseAfterDelivery,
    refundOperation,
  };
}

async function prepareCheckout({ pool, user, operationId, now }) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      `select tx.data as operation, sender.data as sender, traveler.data as traveler,
              manual.id as manual_payout_account_id,
              manual.status as manual_payout_account_status
         from public.wigolink_transactions tx
         join public.wigolink_users sender on sender.id = tx.data->>'senderId'
         join public.wigolink_users traveler on traveler.id = tx.data->>'travelerId'
         left join public.manual_payout_accounts manual
           on manual.user_id = tx.data->>'travelerId' and manual.active
        where tx.id = $1
        for update of tx`,
      [operationId],
    );
    const row = result.rows[0];
    if (!row?.operation) return rollback(client, failure(404, 'Operation introuvable.'));
    if (row.operation.senderId !== user.id) {
      return rollback(client, failure(403, "Paiement reserve a l'expediteur."));
    }
    if (row.operation.operationStatus !== 'paiement_requis') {
      return rollback(client, failure(409, 'Cette operation ne peut pas etre payee maintenant.'));
    }
    const manualReady = row.manual_payout_account_id
      && row.manual_payout_account_status === 'verified';
    if (!manualReady) {
      return rollback(client, failure(409, 'Le voyageur doit configurer ses versements avant le paiement.', {
        payoutSetupRequired: true,
      }));
    }
    const quote = quoteFromOperation(row.operation);
    const paymentResult = await client.query(
      `select * from public.operation_payments where operation_id = $1 for update`,
      [operationId],
    );
    const existing = paymentResult.rows[0] || null;
    if (existing && PAID_STATUSES.has(existing.payment_status)) {
      return rollback(client, failure(409, 'Cette operation est deja payee.'));
    }
    if (existing?.payment_status === 'creating'
      && isYoungerThan(existing.updated_at, now, 90_000)) {
      return rollback(client, failure(409, 'La page de paiement est en cours de preparation.'));
    }
    const attempt = Number(existing?.checkout_attempt || 0) + 1;
    await client.query(
      `insert into public.operation_payments (
         operation_id, currency, traveler_price_cents, sender_fee_cents,
         traveler_fee_cents, charged_amount_cents, traveler_transfer_cents,
         platform_gross_cents, payment_status, transfer_status, checkout_attempt,
         fee_policy_version, pricing_snapshot_json, payout_method, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,'creating','not_ready',$9,$10,$11::jsonb,'manual',now(),now())
       on conflict (operation_id) do update set
         payment_status = 'creating', checkout_attempt = excluded.checkout_attempt,
         currency = excluded.currency, traveler_price_cents = excluded.traveler_price_cents,
         sender_fee_cents = excluded.sender_fee_cents,
         traveler_fee_cents = excluded.traveler_fee_cents,
         charged_amount_cents = excluded.charged_amount_cents,
         traveler_transfer_cents = excluded.traveler_transfer_cents,
         platform_gross_cents = excluded.platform_gross_cents,
         payout_method = 'manual',
         fee_policy_version = excluded.fee_policy_version,
         pricing_snapshot_json = excluded.pricing_snapshot_json, updated_at = now()`,
      [
        operationId,
        quote.currency,
        quote.travelerPriceCents,
        quote.senderFeeCents,
        quote.travelerFeeCents,
        quote.chargedAmountCents,
        quote.travelerTransferCents,
        quote.platformGrossCents,
        attempt,
        quote.feePolicyVersion,
        JSON.stringify(paymentSnapshot(quote)),
      ],
    );
    row.operation.paymentStatus = 'creating';
    row.operation.payment = paymentSnapshot(quote);
    appendOperationEvent(row.operation, 'stripe_checkout_preparing', user.id, {
      attempt,
      chargedAmountCents: quote.chargedAmountCents,
    }, now);
    await updateOperation(client, row.operation);
    await client.query('commit');
    return {
      operation: row.operation,
      sender: row.sender,
      traveler: row.traveler,
      quote,
      attempt,
      existingSessionId: existing?.payment_status === 'checkout_open'
        ? existing.stripe_checkout_session_id
        : null,
      payment: existing,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markCheckoutOpen(pool, operationId, sessionId) {
  const result = await pool.query(
    `update public.operation_payments
        set stripe_checkout_session_id = $2, payment_status = 'checkout_open', updated_at = now()
      where operation_id = $1 returning *`,
    [operationId, sessionId],
  );
  await pool.query(
    `update public.wigolink_transactions
        set data = jsonb_set(data, '{paymentStatus}', '"checkout_open"'::jsonb), updated_at = now()
      where id = $1`,
    [operationId],
  );
  return result.rows[0];
}

async function markCheckoutFailed(pool, operationId, error) {
  await pool.query(
    `update public.operation_payments
        set payment_status = 'checkout_failed', updated_at = now(),
            pricing_snapshot_json = pricing_snapshot_json || jsonb_build_object('lastError', $2::text)
      where operation_id = $1`,
    [operationId, safeError(error)],
  );
  await pool.query(
    `update public.wigolink_transactions
        set data = jsonb_set(data, '{paymentStatus}', '"pending"'::jsonb), updated_at = now()
      where id = $1 and data->>'paymentStatus' = 'creating'`,
    [operationId],
  );
}

async function prepareRefund(pool, operationId, now) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      `select payment.*, tx.data as operation
         from public.operation_payments payment
         join public.wigolink_transactions tx on tx.id = payment.operation_id
        where payment.operation_id = $1 for update of payment, tx`,
      [operationId],
    );
    const row = result.rows[0];
    if (!row) return rollback(client, { error: failure(404, 'Paiement introuvable.') });
    if (row.payment_status === 'refunded') {
      return rollback(client, { error: failure(409, 'Ce paiement est deja rembourse.') });
    }
    if (row.payout_method === 'manual' && row.transfer_status === 'manual_sent') {
      return rollback(client, { error: failure(409, 'Recuperez d abord le versement voyageur avant de rembourser cet expediteur.') });
    }
    if (!row.stripe_payment_intent_id || !PAID_STATUSES.has(row.payment_status)) {
      return rollback(client, { error: failure(409, "Aucun paiement remboursable n'est disponible.") });
    }
    await client.query(
      `update public.operation_payments
          set payment_status = 'refund_pending', updated_at = now()
        where operation_id = $1`,
      [operationId],
    );
    appendOperationEvent(row.operation, 'stripe_refund_preparing', 'admin', {}, now);
    await updateOperation(client, row.operation);
    await client.query('commit');
    return { payment: row };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function completeRefund(pool, operationId, refundId, now) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const paymentResult = await client.query(
      `update public.operation_payments set
         stripe_refund_id = $2, payment_status = 'refunded',
         refunded_at = to_timestamp($3 / 1000.0), updated_at = now()
       where operation_id = $1 returning *`,
      [operationId, refundId, now],
    );
    const operationResult = await client.query(
      `select data from public.wigolink_transactions where id = $1 for update`,
      [operationId],
    );
    const operation = operationResult.rows[0]?.data;
    if (operation) {
      operation.status = 'refunded';
      operation.operationStatus = 'termine';
      operation.paymentStatus = 'refunded';
      operation.escrow = {
        ...operation.escrow,
        provider: 'stripe',
        state: 'refunded',
        refundedAt: now,
      };
      appendOperationEvent(operation, 'stripe_refund_created', 'stripe', {}, now);
      await updateOperation(client, operation);
    }
    await client.query('commit');
    return paymentResult.rows[0];
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function failRefund(pool, operationId, error) {
  await pool.query(
    `update public.operation_payments set payment_status = 'paid', updated_at = now(),
       pricing_snapshot_json = pricing_snapshot_json || jsonb_build_object('refundError', $2::text)
     where operation_id = $1`,
    [operationId, safeError(error)],
  );
}

async function claimWebhookEvent(pool, event, payloadHash) {
  const inserted = await pool.query(
    `insert into public.stripe_webhook_events (
       stripe_event_id, event_type, livemode, connected_account_id, payload_hash,
       processing_status, attempts, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,'processing',1,now(),now())
     on conflict (stripe_event_id) do nothing returning stripe_event_id`,
    [event.id, event.type, !!event.livemode, event.account || null, payloadHash],
  );
  if (inserted.rowCount) return { duplicate: false };
  const existing = await pool.query(
    `select processing_status from public.stripe_webhook_events where stripe_event_id = $1`,
    [event.id],
  );
  if (existing.rows[0]?.processing_status === 'processed') return { duplicate: true };
  await pool.query(
    `update public.stripe_webhook_events
        set processing_status = 'processing', attempts = attempts + 1,
            last_error = null, updated_at = now()
      where stripe_event_id = $1`,
    [event.id],
  );
  return { duplicate: false };
}

async function finishWebhookEvent(pool, eventId, status, error = null) {
  await pool.query(
    `update public.stripe_webhook_events set
       processing_status = $2, processed_at = case when $2 = 'processed' then now() else processed_at end,
       last_error = $3, updated_at = now()
     where stripe_event_id = $1`,
    [eventId, status, error ? safeError(error) : null],
  );
}

async function enrichWebhookEvent(stripe, event) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return null;
  }
  const session = event.data.object;
  const paymentIntentId = objectId(session.payment_intent);
  if (!paymentIntentId) return null;
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
}

async function applyWebhookEvent({ pool, event, enriched, now }) {
  const object = event.data.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_status !== 'paid') return;
    await markPaymentPaid(pool, object, enriched, now);
    return;
  }
  if (event.type === 'payment_intent.payment_failed') {
    await updatePaymentByIntent(pool, object.id, 'failed');
    return;
  }
  if (event.type === 'checkout.session.expired') {
    await markCheckoutExpired(pool, object, now);
    return;
  }
  if (event.type === 'charge.refunded') {
    await markRefundedFromWebhook(pool, object, now);
    return;
  }
  if (event.type === 'charge.dispute.created') {
    await markDisputedFromWebhook(pool, object, now);
    return;
  }
  if (event.type === 'charge.dispute.closed' && object.status === 'won') {
    await updatePaymentByCharge(pool, object.charge, 'paid');
    return;
  }
}

async function markCheckoutExpired(pool, session, now) {
  const operationId = session.metadata?.wigolink_operation_id || session.client_reference_id;
  if (!operationId) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update public.operation_payments
          set payment_status = 'expired', updated_at = now()
        where operation_id = $1
          and payment_status in ('creating', 'checkout_open')`,
      [operationId],
    );
    const result = await client.query(
      `select data from public.wigolink_transactions where id = $1 for update`,
      [operationId],
    );
    const operation = result.rows[0]?.data;
    if (operation?.operationStatus === 'paiement_requis'
      && ['creating', 'checkout_open'].includes(operation.paymentStatus)) {
      operation.paymentStatus = 'pending';
      appendOperationEvent(operation, 'stripe_checkout_expired', 'stripe', {}, now);
      await updateOperation(client, operation);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markPaymentPaid(pool, session, paymentIntent, now) {
  const operationId = session.metadata?.wigolink_operation_id || session.client_reference_id;
  if (!operationId) throw new Error('Webhook Stripe sans operation Wigolink.');
  const charge = paymentIntent?.latest_charge;
  const chargeId = objectId(charge);
  const balanceTransaction = typeof charge === 'object' ? charge.balance_transaction : null;
  const feeCents = typeof balanceTransaction === 'object'
    ? Number(balanceTransaction.fee || 0)
    : null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const paymentResult = await client.query(
      `update public.operation_payments set
         stripe_checkout_session_id = coalesce(stripe_checkout_session_id, $2),
         stripe_payment_intent_id = $3, stripe_charge_id = $4,
         stripe_fee_cents = coalesce($5, stripe_fee_cents), payment_status = 'paid',
         transfer_status = 'not_ready', paid_at = to_timestamp($6 / 1000.0), updated_at = now()
       where operation_id = $1 returning *`,
      [operationId, session.id, objectId(session.payment_intent), chargeId, feeCents, now],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error('Paiement Wigolink introuvable pour le webhook.');
    const operationResult = await client.query(
      `select data from public.wigolink_transactions where id = $1 for update`,
      [operationId],
    );
    const operation = operationResult.rows[0]?.data;
    if (!operation) throw new Error('Operation Wigolink introuvable pour le webhook.');
    if (operation.operationStatus === 'paiement_requis') operation.operationStatus = 'paye';
    operation.paymentStatus = 'paid';
    operation.status = operation.status === 'cancelled' ? 'payment_review' : operation.status;
    operation.escrow = {
      provider: 'stripe',
      providerRef: objectId(session.payment_intent),
      amount: centsToEuros(payment.charged_amount_cents),
      travelerPay: centsToEuros(payment.traveler_transfer_cents),
      commission: centsToEuros(payment.platform_gross_cents),
      state: 'held',
      heldAt: now,
    };
    if (!operation.events?.some((item) => item.type === 'operation_paid')) {
      appendOperationEvent(operation, 'operation_paid', 'stripe', {
        chargedAmountCents: payment.charged_amount_cents,
        stripeFeeCents: feeCents,
      }, now);
    }
    await updateOperation(client, operation);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markRefundedFromWebhook(pool, charge, now) {
  const payment = await paymentByCharge(pool, charge.id);
  if (!payment) return;
  await completeRefund(pool, payment.operation_id, objectId(charge.refunds?.data?.[0]) || payment.stripe_refund_id, now);
}

async function markDisputedFromWebhook(pool, dispute, now) {
  const payment = await paymentByCharge(pool, objectId(dispute.charge));
  if (!payment) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update public.operation_payments set payment_status = 'disputed',
         transfer_status = case when transfer_status = 'not_ready' then 'blocked' else transfer_status end,
         updated_at = now() where operation_id = $1`,
      [payment.operation_id],
    );
    const operationResult = await client.query(
      `select data from public.wigolink_transactions where id = $1 for update`,
      [payment.operation_id],
    );
    const operation = operationResult.rows[0]?.data;
    if (operation) {
      operation.status = 'disputed';
      operation.operationStatus = 'litige';
      operation.paymentStatus = 'disputed';
      operation.escrow = { ...operation.escrow, state: 'frozen', frozenAt: now };
      appendOperationEvent(operation, 'stripe_dispute_opened', 'stripe', {
        disputeId: dispute.id,
      }, now);
      await updateOperation(client, operation);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updatePaymentByIntent(pool, paymentIntentId, status) {
  await pool.query(
    `update public.operation_payments set payment_status = $2, updated_at = now()
      where stripe_payment_intent_id = $1`,
    [paymentIntentId, status],
  );
}

async function updatePaymentByCharge(pool, chargeId, status) {
  await pool.query(
    `update public.operation_payments set payment_status = $2, updated_at = now()
      where stripe_charge_id = $1`,
    [chargeId, status],
  );
}

async function paymentByCharge(pool, chargeId) {
  if (!chargeId) return null;
  const result = await pool.query(
    `select * from public.operation_payments where stripe_charge_id = $1`,
    [chargeId],
  );
  return result.rows[0] || null;
}

function quoteFromOperation(operation) {
  const snapshot = operation.payment;
  if (snapshot?.feePolicyVersion && Number.isSafeInteger(snapshot.priceCents)) {
    return quotePayment({
      travelerPriceCents: snapshot.priceCents,
      currency: snapshot.currency || operation.currency,
    });
  }
  return quotePayment({ travelerPrice: operation.price, currency: operation.currency || 'EUR' });
}

function publicPayment(row) {
  if (!row) return null;
  return {
    currency: row.currency,
    travelerPriceCents: row.traveler_price_cents,
    senderFeeCents: row.sender_fee_cents,
    travelerFeeCents: row.traveler_fee_cents,
    chargedAmountCents: row.charged_amount_cents,
    travelerTransferCents: row.traveler_transfer_cents,
    platformGrossCents: row.platform_gross_cents,
    paymentStatus: row.payment_status,
    transferStatus: row.transfer_status,
    feePolicyVersion: row.fee_policy_version,
  };
}

function paymentMetadata(operation, quote) {
  return {
    wigolink_operation_id: operation.id,
    wigolink_sender_id: operation.senderId,
    wigolink_traveler_id: operation.travelerId,
    wigolink_fee_policy: quote.feePolicyVersion,
    wigolink_traveler_price_cents: String(quote.travelerPriceCents),
    wigolink_sender_fee_cents: String(quote.senderFeeCents),
    wigolink_traveler_fee_cents: String(quote.travelerFeeCents),
    wigolink_traveler_payout_cents: String(quote.travelerTransferCents),
  };
}

function checkoutDescription(operation, quote) {
  const type = operation.shipmentType === 'document' ? 'Document' : 'Colis';
  return `${type} - prix ${centsToEuros(quote.travelerPriceCents).toFixed(2)} EUR + frais de service ${centsToEuros(quote.senderFeeCents).toFixed(2)} EUR`;
}

function supportedLang(value) {
  return ['fr', 'en', 'ar', 'es', 'nl'].includes(value) ? value : 'fr';
}

function isYoungerThan(value, now, durationMs) {
  if (!value) return false;
  return now - new Date(value).getTime() < durationMs;
}

function objectId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

function appendOperationEvent(operation, type, actorId, meta, at) {
  operation.events = Array.isArray(operation.events) ? operation.events : [];
  if (operation.events.some((event) => event.type === type && event.meta?.stripeEventId === meta?.stripeEventId)) return;
  operation.events.push({
    id: crypto.randomUUID(),
    type,
    actorId,
    meta,
    at,
  });
}

async function updateOperation(client, operation) {
  await client.query(
    `update public.wigolink_transactions set data = $2::jsonb, updated_at = now() where id = $1`,
    [operation.id, JSON.stringify(operation)],
  );
}

async function rollback(client, result) {
  await client.query('rollback');
  return result;
}

function success(body, status = 200) {
  return { status, body };
}

function failure(status, error, extra = {}) {
  return { status, body: { error, ...extra } };
}

function stripeMessage(error, fallback) {
  if (error?.type === 'StripeCardError') return error.message || fallback;
  if (error?.code === 'account_country_invalid_address') return 'Adresse incompatible avec le pays choisi.';
  return fallback;
}

function safeError(error) {
  return String(error?.message || error || 'unknown_error').slice(0, 500);
}

function logStripeError(logger, event, error, meta) {
  logger.error(event, {
    ...meta,
    stripeType: error?.type,
    stripeCode: error?.code,
    requestId: error?.requestId,
    message: safeError(error),
  });
}

async function bestEffort(task, logger) {
  try {
    await task();
  } catch (error) {
    logger.error('stripe_best_effort_failed', { message: safeError(error) });
  }
}
