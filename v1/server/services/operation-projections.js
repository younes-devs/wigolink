export function createOperationProjections({
  db,
  txView,
  tripPostView,
  disputeView,
  operationCodePublicState,
}) {
  function operationView(tx, user) {
    const listing = db.listings.find((item) => item.id === tx.listingId) || null;
    const trip = db.trips.find((item) => item.id === tx.tripId) || null;
    const dispute = db.disputes.find((item) => item.txId === tx.id && item.status === 'open')
      || db.disputes.find((item) => item.txId === tx.id)
      || null;
    const statusMap = {
      accepted: 'paiement_requis',
      sealed: 'collecte_prevue',
      in_transit: 'en_transport',
      disputed: 'litige',
      released: 'termine',
      refunded: 'termine',
      cancelled: 'termine',
    };
    const view = {
      ...txView(user)(tx),
      operationStatus: tx.operationStatus || statusMap[tx.status] || 'attente_confirmation',
      title: trip ? `${trip.from} -> ${trip.to}` : listing?.title || tx.id,
      trip: trip ? tripPostView(trip, user) : null,
      price: tx.price || tx.escrow?.travelerPay || listing?.travelerPay || trip?.price || 0,
      dispute: dispute ? disputeView(dispute, tx) : null,
    };

    delete view.pickupCode;
    delete view.deliveryCode;
    delete view.securityCodes;
    const status = view.operationStatus;
    const isTraveler = user?.id === tx.travelerId;
    const isSender = user?.id === tx.senderId;
    view.security = {
      pickup: {
        ...operationCodePublicState(tx.securityCodes?.pickup),
        canReveal: status === 'paye' && isTraveler,
        canEnter: status === 'paye' && isSender,
      },
      delivery: {
        ...operationCodePublicState(tx.securityCodes?.delivery),
        canReveal: status === 'en_transport' && isSender,
        canEnter: status === 'en_transport' && isTraveler,
      },
    };
    return view;
  }

  return { operationView };
}
