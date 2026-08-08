const STEP_BY_STATUS = {
  attente_confirmation: 0,
  paiement_requis: 1,
  paye: 2,
  collecte_prevue: 2,
  en_transport: 3,
  livraison_prevue: 3,
  litige: 3,
  termine: 4,
};

const ROLE_STEP_KEYS = {
  sender: [
    'operations.guide.sender.request',
    'operations.guide.sender.payment',
    'operations.security.pickup.enter',
    'operations.security.delivery.get',
    'operations.status.completed',
  ],
  traveler: [
    'operations.guide.traveler.request',
    'operations.guide.traveler.payment',
    'operations.security.pickup.get',
    'operations.security.delivery.enter',
    'operations.status.completed',
  ],
};

const ROLE_DETAIL_KEYS = {
  sender: [
    'operations.awaiting.sender',
    'operations.guide.sender.paymentHelp',
    'operations.security.pickup.enterHint',
    'operations.security.delivery.share',
    'operations.complete',
  ],
  traveler: [
    'operations.awaiting.traveler',
    'operations.guide.traveler.paymentHelp',
    'operations.security.pickup.share',
    'operations.security.delivery.enterHint',
    'operations.complete',
  ],
};

export function operationStepIndex(status) {
  return STEP_BY_STATUS[status] ?? 0;
}

export function operationGuideSteps(operation) {
  const role = operation?.myRole === 'traveler' ? 'traveler' : 'sender';
  const current = operationStepIndex(operation?.operationStatus);
  const complete = operation?.operationStatus === 'termine';
  return ROLE_STEP_KEYS[role].map((labelKey, index) => ({
    id: `${role}-${index}`,
    labelKey,
    detailKey: ROLE_DETAIL_KEYS[role][index],
    state: complete || index < current ? 'done' : index === current ? 'current' : 'next',
  }));
}

export function operationNeedsAction(operation) {
  const status = operation?.operationStatus;
  const role = operation?.myRole;
  if (status === 'attente_confirmation') return role === 'traveler';
  if (status === 'paiement_requis') return role === 'sender';
  if (status === 'paye') {
    const pickup = operation?.security?.pickup;
    return Boolean(pickup?.canReveal || (pickup?.canEnter && pickup?.issued));
  }
  if (status === 'en_transport') {
    const delivery = operation?.security?.delivery;
    return Boolean(delivery?.canReveal || (delivery?.canEnter && delivery?.issued));
  }
  return false;
}
