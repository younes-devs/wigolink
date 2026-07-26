import { Router } from 'express';

export function createTripOperationsRouter({
  auth,
  db,
  tripPostView,
  todayIso,
  positiveNumber,
  newId,
  createEscrow,
  addEvent,
  findOrCreateConversation,
  notify,
  save,
  operationView,
  conversationView,
  isPartyToTx,
  transitionEscrow,
  issueOperationCode,
  audit,
  verifyOperationCode,
  findUser,
  repositories,
  disputeView,
  validPhotos,
}) {
  const router = Router();
  const TODAY_ISO = todayIso;

  router.post('/trips/:id/accept', auth, async (req, res) => {
    const trip = db.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
    const view = tripPostView(trip, req.user);
    if (view.status !== 'published' || view.departureDate < TODAY_ISO())
      return res.status(400).json({ error: 'Trajet expiré ou indisponible' });
    if (trip.travelerId === req.user.id)
      return res.status(400).json({ error: 'Vous ne pouvez pas accepter votre propre trajet' });
    if (req.user.kycStatus !== 'verified')
      return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });
  
    const shipmentType = req.body?.shipmentType === 'document' ? 'document' : 'parcel';
    const documentCount = shipmentType === 'document' ? Number(req.body?.documentCount) : 0;
    const weightKg = shipmentType === 'parcel' ? positiveNumber(req.body?.weightKg ?? view.capacityKg) : 0;
    if (shipmentType === 'document' && (!Number.isInteger(documentCount) || documentCount < 1 || documentCount > 20))
      return res.status(400).json({ error: 'Indiquez entre 1 et 20 documents.' });
    if (shipmentType === 'parcel' && (weightKg === null || weightKg > view.capacityKg))
      return res.status(400).json({ error: `Le colis doit peser entre 0 et ${view.capacityKg} kg.` });
    const price = shipmentType === 'document'
      ? documentCount * 3
      : Math.round((view.price / view.capacityKg) * weightKg * 100) / 100;
    const descriptionParcel = String(req.body?.descriptionParcel || '').trim().slice(0, 500);
    const commission = Math.round(price * 0.18 * 100) / 100;
    const tx = {
      id: newId('tx'),
      tripId: trip.id,
      listingId: null,
      senderId: req.user.id,
      travelerId: trip.travelerId,
      recipientId: req.user.id,
      status: 'accepted',
      operationStatus: 'attente_confirmation',
      price,
      currency: view.currency,
      shipmentType,
      documentCount: shipmentType === 'document' ? documentCount : null,
      weightKg: shipmentType === 'parcel' ? weightKg : 0,
      descriptionParcel,
      paymentStatus: 'pending',
      escrow: createEscrow({ travelerPay: price, commission }),
      securityCodes: {},
      sealingVideo: null,
      events: [],
      createdAt: Date.now(),
    };
    tx.escrow.state = 'pending';
    delete tx.escrow.heldAt;
    addEvent(tx, 'trip_accepted', req.user.id, { tripId: trip.id, price, shipmentType, documentCount: tx.documentCount, weightKg: tx.weightKg });
    db.transactions.push(tx);
    const conversation = findOrCreateConversation({ participantIds: [req.user.id, trip.travelerId], tripId: trip.id, operationId: tx.id });
    await notify([trip.travelerId], { key: 'offer.received', params: { name: req.user.name, title: `${trip.from} -> ${trip.to}` } }, tx.id, 'messages', 'messages');
    save();
    res.json({ operation: operationView(tx, req.user), conversation: conversationView(conversation, req.user.id) });
  });
  
  router.post('/operations/:id/pay', auth, (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Paiement réservé à l expéditeur' });
    if (tx.operationStatus !== 'paiement_requis')
      return res.status(400).json({ error: 'Le paiement attend la confirmation du voyageur' });
    tx.operationStatus = 'paye';
    tx.paymentStatus = 'paid';
    transitionEscrow(tx.escrow, 'held');
    addEvent(tx, 'operation_paid', req.user.id);
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/pickup-code', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'Ce code est reserve au voyageur' });
    if (tx.operationStatus !== 'paye') return res.status(400).json({ error: 'Le code de remise est disponible apres le paiement.' });
    const code = issueOperationCode(tx, 'pickup', req.user.id);
    addEvent(tx, 'pickup_code_issued', req.user.id, { recipientRole: 'traveler' });
    await audit(req.user.id, 'operation_pickup_code_issued', 'transaction', tx.id, { recipientRole: 'traveler' });
    save();
    res.json({ code, expiresAt: tx.securityCodes.pickup.expiresAt, operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/delivery-code', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Ce code est reserve a l expediteur' });
    if (tx.operationStatus !== 'en_transport') return res.status(400).json({ error: 'Le code de livraison est disponible apres la prise en charge.' });
    const code = issueOperationCode(tx, 'delivery', req.user.id);
    addEvent(tx, 'delivery_code_issued', req.user.id, { recipientRole: 'sender' });
    await audit(req.user.id, 'operation_delivery_code_issued', 'transaction', tx.id, { recipientRole: 'sender' });
    save();
    res.json({ code, expiresAt: tx.securityCodes.delivery.expiresAt, operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/confirm-pickup', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'La remise doit etre confirmee par l expediteur' });
    if (tx.operationStatus !== 'paye') return res.status(400).json({ error: 'La remise ne peut pas etre confirmee a cette etape.' });
    const verification = verifyOperationCode(tx, 'pickup', req.body?.code);
    if (!verification.ok) {
      addEvent(tx, 'pickup_code_failed', req.user.id, { locked: verification.status === 429 });
      await audit(req.user.id, 'operation_pickup_code_failed', 'transaction', tx.id, { locked: verification.status === 429 });
      save();
      return res.status(verification.status).json({ error: verification.error });
    }
    tx.securityCodes.pickup.verifiedAt = Date.now();
    tx.securityCodes.pickup.verifiedBy = req.user.id;
    tx.operationStatus = 'en_transport';
    tx.status = 'in_transit';
    addEvent(tx, 'pickup_code_verified', req.user.id, { proof: 'traveler_code' });
    await audit(req.user.id, 'operation_pickup_code_verified', 'transaction', tx.id, { proof: 'traveler_code' });
    await notify([tx.travelerId], { key: 'tx.pickedUp' }, tx.id, 'shipments', 'suivi');
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/confirm-delivery', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'La livraison doit etre confirmee par le voyageur' });
    if (tx.operationStatus !== 'en_transport') return res.status(400).json({ error: 'La livraison ne peut pas etre confirmee a cette etape.' });
    const verification = verifyOperationCode(tx, 'delivery', req.body?.code);
    if (!verification.ok) {
      addEvent(tx, 'delivery_code_failed', req.user.id, { locked: verification.status === 429 });
      await audit(req.user.id, 'operation_delivery_code_failed', 'transaction', tx.id, { locked: verification.status === 429 });
      save();
      return res.status(verification.status).json({ error: verification.error });
    }
    tx.securityCodes.delivery.verifiedAt = Date.now();
    tx.securityCodes.delivery.verifiedBy = req.user.id;
    tx.operationStatus = 'termine';
    tx.status = 'released';
    transitionEscrow(tx.escrow, 'released');
    for (const uid of new Set([tx.senderId, tx.travelerId])) {
      const member = findUser(uid);
      if (!member) continue;
      member.completed = (member.completed || 0) + 1;
      member.badges = member.badges || [];
      if (member.completed >= 5 && !member.badges.includes('voyageur-confirme')) member.badges.push('voyageur-confirme');
    }
    addEvent(tx, 'delivery_code_verified', req.user.id, { proof: 'sender_code', escrowReleased: true });
    await audit(req.user.id, 'operation_delivery_code_verified', 'transaction', tx.id, { proof: 'sender_code', escrowReleased: true });
    await notify([tx.senderId, tx.travelerId], { key: 'tx.delivered.sender' }, tx.id, 'shipments', 'suivi');
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/confirm', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    const current = tx.operationStatus || (tx.status === 'accepted' ? 'paiement_requis' : null);
    const transitions = {
      attente_confirmation: { next: 'paiement_requis', event: 'traveler_confirmed', role: 'traveler' },
    };
    const transition = transitions[current];
    if (!transition) return res.status(400).json({ error: 'Aucune confirmation disponible a cette etape' });
    if (transition.role === 'traveler' && tx.travelerId !== req.user.id)
      return res.status(403).json({ error: 'Confirmation reservee au voyageur' });
  
    tx.operationStatus = transition.next;
    if (transition.txStatus) tx.status = transition.txStatus;
    if (transition.escrow) transitionEscrow(tx.escrow, transition.escrow);
    addEvent(tx, transition.event, req.user.id);
  
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/reject', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'Refus reserve au voyageur' });
    if (tx.operationStatus !== 'attente_confirmation')
      return res.status(400).json({ error: 'Cette operation ne peut plus etre refusee' });
    tx.status = 'cancelled';
    tx.operationStatus = 'termine';
    tx.paymentStatus = 'cancelled';
    transitionEscrow(tx.escrow, 'refunded');
    addEvent(tx, 'traveler_rejected', req.user.id, {
      reason: String(req.body?.reason || '').trim().slice(0, 300),
    });
    await notify([tx.senderId], { key: 'offer.refused' }, tx.id, 'transactions', 'suivi');
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/cancel', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Annulation reservee a l expediteur' });
    if (!['attente_confirmation', 'paiement_requis'].includes(tx.operationStatus))
      return res.status(400).json({ error: 'Cette operation ne peut plus etre annulee' });
    tx.status = 'cancelled';
    tx.operationStatus = 'termine';
    tx.paymentStatus = 'cancelled';
    transitionEscrow(tx.escrow, 'refunded');
    addEvent(tx, 'sender_cancelled', req.user.id, {
      reason: String(req.body?.reason || '').trim().slice(0, 300),
    });
    await notify([tx.travelerId], { key: 'offer.withdrawn', params: { name: req.user.name } }, tx.id, 'transactions', 'suivi');
    save();
    res.json({ operation: operationView(tx, req.user) });
  });
  
  router.post('/operations/:id/dispute', auth, async (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    if (tx.operationStatus === 'termine') return res.status(400).json({ error: 'Operation deja terminee' });
    const existing = db.disputes.find((d) => d.txId === tx.id && d.status === 'open');
    if (existing) return res.json({ operation: operationView(tx, req.user), dispute: disputeView(existing, tx) });
  
    tx.status = 'disputed';
    tx.operationStatus = 'litige';
    transitionEscrow(tx.escrow, 'frozen');
    const dispute = {
      id: newId('d'),
      txId: tx.id,
      openedBy: req.user.id,
      reason: String(req.body?.reason || 'Probleme signale depuis En cours').trim().slice(0, 500),
      evidence: [],
      status: 'open',
      createdAt: Date.now(),
    };
    db.disputes.push(dispute);
    repositories.reviewQueue.append({ type: 'dispute', refId: dispute.id });
    addEvent(tx, 'dispute_opened', req.user.id, { reason: dispute.reason });
    await notify([tx.senderId, tx.travelerId].filter((id) => id !== req.user.id), { key: 'dispute.opened' }, tx.id, 'security', 'litige');
    save();
    res.json({ operation: operationView(tx, req.user), dispute: disputeView(dispute, tx) });
  });
  
  router.post('/operations/:id/evidence', auth, (req, res) => {
    const tx = db.transactions.find((t) => t.id === req.params.id);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    const dispute = db.disputes.find((d) => d.txId === tx.id && d.status === 'open');
    if (!dispute) return res.status(400).json({ error: 'Aucun litige ouvert sur cette operation' });
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    const { photo } = req.body || {};
    if (!text && !photo) return res.status(400).json({ error: 'Ajoutez un commentaire ou une photo' });
    if (photo && !validPhotos([photo])) return res.status(400).json({ error: 'Photo invalide' });
    dispute.evidence.push({ by: req.user.id, text: text || null, photo: photo || null, at: Date.now() });
    addEvent(tx, 'evidence_added', req.user.id);
    save();
    res.json({ operation: operationView(tx, req.user), dispute: disputeView(dispute, tx) });
  });
  
  
  return router;
}
