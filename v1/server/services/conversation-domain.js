const LOCATION_EXPIRY_MINUTES = new Set([30, 120]);
export const MESSAGE_SAFETY_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SAFETY_COOLDOWN_MS = 30 * 60 * 1000;
const SAFETY_STRIKE_LIMIT = 3;

const SYSTEM_EVENT_TEXT = {
  trip_accepted: 'Discussion ouverte pour ce trajet.',
  traveler_confirmed: 'Trajet confirme par le voyageur.',
  operation_paid: 'Paiement recu. La remise peut etre organisee.',
  rendezvous_confirmed: 'Rendez-vous de remise planifie.',
  pickup_confirmed: 'Colis remis au voyageur.',
  delivery_confirmed: 'Livraison confirmee.',
  traveler_rejected: 'Operation refusee par le voyageur.',
  traveler_cancelled: 'Operation annulee par le voyageur.',
  sender_cancelled: 'Operation annulee.',
  dispute_opened: 'Litige ouvert.',
  evidence_added: 'Element ajoute au litige.',
};

export function createConversationDomain({
  db,
  repositories,
  realtime,
  findUser,
  publicUser,
  tripPostView,
  operationView,
  todayIso,
  newId,
  now = Date.now,
}) {
  function broadcastConversation(conversation, payload, exceptUserId = null) {
    for (const userId of conversation.participantIds || []) {
      if (userId !== exceptUserId) {
        realtime.broadcast(userId, { conversationId: conversation.id, ...payload, at: now() });
      }
    }
  }

  function locationCanBePrecise(conversation) {
    const operation = conversation.operationId
      ? db.transactions.find((item) => item.id === conversation.operationId)
      : null;
    const status = operation?.operationStatus || operation?.status;
    return ['paye', 'collecte_prevue', 'en_transport'].includes(status);
  }

  function normalizeMessageLocation(value, conversation, timestamp = now()) {
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
    const precise = hasCoordinates && locationCanBePrecise(conversation);
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

  function conversationParticipants(conversation) {
    return conversation.participantIds.map((id) => publicUser(findUser(id))).filter(Boolean);
  }

  function operationAction(tx, viewerId) {
    if (!tx) return { actionRequired: false, actionKey: null, actionLabel: null, actionHref: null };
    const status = tx.operationStatus || (tx.status === 'accepted' ? 'paiement_requis' : tx.status);
    const actionHref = `/operations/${tx.id}`;
    if (status === 'attente_confirmation') {
      return {
        actionRequired: tx.travelerId === viewerId,
        actionKey: tx.travelerId === viewerId ? 'messages.action.confirmTrip' : 'messages.action.waitTraveler',
        actionLabel: tx.travelerId === viewerId ? 'Confirmer le trajet' : 'En attente du voyageur',
        actionHref,
      };
    }
    if (status === 'paiement_requis') {
      return {
        actionRequired: tx.senderId === viewerId,
        actionKey: tx.senderId === viewerId ? 'messages.action.payContinue' : 'messages.action.paymentExpected',
        actionLabel: tx.senderId === viewerId ? 'Payer pour continuer' : 'Paiement attendu',
        actionHref,
      };
    }
    if (status === 'paye') return { actionRequired: true, actionKey: 'messages.action.organizeHandoff', actionLabel: 'Organiser la remise', actionHref };
    if (status === 'collecte_prevue') return { actionRequired: true, actionKey: 'messages.action.confirmPickup', actionLabel: 'Confirmer la collecte', actionHref };
    if (status === 'en_transport') return { actionRequired: true, actionKey: 'messages.action.trackDelivery', actionLabel: 'Suivre la livraison', actionHref };
    if (status === 'litige') return { actionRequired: true, actionKey: 'messages.action.trackDispute', actionLabel: 'Suivre le litige', actionHref };
    return { actionRequired: false, actionKey: 'messages.action.viewRecap', actionLabel: 'Consulter le recap', actionHref };
  }

  function conversationStatus(conversation, viewerId, operation) {
    if ((conversation.archivedBy || []).includes(viewerId)) return 'archived';
    if (operation) {
      const status = operation.operationStatus || operation.status;
      if (['termine', 'released', 'refunded', 'cancelled'].includes(status)) return 'completed';
      return operationAction(operation, viewerId).actionRequired ? 'waiting_user' : 'waiting_other';
    }
    const trip = conversation.tripId ? db.trips.find((item) => item.id === conversation.tripId) : null;
    if (trip && (trip.departureDate || trip.date) < todayIso()) return 'completed';
    return 'active';
  }

  function conversationContextSummary({ trip, operation }) {
    if (operation) {
      return {
        type: 'operation',
        labelKey: operation.title ? null : 'messages.operation.active',
        label: operation.title || 'Operation en cours',
        detail: operation.operationStatus || operation.status || 'en cours',
        href: `/operations/${operation.id}`,
      };
    }
    if (trip) {
      return {
        type: 'trip',
        label: `${trip.from} -> ${trip.to}`,
        detail: trip.departureDate || trip.date || null,
        href: `/trajets/${trip.id}`,
      };
    }
    return {
      type: 'direct',
      labelKey: 'messages.status.direct',
      label: 'Discussion directe',
      detail: null,
      href: null,
    };
  }

  function clientMessageView(message) {
    if (!message) return null;
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

  function conversationView(conversation, viewerId) {
    const messages = db.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((left, right) => left.at - right.at);
    const lastMessage = clientMessageView(messages[messages.length - 1] || null);
    const unread = messages.filter((message) =>
      message.from !== viewerId && !(message.readBy || []).includes(viewerId)
    ).length;
    const trip = conversation.tripId ? db.trips.find((item) => item.id === conversation.tripId) : null;
    const operation = conversation.operationId
      ? db.transactions.find((item) => item.id === conversation.operationId)
      : null;
    const operationUi = operation ? operationView(operation, findUser(viewerId)) : null;
    const tripUi = trip ? tripPostView(trip) : null;
    const action = operation ? operationAction(operation, viewerId) : {
      actionRequired: false,
      actionKey: trip ? 'messages.action.viewTrip' : null,
      actionLabel: trip ? 'Voir le trajet' : null,
      actionHref: trip ? `/trajets/${trip.id}` : null,
    };
    const status = conversationStatus(conversation, viewerId, operation);
    const lastMessageAt = lastMessage?.at || conversation.lastMessageAt || conversation.createdAt;
    const lastMessagePreview = lastMessage?.flagged
      ? 'Message signale par securite'
      : (lastMessage?.text || (lastMessage?.location
        ? 'Localisation partagee'
        : lastMessage?.attachments?.length
          ? 'Photo jointe'
          : trip
            ? 'Conversation liee a un trajet'
            : operation
              ? 'Conversation liee a une operation'
              : 'Nouvelle conversation'));
    const lastMessagePreviewKey = lastMessage?.flagged
      ? 'messages.preview.flagged'
      : (lastMessage?.text
        ? null
        : lastMessage?.location
          ? 'messages.preview.location'
          : lastMessage?.attachments?.length
            ? 'messages.preview.photo'
            : trip
              ? 'messages.preview.trip'
              : operation
                ? 'messages.preview.operation'
                : 'messages.preview.new');
    const participants = conversationParticipants(conversation);
    const other = participants.find((user) => user.id !== viewerId) || null;
    return {
      ...conversation,
      participants,
      other,
      otherOnline: !!other && realtime.isOnline(other.id),
      otherLastSeenAt: other ? realtime.lastSeenAt(other.id) : null,
      lastMessage,
      lastMessageAt,
      lastMessagePreview,
      lastMessagePreviewKey,
      unread,
      unreadCount: unread,
      status,
      archived: (conversation.archivedBy || []).includes(viewerId),
      pinned: (conversation.pinnedBy || []).includes(viewerId),
      blocked: (conversation.blockedBy || []).includes(viewerId),
      blockedByOther: !!other && blockedUserIds(findUser(other.id)).has(viewerId),
      actionRequired: action.actionRequired,
      actionKey: action.actionKey,
      actionLabel: action.actionLabel,
      actionHref: action.actionHref,
      contextType: operation ? 'operation' : trip ? 'trip' : 'direct',
      context: conversationContextSummary({ trip: tripUi, operation: operationUi }),
      updatedAt: lastMessageAt,
      trip: tripUi,
      operation: operationUi,
    };
  }

  function conversationMessages(conversation) {
    const userMessages = db.messages
      .filter((message) => message.conversationId === conversation.id)
      .map((message) => ({
        ...clientMessageView(message),
        type: message.type || (message.flagged ? 'warning' : 'text'),
        deliveryStatus: message.deliveryStatus || 'sent',
        createdAt: message.createdAt || message.at,
        updatedAt: message.updatedAt || message.at,
      }));
    const operation = conversation.operationId
      ? db.transactions.find((item) => item.id === conversation.operationId)
      : null;
    const systemMessages = (operation?.events || [])
      .filter((event) => SYSTEM_EVENT_TEXT[event.type])
      .map((event) => ({
        id: `sys-${event.id}`,
        conversationId: conversation.id,
        txId: operation.id,
        from: null,
        text: SYSTEM_EVENT_TEXT[event.type],
        textKey: `messages.system.${event.type}`,
        type: 'system',
        systemEvent: { type: event.type, meta: event.meta || {} },
        readBy: conversation.participantIds,
        at: event.at,
        createdAt: event.at,
        updatedAt: event.at,
        deliveryStatus: 'sent',
      }));
    return [...systemMessages, ...userMessages].sort((left, right) => left.at - right.at);
  }

  function adminConversationModerationView(conversation) {
    if (!conversation) return null;
    const trip = conversation.tripId ? db.trips.find((item) => item.id === conversation.tripId) : null;
    const operation = conversation.operationId
      ? db.transactions.find((item) => item.id === conversation.operationId)
      : null;
    const operationUi = operation ? operationView(operation, findUser(conversation.participantIds[0])) : null;
    const tripUi = trip ? tripPostView(trip) : null;
    const reports = (conversation.reports || [])
      .slice()
      .sort((left, right) => right.at - left.at)
      .map((report) => ({ ...report, reporter: publicUser(findUser(report.reporterId)) }));
    const messages = conversationMessages(conversation)
      .slice(-8)
      .map((message) => ({
        ...message,
        fromUser: message.from ? publicUser(findUser(message.from)) : null,
      }));
    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.lastMessageAt || conversation.createdAt,
      contextType: operation ? 'operation' : trip ? 'trip' : 'direct',
      context: conversationContextSummary({ trip: tripUi, operation: operationUi }),
      participants: conversation.participantIds.map((id) => publicUser(findUser(id))).filter(Boolean),
      reportCount: reports.length,
      reports,
      safetyIncidents: (conversation.safetyIncidents || [])
        .slice()
        .sort((left, right) => right.at - left.at)
        .slice(0, 12)
        .map((incident) => ({ ...incident, user: publicUser(findUser(incident.userId)) })),
      messages,
      lastMessagePreview: messages[messages.length - 1]?.text || null,
      moderationStatus: conversation.moderationStatus || 'pending',
    };
  }

  function findOrCreateConversation({ participantIds, tripId = null, operationId = null }) {
    const ids = [...new Set(participantIds)].sort();
    let conversation = operationId
      ? db.conversations.find((item) => item.operationId === operationId)
      : db.conversations.find((item) =>
        item.participantIds.slice().sort().join('|') === ids.join('|')
        && (item.tripId || null) === (tripId || null)
        && !item.operationId
      );
    if (!conversation) {
      conversation = {
        id: newId('conv'),
        participantIds: ids,
        tripId,
        operationId,
        lastMessageAt: now(),
        createdAt: now(),
      };
      db.conversations.push(conversation);
    }
    return conversation;
  }

  function conversationMessagesPage(conversation, query = {}) {
    let messages = conversationMessages(conversation);
    const q = String(query.q || '').trim().toLowerCase();
    if (q) {
      messages = messages.filter((message) =>
        `${message.text || ''} ${message.location?.label || ''} ${message.location?.city || ''} ${message.systemEvent?.type || ''} ${(message.attachments || []).map((attachment) => attachment.name).join(' ')}`.toLowerCase().includes(q)
      );
    }
    const before = Number(query.before || 0);
    if (before > 0) messages = messages.filter((message) => message.at < before);
    const after = Number(query.after || 0);
    if (after > 0) messages = messages.filter((message) => message.at > after);
    const requestedLimit = Number(query.limit || 0);
    const limit = requestedLimit > 0 ? Math.max(1, Math.min(100, requestedLimit)) : 0;
    const total = messages.length;
    if (limit > 0 && messages.length > limit) {
      messages = after > 0 ? messages.slice(0, limit) : messages.slice(-limit);
    }
    const hasMore = limit > 0 && total > messages.length;
    return {
      messages,
      page: {
        limit: limit || null,
        total,
        hasMore,
        nextBefore: !after && hasMore ? messages[0]?.at || null : null,
        nextAfter: after && hasMore ? messages.at(-1)?.at || null : null,
        q,
      },
    };
  }

  function blockedUserIds(user) {
    return new Set(Array.isArray(user?.blockedUserIds) ? user.blockedUserIds : []);
  }

  function areConversationParticipantsBlocked(conversation, userId) {
    const otherId = conversation.participantIds.find((id) => id !== userId);
    const other = otherId ? findUser(otherId) : null;
    return !!(other && (
      blockedUserIds(findUser(userId)).has(otherId)
      || blockedUserIds(other).has(userId)
    ));
  }

  function registerMessageSafetyAttempt({ user, conversation, analysis }) {
    const timestamp = now();
    const prior = (user.messageSafetyAttempts || [])
      .filter((item) => item.at > timestamp - MESSAGE_SAFETY_ATTEMPT_WINDOW_MS);
    const attempt = {
      id: newId('msa'),
      at: timestamp,
      conversationId: conversation?.id || null,
      categories: analysis.categories,
      severity: analysis.severity,
    };
    prior.push(attempt);
    user.messageSafetyAttempts = prior;
    const highCount = prior.filter((item) => item.severity === 'high').length;
    if (highCount >= SAFETY_STRIKE_LIMIT) {
      user.messageSafetyBlockedUntil = Math.max(
        user.messageSafetyBlockedUntil || 0,
        timestamp + SAFETY_COOLDOWN_MS,
      );
    }
    if (conversation) {
      conversation.safetyIncidents = [
        ...(conversation.safetyIncidents || []),
        { ...attempt, userId: user.id },
      ].slice(-50);
      const hasQueueItem = repositories.reviewQueue.open()
        .some((item) => item.type === 'conversation' && item.refId === conversation.id);
      if (!hasQueueItem && (analysis.severity === 'high' || highCount >= SAFETY_STRIKE_LIMIT)) {
        repositories.reviewQueue.append({ type: 'conversation', refId: conversation.id });
      }
    }
    return { cooldownUntil: user.messageSafetyBlockedUntil || null, highCount };
  }

  function messageSafetyError({ analysis, cooldownUntil = null }) {
    return {
      code: cooldownUntil ? 'message_safety_cooldown' : 'message_safety_blocked',
      categories: analysis.categories,
      cooldownUntil,
      error: cooldownUntil
        ? 'Pour votre securite, l envoi est temporairement limite. Gardez les echanges et le paiement dans Wigolink.'
        : 'Pour votre securite, les coordonnees, liens, reseaux sociaux et paiements externes ne peuvent pas etre partages. Gardez vos echanges dans Wigolink.',
    };
  }

  function unreadConversationCount(userId) {
    return db.conversations
      .filter((conversation) => conversation.participantIds.includes(userId))
      .reduce((sum, conversation) => {
        const unread = db.messages.filter((message) =>
          message.conversationId === conversation.id
          && message.from !== userId
          && !(message.readBy || []).includes(userId)
        ).length;
        return sum + unread;
      }, 0);
  }

  function markConversationRead(conversationId, userId) {
    let changed = false;
    for (const message of db.messages) {
      if (message.conversationId !== conversationId || message.from === userId) continue;
      const readBy = new Set(message.readBy || []);
      if (!readBy.has(userId)) {
        readBy.add(userId);
        message.readBy = [...readBy];
        changed = true;
      }
    }
    return changed;
  }

  return {
    adminConversationModerationView,
    areConversationParticipantsBlocked,
    blockedUserIds,
    broadcastConversation,
    clientMessageView,
    conversationMessages,
    conversationMessagesPage,
    conversationView,
    findOrCreateConversation,
    markConversationRead,
    messageSafetyError,
    normalizeMessageLocation,
    registerMessageSafetyAttempt,
    unreadConversationCount,
  };
}
