import { relationalId } from './relational-id.js';
import {
  ensureConversationMembers,
} from './relational-conversation-members.js';

const SAFETY_WINDOW_MS = 10 * 60 * 1000;
const SAFETY_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SAFETY_COOLDOWN_MS = 30 * 60 * 1000;
const SAFETY_STRIKE_LIMIT = 3;
const LOCATION_EXPIRY_MINUTES = new Set([30, 120]);
const MESSAGE_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const REPORT_REASON_CODES = new Set([
  'external_payment',
  'abuse',
  'suspicious',
  'off_platform',
  'other',
]);

export function relationalMessageWritesEnabled(env = process.env) {
  return env.RELATIONAL_MESSAGE_WRITES === 'true';
}

export function createRelationalMessageWriter({
  getPool,
  getConversation,
  validPhotos,
  analyzeSafety,
  safetyError,
  messageMedia,
  allowInlineMediaFallback = true,
  broadcastConversation,
  memberStateEnabled = () => false,
  newId = relationalId,
  now = Date.now,
  logger = console,
}) {
  async function send({ user, conversationId, body = {}, today }) {
    const pool = getPool();
    const initial = await conversationContext(pool, conversationId, user.id);
    if (!initial) return response(404, { error: 'Conversation introuvable' });

    const prepared = prepareMessage({
      body,
      conversation: initial.conversation,
      operation: initial.operation,
      validPhotos,
      now,
    });
    if (prepared.error) return prepared;
    if (isBlocked(initial.conversation, user, initial.other)) {
      return response(403, {
        code: 'conversation_blocked',
        error: 'Cette conversation est bloquee. Aucun nouveau message ne peut etre envoye.',
      });
    }
    if (user.messageSafetyBlockedUntil && user.messageSafetyBlockedUntil > now()) {
      return response(429, safetyError({
        analysis: { categories: ['repeated_attempts'], severity: 'high' },
        cooldownUntil: user.messageSafetyBlockedUntil,
      }));
    }

    const existing = prepared.clientId
      ? await existingMessage(pool, conversationId, user.id, prepared.clientId)
      : null;
    if (existing) {
      return successfulMessage({
        pool,
        getConversation,
        conversationId,
        user,
        message: existing,
        today,
      });
    }

    const media = await storeAttachments({
      attachments: prepared.attachments,
      conversationId,
      userId: user.id,
      pool,
      messageId: prepared.messageId,
      messageMedia,
      allowInlineMediaFallback,
      newId,
      logger,
    });
    if (media.error) return media;

    const client = await pool.connect();
    try {
      await client.query('begin');
      const locked = await conversationContext(client, conversationId, user.id, { lock: true });
      if (!locked) {
        await client.query('rollback');
        await removeStoredMedia(messageMedia, media.storagePaths);
        return response(404, { error: 'Conversation introuvable' });
      }
      if (isBlocked(locked.conversation, user, locked.other)) {
        await client.query('rollback');
        await removeStoredMedia(messageMedia, media.storagePaths);
        return response(403, {
          code: 'conversation_blocked',
          error: 'Cette conversation est bloquee. Aucun nouveau message ne peut etre envoye.',
        });
      }

      if (prepared.clientId) {
        const duplicate = await existingMessage(
          client,
          conversationId,
          user.id,
          prepared.clientId,
        );
        if (duplicate) {
          await client.query('rollback');
          await removeStoredMedia(messageMedia, media.storagePaths);
          return successfulMessage({
            pool,
            getConversation,
            conversationId,
            user,
            message: duplicate,
            today,
          });
        }
      }

      const recent = await client.query(
        `select text from public.messages
         where conversation_id = $1 and from_id = $2
           and at > to_timestamp($3 / 1000.0)
         order by at desc
         limit 4`,
        [conversationId, user.id, now() - SAFETY_WINDOW_MS],
      );
      const recentText = recent.rows.reverse().map((row) => row.text || '').join(' ');
      const safety = analyzeSafety(
        `${recentText} ${prepared.text} ${prepared.location?.label || ''} ${prepared.location?.city || ''}`,
      );
      if (safety.blocked) {
        const result = await persistSafetyAttempt({
          client,
          user,
          conversation: locked.conversation,
          analysis: safety,
          newId,
          now,
        });
        await client.query('commit');
        await removeStoredMedia(messageMedia, media.storagePaths);
        return response(
          result.cooldownUntil ? 429 : 422,
          safetyError({
            analysis: safety,
            cooldownUntil: result.cooldownUntil,
          }),
        );
      }

      const createdAt = now();
      const message = {
        id: media.messageId,
        clientId: prepared.clientId,
        conversationId,
        txId: locked.conversation.operationId || null,
        from: user.id,
        text: prepared.text,
        flagged: false,
        flagReason: null,
        type: prepared.location
          ? 'location'
          : media.attachments.length
            ? 'attachment'
            : 'text',
        attachments: media.attachments,
        location: prepared.location,
        deliveryStatus: 'sent',
        readBy: [user.id],
        at: createdAt,
        createdAt,
        updatedAt: createdAt,
      };
      await client.query(
        `insert into public.messages
           (id, tx_id, conversation_id, from_id, client_id, text, flagged, at, data)
         values ($1, $2, $3, $4, $5, $6, false, to_timestamp($7 / 1000.0), $8::jsonb)`,
        [
          message.id,
          message.txId,
          conversationId,
          user.id,
          message.clientId,
          message.text,
          createdAt,
          JSON.stringify(message),
        ],
      );
      if (media.reservationIds.length) {
        await client.query(
          `delete from public.wigolink_runtime_records
           where kind = 'message_upload' and id = any($1::text[])`,
          [media.reservationIds],
        );
      }

      const conversation = {
        ...locked.conversation,
        lastMessageAt: createdAt,
        ...(memberStateEnabled()
          ? {}
          : {
            archivedBy: (locked.conversation.archivedBy || [])
              .filter((participantId) => participantId !== user.id),
            deletedBy: [],
          }),
      };
      await client.query(
        `update public.wigolink_conversations
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [conversationId, JSON.stringify(conversation)],
      );
      if (memberStateEnabled()) {
        await ensureConversationMembers(client, conversation, { now });
        await client.query(
          `update public.wigolink_conversation_members
           set deleted = false,
               archived = case when user_id = $2 then false else archived end,
               updated_at = now()
           where conversation_id = $1`,
          [conversationId, user.id],
        );
      }
      await client.query('commit');

      broadcastConversation(conversation, {
        type: 'message',
        messageId: message.id,
        from: user.id,
      });
      return successfulMessage({
        pool,
        getConversation,
        conversationId,
        user,
        message,
        today,
      });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      await removeStoredMedia(messageMedia, media.storagePaths);
      if (isUniqueViolation(error) && prepared.clientId) {
        const duplicate = await existingMessage(
          pool,
          conversationId,
          user.id,
          prepared.clientId,
        );
        if (duplicate) {
          return successfulMessage({
            pool,
            getConversation,
            conversationId,
            user,
            message: duplicate,
            today,
          });
        }
      }
      logger.error('relational_message_write_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Message temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function createAttachmentUpload({ user, conversationId, body = {} }) {
    if (!messageMedia?.enabled) {
      return response(503, {
        error: 'Le stockage des images est temporairement indisponible',
      });
    }
    const context = await conversationContext(
      getPool(),
      conversationId,
      user.id,
    );
    if (!context) {
      return response(404, { error: 'Conversation introuvable' });
    }
    if (isBlocked(context.conversation, user, context.other)) {
      return response(403, {
        code: 'conversation_blocked',
        error: 'Cette conversation est bloquee.',
      });
    }
    const mime = String(body.mime || '').toLowerCase();
    if (!DIRECT_UPLOAD_MIMES.has(mime)) {
      return response(400, { error: 'Type image invalide' });
    }
    const declaredSize = Number(body.size || 0);
    if (
      !Number.isFinite(declaredSize)
      || declaredSize <= 0
      || declaredSize > DIRECT_UPLOAD_MAX_BYTES
    ) {
      return response(400, { error: 'Image trop volumineuse' });
    }
    const attachmentId = newId('att');
    try {
      const proxyDataUrl = String(body.dataUrl || '');
      const proxySize = proxyDataUrl
        ? directDataUrlSize(proxyDataUrl, mime)
        : null;
      if (proxyDataUrl && (!proxySize || proxySize > DIRECT_UPLOAD_MAX_BYTES)) {
        return response(400, { error: 'Image invalide ou trop volumineuse' });
      }
      const upload = proxyDataUrl
        ? await messageMedia.storeDataUrl({
          conversationId,
          attachmentId,
          dataUrl: proxyDataUrl,
        })
        : await messageMedia.createSignedUpload({
          conversationId,
          attachmentId,
          mime,
        });
      if (!upload?.storagePath) throw new Error('Stockage image indisponible');
      const storedSize = proxySize || declaredSize;
      await getPool().query(
        `insert into public.wigolink_runtime_records
           (kind, id, data, expires_at, updated_at)
         values ('message_upload', $1, $2::jsonb, to_timestamp($3 / 1000.0), now())
         on conflict (kind, id) do update
         set data = excluded.data,
             expires_at = excluded.expires_at,
             updated_at = now()`,
        [
          attachmentId,
          JSON.stringify({
            attachmentId,
            conversationId,
            userId: user.id,
            storagePath: upload.storagePath,
            mime,
            declaredSize: storedSize,
            createdAt: now(),
          }),
          now() + MESSAGE_UPLOAD_TTL_MS,
        ],
      );
      return response(200, {
        upload: {
          attachmentId,
          storagePath: upload.storagePath,
          ...(upload.signedUrl ? { signedUrl: upload.signedUrl } : {}),
          uploaded: !!proxyDataUrl,
          mime,
          size: storedSize,
          maxBytes: DIRECT_UPLOAD_MAX_BYTES,
        },
      });
    } catch (error) {
      logger.error('relational_message_upload_url_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Upload temporairement indisponible. Reessayez.',
      });
    }
  }

  async function createConversation({ user, body = {}, today }) {
    const pool = getPool();
    const client = await pool.connect();
    let conversationId;
    try {
      await client.query('begin');
      const tripId = cleanId(body.tripId);
      const operationId = cleanId(body.operationId);
      let otherId = cleanId(body.userId);

      if (tripId) {
        const tripResult = await client.query(
          'select data from public.wigolink_trips where id = $1 limit 1',
          [tripId],
        );
        const trip = tripResult.rows[0]?.data;
        if (!trip) {
          await client.query('rollback');
          return response(404, { error: 'Trajet introuvable' });
        }
        otherId = cleanId(trip.travelerId);
      }

      if (operationId) {
        const operationResult = await client.query(
          'select data from public.wigolink_transactions where id = $1 limit 1',
          [operationId],
        );
        const operation = operationResult.rows[0]?.data;
        if (!operation || !operationPartyIds(operation).includes(user.id)) {
          await client.query('rollback');
          return response(404, { error: 'Operation introuvable' });
        }
        otherId = operation.senderId === user.id
          ? cleanId(operation.travelerId)
          : cleanId(operation.senderId);
      }

      if (!otherId || otherId === user.id) {
        await client.query('rollback');
        return response(400, { error: 'Destinataire invalide' });
      }
      const recipient = await client.query(
        'select 1 from public.wigolink_users where id = $1 limit 1',
        [otherId],
      );
      if (!recipient.rowCount) {
        await client.query('rollback');
        return response(400, { error: 'Destinataire invalide' });
      }

      const participantIds = [user.id, otherId].sort();
      const conversationKey = operationId
        ? `operation:${operationId}`
        : JSON.stringify([participantIds, tripId || null]);
      await client.query(
        'select pg_advisory_xact_lock(hashtext($1))',
        [conversationKey],
      );
      const existing = operationId
        ? await client.query(
          `select id, data
           from public.wigolink_conversations
           where data->>'operationId' = $1
           order by created_at asc, id asc
           limit 1
           for update`,
          [operationId],
        )
        : await client.query(
          `select id, data
           from public.wigolink_conversations
           where data->'participantIds' = $1::jsonb
             and coalesce(data->>'tripId', '') = $2
             and coalesce(data->>'operationId', '') = ''
           order by created_at asc, id asc
           limit 1
           for update`,
          [JSON.stringify(participantIds), tripId || ''],
        );
      const createdAt = now();
      if (existing.rows[0]) {
        conversationId = existing.rows[0].id;
        const conversation = {
          ...existing.rows[0].data,
          ...(memberStateEnabled()
            ? {}
            : {
              deletedBy: (existing.rows[0].data.deletedBy || [])
                .filter((id) => id !== user.id),
            }),
        };
        await updateConversation(client, conversation);
        if (memberStateEnabled()) {
          await ensureConversationMembers(client, conversation, { now });
          await client.query(
            `update public.wigolink_conversation_members
             set deleted = false, updated_at = now()
             where conversation_id = $1 and user_id = $2`,
            [conversation.id, user.id],
          );
        }
      } else {
        const conversation = {
          id: newId('conv'),
          participantIds,
          tripId: tripId || null,
          operationId: operationId || null,
          createdAt,
          lastMessageAt: createdAt,
          archivedBy: [],
          pinnedBy: [],
          deletedBy: [],
          blockedBy: [],
        };
        conversationId = conversation.id;
        await client.query(
          `insert into public.wigolink_conversations
             (id, data, created_at, updated_at)
           values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
          [conversation.id, JSON.stringify(conversation), createdAt],
        );
        if (memberStateEnabled()) {
          await ensureConversationMembers(client, conversation, { now });
        }
      }
      await client.query('commit');
      const detail = await getConversation({
        pool,
        user,
        id: conversationId,
        today,
        memberStateEnabled: memberStateEnabled(),
      });
      return response(200, { conversation: detail?.conversation || null });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_conversation_create_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Conversation temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function reportConversation({
    user,
    conversationId,
    body = {},
    today,
  }) {
    const reasonCode = REPORT_REASON_CODES.has(String(body.reasonCode || 'other').trim())
      ? String(body.reasonCode || 'other').trim()
      : 'other';
    const reason = String(body.reason || '').trim().slice(0, 500);
    const comment = String(body.comment || '').trim().slice(0, 500);
    if (!reason) return response(400, { error: 'Motif requis' });

    const pool = getPool();
    const client = await pool.connect();
    let report;
    try {
      await client.query('begin');
      const context = await conversationContext(
        client,
        conversationId,
        user.id,
        { lock: true },
      );
      if (!context) {
        await client.query('rollback');
        return response(404, { error: 'Conversation introuvable' });
      }
      await client.query(
        'select pg_advisory_xact_lock(hashtext($1))',
        [`conversation-report:${conversationId}`],
      );
      const createdAt = now();
      report = {
        id: newId('cr'),
        conversationId,
        reporterId: user.id,
        reasonCode,
        reason,
        comment,
        at: createdAt,
      };
      await client.query(
        `insert into public.wigolink_conversation_reports
           (id, conversation_id, reporter_id, reason_code, reason, comment, data, created_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, to_timestamp($8 / 1000.0))`,
        [
          report.id,
          conversationId,
          user.id,
          reasonCode,
          reason,
          comment || null,
          JSON.stringify(report),
          createdAt,
        ],
      );
      const conversation = {
        ...context.conversation,
        reportedBy: [...new Set([
          ...(context.conversation.reportedBy || []),
          user.id,
        ])],
        reportCount: Number(context.conversation.reportCount || 0) + 1,
        latestReportAt: createdAt,
      };
      await updateConversation(client, conversation);
      const queued = await client.query(
        `select 1 from public.wigolink_review_queue
         where data->>'type' = 'conversation'
           and data->>'refId' = $1
           and coalesce(data->>'status', 'pending') = 'pending'
         limit 1`,
        [conversationId],
      );
      if (!queued.rowCount) {
        const item = {
          id: newId('rq'),
          type: 'conversation',
          refId: conversationId,
          status: 'pending',
          createdAt,
        };
        await client.query(
          `insert into public.wigolink_review_queue (id, data, created_at, updated_at)
           values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
          [item.id, JSON.stringify(item), createdAt],
        );
      }
      await client.query(
        `insert into public.audit_logs
           (actor_id, action, target_type, target_id, meta)
         values ($1, 'conversation.report', 'conversation', $2, $3::jsonb)`,
        [
          user.id,
          conversationId,
          JSON.stringify({
            reportId: report.id,
            reason,
            reasonCode,
          }),
        ],
      );
      await client.query('commit');
      const detail = await getConversation({
        pool,
        user,
        id: conversationId,
        today,
        memberStateEnabled: memberStateEnabled(),
      });
      return response(200, {
        ok: true,
        report,
        conversation: detail?.conversation || null,
      });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_conversation_report_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Signalement temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function blockConversation({
    user,
    conversationId,
    blocked = true,
    today,
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const context = await conversationContext(
        client,
        conversationId,
        user.id,
        { lock: true },
      );
      if (!context) {
        await client.query('rollback');
        return response(404, { error: 'Conversation introuvable' });
      }
      const otherId = context.conversation.participantIds
        ?.find((id) => id !== user.id);
      if (!otherId) {
        await client.query('rollback');
        return response(400, { error: 'Participant introuvable' });
      }
      const memberResult = await client.query(
        'select data from public.wigolink_users where id = $1 for update',
        [user.id],
      );
      const member = memberResult.rows[0]?.data;
      if (!member) {
        await client.query('rollback');
        return response(404, { error: 'Compte introuvable' });
      }
      const blockedIds = new Set(member.blockedUserIds || []);
      if (blocked) blockedIds.add(otherId);
      else blockedIds.delete(otherId);
      member.blockedUserIds = [...blockedIds];
      const conversation = {
        ...context.conversation,
        ...(memberStateEnabled()
          ? {}
          : {
            blockedBy: blocked
              ? [...new Set([...(context.conversation.blockedBy || []), user.id])]
              : (context.conversation.blockedBy || []).filter((id) => id !== user.id),
          }),
      };
      await client.query(
        `update public.wigolink_users
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [user.id, JSON.stringify(member)],
      );
      if (memberStateEnabled()) {
        await ensureConversationMembers(client, conversation, { now });
        await client.query(
          `update public.wigolink_conversation_members
           set blocked = $3, updated_at = now()
           where conversation_id = $1 and user_id = $2`,
          [conversationId, user.id, blocked],
        );
      } else {
        await updateConversation(client, conversation);
      }
      await insertConversationAudit(client, {
        actorId: user.id,
        action: blocked ? 'conversation.block' : 'conversation.unblock',
        targetType: 'conversation',
        targetId: conversationId,
        meta: { otherId },
      });
      await client.query('commit');
      const detail = await getConversation({
        pool,
        user: member,
        id: conversationId,
        today,
        memberStateEnabled: memberStateEnabled(),
      });
      return response(200, {
        ok: true,
        blocked,
        conversation: detail?.conversation || null,
      });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_conversation_block_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Blocage temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function listBlocked({ user }) {
    const memberResult = await getPool().query(
      'select data from public.wigolink_users where id = $1 limit 1',
      [user.id],
    );
    const blockedIds = memberResult.rows[0]?.data?.blockedUserIds || [];
    if (!blockedIds.length) return response(200, { users: [] });
    const usersResult = await getPool().query(
      'select id, data from public.wigolink_users where id = any($1::text[])',
      [blockedIds],
    );
    const byId = new Map(usersResult.rows.map((row) => [row.id, row.data]));
    return response(200, {
      users: blockedIds
        .map((id) => publicUser(byId.get(id)))
        .filter(Boolean),
    });
  }

  async function unblockUser({ user, otherId }) {
    const safeOtherId = cleanId(otherId);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const memberResult = await client.query(
        'select data from public.wigolink_users where id = $1 for update',
        [user.id],
      );
      const member = memberResult.rows[0]?.data;
      const blockedIds = new Set(member?.blockedUserIds || []);
      if (!member || !safeOtherId || !blockedIds.has(safeOtherId)) {
        await client.query('rollback');
        return response(404, { error: 'Compte bloque introuvable' });
      }
      blockedIds.delete(safeOtherId);
      member.blockedUserIds = [...blockedIds];
      await client.query(
        `update public.wigolink_users
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [user.id, JSON.stringify(member)],
      );
      if (memberStateEnabled()) {
        await client.query(
          `update public.wigolink_conversation_members member
           set blocked = false, updated_at = now()
           where member.user_id = $1
             and exists (
               select 1
               from public.wigolink_conversations conversation
               where conversation.id = member.conversation_id
                 and conversation.data->'participantIds' ? $1
                 and conversation.data->'participantIds' ? $2
             )`,
          [user.id, safeOtherId],
        );
      } else {
        await client.query(
          `update public.wigolink_conversations
           set data = jsonb_set(
             data,
             '{blockedBy}',
             coalesce((
               select jsonb_agg(value)
               from jsonb_array_elements_text(
                 coalesce(data->'blockedBy', '[]'::jsonb)
               ) value
               where value <> $1
             ), '[]'::jsonb),
             true
           ),
           updated_at = now()
           where data->'participantIds' ? $1
             and data->'participantIds' ? $2`,
          [user.id, safeOtherId],
        );
      }
      await insertConversationAudit(client, {
        actorId: user.id,
        action: 'user.unblock',
        targetType: 'user',
        targetId: safeOtherId,
        meta: {},
      });
      await client.query('commit');
      return response(200, { ok: true });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_user_unblock_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Deblocage temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function remove({ user, conversationId, messageId, today }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const context = await conversationContext(
        client,
        conversationId,
        user.id,
        { lock: true },
      );
      if (!context) {
        await client.query('rollback');
        return response(404, { error: 'Conversation introuvable' });
      }
      const found = await client.query(
        `select from_id, data from public.messages
         where id = $1 and conversation_id = $2
         for update`,
        [messageId, conversationId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('rollback');
        return response(404, { error: 'Message introuvable' });
      }
      if (row.from_id !== user.id) {
        await client.query('rollback');
        return response(403, {
          error: 'Vous pouvez supprimer uniquement vos messages',
        });
      }
      const deletedAt = now();
      const retainedMessage = {
        ...row.data,
        hiddenForParticipants: true,
        deletedAt,
        deletedBy: user.id,
        updatedAt: deletedAt,
      };
      await client.query(
        `update public.messages
         set data = $2::jsonb
         where id = $1`,
        [messageId, JSON.stringify(retainedMessage)],
      );
      const latest = await client.query(
        `select extract(epoch from at) * 1000 as at
         from public.messages
         where conversation_id = $1
           and coalesce((data->>'hiddenForParticipants')::boolean, false) = false
         order by at desc limit 1`,
        [conversationId],
      );
      const conversation = {
        ...context.conversation,
        lastMessageAt: Number(latest.rows[0]?.at || context.conversation.createdAt),
      };
      await client.query(
        `update public.wigolink_conversations
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [conversationId, JSON.stringify(conversation)],
      );
      await client.query(
        `insert into public.audit_logs
           (actor_id, action, target_type, target_id, meta)
         values ($1, 'message.delete', 'message', $2, $3::jsonb)`,
        [
          user.id,
          messageId,
          JSON.stringify({
            conversationId,
            retainedForAdmin: true,
          }),
        ],
      );
      await client.query('commit');
      broadcastConversation(conversation, {
        type: 'message_deleted',
        messageId,
        from: user.id,
      });
      const detail = await getConversation({
        pool,
        user,
        id: conversationId,
        today,
        memberStateEnabled: memberStateEnabled(),
      });
      return response(200, {
        ok: true,
        conversation: detail?.conversation || null,
      });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_message_delete_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Suppression temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function attachment({ user, conversationId, messageId, attachmentId }) {
    const result = await getPool().query(
      `select m.data
       from public.messages m
       join public.wigolink_conversations c on c.id = m.conversation_id
       where m.id = $1 and m.conversation_id = $2
         and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
         and c.data->'participantIds' ? $3`,
      [messageId, conversationId, user.id],
    );
    const media = result.rows[0]?.data?.attachments
      ?.find((item) => item.id === attachmentId);
    if (!media) return { status: 404 };
    if (media.dataUrl) {
      const match = media.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return { status: 404 };
      return {
        status: 200,
        body: Buffer.from(match[2], 'base64'),
        contentType: match[1],
      };
    }
    return await messageMedia?.download(media.storagePath) || { status: 503 };
  }

  async function markRead({ user, conversationId, today }) {
    const pool = getPool();
    const context = await conversationContext(pool, conversationId, user.id);
    if (!context) return response(404, { error: 'Conversation introuvable' });
    let updated;
    if (memberStateEnabled()) {
      await ensureConversationMembers(pool, context.conversation, { now });
      updated = await pool.query(
        `with latest as (
           select max(at) as at
           from public.messages
           where conversation_id = $1
             and from_id <> $2
             and coalesce(
               (data->>'hiddenForParticipants')::boolean,
               false
             ) = false
         )
         update public.wigolink_conversation_members member
         set last_read_at = latest.at, updated_at = now()
         from latest
         where member.conversation_id = $1
           and member.user_id = $2
           and latest.at is not null
           and latest.at > coalesce(
             member.last_read_at,
             'epoch'::timestamptz
           )`,
        [conversationId, user.id],
      );
    } else {
      updated = await pool.query(
        `update public.messages
         set data = jsonb_set(
           data,
           '{readBy}',
           coalesce(data->'readBy', '[]'::jsonb) || to_jsonb($2::text),
           true
         )
         where conversation_id = $1
           and from_id <> $2
           and coalesce((data->>'hiddenForParticipants')::boolean, false) = false
           and not (coalesce(data->'readBy', '[]'::jsonb) ? $2)`,
        [conversationId, user.id],
      );
    }
    if (updated.rowCount) {
      broadcastConversation(context.conversation, {
        type: 'read',
        userId: user.id,
      });
    }
    return inboxResponse({
      pool,
      getConversation,
      conversationId,
      user,
      today,
      memberStateEnabled: memberStateEnabled(),
    });
  }

  async function markUnread({ user, conversationId, today }) {
    const pool = getPool();
    const context = await conversationContext(pool, conversationId, user.id);
    if (!context) return response(404, { error: 'Conversation introuvable' });
    const latest = await pool.query(
      `select id, data, at from public.messages
       where conversation_id = $1
         and from_id <> $2
         and coalesce((data->>'hiddenForParticipants')::boolean, false) = false
       order by at desc limit 1`,
      [conversationId, user.id],
    );
    if (latest.rows[0]) {
      if (memberStateEnabled()) {
        await ensureConversationMembers(pool, context.conversation, { now });
        await pool.query(
          `update public.wigolink_conversation_members
           set last_read_at = $3::timestamptz - interval '1 microsecond',
               updated_at = now()
           where conversation_id = $1 and user_id = $2`,
          [
            conversationId,
            user.id,
            latest.rows[0].at,
          ],
        );
      } else {
        const message = latest.rows[0].data;
        message.readBy = (message.readBy || []).filter((id) => id !== user.id);
        await pool.query(
          'update public.messages set data = $2::jsonb where id = $1',
          [latest.rows[0].id, JSON.stringify(message)],
        );
      }
    }
    return inboxResponse({
      pool,
      getConversation,
      conversationId,
      user,
      today,
      memberStateEnabled: memberStateEnabled(),
    });
  }

  async function archive({ user, conversationId, active, today }) {
    return mutateConversationPreference({
      user,
      conversationId,
      key: 'archivedBy',
      active,
      today,
    });
  }

  async function pin({ user, conversationId, active, today }) {
    return mutateConversationPreference({
      user,
      conversationId,
      key: 'pinnedBy',
      active,
      today,
    });
  }

  async function removeConversation({ user, conversationId }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const context = await conversationContext(
        client,
        conversationId,
        user.id,
        { lock: !memberStateEnabled() },
      );
      if (!context) {
        await client.query('rollback');
        return response(404, { error: 'Conversation introuvable' });
      }
      const conversation = memberStateEnabled()
        ? context.conversation
        : {
          ...context.conversation,
          deletedBy: [...new Set([
            ...(context.conversation.deletedBy || []),
            user.id,
          ])],
        };
      if (memberStateEnabled()) {
        await ensureConversationMembers(client, conversation, { now });
        await client.query(
          `update public.wigolink_conversation_members
           set deleted = true, updated_at = now()
           where conversation_id = $1 and user_id = $2`,
          [conversationId, user.id],
        );
      } else {
        await updateConversation(client, conversation);
      }
      const count = await client.query(
        'select count(*)::int as count from public.messages where conversation_id = $1',
        [conversationId],
      );
      await client.query(
        `insert into public.audit_logs
           (actor_id, action, target_type, target_id, meta)
         values ($1, 'conversation.delete', 'conversation', $2, $3::jsonb)`,
        [
          user.id,
          conversationId,
          JSON.stringify({
            subjectUserId: user.id,
            scope: 'inbox_only',
            retainedForAdmin: true,
            participantIds: conversation.participantIds,
            messageCount: Number(count.rows[0]?.count || 0),
          }),
        ],
      );
      await client.query('commit');
      return response(200, { ok: true });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_conversation_delete_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Suppression temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  async function typing({ user, conversationId, active }) {
    const context = await conversationContext(getPool(), conversationId, user.id);
    if (!context) return response(404, { error: 'Conversation introuvable' });
    broadcastConversation(context.conversation, {
      type: 'typing',
      userId: user.id,
      active: active === true,
    }, user.id);
    return response(200, { ok: true });
  }

  async function mutateConversationPreference({
    user,
    conversationId,
    key,
    active,
    today,
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const context = await conversationContext(
        client,
        conversationId,
        user.id,
        { lock: !memberStateEnabled() },
      );
      if (!context) {
        await client.query('rollback');
        return response(404, { error: 'Conversation introuvable' });
      }
      if (memberStateEnabled()) {
        await ensureConversationMembers(client, context.conversation, { now });
        const column = key === 'pinnedBy' ? 'pinned' : 'archived';
        await client.query(
          `update public.wigolink_conversation_members
           set ${column} = $3, updated_at = now()
           where conversation_id = $1 and user_id = $2`,
          [conversationId, user.id, active],
        );
      } else {
        const values = new Set(context.conversation[key] || []);
        if (active) values.add(user.id);
        else values.delete(user.id);
        const conversation = {
          ...context.conversation,
          [key]: [...values],
        };
        await updateConversation(client, conversation);
      }
      await client.query('commit');
      return inboxResponse({
        pool,
        getConversation,
        conversationId,
        user,
        today,
        memberStateEnabled: memberStateEnabled(),
      });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_conversation_preference_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Action temporairement indisponible. Reessayez.',
      });
    } finally {
      client.release();
    }
  }

  return {
    archive,
    attachment,
    blockConversation,
    createConversation,
    createAttachmentUpload,
    listBlocked,
    markRead,
    markUnread,
    pin,
    reportConversation,
    remove,
    removeConversation,
    send,
    typing,
    unblockUser,
  };
}

async function conversationContext(pool, conversationId, userId, { lock = false } = {}) {
  const result = await pool.query(
    `select c.data as conversation, other.data as other, operation.data as operation
     from public.wigolink_conversations c
     left join lateral (
       select u.data from public.wigolink_users u
       where u.id <> $2 and c.data->'participantIds' ? u.id
       limit 1
     ) other on true
     left join public.wigolink_transactions operation
       on operation.id = c.data->>'operationId'
     where c.id = $1 and c.data->'participantIds' ? $2
     ${lock ? 'for update of c' : ''}`,
    [conversationId, userId],
  );
  return result.rows[0] || null;
}

function prepareMessage({ body, conversation, operation, validPhotos, now }) {
  const text = String(body.text || '').trim().slice(0, 1000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 1)
    : [];
  const createdAt = now();
  const location = normalizeLocation(body.location, operation, createdAt);
  if (body.location && !location) {
    return response(400, { error: 'Localisation invalide' });
  }
  if (!text && attachments.length === 0 && !location) {
    return response(400, { error: 'Message vide' });
  }
  if (
    attachments.length > 0
    && !attachments.every((attachment) => (
      isDirectAttachment(attachment, conversation.id)
      || validPhotos([attachment?.dataUrl || attachment])
    ))
  ) {
    return response(400, { error: 'Piece jointe invalide' });
  }
  return {
    text,
    attachments,
    location,
    clientId: String(body.clientId || '').trim().slice(0, 80) || null,
    messageId: null,
    conversation,
  };
}

async function storeAttachments({
  attachments,
  conversationId,
  userId,
  pool,
  messageId: providedMessageId,
  messageMedia,
  allowInlineMediaFallback,
  newId,
  logger,
}) {
  const messageId = providedMessageId || newId('m');
  if (attachments.length && !messageMedia?.enabled && !allowInlineMediaFallback) {
    return response(503, {
      error: 'Le stockage des images est temporairement indisponible',
    });
  }
  const storagePaths = [];
  const reservationIds = [];
  try {
    await validateUploadReservations({
      attachments,
      conversationId,
      userId,
      pool,
    });
    const normalized = await Promise.all(attachments.map(async (attachment, index) => {
      if (isDirectAttachment(attachment, conversationId)) {
        const stored = await messageMedia?.info(attachment.storagePath);
        if (
          !stored
          || !DIRECT_UPLOAD_MIMES.has(stored.mime || attachment.mime)
          || stored.size <= 0
          || stored.size > DIRECT_UPLOAD_MAX_BYTES
        ) {
          throw new Error('Upload direct invalide');
        }
        storagePaths.push(attachment.storagePath);
        reservationIds.push(attachment.id);
        return {
          id: attachment.id,
          type: 'image',
          name: String(attachment.name || `image-${index + 1}`).slice(0, 80),
          mime: stored.mime || attachment.mime,
          storagePath: attachment.storagePath,
          url: `/conversations/${conversationId}/messages/${messageId}/attachments/${attachment.id}`,
          size: stored.size,
        };
      }
      const dataUrl = typeof attachment === 'string' ? attachment : attachment.dataUrl;
      const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
      const attachmentId = newId('att');
      const stored = messageMedia?.enabled
        ? await messageMedia.storeDataUrl({
          conversationId,
          attachmentId,
          dataUrl,
        })
        : null;
      if (stored?.storagePath) storagePaths.push(stored.storagePath);
      return {
        id: attachmentId,
        type: 'image',
        name: String(attachment?.name || `image-${index + 1}`).slice(0, 80),
        mime: stored?.mime || mime,
        ...(stored
          ? {
            storagePath: stored.storagePath,
            url: `/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`,
            size: stored.size,
          }
          : {
            dataUrl,
            url: `/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`,
            size: dataUrl.length,
          }),
      };
    }));
    return {
      attachments: normalized,
      messageId,
      storagePaths,
      reservationIds,
    };
  } catch (error) {
    await removeStoredMedia(messageMedia, storagePaths);
    logger.error('relational_message_media_store_failed', {
      message: error?.message || 'unknown_error',
    });
    if (!allowInlineMediaFallback) {
      return response(503, {
        error: 'Le stockage des images est temporairement indisponible',
      });
    }
    if (attachments.some((attachment) => (
      isDirectAttachment(attachment, conversationId)
    ))) {
      return response(400, { error: 'Upload direct invalide' });
    }
    return {
      attachments: attachments.map((attachment, index) => {
        const dataUrl = typeof attachment === 'string' ? attachment : attachment.dataUrl;
        return {
          id: newId('att'),
          type: 'image',
          name: String(attachment?.name || `image-${index + 1}`).slice(0, 80),
          mime: dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg',
          dataUrl,
          size: dataUrl.length,
        };
      }),
      messageId,
      storagePaths: [],
      reservationIds: [],
    };
  }
}

async function validateUploadReservations({
  attachments,
  conversationId,
  userId,
  pool,
}) {
  const direct = attachments.filter((attachment) => (
    isDirectAttachment(attachment, conversationId)
  ));
  if (!direct.length) return;
  const ids = direct.map((attachment) => attachment.id);
  const result = await pool.query(
    `select id, data
     from public.wigolink_runtime_records
     where kind = 'message_upload'
       and id = any($1::text[])
       and expires_at > now()`,
    [ids],
  );
  const reservations = new Map(
    result.rows.map((row) => [row.id, row.data]),
  );
  const valid = direct.every((attachment) => {
    const reservation = reservations.get(attachment.id);
    return reservation
      && reservation.userId === userId
      && reservation.conversationId === conversationId
      && reservation.storagePath === attachment.storagePath;
  });
  if (!valid || reservations.size !== direct.length) {
    throw new Error('Reservation upload invalide');
  }
}

const DIRECT_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const DIRECT_UPLOAD_MAX_BYTES = 700 * 1024;

function directDataUrlSize(dataUrl, expectedMime) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || match[1] !== expectedMime) return 0;
  try {
    return Buffer.from(match[2], 'base64').length;
  } catch {
    return 0;
  }
}

function isDirectAttachment(attachment, conversationId) {
  if (!attachment || typeof attachment !== 'object') return false;
  const id = String(attachment.id || '');
  const mime = String(attachment.mime || '');
  const path = String(attachment.storagePath || '');
  if (!/^att-[a-zA-Z0-9-]{8,100}$/.test(id)) return false;
  if (!DIRECT_UPLOAD_MIMES.has(mime)) return false;
  const escapedConversation = String(conversationId)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 100);
  return path.startsWith(`conversations/${escapedConversation}/${id}.`);
}

async function persistSafetyAttempt({
  client,
  user,
  conversation,
  analysis,
  newId,
  now,
}) {
  const timestamp = now();
  const prior = (user.messageSafetyAttempts || [])
    .filter((item) => item.at > timestamp - SAFETY_ATTEMPT_WINDOW_MS);
  const attempt = {
    id: newId('msa'),
    at: timestamp,
    conversationId: conversation.id,
    categories: analysis.categories,
    severity: analysis.severity,
  };
  prior.push(attempt);
  const highCount = prior.filter((item) => item.severity === 'high').length;
  const cooldownUntil = highCount >= SAFETY_STRIKE_LIMIT
    ? Math.max(user.messageSafetyBlockedUntil || 0, timestamp + SAFETY_COOLDOWN_MS)
    : user.messageSafetyBlockedUntil || null;
  const updatedUser = {
    ...user,
    messageSafetyAttempts: prior,
    messageSafetyBlockedUntil: cooldownUntil,
  };
  const updatedConversation = {
    ...conversation,
    safetyIncidents: [
      ...(conversation.safetyIncidents || []),
      { ...attempt, userId: user.id },
    ].slice(-50),
  };
  await client.query(
    `update public.wigolink_users set data = $2::jsonb, updated_at = now() where id = $1`,
    [user.id, JSON.stringify(updatedUser)],
  );
  await client.query(
    `update public.wigolink_conversations set data = $2::jsonb, updated_at = now() where id = $1`,
    [conversation.id, JSON.stringify(updatedConversation)],
  );
  await client.query(
    `insert into public.audit_logs
       (actor_id, action, target_type, target_id, meta)
     values ($1, 'message.safety_blocked', 'conversation', $2, $3::jsonb)`,
    [
      user.id,
      conversation.id,
      JSON.stringify({
        categories: analysis.categories,
        severity: analysis.severity,
        highCount,
      }),
    ],
  );
  if (analysis.severity === 'high' || highCount >= SAFETY_STRIKE_LIMIT) {
    const queued = await client.query(
      `select 1 from public.wigolink_review_queue
       where data->>'type' = 'conversation'
         and data->>'refId' = $1
         and coalesce(data->>'status', 'pending') = 'pending'
       limit 1`,
      [conversation.id],
    );
    if (!queued.rowCount) {
      const queueItem = {
        id: newId('rq'),
        type: 'conversation',
        refId: conversation.id,
        status: 'pending',
        createdAt: timestamp,
      };
      await client.query(
        `insert into public.wigolink_review_queue (id, data)
         values ($1, $2::jsonb)`,
        [queueItem.id, JSON.stringify(queueItem)],
      );
    }
  }
  return { cooldownUntil, highCount };
}

async function existingMessage(pool, conversationId, userId, clientId) {
  const result = await pool.query(
    `select data from public.messages
     where conversation_id = $1 and from_id = $2 and client_id = $3
     limit 1`,
    [conversationId, userId, clientId],
  );
  return result.rows[0]?.data || null;
}

async function successfulMessage({
  pool,
  getConversation,
  conversationId,
  user,
  message,
  today,
}) {
  const detail = await getConversation({
    pool,
    user,
    id: conversationId,
    today,
  });
  return response(200, {
    message: clientMessage(message),
    conversation: detail?.conversation || null,
    warningKey: message.flagged ? 'messages.safety.keepInside' : null,
    warning: message.flagged
      ? 'Gardez les echanges et le paiement dans Wigolink pour rester protege.'
      : null,
  });
}

async function inboxResponse({
  pool,
  getConversation,
  conversationId,
  user,
  today,
  memberStateEnabled = false,
}) {
  const detail = await getConversation({
    pool,
    user,
    id: conversationId,
    today,
    memberStateEnabled,
  });
  const memberJoin = memberStateEnabled
    ? `join public.wigolink_conversation_members member
         on member.conversation_id = c.id and member.user_id = $1`
    : '';
  const membershipFilter = memberStateEnabled
    ? 'and not member.deleted'
    : `and c.data->'participantIds' ? $1
       and not (coalesce(c.data->'deletedBy', '[]'::jsonb) ? $1)`;
  const unreadFilter = memberStateEnabled
    ? `and m.at > coalesce(member.last_read_at, 'epoch'::timestamptz)`
    : `and not (coalesce(m.data->'readBy', '[]'::jsonb) ? $1)`;
  const unread = await pool.query(
    `select count(distinct c.id)::int as count
     from public.wigolink_conversations c
     ${memberJoin}
     join public.messages m on m.conversation_id = c.id
     where true
       ${membershipFilter}
       and m.from_id <> $1
       and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
       ${unreadFilter}`,
    [user.id],
  );
  return response(200, {
    ok: true,
    conversation: detail?.conversation || null,
    messagesUnread: Number(unread.rows[0]?.count || 0),
  });
}

function clientMessage(message) {
  return {
    ...message,
    attachments: (message.attachments || []).map((attachment) => {
      const { dataUrl, storagePath, ...safe } = attachment;
      return {
        ...safe,
        url: safe.url || `/conversations/${message.conversationId}/messages/${message.id}/attachments/${attachment.id}`,
      };
    }),
  };
}

function normalizeLocation(value, operation, timestamp) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = value.kind === 'place' ? 'place' : value.kind === 'current' ? 'current' : null;
  if (!kind) return null;
  const label = String(value.label || '').trim().slice(0, 120);
  const city = String(value.city || '').trim().slice(0, 80);
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  if (kind === 'current' && !hasCoordinates) return null;
  if (kind === 'place' && !label && !city) return null;
  const operationStatus = operation?.operationStatus || operation?.status;
  const precise = hasCoordinates
    && ['paye', 'collecte_prevue', 'en_transport'].includes(operationStatus);
  const expiresInMinutes = LOCATION_EXPIRY_MINUTES.has(Number(value.expiresInMinutes))
    ? Number(value.expiresInMinutes)
    : 120;
  return {
    kind,
    labelKey: label ? null : (kind === 'current' ? 'messages.location.myCurrent' : 'messages.location.meeting'),
    label: label || (kind === 'current' ? 'Position actuelle' : 'Lieu de rendez-vous'),
    city: city || null,
    latitude: hasCoordinates ? (precise ? latitude : Number(latitude.toFixed(2))) : null,
    longitude: hasCoordinates ? (precise ? longitude : Number(longitude.toFixed(2))) : null,
    accuracy: hasCoordinates && Number.isFinite(Number(value.accuracy))
      ? Math.round(Math.max(0, Math.min(Number(value.accuracy), 10000)))
      : null,
    precision: precise ? 'exact' : 'approximate',
    expiresAt: timestamp + expiresInMinutes * 60 * 1000,
  };
}

function isBlocked(conversation, user, other) {
  const userBlocked = new Set(Array.isArray(user?.blockedUserIds) ? user.blockedUserIds : []);
  const otherBlocked = new Set(Array.isArray(other?.blockedUserIds) ? other.blockedUserIds : []);
  return (conversation.blockedBy || []).includes(user.id)
    || (!!other?.id && userBlocked.has(other.id))
    || otherBlocked.has(user.id);
}

async function removeStoredMedia(messageMedia, paths = []) {
  await Promise.all(paths.map((path) =>
    messageMedia?.remove?.(path).catch(() => {})
  ));
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

async function updateConversation(client, conversation) {
  await client.query(
    `update public.wigolink_conversations
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [conversation.id, JSON.stringify(conversation)],
  );
}

async function insertConversationAudit(client, {
  actorId,
  action,
  targetType,
  targetId,
  meta,
}) {
  await client.query(
    `insert into public.audit_logs
       (actor_id, action, target_type, target_id, meta)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      actorId,
      action,
      targetType,
      targetId,
      JSON.stringify(meta || {}),
    ],
  );
}

function operationPartyIds(operation) {
  return [
    operation?.senderId,
    operation?.travelerId,
    operation?.recipientId,
  ].filter(Boolean);
}

function cleanId(value) {
  return String(value || '').trim().slice(0, 120) || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    city: user.city,
    kycStatus: user.kycStatus,
    rating: user.rating,
    ratingCount: user.ratingCount,
    completed: user.completed,
    cancelRate: user.cancelRate,
    badges: user.badges,
    photoUrl: user.photoUrl || null,
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt,
    onboardingDone: !!user.settings?.onboardingDone,
    emailVerified: !!user.emailVerified,
  };
}

function response(status, body) {
  return { status, body };
}
