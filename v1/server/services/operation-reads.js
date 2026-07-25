export function createOperationReadService({
  db,
  isClosedStatus,
  isParty,
  operationView,
  transactionView,
}) {
  function response(status, body) {
    return { status, body };
  }

  function memberTransactions(user, history) {
    return db.transactions
      .filter((transaction) => isParty(transaction, user.id))
      .filter((transaction) =>
        history
          ? isClosedStatus(transaction.status)
          : !isClosedStatus(transaction.status)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function operations(user, query = {}) {
    const history = query.history === '1';
    return {
      operations: memberTransactions(user, history)
        .map((transaction) => operationView(transaction, user)),
    };
  }

  function operation(id, user) {
    const transaction = db.transactions.find(
      (candidate) => candidate.id === id,
    );
    if (!transaction) {
      return response(404, { error: 'Operation introuvable' });
    }
    if (!isParty(transaction, user.id) && !user.isAdmin) {
      return response(403, { error: 'Non autorisé' });
    }
    return response(200, {
      operation: operationView(transaction, user),
    });
  }

  function transactions(user, query = {}) {
    const history = query.history === '1';
    return {
      transactions: memberTransactions(user, history)
        .map(transactionView(user)),
    };
  }

  function transaction(id, user) {
    const found = db.transactions.find(
      (candidate) => candidate.id === id,
    );
    if (!found) {
      return response(404, { error: 'Transaction introuvable' });
    }
    if (!isParty(found, user.id) && !user.isAdmin) {
      return response(403, { error: 'Non autorisé' });
    }
    return response(200, {
      transaction: transactionView(user)(found),
    });
  }

  function shipmentAction(listing, transaction) {
    if (listing.status === 'pending_review') {
      return {
        id: 'review',
        priority: 'medium',
        href: '/envois',
      };
    }
    if (listing.status === 'published') {
      return {
        id: 'wait_traveler',
        priority: 'medium',
        href: `/annonce/${listing.id}`,
      };
    }
    if (!transaction) {
      return {
        id: listing.status === 'cancelled' ? 'cancelled' : 'closed',
        priority: 'low',
        href: '/envois',
      };
    }
    if (transaction.status === 'accepted') {
      return {
        id: 'seal',
        priority: 'high',
        href: `/transactions/${transaction.id}#actions`,
      };
    }
    if (transaction.status === 'sealed') {
      return {
        id: 'handoff',
        priority: 'high',
        href: `/transactions/${transaction.id}#messages`,
      };
    }
    if (transaction.status === 'in_transit') {
      return {
        id: 'track',
        priority: 'medium',
        href: `/transactions/${transaction.id}#suivi`,
      };
    }
    if (transaction.status === 'disputed') {
      return {
        id: 'dispute',
        priority: 'high',
        href: `/transactions/${transaction.id}#litige`,
      };
    }
    if (transaction.status === 'released') {
      return {
        id: 'rate',
        priority: 'low',
        href: `/transactions/${transaction.id}#actions`,
      };
    }
    return {
      id: 'closed',
      priority: 'low',
      href: `/transactions/${transaction.id}`,
    };
  }

  function commandCenter(user) {
    const mine = db.listings
      .filter((listing) => listing.senderId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    const items = mine.map((listing) => {
      const transaction = db.transactions
        .filter((candidate) => candidate.listingId === listing.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
      const action = shipmentAction(listing, transaction);
      return {
        listing,
        transaction:
          transaction ? transactionView(user)(transaction) : null,
        action,
        risk: {
          customs:
            listing.valueEur
            > (listing.from === 'Casablanca' ? 430 : 185),
          gray: listing.whitelistVerdict === 'gray',
          disputed: transaction?.status === 'disputed',
        },
      };
    });
    const actions = items
      .filter((item) => ['high', 'medium'].includes(item.action.priority))
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return (
          rank[a.action.priority] - rank[b.action.priority]
          || b.listing.createdAt - a.listing.createdAt
        );
      })
      .slice(0, 5)
      .map((item) => ({
        id: `${item.listing.id}:${item.action.id}`,
        listingId: item.listing.id,
        title: item.listing.title,
        action: item.action,
        status: item.transaction?.status || item.listing.status,
      }));

    return {
      commandCenter: {
        totals: {
          total: mine.length,
          active: items.filter(
            (item) =>
              !['cancelled', 'rejected'].includes(item.listing.status),
          ).length,
          published: mine.filter(
            (listing) => listing.status === 'published',
          ).length,
          pendingReview: mine.filter(
            (listing) => listing.status === 'pending_review',
          ).length,
          matched: mine.filter(
            (listing) => listing.status === 'matched',
          ).length,
          inTransit: items.filter(
            (item) => item.transaction?.status === 'in_transit',
          ).length,
          disputed: items.filter(
            (item) => item.transaction?.status === 'disputed',
          ).length,
          escrowHeld: items.reduce(
            (total, item) =>
              total
              + (
                item.transaction?.escrow?.state === 'held'
                  ? item.transaction.escrow.amount
                  : 0
              ),
            0,
          ),
        },
        actions,
        items,
      },
    };
  }

  return {
    operations,
    operation,
    transactions,
    transaction,
    commandCenter,
  };
}
