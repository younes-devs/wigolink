import { relationalId } from './relational-id.js';

export function createRelationalAdminReview({
  getPool,
  whitelist = [],
  transitionEscrow,
  notify,
  audit,
  now = Date.now,
  logger = console,
}) {
  const baseCategories = new Set(whitelist.map((category) => category.id));

  return async function review({
    actorId,
    reviewId,
    decision,
    maxQty,
  }) {
    const pool = getPool();
    const client = await pool.connect();
    let outcome;
    try {
      await client.query('begin');
      const item = await lockedRecord(
        client,
        'wigofly_review_queue',
        reviewId,
      );
      if (!item) {
        await client.query('rollback');
        return {
          handled: true,
          status: 404,
          body: { error: 'Introuvable' },
        };
      }
      if (item.status === 'closed') {
        await client.query('commit');
        return { handled: true, status: 200, body: { ok: true } };
      }

      if (item.type === 'listing') {
        outcome = await reviewListing({
          client,
          item,
          actorId,
          decision,
          maxQty,
          baseCategories,
          now,
        });
      } else if (item.type === 'conversation') {
        outcome = await reviewConversation({
          client,
          item,
          actorId,
          decision,
          now,
        });
      } else if (item.type === 'dispute') {
        outcome = await reviewDispute({
          client,
          item,
          actorId,
          decision,
          transitionEscrow,
          now,
        });
      } else {
        await client.query('rollback');
        return { handled: false };
      }

      if (outcome.status !== 200) {
        await client.query('rollback');
        return {
          handled: true,
          status: outcome.status,
          body: outcome.body,
        };
      }

      closeReview(item, { actorId, decision, at: now() });
      await updateRecord(client, 'wigofly_review_queue', item);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_admin_review_failed', {
        reviewId,
        message: error?.message || 'unknown_error',
      });
      return {
        handled: true,
        status: 503,
        body: { error: 'Decision temporairement indisponible.' },
      };
    } finally {
      client.release();
    }

    await bestEffort(
      () => audit(
        actorId,
        outcome.audit.action,
        outcome.audit.targetType,
        outcome.audit.targetId,
        {
          reviewId,
          ...outcome.audit.meta,
        },
      ),
      logger,
    );
    if (outcome.notification) {
      await bestEffort(
        () => notify(...outcome.notification),
        logger,
      );
    }
    return { handled: true, status: 200, body: { ok: true } };
  };
}

async function reviewListing({
  client,
  item,
  actorId,
  decision,
  maxQty,
  baseCategories,
  now,
}) {
  const listing = await lockedRecord(
    client,
    'wigofly_listings',
    item.refId,
  );
  if (!listing) {
    return { status: 404, body: { error: 'Annonce introuvable' } };
  }

  listing.status = decision === 'approve' ? 'published' : 'rejected';
  let promoted = false;
  if (
    decision === 'approve'
    && listing.whitelistVerdict === 'gray'
    && !baseCategories.has(listing.categoryId)
  ) {
    const existing = await client.query(
      `select id
       from public.wigofly_custom_whitelist
       where id = $1
       for update`,
      [listing.categoryId],
    );
    if (!existing.rowCount) {
      const addedAt = now();
      const entry = {
        id: listing.categoryId,
        label: listing.categoryLabel,
        maxQty: String(maxQty || 'Usage personnel (a confirmer)').slice(0, 40),
        icon: listing.icon || 'package',
        addedFrom: listing.id,
        addedAt,
      };
      await client.query(
        `insert into public.wigofly_custom_whitelist
           (id, data, created_at, updated_at)
         values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())
         on conflict (id) do nothing`,
        [entry.id, JSON.stringify(entry), addedAt],
      );
      promoted = true;
    }
  }
  await updateRecord(client, 'wigofly_listings', listing);
  return {
    status: 200,
    audit: {
      action: `review.listing.${decision}`,
      targetType: 'listing',
      targetId: listing.id,
      meta: {
        categoryId: listing.categoryId,
        promoted,
        actorId,
      },
    },
  };
}

async function reviewConversation({
  client,
  item,
  actorId,
  decision,
  now,
}) {
  const conversation = await lockedRecord(
    client,
    'wigofly_conversations',
    item.refId,
  );
  if (!conversation) {
    return {
      status: 404,
      body: { error: 'Conversation introuvable' },
    };
  }
  const moderatedAt = now();
  conversation.moderationStatus = decision || 'reviewed';
  conversation.moderatedAt = moderatedAt;
  conversation.moderatedBy = actorId;
  conversation.reports = (conversation.reports || []).map((report) => ({
    ...report,
    reviewedAt: moderatedAt,
    reviewedBy: actorId,
    decision: conversation.moderationStatus,
  }));
  await updateRecord(client, 'wigofly_conversations', conversation);
  return {
    status: 200,
    audit: {
      action: `review.conversation.${conversation.moderationStatus}`,
      targetType: 'conversation',
      targetId: conversation.id,
      meta: { reportCount: conversation.reports.length },
    },
  };
}

async function reviewDispute({
  client,
  item,
  actorId,
  decision,
  transitionEscrow,
  now,
}) {
  const dispute = await lockedRecord(
    client,
    'wigofly_disputes',
    item.refId,
  );
  if (!dispute) {
    return { status: 404, body: { error: 'Litige introuvable' } };
  }
  const transaction = await lockedRecord(
    client,
    'wigofly_transactions',
    dispute.txId,
  );
  if (!transaction) {
    return { status: 404, body: { error: 'Operation introuvable' } };
  }

  const resolvedAt = now();
  dispute.status = 'resolved';
  dispute.resolution = decision;
  dispute.resolvedAt = resolvedAt;
  transaction.status = decision === 'release_traveler'
    ? 'released'
    : 'refunded';
  transaction.operationStatus = 'termine';
  transitionEscrow(
    transaction.escrow,
    decision === 'release_traveler' ? 'released' : 'refunded',
    resolvedAt,
  );
  transaction.events = Array.isArray(transaction.events)
    ? transaction.events
    : [];
  transaction.events.push({
    id: relationalId('e'),
    type: 'dispute_resolved',
    actorId,
    meta: { decision },
    at: resolvedAt,
  });

  await updateRecord(client, 'wigofly_disputes', dispute);
  await updateRecord(client, 'wigofly_transactions', transaction);
  return {
    status: 200,
    audit: {
      action: `review.dispute.${decision}`,
      targetType: 'dispute',
      targetId: dispute.id,
      meta: {
        txId: transaction.id,
        escrowState: transaction.escrow?.state || null,
      },
    },
    notification: [
      [
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ],
      {
        key: decision === 'release_traveler'
          ? 'dispute.resolved.traveler'
          : 'dispute.resolved.sender',
      },
      transaction.id,
      'security',
      'litige',
    ],
  };
}

async function lockedRecord(client, table, id) {
  const result = await client.query(
    `select data
     from public.${table}
     where id = $1
     for update`,
    [id],
  );
  return result.rows[0]?.data || null;
}

async function updateRecord(client, table, value) {
  await client.query(
    `update public.${table}
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [value.id, JSON.stringify(value)],
  );
}

function closeReview(item, { actorId, decision, at }) {
  item.status = 'closed';
  item.decision = decision;
  item.closedAt = at;
  item.closedBy = actorId;
}

async function bestEffort(task, logger) {
  try {
    await task();
  } catch (error) {
    logger.error('relational_admin_review_side_effect_failed', {
      message: error?.message || 'unknown_error',
    });
  }
}
