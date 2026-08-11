import { transactionParticipantFilter } from './relational-sql.js';
import { decodePageCursor, encodePageCursor } from './pagination-cursor.js';
import { stripePaymentsEnabled } from './payments/stripe-config.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CLOSED_STATUSES = new Set(['released', 'refunded', 'cancelled']);

export function relationalOperationReadsEnabled(env = process.env) {
  return env.RELATIONAL_OPERATION_READS === 'true';
}

export async function listRelationalOperations({
  pool,
  user,
  query = {},
  operationCodePublicState,
  disputeView,
}) {
  const history = query.history === '1';
  const limit = boundedLimit(query.limit);
  const cursor = decodeOperationCursor(query.cursor);
  const offset = cursor ? 0 : boundedOffset(query.offset);
  const params = [user.id, [...CLOSED_STATUSES], history];
  let cursorClause = '';
  if (cursor) {
    params.push(cursor.at, cursor.id);
    const atParam = `$${params.length - 1}`;
    const idParam = `$${params.length}`;
    cursorClause = `and (
      coalesce(
        nullif(tx.data->>'createdAt', '')::bigint,
        extract(epoch from tx.created_at) * 1000
      ) < ${atParam}
      or (
        coalesce(
          nullif(tx.data->>'createdAt', '')::bigint,
          extract(epoch from tx.created_at) * 1000
        ) = ${atParam}
        and tx.id > ${idParam}
      )
    )`;
  }
  params.push(limit + 1);
  const limitParam = `$${params.length}`;
  let offsetClause = '';
  if (!cursor) {
    params.push(offset);
    offsetClause = `offset $${params.length}`;
  }
  const result = await pool.query(
    `${operationSelect()}
     where ${transactionParticipantFilter('$1')}
       and ((coalesce(tx.data->>'status', '') = any($2::text[])) = $3)
       ${cursorClause}
     order by coalesce(
       nullif(tx.data->>'createdAt', '')::bigint,
       extract(epoch from tx.created_at) * 1000
     ) desc, tx.id asc
     limit ${limitParam} ${offsetClause}`,
    params,
  );
  const hasMore = result.rows.length > limit;
  const selected = result.rows.slice(0, limit);
  const operations = selected.map((row) =>
    operationView(row, user, operationCodePublicState, disputeView)
  );
  const last = selected.at(-1);
  return {
    operations,
    page: {
      limit,
      offset,
      hasMore,
      nextOffset: hasMore && !cursor ? offset + limit : null,
      nextCursor: hasMore && last ? encodePageCursor({
        at: Number(last.sort_at || last.transaction?.createdAt || 0),
        id: String(last.sort_id || last.transaction?.id || ''),
      }) : null,
    },
  };
}

export async function relationalOperation({
  pool,
  user,
  id,
  operationCodePublicState,
  disputeView,
}) {
  const result = await pool.query(
    `${operationSelect()}
     where tx.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return { status: 404, body: { error: 'Operation introuvable' } };
  }
  const transaction = row.transaction || {};
  if (!user.isAdmin && ![
    transaction.senderId,
    transaction.travelerId,
    transaction.recipientId,
  ].includes(user.id)) {
    return { status: 403, body: { error: 'Non autorise' } };
  }
  return {
    status: 200,
    body: {
      operation: operationView(
        row,
        user,
        operationCodePublicState,
        disputeView,
      ),
    },
  };
}

function operationSelect() {
  return `select
       tx.data as transaction,
       tx.id as sort_id,
       coalesce(
         nullif(tx.data->>'createdAt', '')::bigint,
         extract(epoch from tx.created_at) * 1000
       ) as sort_at,
       trip.data as trip,
       listing.data as listing,
       dispute.data as dispute,
       sender.data as sender,
       traveler.data as traveler,
       recipient.data as recipient,
       conversation.id as conversation_id,
       to_jsonb(payment) as payment_record,
       to_jsonb(manual_payout) as manual_payout_record
     from public.wigolink_transactions tx
     left join public.wigolink_trips trip
       on trip.id = tx.data->>'tripId'
     left join public.wigolink_listings listing
       on listing.id = tx.data->>'listingId'
     left join lateral (
       select d.data
       from public.wigolink_disputes d
       where d.data->>'txId' = tx.id
       order by
         (coalesce(d.data->>'status', '') = 'open') desc,
         d.created_at desc
       limit 1
     ) dispute on true
     left join public.wigolink_users sender
       on sender.id = tx.data->>'senderId'
     left join public.wigolink_users traveler
       on traveler.id = tx.data->>'travelerId'
     left join public.wigolink_users recipient
       on recipient.id = tx.data->>'recipientId'
     left join lateral (
       select c.id
       from public.wigolink_conversations c
       where c.data->>'operationId' = tx.id
       order by c.created_at asc, c.id asc
       limit 1
     ) conversation on true
     left join public.operation_payments payment
       on payment.operation_id = tx.id
     left join public.manual_payout_accounts manual_payout
       on manual_payout.user_id = tx.data->>'travelerId'
      and manual_payout.active`;
}

function operationView(
  row,
  user,
  operationCodePublicState = () => ({}),
  disputeView = (value) => value,
) {
  const transaction = row.transaction || {};
  const trip = row.trip || null;
  const listing = row.listing || null;
  const statusMap = {
    accepted: 'paiement_requis',
    sealed: 'collecte_prevue',
    in_transit: 'en_transport',
    disputed: 'litige',
    released: 'termine',
    refunded: 'termine',
    cancelled: 'termine',
  };
  const operationStatus = transaction.operationStatus
    || statusMap[transaction.status]
    || 'attente_confirmation';
  const view = {
    ...transaction,
    sender: publicUser(row.sender),
    traveler: publicUser(row.traveler),
    recipient: publicUser(row.recipient),
    listing,
    operationStatus,
    title: trip
      ? `${trip.from} -> ${trip.to}`
      : listing?.title || 'Envoi en cours',
    trip: trip ? tripView(trip, row.traveler) : null,
    price: transaction.price
      || transaction.escrow?.travelerPay
      || listing?.travelerPay
      || trip?.price
      || 0,
    dispute: row.dispute ? disputeView(row.dispute, transaction) : null,
    paymentDetails: publicPayment(row.payment_record, transaction.payment),
    payout: publicPayout(row.manual_payout_record),
    conversationId: row.conversation_id || null,
  };
  delete view.pickupCode;
  delete view.deliveryCode;
  delete view.securityCodes;
  const isTraveler = user?.id === transaction.travelerId;
  const isSender = user?.id === transaction.senderId;
  view.myRole = isTraveler ? 'traveler' : isSender ? 'sender' : 'recipient';
  view.security = {
    pickup: {
      ...operationCodePublicState(transaction.securityCodes?.pickup),
      canReveal: operationStatus === 'paye' && isTraveler,
      canEnter: operationStatus === 'paye' && isSender,
    },
    delivery: {
      ...operationCodePublicState(transaction.securityCodes?.delivery),
      canReveal: operationStatus === 'en_transport' && isSender,
      canEnter: operationStatus === 'en_transport' && isTraveler,
    },
  };
  return view;
}

function publicPayment(record, snapshot) {
  if (!record && !snapshot) return null;
  if (!record) {
    return {
      currency: snapshot.currency,
      travelerPriceCents: Number(snapshot.travelerPriceCents ?? snapshot.priceCents ?? 0),
      senderFeeCents: Number(snapshot.senderFeeCents || 0),
      travelerFeeCents: Number(snapshot.travelerFeeCents || 0),
      chargedAmountCents: Number(snapshot.chargedAmountCents || 0),
      travelerTransferCents: Number(snapshot.travelerTransferCents || 0),
      platformGrossCents: Number(snapshot.platformGrossCents || 0),
      feePolicyVersion: snapshot.feePolicyVersion,
      paymentStatus: snapshot.paymentStatus || null,
      transferStatus: snapshot.transferStatus || null,
    };
  }
  return {
    currency: record.currency,
    travelerPriceCents: Number(record.traveler_price_cents || 0),
    senderFeeCents: Number(record.sender_fee_cents || 0),
    travelerFeeCents: Number(record.traveler_fee_cents || 0),
    chargedAmountCents: Number(record.charged_amount_cents || 0),
    travelerTransferCents: Number(record.traveler_transfer_cents || 0),
    platformGrossCents: Number(record.platform_gross_cents || 0),
    feePolicyVersion: record.fee_policy_version,
    paymentStatus: record.payment_status,
    transferStatus: record.transfer_status,
  };
}

function publicPayout(manualRecord) {
  if (!stripePaymentsEnabled()) return null;
  if (!manualRecord) {
    return {
      configured: false,
      ready: false,
      status: 'not_configured',
      mode: 'manual',
    };
  }
  return {
    configured: true,
    ready: manualRecord.status === 'verified',
    status: manualRecord.status,
    country: manualRecord.country,
    mode: 'manual',
  };
}

function tripView(trip, traveler) {
  return {
    ...trip,
    departureDate: trip.departureDate || trip.date,
    ticketDate: trip.ticketDate || trip.date,
    transportMode: trip.transportMode === 'car' ? 'car' : 'plane',
    price: Number(trip.price ?? trip.proposedPrice ?? 25),
    currency: trip.currency || 'EUR',
    capacityKg: Number(trip.capacityKg || 0),
    traveler: publicUser(traveler),
  };
}

function publicUser(value) {
  if (!value) return null;
  return {
    id: value.id,
    name: value.name,
    city: value.city,
    kycStatus: value.kycStatus,
    rating: value.rating,
    ratingCount: value.ratingCount,
    completed: value.completed,
    cancelRate: value.cancelRate,
    badges: value.badges,
    photoUrl: value.photoUrl || null,
    isAdmin: !!value.isAdmin,
    createdAt: value.createdAt,
    emailVerified: !!value.emailVerified,
  };
}

function boundedLimit(value) {
  const numeric = Number(value || DEFAULT_LIMIT);
  return Math.max(
    1,
    Math.min(
      MAX_LIMIT,
      Number.isFinite(numeric) ? Math.floor(numeric) : DEFAULT_LIMIT,
    ),
  );
}

function boundedOffset(value) {
  const numeric = Number(value || 0);
  return Math.max(0, Number.isFinite(numeric) ? Math.floor(numeric) : 0);
}

function decodeOperationCursor(value) {
  return decodePageCursor(value, (cursor) => (
    cursor
    && Number.isFinite(Number(cursor.at))
    && Number(cursor.at) >= 0
    && typeof cursor.id === 'string'
    && cursor.id.length > 0
    && cursor.id.length <= 160
  ));
}
