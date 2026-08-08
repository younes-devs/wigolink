import { t } from '../../../i18n.js';

export function contextLabel(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.context?.labelKey) return t(conversation.context.labelKey);

  const label = conversation.operation?.title || conversation.context?.label || '';
  if (label && !isTechnicalLabel(label)) return label;
  if (conversation.operation || conversation.contextType === 'operation') return t('messages.operation.active');
  return t('messages.status.direct');
}

function isTechnicalLabel(value) {
  return /^(?:tx|op|operation|conv|t)[-_][a-z0-9-]+$/i.test(String(value).trim());
}
