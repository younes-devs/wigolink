export function createMemberOverviewService({
  db,
  publicUser,
  findUser,
  isParty,
  closedStatuses,
  unreadConversationCount,
  flaggedMessagesRepository,
  kycUserView,
  runMatchingOfferReminders,
  transactionView,
  matchesTrip,
  normalizeMatchingOffer,
  notificationsRepository,
  renderNotification,
  today = () => new Date().toISOString().slice(0, 10),
}) {
  function isClosed(status) {
    return closedStatuses.includes(status);
  }

  function operationNeedsAction(transaction, userId) {
    const status = transaction.operationStatus
      || (
        transaction.status === 'accepted'
          ? 'paiement_requis'
          : transaction.status
      );
    if (status === 'attente_confirmation') {
      return transaction.travelerId === userId;
    }
    if (status === 'paiement_requis') {
      return transaction.senderId === userId;
    }
    if (status === 'paye') {
      return transaction.securityCodes?.pickup?.issuedAt
        ? transaction.senderId === userId
        : transaction.travelerId === userId;
    }
    if (status === 'en_transport') {
      return transaction.securityCodes?.delivery?.issuedAt
        ? transaction.travelerId === userId
        : transaction.senderId === userId;
    }
    if (status === 'litige') {
      return isParty(transaction, userId);
    }
    return false;
  }

  function navigation(user) {
    const operationsActionRequired = db.transactions
      .filter((transaction) => isParty(transaction, user.id))
      .filter((transaction) => !isClosed(transaction.status))
      .filter(
        (transaction) => operationNeedsAction(transaction, user.id),
      )
      .length;
    return {
      messagesUnread: unreadConversationCount(user.id),
      operationsActionRequired,
    };
  }

  function clamp(number, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, number));
  }

  async function trust(user) {
    const transactions = db.transactions.filter(
      (transaction) => isParty(transaction, user.id),
    );
    const active = transactions.filter(
      (transaction) => !isClosed(transaction.status),
    );
    const released = transactions.filter(
      (transaction) => transaction.status === 'released',
    );
    const disputes = db.disputes
      .filter((dispute) => {
        const transaction = db.transactions.find(
          (candidate) => candidate.id === dispute.txId,
        );
        return transaction && isParty(transaction, user.id);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    const openDisputes = disputes.filter(
      (dispute) => dispute.status === 'open',
    );
    const flaggedMessages = await flaggedMessagesRepository
      .flaggedFromUser(user.id);
    const kyc = kycUserView(user);

    let score = 35;
    if (user.emailVerified) score += 8;
    if (user.kycStatus === 'verified') score += 25;
    else if (user.kycStatus === 'pending') score += 10;
    score += Math.min(
      18,
      (user.completed || released.length) * 4,
    );
    if (user.ratingCount > 0) {
      score += clamp(((user.rating || 0) - 3) * 5, 0, 10);
    }
    score -= Math.round((user.cancelRate || 0) * 35);
    score -= Math.min(18, disputes.length * 6);
    score -= Math.min(12, flaggedMessages.length * 4);
    score = clamp(Math.round(score), 0, 100);

    const level = score >= 85
      ? 'excellent'
      : score >= 70
        ? 'solid'
        : score >= 50
          ? 'limited'
          : 'risk';
    const actions = [];
    if (user.kycStatus !== 'verified') {
      actions.push({
        id: 'verify-identity',
        status: user.kycStatus || 'none',
        priority: user.kycStatus === 'pending' ? 'medium' : 'high',
        href: '/verification',
      });
    }
    if ((user.ratingCount || 0) < 3) {
      actions.push({
        id: 'build-reviews',
        status: 'todo',
        priority: 'medium',
        href: '/trajets',
      });
    }
    if (openDisputes.length > 0) {
      actions.push({
        id: 'answer-dispute',
        status: 'urgent',
        priority: 'high',
        href: `/transactions/${openDisputes[0].txId}#litige`,
      });
    }
    if (flaggedMessages.length > 0) {
      actions.push({
        id: 'keep-chat-in-app',
        status: 'warning',
        priority: 'medium',
        href: '/cgu',
      });
    }
    if (active.length >= user.maxActive) {
      actions.push({
        id: 'active-limit',
        status: 'locked',
        priority: 'medium',
        href: '/transactions',
      });
    }

    return {
      user: publicUser(user),
      score,
      level,
      stats: {
        completed: user.completed || released.length,
        rating: user.rating,
        ratingCount: user.ratingCount || 0,
        cancelRate: user.cancelRate || 0,
        active: active.length,
        released: released.length,
        disputes: disputes.length,
        openDisputes: openDisputes.length,
        flaggedMessages: flaggedMessages.length,
        memberSince: user.createdAt,
      },
      limits: {
        maxValue: user.maxValue,
        maxActive: user.maxActive,
        active: active.length,
        nextValue: user.completed >= 3 ? user.maxValue : 500,
        nextActive: user.completed >= 3 ? user.maxActive : 3,
        completedForUpgrade: Math.min(user.completed || 0, 3),
        requiredForUpgrade: 3,
      },
      identity: {
        emailVerified: !!user.emailVerified,
        kycStatus: user.kycStatus || 'none',
        kyc,
      },
      actions,
      incidents: {
        disputes: disputes.slice(0, 4).map((dispute) => ({
          id: dispute.id,
          txId: dispute.txId,
          status: dispute.status,
          reason: dispute.reason,
          createdAt: dispute.createdAt,
          evidenceCount: dispute.evidence?.length || 0,
        })),
        flaggedMessages: flaggedMessages
          .slice(-4)
          .reverse()
          .map((message) => ({
            id: message.id,
            txId: message.txId,
            at: message.at,
          })),
      },
      protections: [
        { id: 'escrow', enabled: true },
        { id: 'kyc', enabled: user.kycStatus === 'verified' },
        { id: 'video', enabled: true },
        { id: 'dispute', enabled: true },
        { id: 'customs', enabled: true },
      ],
    };
  }

  async function dashboard(user, lang) {
    await runMatchingOfferReminders({ persist: true });
    const currentDate = today();
    const trips = db.trips
      .filter(
        (trip) =>
          trip.travelerId === user.id
          && trip.date >= currentDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    const transactions = db.transactions
      .filter((transaction) => isParty(transaction, user.id))
      .sort((a, b) => b.createdAt - a.createdAt);
    const activeRaw = transactions.filter(
      (transaction) => !isClosed(transaction.status),
    );
    const activeTransactions = activeRaw.map(transactionView(user));
    const actions = activeTransactions
      .filter((transaction) => {
        if (transaction.status === 'accepted') {
          return transaction.myRole === 'sender';
        }
        if (transaction.status === 'sealed') {
          return transaction.myRole === 'traveler';
        }
        if (transaction.status === 'in_transit') {
          return transaction.myRole === 'recipient';
        }
        return transaction.status === 'disputed';
      })
      .slice(0, 5);
    const openListings = db.listings.filter(
      (listing) =>
        listing.status === 'published'
        && listing.senderId !== user.id,
    );
    const matches = openListings
      .filter(
        (listing) => trips.some((trip) => matchesTrip(listing, trip)),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((listing) => ({
        ...listing,
        sender: publicUser(findUser(listing.senderId)),
        matched: true,
      }))
      .slice(0, 5);
    const mine = db.listings.filter(
      (listing) => listing.senderId === user.id,
    );
    const offers = (db.matchingOffers || [])
      .map(normalizeMatchingOffer)
      .filter(
        (offer) =>
          offer.senderId === user.id
          || offer.travelerId === user.id,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const offerTurn = (offer) =>
      (
        offer.status === 'pending_traveler'
        && offer.travelerId === user.id
      )
      || (
        offer.status === 'countered_sender'
        && offer.senderId === user.id
      );
    const activeOffers = offers.filter(
      (offer) =>
        ['pending_traveler', 'countered_sender'].includes(
          offer.status,
        ),
    );
    const notifications = (
      await notificationsRepository.listForUser(user.id, { limit: 5 })
    ).map((notification) => ({
      ...notification,
      text: renderNotification(lang, notification),
    }));
    const unread = await notificationsRepository.unreadCount(user.id);

    return {
      user: publicUser(user),
      trust: {
        kycStatus: user.kycStatus || 'none',
        trainingDone: !!user.trainingDone,
        maxValue: user.maxValue,
        maxActive: user.maxActive,
        activeCount: activeRaw.length,
        completed: user.completed,
        rating: user.rating,
      },
      actions,
      activeTx: activeTransactions.slice(0, 5),
      trips,
      matches,
      shipments: {
        total: mine.length,
        published: mine.filter(
          (listing) => listing.status === 'published',
        ).length,
        pendingReview: mine.filter(
          (listing) => listing.status === 'pending_review',
        ).length,
        matched: mine.filter(
          (listing) => listing.status === 'matched',
        ).length,
      },
      offers: {
        active: activeOffers.length,
        mineToAct: activeOffers.filter(offerTurn).length,
        sent: offers.filter(
          (offer) => offer.senderId === user.id,
        ).length,
        received: offers.filter(
          (offer) => offer.travelerId === user.id,
        ).length,
        latest: activeOffers.slice(0, 3).map((offer) => ({
          id: offer.id,
          status: offer.status,
          offeredPay: offer.offeredPay,
          expiresAt: offer.expiresAt,
          myRole: offer.senderId === user.id ? 'sender' : 'traveler',
          waitingForMe: offerTurn(offer),
          listing: db.listings.find(
            (listing) => listing.id === offer.listingId,
          ),
          other: publicUser(
            findUser(
              offer.senderId === user.id
                ? offer.travelerId
                : offer.senderId,
            ),
          ),
        })),
      },
      notifications,
      unread,
    };
  }

  return {
    navigation,
    trust,
    dashboard,
  };
}
