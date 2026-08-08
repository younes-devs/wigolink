import { t } from '../../../i18n.js';

export function contextLabel(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.context?.labelKey) return t(conversation.context.labelKey);

  const label = conversation.operation?.title || conversation.context?.label || '';
  if (label && !isTechnicalLabel(label)) return label;
  if (conversation.operation || conversation.contextType === 'operation') return t('messages.operation.active');
  return t('messages.status.direct');
}

export function contextDetail(conversation) {
  if (conversation.actionKey) return t(conversation.actionKey);
  if (conversation.actionLabel && !isTechnicalLabel(conversation.actionLabel)) return conversation.actionLabel;
  if (conversation.operation || conversation.contextType === 'operation') {
    return operationStatusLabel(conversation.operation?.operationStatus || conversation.context?.detail);
  }
  const detail = conversation.context?.detail || '';
  return detail && !isTechnicalLabel(detail) && !isMachineValue(detail)
    ? detail
    : t('messages.context.default');
}

export function operationStatusLabel(status) {
  const key = {
    attente_confirmation: 'operations.status.awaitingConfirmation',
    paiement_requis: 'operations.status.paymentRequired',
    paye: 'operations.status.paid',
    collecte_prevue: 'operations.status.pickupPlanned',
    en_transport: 'operations.status.inTransit',
    livraison_prevue: 'operations.status.deliveryPlanned',
    litige: 'operations.status.dispute',
    termine: 'operations.status.completed',
  }[status];
  return key ? t(key) : t('messages.operation.active');
}

function isTechnicalLabel(value) {
  return /^(?:tx|op|operation|conv|t)[-_][a-z0-9-]+$/i.test(String(value).trim());
}

function isMachineValue(value) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(String(value).trim());
}
