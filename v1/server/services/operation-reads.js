export function createOperationReadService({
  db,
  isClosedStatus,
  isParty,
  operationView,
}) {
  function operations(user, query = {}) {
    const history = query.history === '1';
    const shipmentType = ['parcel', 'document'].includes(query.shipmentType)
      ? query.shipmentType
      : null;
    return {
      operations: db.transactions
        .filter((transaction) => isParty(transaction, user.id))
        .filter((transaction) => (
          history
            ? isClosedStatus(transaction.status)
            : !isClosedStatus(transaction.status)
        ))
        .filter((transaction) => (
          history
          || !shipmentType
          || (shipmentType === 'document'
            ? transaction.shipmentType === 'document'
            : (transaction.shipmentType || 'parcel') === 'parcel')
        ))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((transaction) => operationView(transaction, user)),
    };
  }

  function operation(id, user) {
    const transaction = db.transactions.find((candidate) => candidate.id === id);
    if (!transaction) {
      return { status: 404, body: { error: 'Operation introuvable' } };
    }
    if (!isParty(transaction, user.id) && !user.isAdmin) {
      return { status: 403, body: { error: 'Non autorise' } };
    }
    return {
      status: 200,
      body: { operation: operationView(transaction, user) },
    };
  }

  return { operations, operation };
}
