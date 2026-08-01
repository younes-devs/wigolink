import { relationalId } from './relational-id.js';
import {
  ensureConversationMembers,
} from './relational-conversation-members.js';

export function relationalOperationWritesEnabled(env = process.env) {
  return env.RELATIONAL_OPERATION_WRITES === 'true';
}

export function createRelationalOperationWriter({
  getPool,
  getOperation,
  getConversation,
  operationCodePublicState,
  disputeView,
  createEscrow,
  transitionEscrow,
  issueOperationCode,
  verifyOperationCode,
  notify,
  audit,
  validPhotos,
  today,
  now = Date.now,
  logger = console,
  memberStateEnabled = () => false,
}) {
  async function accept({ user, tripId, body = {} }) {
    if (user.kycStatus !== 'verified') {
      return response(403, {
        error: "Verification d'identite requise",
        needsKyc: true,
      });
    }
    const pool = getPool();
    const client = await pool.connect();
    let transaction;
    let conversation;
    try {
      await client.query('begin');
      const tripResult = await client.query(
        `select data from public.wigolink_trips where id = $1 for update`,
        [tripId],
      );
      const trip = tripResult.rows[0]?.data;
      if (!trip) return await rollbackResponse(client, 404, { error: 'Trajet introuvable' });
      const departureDate = trip.departureDate || trip.ticketDate || trip.date;
      if ((trip.status || 'published') !== 'published' || departureDate < today()) {
        return await rollbackResponse(client, 400, {
          error: 'Trajet expire ou indisponible',
        });
      }
      if (trip.travelerId === user.id) {
        return await rollbackResponse(client, 400, {
          error: 'Vous ne pouvez pas accepter votre propre trajet',
        });
      }

      const duplicateResult = await client.query(
        `select data from public.wigolink_transactions
         where data->>'tripId' = $1
           and data->>'senderId' = $2
           and coalesce(data->>'status', '') not in ('cancelled', 'refunded', 'released')
         order by created_at desc
         limit 1
         for update`,
        [trip.id, user.id],
      );
      const duplicate = duplicateResult.rows[0]?.data;
      if (duplicate) {
        const conversationResult = await client.query(
          `select id from public.wigolink_conversations
           where data->>'operationId' = $1
             and data->'participantIds' ? $2
           limit 1`,
          [duplicate.id, user.id],
        );
        await client.query('commit');
        return operationResponse({
          pool,
          user,
          transactionId: duplicate.id,
          conversationId: conversationResult.rows[0]?.id,
          getOperation,
          getConversation,
          operationCodePublicState,
          disputeView,
          today,
        });
      }

      const capacityKg = Number(trip.capacityKg || 0);
      const basePrice = Number(trip.price ?? trip.proposedPrice ?? 25);
      const shipment = shipmentFor(body, capacityKg, basePrice);
      if (shipment.error) return await rollbackResponse(client, 400, shipment.error);

      const createdAt = now();
      const commission = money(shipment.price * 0.18);
      transaction = {
        id: relationalId('tx'),
        tripId: trip.id,
        listingId: null,
        senderId: user.id,
        travelerId: trip.travelerId,
        recipientId: user.id,
        status: 'accepted',
        operationStatus: 'attente_confirmation',
        price: shipment.price,
        currency: trip.currency || 'EUR',
        shipmentType: shipment.type,
        documentCount: shipment.documentCount,
        weightKg: shipment.weightKg,
        descriptionParcel: String(body.descriptionParcel || '').trim().slice(0, 500),
        paymentStatus: 'pending',
        escrow: createEscrow({
          travelerPay: shipment.price,
          commission,
        }),
        securityCodes: {},
        events: [],
        createdAt,
      };
      transaction.escrow.state = 'pending';
      delete transaction.escrow.heldAt;
      addEvent(transaction, 'trip_accepted', user.id, {
        tripId: trip.id,
        price: shipment.price,
        shipmentType: shipment.type,
        documentCount: shipment.documentCount,
        weightKg: shipment.weightKg,
      }, createdAt);
      await insertRecord(client, 'wigolink_transactions', transaction);

      conversation = {
        id: relationalId('conv'),
        participantIds: [user.id, trip.travelerId],
        tripId: trip.id,
        operationId: transaction.id,
        createdAt,
        lastMessageAt: createdAt,
        archivedBy: [],
        pinnedBy: [],
        deletedBy: [],
      };
      await insertRecord(client, 'wigolink_conversations', conversation);
      if (memberStateEnabled()) {
        await ensureConversationMembers(client, conversation, { now });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_operation_accept_failed', {
        message: error?.message || 'unknown_error',
      });
      return unavailable();
    } finally {
      client.release();
    }

    await bestEffort(() => notify(
      [transaction.travelerId],
      {
        key: 'offer.received',
        params: {
          name: user.name,
          title: `${transaction.tripId}`,
        },
      },
      transaction.id,
      'messages',
      'messages',
    ), logger);
    return operationResponse({
      pool,
      user,
      transactionId: transaction.id,
      conversationId: conversation.id,
      getOperation,
      getConversation,
      operationCodePublicState,
      disputeView,
      today,
    });
  }

  async function pay(context) {
    return mutate(context, {
      authorize: (tx, user) => tx.senderId === user.id
        ? null
        : forbidden("Paiement reserve a l'expediteur"),
      validate: (tx) => tx.operationStatus === 'paiement_requis'
        ? null
        : invalid('Le paiement attend la confirmation du voyageur'),
      apply(tx, user) {
        tx.operationStatus = 'paye';
        tx.paymentStatus = 'paid';
        transitionEscrow(tx.escrow, 'held');
        addEvent(tx, 'operation_paid', user.id, {}, now());
      },
    });
  }

  async function issueCode(context, kind) {
    const travelerCode = kind === 'pickup';
    const result = await mutate(context, {
      authorize: (tx, user) => (
        (travelerCode ? tx.travelerId : tx.senderId) === user.id
          ? null
          : forbidden(travelerCode
            ? 'Ce code est reserve au voyageur'
            : "Ce code est reserve a l'expediteur")
      ),
      validate: (tx) => tx.operationStatus === (travelerCode ? 'paye' : 'en_transport')
        ? null
        : invalid(travelerCode
          ? 'Le code de remise est disponible apres le paiement.'
          : 'Le code de livraison est disponible apres la prise en charge.'),
      apply(tx, user) {
        const code = issueOperationCode(tx, kind, user.id);
        addEvent(tx, `${kind}_code_issued`, user.id, {
          recipientRole: travelerCode ? 'traveler' : 'sender',
        }, now());
        return {
          code,
          expiresAt: tx.securityCodes[kind].expiresAt,
          auditAction: `operation_${kind}_code_issued`,
          auditMeta: {
            recipientRole: travelerCode ? 'traveler' : 'sender',
          },
        };
      },
    });
    return result;
  }

  async function confirmCode(context, kind) {
    const pickup = kind === 'pickup';
    return mutate(context, {
      authorize: (tx, user) => (
        (pickup ? tx.senderId : tx.travelerId) === user.id
          ? null
          : forbidden(pickup
            ? "La remise doit etre confirmee par l'expediteur"
            : 'La livraison doit etre confirmee par le voyageur')
      ),
      validate: (tx) => tx.operationStatus === (pickup ? 'paye' : 'en_transport')
        ? null
        : invalid(pickup
          ? 'La remise ne peut pas etre confirmee a cette etape.'
          : 'La livraison ne peut pas etre confirmee a cette etape.'),
      apply(tx, user, body) {
        const verification = verifyOperationCode(tx, kind, body?.code);
        if (!verification.ok) {
          addEvent(tx, `${kind}_code_failed`, user.id, {
            locked: verification.status === 429,
          }, now());
          return {
            error: response(verification.status, { error: verification.error }),
            persistOnError: true,
            auditAction: `operation_${kind}_code_failed`,
            auditMeta: { locked: verification.status === 429 },
          };
        }
        tx.securityCodes[kind].verifiedAt = now();
        tx.securityCodes[kind].verifiedBy = user.id;
        if (pickup) {
          tx.operationStatus = 'en_transport';
          tx.status = 'in_transit';
        } else {
          tx.operationStatus = 'termine';
          tx.status = 'released';
          transitionEscrow(tx.escrow, 'released');
        }
        addEvent(tx, `${kind}_code_verified`, user.id, {
          ...(pickup ? { proof: 'traveler_code' } : { deliveryConfirmed: true }),
        }, now());
        return {
          auditAction: `operation_${kind}_code_verified`,
          auditMeta: pickup
            ? { proof: 'traveler_code' }
            : { deliveryConfirmed: true },
          incrementCompleted: !pickup,
          notification: {
            users: pickup
              ? [tx.travelerId]
              : [tx.senderId, tx.travelerId],
            payload: { key: pickup ? 'tx.pickedUp' : 'tx.delivered.sender' },
            type: 'shipments',
            section: 'suivi',
          },
        };
      },
    });
  }

  async function confirm(context) {
    return mutate(context, {
      authorize: (tx, user) => tx.travelerId === user.id
        ? null
        : forbidden('Confirmation reservee au voyageur'),
      validate: (tx) => tx.operationStatus === 'attente_confirmation'
        ? null
        : invalid('Aucune confirmation disponible a cette etape'),
      apply(tx, user) {
        tx.operationStatus = 'paiement_requis';
        addEvent(tx, 'traveler_confirmed', user.id, {}, now());
      },
    });
  }

  async function reject(context) {
    return cancelMutation(context, {
      role: 'traveler',
      allowed: ['attente_confirmation'],
      event: 'traveler_rejected',
      notificationKey: 'offer.refused',
    });
  }

  async function cancel(context) {
    return cancelMutation(context, {
      role: 'sender',
      allowed: ['attente_confirmation', 'paiement_requis'],
      event: 'sender_cancelled',
      notificationKey: 'offer.withdrawn',
    });
  }

  async function cancelMutation(context, {
    role,
    allowed,
    event,
    notificationKey,
  }) {
    return mutate(context, {
      authorize: (tx, user) => tx[`${role}Id`] === user.id
        ? null
        : forbidden(role === 'traveler'
          ? 'Refus reserve au voyageur'
          : "Annulation reservee a l'expediteur"),
      validate: (tx) => allowed.includes(tx.operationStatus)
        ? null
        : invalid(role === 'traveler'
          ? 'Cette operation ne peut plus etre refusee'
          : 'Cette operation ne peut plus etre annulee'),
      apply(tx, user, body) {
        tx.status = 'cancelled';
        tx.operationStatus = 'termine';
        tx.paymentStatus = 'cancelled';
        transitionEscrow(tx.escrow, 'refunded');
        addEvent(tx, event, user.id, {
          reason: String(body?.reason || '').trim().slice(0, 300),
        }, now());
        return {
          notification: {
            users: [role === 'traveler' ? tx.senderId : tx.travelerId],
            payload: role === 'traveler'
              ? { key: notificationKey }
              : { key: notificationKey, params: { name: user.name } },
            type: 'transactions',
            section: 'suivi',
          },
        };
      },
    });
  }

  async function openDispute(context) {
    const pool = getPool();
    const client = await pool.connect();
    let tx;
    let dispute;
    try {
      await client.query('begin');
      tx = await lockedTransaction(client, context.operationId);
      const access = partyError(tx, context.user);
      if (access) return await rollbackResult(client, access);
      if (tx.operationStatus === 'termine') {
        return await rollbackResponse(client, 400, {
          error: 'Operation deja terminee',
        });
      }
      const existing = await client.query(
        `select data from public.wigolink_disputes
         where data->>'txId' = $1 and data->>'status' = 'open'
         order by created_at desc limit 1 for update`,
        [tx.id],
      );
      dispute = existing.rows[0]?.data;
      if (!dispute) {
        const createdAt = now();
        dispute = {
          id: relationalId('d'),
          txId: tx.id,
          openedBy: context.user.id,
          reason: String(
            context.body?.reason || 'Probleme signale depuis En cours',
          ).trim().slice(0, 500),
          evidence: [],
          status: 'open',
          createdAt,
        };
        tx.status = 'disputed';
        tx.operationStatus = 'litige';
        transitionEscrow(tx.escrow, 'frozen');
        addEvent(tx, 'dispute_opened', context.user.id, {
          reason: dispute.reason,
        }, createdAt);
        await updateRecord(client, 'wigolink_transactions', tx);
        await insertRecord(client, 'wigolink_disputes', dispute);
        await insertRecord(client, 'wigolink_review_queue', {
          id: relationalId('review'),
          type: 'dispute',
          refId: dispute.id,
          createdAt,
        });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_dispute_write_failed', {
        message: error?.message || 'unknown_error',
      });
      return unavailable();
    } finally {
      client.release();
    }
    await bestEffort(() => notify(
      [tx.senderId, tx.travelerId].filter((id) => id !== context.user.id),
      { key: 'dispute.opened' },
      tx.id,
      'security',
      'litige',
    ), logger);
    const result = await operationResponse({
      pool,
      user: context.user,
      transactionId: tx.id,
      getOperation,
      operationCodePublicState,
      disputeView,
      today,
    });
    return response(result.status, {
      ...result.body,
      dispute: result.body.operation?.dispute || disputeView(dispute, tx),
    });
  }

  async function addEvidence(context) {
    const text = String(context.body?.text || '').trim().slice(0, 2000);
    const photo = context.body?.photo;
    if (!text && !photo) {
      return response(400, { error: 'Ajoutez un commentaire ou une photo' });
    }
    if (photo && !validPhotos([photo])) {
      return response(400, { error: 'Photo invalide' });
    }
    return mutate(context, {
      validate: (tx) => tx.operationStatus === 'litige'
        ? null
        : invalid('Aucun litige ouvert sur cette operation'),
      async apply(tx, user, body, client) {
        const result = await client.query(
          `select data from public.wigolink_disputes
           where data->>'txId' = $1 and data->>'status' = 'open'
           order by created_at desc limit 1 for update`,
          [tx.id],
        );
        const dispute = result.rows[0]?.data;
        if (!dispute) {
          return { error: response(400, {
            error: 'Aucun litige ouvert sur cette operation',
          }) };
        }
        dispute.evidence = Array.isArray(dispute.evidence) ? dispute.evidence : [];
        dispute.evidence.push({
          by: user.id,
          text: text || null,
          photo: photo || null,
          at: now(),
        });
        await updateRecord(client, 'wigolink_disputes', dispute);
        addEvent(tx, 'evidence_added', user.id, {}, now());
      },
    });
  }

  async function mutate(context, rules) {
    const pool = getPool();
    const client = await pool.connect();
    let tx;
    let effect = {};
    try {
      await client.query('begin');
      tx = await lockedTransaction(client, context.operationId);
      const access = partyError(tx, context.user);
      if (access) return await rollbackResult(client, access);
      const authorization = rules.authorize?.(tx, context.user);
      if (authorization) return await rollbackResult(client, authorization);
      const validation = rules.validate?.(tx, context.user);
      if (validation) return await rollbackResult(client, validation);
      effect = await rules.apply(tx, context.user, context.body || {}, client) || {};
      if (effect.error && !effect.persistOnError) {
        return await rollbackResult(client, effect.error);
      }
      await updateRecord(client, 'wigolink_transactions', tx);
      if (effect.incrementCompleted) {
        await incrementCompleted(client, tx.senderId);
        await incrementCompleted(client, tx.travelerId);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_operation_write_failed', {
        operationId: context.operationId,
        message: error?.message || 'unknown_error',
      });
      return unavailable();
    } finally {
      client.release();
    }
    if (effect.auditAction) {
      await bestEffort(() => audit(
        context.user.id,
        effect.auditAction,
        'transaction',
        tx.id,
        effect.auditMeta || {},
      ), logger);
    }
    if (effect.notification) {
      await bestEffort(() => notify(
        effect.notification.users,
        effect.notification.payload,
        tx.id,
        effect.notification.type,
        effect.notification.section,
      ), logger);
    }
    if (effect.error) return effect.error;
    const result = await operationResponse({
      pool,
      user: context.user,
      transactionId: tx.id,
      getOperation,
      operationCodePublicState,
      disputeView,
      today,
    });
    return response(result.status, {
      ...(effect.code ? { code: effect.code } : {}),
      ...(effect.expiresAt ? { expiresAt: effect.expiresAt } : {}),
      ...result.body,
    });
  }

  return {
    accept,
    pay,
    issuePickupCode: (context) => issueCode(context, 'pickup'),
    issueDeliveryCode: (context) => issueCode(context, 'delivery'),
    confirmPickup: (context) => confirmCode(context, 'pickup'),
    confirmDelivery: (context) => confirmCode(context, 'delivery'),
    confirm,
    reject,
    cancel,
    openDispute,
    addEvidence,
  };
}

function shipmentFor(body, capacityKg, basePrice) {
  const type = body.shipmentType === 'document' ? 'document' : 'parcel';
  if (type === 'document') {
    const documentCount = Number(body.documentCount);
    if (!Number.isInteger(documentCount) || documentCount < 1 || documentCount > 20) {
      return { error: { error: 'Indiquez entre 1 et 20 documents.' } };
    }
    return {
      type,
      documentCount,
      weightKg: 0,
      price: documentCount * 3,
    };
  }
  const weightKg = Number(body.weightKg ?? capacityKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > capacityKg) {
    return {
      error: {
        error: `Le colis doit peser entre 0 et ${capacityKg} kg.`,
      },
    };
  }
  return {
    type,
    documentCount: null,
    weightKg,
    price: money((basePrice / capacityKg) * weightKg),
  };
}

async function operationResponse({
  pool,
  user,
  transactionId,
  conversationId,
  getOperation,
  getConversation,
  operationCodePublicState,
  disputeView,
  today,
}) {
  const result = await getOperation({
    pool,
    user,
    id: transactionId,
    operationCodePublicState,
    disputeView,
  });
  if (!conversationId || !getConversation || result.status !== 200) return result;
  const conversation = await getConversation({
    pool,
    user,
    id: conversationId,
    today: today(),
  });
  return response(result.status, {
    ...result.body,
    conversation: conversation?.conversation || { id: conversationId },
  });
}

async function lockedTransaction(client, id) {
  const result = await client.query(
    `select data from public.wigolink_transactions where id = $1 for update`,
    [id],
  );
  return result.rows[0]?.data || null;
}

function partyError(tx, user) {
  if (!tx || ![tx.senderId, tx.travelerId, tx.recipientId].includes(user.id)) {
    return response(404, { error: 'Operation introuvable' });
  }
  return null;
}

async function insertRecord(client, table, value) {
  await client.query(
    `insert into public.${table} (id, data, created_at, updated_at)
     values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
    [value.id, JSON.stringify(value), value.createdAt || Date.now()],
  );
}

async function updateRecord(client, table, value) {
  await client.query(
    `update public.${table} set data = $2::jsonb, updated_at = now() where id = $1`,
    [value.id, JSON.stringify(value)],
  );
}

async function incrementCompleted(client, userId) {
  await client.query(
    `update public.wigolink_users
     set data = jsonb_set(
       case
         when coalesce((data->>'completed')::int, 0) + 1 >= 5
           and not (coalesce(data->'badges', '[]'::jsonb) ? 'voyageur-confirme')
         then jsonb_set(
           data,
           '{badges}',
           coalesce(data->'badges', '[]'::jsonb) || '"voyageur-confirme"'::jsonb
         )
         else data
       end,
       '{completed}',
       to_jsonb(coalesce((data->>'completed')::int, 0) + 1)
     ),
     updated_at = now()
     where id = $1`,
    [userId],
  );
}

function addEvent(tx, type, actorId, meta, at) {
  tx.events = Array.isArray(tx.events) ? tx.events : [];
  tx.events.push({
    id: relationalId('e'),
    type,
    actorId,
    meta,
    at,
  });
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function invalid(error) {
  return response(400, { error });
}

function forbidden(error) {
  return response(403, { error });
}

function response(status, body) {
  return { status, body };
}

function unavailable() {
  return response(503, {
    error: 'Operation temporairement indisponible. Reessayez.',
  });
}

async function rollbackResponse(client, status, body) {
  await client.query('rollback');
  return response(status, body);
}

async function rollbackResult(client, result) {
  await client.query('rollback');
  return result;
}

async function bestEffort(task, logger) {
  try {
    await task();
  } catch (error) {
    logger.error('relational_operation_side_effect_failed', {
      message: error?.message || 'unknown_error',
    });
  }
}
