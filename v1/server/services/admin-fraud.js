export function createAdminFraudService({
  db,
  findUser,
  messagesRepository,
  kycRepository,
  loadRelationalFraudState = null,
}) {
  function members() {
    return db.users.filter((user) => !user.isAdmin);
  }

  function groupedMembers(key) {
    const groups = {};
    for (const user of members()) {
      const value = user[key];
      if (!value) continue;
      (groups[value] = groups[value] || []).push(user);
    }
    return Object.entries(groups).filter(
      ([, users]) => users.length > 1,
    );
  }

  function transactionPairs() {
    const pairs = {};
    for (const transaction of db.transactions) {
      const key = [
        transaction.senderId,
        transaction.travelerId,
      ].sort().join('|');
      (pairs[key] = pairs[key] || []).push(transaction);
    }
    return pairs;
  }

  function disputeCounts() {
    const counts = {};
    for (const dispute of db.disputes) {
      const transaction = db.transactions.find(
        (candidate) => candidate.id === dispute.txId,
      );
      if (!transaction) continue;
      const participants = new Set([
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ].filter(Boolean));
      for (const userId of participants) {
        counts[userId] = (counts[userId] || 0) + 1;
      }
    }
    return counts;
  }

  async function summary() {
    const relational = loadRelationalFraudState
      ? await loadRelationalFraudState()
      : null;
    const pairCounts = relational?.repeatPairs || Object.values(transactionPairs()).map(
      (transactions) => ({ transactionCount: transactions.length }),
    );
    const disputesByUser = relational?.disputeCounts || disputeCounts();
    const kycRejections = kycRepository.rejectionCountsByUser();
    const humanMembers = members();
    return {
      linkedAccounts:
        groupedMembers('phone').length
        + groupedMembers('registerIp').length,
      repeatPairs: pairCounts.filter(
        (pair) => pair.transactionCount >= 3,
      ).length,
      flaggedMessaging: await messagesRepository.flaggedSenderCount(),
      abnormalCancel: humanMembers.filter(
        (user) => user.completed >= 3 && user.cancelRate > 0.2,
      ).length,
      disputeProne: Object.values(disputesByUser).filter(
        (count) => count >= 2,
      ).length,
      kycRepeatRejections: Object.values(kycRejections).filter(
        (count) => count >= 2,
      ).length,
    };
  }

  async function details() {
    const relational = loadRelationalFraudState
      ? await loadRelationalFraudState()
      : null;
    const linkedAccounts = [
      ...groupedMembers('phone').map(
        ([value, users]) => ({ signal: 'phone', value, users }),
      ),
      ...groupedMembers('registerIp').map(
        ([value, users]) => ({ signal: 'ip', value, users }),
      ),
    ].map(({ signal, value, users }) => ({
      signal,
      value,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })),
    }));

    const repeatPairs = relational
      ? relational.repeatPairs.map((pair) => ({
        users: [pair.firstUserId, pair.secondUserId].map((userId) => {
          const user = findUser(userId);
          return user
            ? { id: user.id, name: user.name }
            : { id: userId, name: '?' };
        }),
        transactionCount: pair.transactionCount,
        disputedCount: pair.disputedCount,
        totalValueEur: Math.round(pair.totalValueEur * 100) / 100,
      }))
      : Object.entries(transactionPairs())
        .filter(([, transactions]) => transactions.length >= 2)
        .map(([key, transactions]) => {
          const [firstId, secondId] = key.split('|');
          const disputedCount = transactions.filter(
            (transaction) =>
              transaction.status === 'disputed'
              || db.disputes.some(
                (dispute) => dispute.txId === transaction.id,
              ),
          ).length;
          return {
            users: [firstId, secondId].map((userId) => {
              const user = findUser(userId);
              return user
                ? { id: user.id, name: user.name }
                : { id: userId, name: '?' };
            }),
            transactionCount: transactions.length,
            disputedCount,
            totalValueEur: Math.round(
              transactions.reduce(
                (total, transaction) =>
                  total + (transaction.escrow?.amount || 0),
                0,
              ) * 100,
            ) / 100,
          };
        });
    repeatPairs.sort(
      (first, second) =>
        second.transactionCount - first.transactionCount,
    );

    const flaggedByUser = {};
    for (const message of await messagesRepository.all()) {
      if (!message.flagged) continue;
      flaggedByUser[message.from] =
        (flaggedByUser[message.from] || 0) + 1;
    }
    const flaggedMessaging = Object.entries(flaggedByUser)
      .map(([userId, count]) => ({
        userId,
        name: findUser(userId)?.name || '?',
        count,
      }))
      .sort((first, second) => second.count - first.count);

    const abnormalCancel = members()
      .filter((user) => user.completed >= 3 && user.cancelRate > 0.2)
      .map((user) => ({
        id: user.id,
        name: user.name,
        completed: user.completed,
        cancelRate: user.cancelRate,
      }))
      .sort(
        (first, second) => second.cancelRate - first.cancelRate,
      );

    const disputeProne = Object.entries(
      relational?.disputeCounts || disputeCounts(),
    )
      .filter(([, count]) => count >= 2)
      .map(([userId, count]) => ({
        userId,
        name: findUser(userId)?.name || '?',
        disputeCount: count,
      }))
      .sort(
        (first, second) =>
          second.disputeCount - first.disputeCount,
      );

    const kycRepeatRejections = Object.entries(
      kycRepository.rejectionCountsByUser(),
    )
      .filter(([, count]) => count >= 2)
      .map(([userId, count]) => {
        const user = findUser(userId);
        return {
          userId,
          name: user?.name || '?',
          rejectionCount: count,
          currentStatus: user?.kycStatus,
        };
      })
      .sort(
        (first, second) =>
          second.rejectionCount - first.rejectionCount,
      );

    return {
      linkedAccounts,
      repeatPairs,
      flaggedMessaging,
      abnormalCancel,
      disputeProne,
      kycRepeatRejections,
    };
  }

  return {
    details,
    summary,
  };
}
