export function createMemberOverviewService({
  db,
  isParty,
  closedStatuses,
  unreadConversationCount,
}) {
  function operationNeedsAction(transaction, userId) {
    const status = transaction.operationStatus
      || (transaction.status === 'accepted' ? 'paiement_requis' : transaction.status);

    if (status === 'attente_confirmation') return transaction.travelerId === userId;
    if (status === 'paiement_requis') return transaction.senderId === userId;
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
    if (status === 'litige') return isParty(transaction, userId);
    return false;
  }

  function navigation(user) {
    const operationsActionRequired = db.transactions
      .filter((transaction) => isParty(transaction, user.id))
      .filter((transaction) => !closedStatuses.includes(transaction.status))
      .filter((transaction) => operationNeedsAction(transaction, user.id))
      .length;

    return {
      messagesUnread: unreadConversationCount(user.id),
      operationsActionRequired,
    };
  }

  return { navigation };
}
