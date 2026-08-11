const REPORT_REASON_CODES = new Set([
  'external_payment',
  'abuse',
  'suspicious',
  'off_platform',
  'other',
]);

export function createConversationMessageService({
  db,
  isPartyToTransaction,
  findUser,
  findOrCreateConversation,
  conversationView,
  conversationMessages,
  areParticipantsBlocked,
  normalizeLocation,
  analyzeSafety,
  registerSafetyAttempt,
  safetyError,
  reviewQueue,
  audit,
  save,
  broadcastConversation,
  messageMedia = null,
  newId,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function findConversation(id, userId) {
    return db.conversations.find((conversation) =>
      conversation.id === id
      && conversation.participantIds.includes(userId)
    ) || null;
  }

  function messageResponse(message, conversation, userId) {
    return {
      message: clientMessage(message),
      conversation: conversationView(conversation, userId),
      warningKey: message.flagged ? 'messages.safety.keepInside' : null,
      warning: message.flagged
        ? 'Gardez les echanges et le paiement dans Wigolink pour rester protege.'
        : null,
    };
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

  function createConversation(user, body = {}) {
    const {
      tripId = null,
      operationId = null,
      userId = null,
    } = body;
    let otherId = userId;

    if (tripId) {
      const trip = db.trips.find((item) => item.id === tripId);
      if (!trip) return response(404, { error: 'Trajet introuvable' });
      otherId = trip.travelerId;
    }

    if (operationId) {
      const transaction = db.transactions.find((item) => item.id === operationId);
      if (!transaction || !isPartyToTransaction(transaction, user.id)) {
        return response(404, { error: 'Operation introuvable' });
      }
      otherId = transaction.senderId === user.id
        ? transaction.travelerId
        : transaction.senderId;
    }

    if (!otherId || !findUser(otherId)) {
      return response(400, { error: 'Destinataire invalide' });
    }
    if (otherId === user.id) {
      return response(400, { error: 'Conversation invalide' });
    }

    const conversation = findOrCreateConversation({
      participantIds: [user.id, otherId],
      tripId,
      operationId,
    });
    save();
    return response(200, {
      conversation: conversationView(conversation, user.id),
    });
  }

  async function reportConversation(id, user, body = {}) {
    const conversation = findConversation(id, user.id);
    if (!conversation) {
      return response(404, { error: 'Conversation introuvable' });
    }

    const reasonCode = String(body.reasonCode || 'other').trim();
    const safeReasonCode = REPORT_REASON_CODES.has(reasonCode)
      ? reasonCode
      : 'other';
    const reason = String(body.reason || '').trim().slice(0, 500);
    const comment = String(body.comment || '').trim().slice(0, 500);
    if (!reason) return response(400, { error: 'Motif requis' });

    const report = {
      id: newId('cr'),
      conversationId: conversation.id,
      reporterId: user.id,
      reasonCode: safeReasonCode,
      reason,
      comment,
      at: now(),
    };
    conversation.reports = conversation.reports || [];
    conversation.reports.push(report);
    conversation.reportedBy = [...new Set([
      ...(conversation.reportedBy || []),
      user.id,
    ])];
    const alreadyQueued = reviewQueue.open()
      .some((item) =>
        item.type === 'conversation'
        && item.refId === conversation.id
      );
    if (!alreadyQueued) {
      reviewQueue.append({
        type: 'conversation',
        refId: conversation.id,
      });
    }
    await audit(
      user.id,
      'conversation.report',
      'conversation',
      conversation.id,
      {
        reason,
        reasonCode: safeReasonCode,
      },
    );
    save();
    return response(200, {
      ok: true,
      report,
      conversation: conversationView(conversation, user.id),
    });
  }

  async function sendMessage(id, user, body = {}) {
    const conversation = findConversation(id, user.id);
    if (!conversation) {
      return response(404, { error: 'Conversation introuvable' });
    }
    if (areParticipantsBlocked(conversation, user.id)) {
      return response(403, {
        code: 'conversation_blocked',
        error: 'Cette conversation est bloquee. Aucun nouveau message ne peut etre envoye.',
      });
    }

    if (user.messageSafetyBlockedUntil && user.messageSafetyBlockedUntil > now()) {
      return response(429, safetyError({
        analysis: {
          categories: ['repeated_attempts'],
          severity: 'high',
        },
        cooldownUntil: user.messageSafetyBlockedUntil,
      }));
    }

    const text = String(body.text || '').trim().slice(0, 1000);
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      return response(400, {
        code: 'message_attachments_disabled',
        error: 'Piece jointe invalide',
      });
    }
    const createdAt = now();
    const location = normalizeLocation(
      body.location,
      conversation,
      createdAt,
    );
    if (body.location && !location) {
      return response(400, { error: 'Localisation invalide' });
    }
    if (!text && !location) {
      return response(400, { error: 'Message vide' });
    }
    const messageId = newId('m');
    const clientId = String(body.clientId || '').trim().slice(0, 80) || null;

    if (clientId) {
      const existing = db.messages.find((message) =>
        message.conversationId === conversation.id
        && message.from === user.id
        && message.clientId === clientId
      );
      if (existing) {
        return response(200, messageResponse(
          existing,
          conversation,
          user.id,
        ));
      }
    }

    const recentOutboundText = db.messages
      .filter((message) =>
        message.conversationId === conversation.id
        && message.from === user.id
        && message.at > now() - 10 * 60 * 1000
      )
      .slice(-4)
      .map((message) => message.text || '')
      .join(' ');
    const safety = analyzeSafety(
      `${recentOutboundText} ${text} ${location?.label || ''} ${location?.city || ''}`,
    );
    if (safety.blocked) {
      const attempt = registerSafetyAttempt({
        user,
        conversation,
        analysis: safety,
      });
      await audit(
        user.id,
        'message.safety_blocked',
        'conversation',
        conversation.id,
        {
          categories: safety.categories,
          severity: safety.severity,
          highCount: attempt.highCount,
        },
      );
      save();
      return response(
        attempt.cooldownUntil ? 429 : 422,
        safetyError({
          analysis: safety,
          cooldownUntil: attempt.cooldownUntil,
        }),
      );
    }

    const message = {
      id: messageId,
      clientId,
      conversationId: conversation.id,
      txId: conversation.operationId || null,
      from: user.id,
      text,
      flagged: false,
      flagReason: null,
      type: location ? 'location' : 'text',
      attachments: [],
      location,
      deliveryStatus: 'sent',
      readBy: [user.id],
      at: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
    db.messages.push(message);
    conversation.lastMessageAt = message.at;
    conversation.archivedBy = (conversation.archivedBy || [])
      .filter((participantId) => participantId !== user.id);
    save();
    broadcastConversation(conversation, {
      type: 'message',
      messageId: message.id,
      from: user.id,
    });
    return response(200, messageResponse(
      message,
      conversation,
      user.id,
    ));
  }

  function deleteMessage(conversationId, messageId, userId) {
    const conversation = findConversation(conversationId, userId);
    if (!conversation) {
      return response(404, { error: 'Conversation introuvable' });
    }
    const index = db.messages.findIndex((message) =>
      message.id === messageId
      && message.conversationId === conversation.id
    );
    if (index < 0) {
      return response(404, { error: 'Message introuvable' });
    }
    if (db.messages[index].from !== userId) {
      return response(403, {
        error: 'Vous pouvez supprimer uniquement vos messages',
      });
    }

    db.messages.splice(index, 1);
    const last = conversationMessages(conversation).at(-1);
    conversation.lastMessageAt = last?.at || conversation.createdAt;
    save();
    broadcastConversation(conversation, {
      type: 'message_deleted',
      messageId,
      from: userId,
    });
    return response(200, {
      ok: true,
      conversation: conversationView(conversation, userId),
    });
  }

  async function attachment(conversationId, messageId, attachmentId, userId) {
    const conversation = findConversation(conversationId, userId);
    if (!conversation) return { status: 404 };
    const message = db.messages.find((item) =>
      item.id === messageId && item.conversationId === conversationId
    );
    const media = message?.attachments?.find((item) => item.id === attachmentId);
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
    const downloaded = await messageMedia?.download(media.storagePath);
    return downloaded || { status: 503 };
  }

  return {
    attachment,
    createConversation,
    deleteMessage,
    reportConversation,
    sendMessage,
  };
}
