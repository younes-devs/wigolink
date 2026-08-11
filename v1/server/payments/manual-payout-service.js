import crypto from 'node:crypto';
import { createManualPayoutCipher } from './manual-payout-crypto.js';

export function createManualPayoutService({
  getPool,
  config,
  audit = async () => {},
  now = Date.now,
}) {
  const cipher = createManualPayoutCipher(config.encryptionKey);

  function availability() {
    if (!config.enabled) return failure(404, 'Versements manuels inactifs.');
    if (!cipher.ready) return failure(503, 'Configuration bancaire temporairement indisponible.');
    return null;
  }

  async function status({ user }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const account = await activeAccount(getPool(), user.id);
    const accountDetails = account ? cipher.decrypt(account.details_ciphertext) : null;
    const requests = await getPool().query(
      `select operation_id, amount_cents, currency, status, requested_at, processed_at
         from public.manual_payout_requests
        where traveler_id = $1
        order by requested_at desc
        limit 10`,
      [user.id],
    );
    return success({
      mode: 'manual',
      payout: publicAccount(account, accountDetails),
      requests: requests.rows.map(publicRequest),
    });
  }

  async function saveAccount({ user, body }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const validated = validateAccount(body, config.allowedCountries);
    if (validated.error) return failure(400, validated.error);
    const pool = getPool();
    const client = await pool.connect();
    const id = `mpa-${crypto.randomUUID()}`;
    let savedAccount;
    try {
      await client.query('begin');
      await client.query(
        `update public.manual_payout_accounts
            set active = false, updated_at = now()
          where user_id = $1 and active`,
        [user.id],
      );
      const result = await client.query(
        `insert into public.manual_payout_accounts (
           id, user_id, country, details_ciphertext, account_last4, status, active,
           created_at, updated_at
         ) values ($1,$2,$3,$4,$5,'verified',true,now(),now())
         returning *`,
        [
          id,
          user.id,
          validated.value.country,
          cipher.encrypt(validated.value),
          validated.value.accountIdentifier.slice(-4),
        ],
      );
      savedAccount = result.rows[0];
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await audit(user.id, 'manual_payout_account_saved', 'user', user.id, {
      payoutAccountId: id,
      country: validated.value.country,
      accountLast4: validated.value.accountIdentifier.slice(-4),
    });
    const queuedRequests = await resumeAwaitingPayouts(pool, user.id, queueAfterDelivery);
    return success({
      mode: 'manual',
      payout: publicAccount(savedAccount, validated.value),
      queuedRequests,
    }, 201);
  }

  async function queueAfterDelivery(operationId) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const client = await getPool().connect();
    let queuedRequest;
    let auditPayload;
    try {
      await client.query('begin');
      const result = await client.query(
        `select payment.*, tx.data as operation, account.id as payout_account_id
           from public.operation_payments payment
           join public.wigolink_transactions tx on tx.id = payment.operation_id
           left join public.manual_payout_accounts account
             on account.user_id = tx.data->>'travelerId' and account.active
          where payment.operation_id = $1
          for update of payment, tx`,
        [operationId],
      );
      const row = result.rows[0];
      if (!row) return rollback(client, failure(404, 'Paiement introuvable.'));
      if (row.transfer_status === 'manual_sent' || row.payment_status === 'transferred') {
        return rollback(client, success({ request: { status: 'sent' } }));
      }
      if (!row.payout_account_id) {
        await client.query(
          `update public.operation_payments
              set transfer_status = 'bank_details_required', updated_at = now()
            where operation_id = $1`,
          [operationId],
        );
        await client.query('commit');
        return failure(409, 'Le voyageur doit renseigner son compte bancaire.', {
          payoutSetupRequired: true,
        });
      }
      if (!['paid', 'transfer_pending'].includes(row.payment_status) || !row.stripe_charge_id) {
        return rollback(client, failure(409, "Le paiement n'est pas pret pour le versement."));
      }
      if (!['termine', 'livraison_confirmee'].includes(row.operation.operationStatus)
        || row.operation.status === 'disputed') {
        return rollback(client, failure(409, "La livraison n'est pas confirmee."));
      }
      const request = await client.query(
        `insert into public.manual_payout_requests (
           operation_id, traveler_id, payout_account_id, amount_cents, currency,
           status, requested_at, updated_at
         ) values ($1,$2,$3,$4,$5,'pending',now(),now())
         on conflict (operation_id) do update set updated_at = now()
         returning *`,
        [
          operationId,
          row.operation.travelerId,
          row.payout_account_id,
          row.traveler_transfer_cents,
          row.currency,
        ],
      );
      await client.query(
        `update public.operation_payments
            set payment_status = 'transfer_pending', transfer_status = 'manual_pending',
                payout_method = 'manual', updated_at = now()
          where operation_id = $1`,
        [operationId],
      );
      row.operation.paymentStatus = 'transfer_pending';
      appendEvent(row.operation, 'manual_payout_requested', 'system', {
        amountCents: row.traveler_transfer_cents,
      }, now());
      await updateOperation(client, row.operation);
      await client.query('commit');
      queuedRequest = request.rows[0];
      auditPayload = {
        travelerId: row.operation.travelerId,
        amountCents: row.traveler_transfer_cents,
        currency: row.currency,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await audit('system', 'manual_payout_requested', 'transaction', operationId, auditPayload);
    return success({ request: publicRequest(queuedRequest) }, 201);
  }

  async function listRequests({ admin, status: requestedStatus }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const statusFilter = ['pending', 'processing', 'sent', 'failed'].includes(requestedStatus)
      ? requestedStatus
      : null;
    const result = await getPool().query(
      `select request.*, account.country, account.account_last4, account.details_ciphertext,
              member.data as traveler, tx.data as operation
         from public.manual_payout_requests request
         join public.manual_payout_accounts account on account.id = request.payout_account_id
         join public.wigolink_users member on member.id = request.traveler_id
         join public.wigolink_transactions tx on tx.id = request.operation_id
        where ($1::text is null or request.status = $1)
        order by case when request.status = 'pending' then 0 else 1 end,
                 request.requested_at asc
        limit 200`,
      [statusFilter],
    );
    await audit(admin.id, 'manual_payout_queue_viewed', 'admin', admin.id, {
      count: result.rows.length,
      status: statusFilter || 'all',
    });
    return success({
      requests: result.rows.map((row) => adminRequest(row, cipher.decrypt(row.details_ciphertext))),
    });
  }

  async function markSent({ admin, operationId, reference }) {
    const unavailable = availability();
    if (unavailable) return unavailable;
    const normalizedReference = String(reference || '').trim();
    if (normalizedReference.length < 4 || normalizedReference.length > 120) {
      return failure(400, 'Ajoutez une reference bancaire valide.');
    }
    const client = await getPool().connect();
    let sentRequest;
    let auditPayload;
    try {
      await client.query('begin');
      const result = await client.query(
        `select request.*, tx.data as operation
           from public.manual_payout_requests request
           join public.wigolink_transactions tx on tx.id = request.operation_id
          where request.operation_id = $1
          for update of request, tx`,
        [operationId],
      );
      const row = result.rows[0];
      if (!row) return rollback(client, failure(404, 'Demande de versement introuvable.'));
      if (row.status === 'sent') return rollback(client, failure(409, 'Ce versement est deja marque comme envoye.'));
      const updatedRequest = await client.query(
        `update public.manual_payout_requests
            set status = 'sent', transfer_reference = $2, processed_by = $3,
                processed_at = now(), updated_at = now()
          where operation_id = $1
          returning *`,
        [operationId, normalizedReference, admin.id],
      );
      await client.query(
        `update public.operation_payments
            set payment_status = 'transferred', transfer_status = 'manual_sent',
                transferred_at = now(), updated_at = now()
          where operation_id = $1`,
        [operationId],
      );
      row.operation.status = 'released';
      row.operation.paymentStatus = 'transferred';
      row.operation.escrow = {
        ...row.operation.escrow,
        provider: 'stripe_manual_payout',
        state: 'released',
        releasedAt: now(),
      };
      appendEvent(row.operation, 'manual_payout_sent', admin.id, {}, now());
      await updateOperation(client, row.operation);
      await client.query('commit');
      sentRequest = updatedRequest.rows[0];
      auditPayload = {
        amountCents: row.amount_cents,
        currency: row.currency,
      };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await audit(admin.id, 'manual_payout_sent', 'transaction', operationId, auditPayload);
    return success({ request: publicRequest(sentRequest) });
  }

  return { availability, status, saveAccount, queueAfterDelivery, listRequests, markSent };
}

async function resumeAwaitingPayouts(pool, travelerId, queueAfterDelivery) {
  const result = await pool.query(
    `select payment.operation_id
       from public.operation_payments payment
       join public.wigolink_transactions tx on tx.id = payment.operation_id
      where tx.data->>'travelerId' = $1
        and payment.transfer_status = 'bank_details_required'
      order by payment.updated_at asc
      limit 50`,
    [travelerId],
  );
  let queued = 0;
  for (const row of result.rows) {
    const outcome = await queueAfterDelivery(row.operation_id).catch(() => null);
    if (outcome?.status >= 200 && outcome.status < 300) queued += 1;
  }
  return queued;
}

async function activeAccount(pool, userId) {
  const result = await pool.query(
    `select * from public.manual_payout_accounts
      where user_id = $1 and active
      order by created_at desc limit 1`,
    [userId],
  );
  return result.rows[0] || null;
}

function validateAccount(body, allowedCountries) {
  const country = String(body?.country || '').trim().toUpperCase();
  const holderName = String(body?.holderName || '').trim().replace(/\s+/g, ' ');
  const bankName = String(body?.bankName || '').trim().replace(/\s+/g, ' ');
  const phone = String(body?.phone || '').trim();
  const bic = String(body?.bic || '').trim().toUpperCase().replace(/\s+/g, '');
  let accountIdentifier = String(body?.accountIdentifier || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!allowedCountries.has(country)) return { error: 'Ce pays de versement ne fait pas partie du pilote.' };
  if (holderName.length < 3 || holderName.length > 120) return { error: 'Le titulaire du compte est invalide.' };
  if (bankName.length < 2 || bankName.length > 100) return { error: 'Le nom de la banque est invalide.' };
  if (country === 'MA') {
    accountIdentifier = accountIdentifier.replace(/\D/g, '');
    if (!/^\d{24}$/.test(accountIdentifier)) return { error: 'Le RIB marocain doit contenir 24 chiffres.' };
    if (!/^\+?[0-9 ()-]{8,20}$/.test(phone)) return { error: 'Ajoutez un numero de telephone valide.' };
  } else if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(accountIdentifier)) {
    return { error: 'Ajoutez un IBAN valide.' };
  }
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return { error: 'Le code BIC/SWIFT est invalide.' };
  return { value: { country, holderName, bankName, accountIdentifier, bic, phone } };
}

function publicAccount(row, details = null) {
  return row ? {
    configured: true,
    ready: row.status === 'verified',
    country: row.country,
    status: row.status,
    accountLast4: row.account_last4,
    bankName: String(details?.bankName || '').trim() || null,
  } : {
    configured: false,
    ready: false,
    country: null,
    status: 'not_configured',
    accountLast4: null,
    bankName: null,
  };
}

function publicRequest(row) {
  return {
    operationId: row.operation_id,
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency,
    status: row.status,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
  };
}

function adminRequest(row, details) {
  const operation = row.operation || {};
  const traveler = row.traveler || {};
  return {
    ...publicRequest(row),
    traveler: {
      id: row.traveler_id,
      name: traveler.name,
      email: traveler.email,
      kycStatus: traveler.kycStatus,
    },
    route: [operation.from, operation.to].filter(Boolean).join(' -> '),
    bank: {
      country: row.country,
      holderName: details.holderName,
      bankName: details.bankName,
      accountIdentifier: details.accountIdentifier,
      bic: details.bic || null,
      phone: details.phone || null,
    },
    transferReference: row.transfer_reference || null,
    processedBy: row.processed_by || null,
  };
}

function appendEvent(operation, type, actorId, meta, at) {
  operation.events = Array.isArray(operation.events) ? operation.events : [];
  operation.events.push({ id: crypto.randomUUID(), type, actorId, meta, at });
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
