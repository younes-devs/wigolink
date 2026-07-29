import { relationalId } from './relational-id.js';

export function createRelationalAdminReview({
  getPool,
  transitionEscrow,
  notify,
  audit,
  now = Date.now,
  logger = console,
}) {
  return async function review({
    actorId,
    reviewId,
    decision,
  }) {
    const pool = getPool();
    const client = await pool.connect();
    let transaction;
    let dispute;
    try {
      await client.query('begin');
      const reviewResult = await client.query(
        `select data from public.wigofly_review_queue
         where id = $1 for update`,
        [reviewId],
      );
      const item = reviewResult.rows[0]?.data;
      if (!item || item.type !== 'dispute') {
        await client.query('rollback');
        return { handled: false };
      }
      if (item.status === 'closed') {
        await client.query('commit');
        return { handled: true, status: 200, body: { ok: true } };
      }
      const disputeResult = await client.query(
        `select data from public.wigofly_disputes
         where id = $1 for update`,
        [item.refId],
      );
      dispute = disputeResult.rows[0]?.data;
      if (!dispute) {
        await client.query('rollback');
        return {
          handled: true,
          status: 404,
          body: { error: 'Litige introuvable' },
        };
      }
      const transactionResult = await client.query(
        `select data from public.wigofly_transactions
         where id = $1 for update`,
        [dispute.txId],
      );
      transaction = transactionResult.rows[0]?.data;
      if (!transaction) {
        await client.query('rollback');
        return {
          handled: true,
          status: 404,
          body: { error: 'Operation introuvable' },
        };
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
      item.status = 'closed';
      item.decision = decision;
      item.closedAt = resolvedAt;
      item.closedBy = actorId;

      await updateRecord(client, 'wigofly_disputes', dispute);
      await updateRecord(client, 'wigofly_transactions', transaction);
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

    await bestEffort(() => audit(
      actorId,
      `review.dispute.${decision}`,
      'dispute',
      dispute.id,
      {
        reviewId,
        txId: transaction.id,
        escrowState: transaction.escrow?.state || null,
      },
    ), logger);
    await bestEffort(() => notify(
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
    ), logger);
    return { handled: true, status: 200, body: { ok: true } };
  };
}

async function updateRecord(client, table, value) {
  await client.query(
    `update public.${table}
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [value.id, JSON.stringify(value)],
  );
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
