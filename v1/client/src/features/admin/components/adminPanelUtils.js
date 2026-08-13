import { dateLocale, t } from '../../../i18n.js';

export function auditAction(action) {
  const keys = {
    'profile.update': 'admin.audit.profileUpdate',
    'profile.photo.update': 'admin.audit.profilePhotoUpdate',
    'profile.password.update': 'admin.audit.profilePasswordUpdate',
    'profile.email.update': 'admin.audit.profileEmailUpdate',
    'profile.delete': 'admin.audit.profileDelete',
    'settings.notifications.update': 'admin.audit.settingsNotificationsUpdate',
    'trip.create': 'admin.audit.tripCreate',
    'trip.update': 'admin.audit.tripUpdate',
    'trip.remove': 'admin.audit.tripRemove',
    'listing.create': 'admin.audit.listingCreate',
    'listing.update': 'admin.audit.listingUpdate',
    'listing.cancel': 'admin.audit.listingCancel',
    'conversation.delete': 'admin.audit.conversationDelete',
  };
  if (keys[action]) return t(keys[action]);
  const translatedStatus = adminStatus(action);
  return translatedStatus === action
    ? t('admin.audit.administrativeEvent')
    : translatedStatus;
}

export function auditField(field) {
  return {
    name: 'Nom', city: 'Ville', phone: 'Telephone', email: 'E-mail', hasPhoto: 'Photo de profil',
    transactions: 'Transactions', messages: 'Messages', shipments: 'Envois', reminders: 'Rappels',
    from: 'Depart', to: 'Arrivee', departureDate: 'Date de depart', transportMode: 'Type de transport', capacityKg: 'Capacite',
    price: 'Prix', description: 'Description', conditions: 'Conditions', status: 'Statut',
    title: 'Titre', categoryLabel: 'Categorie', weightKg: 'Poids', valueEur: 'Valeur declaree',
    dateFrom: 'Date de debut', dateTo: 'Date de fin', travelerPay: 'Remuneration voyageur',
    provider: 'Methode de connexion',
  }[field] || field;
}

export function auditValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

export function formatAdminDate(value) {
  return value ? new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(adminDate(value)) : '—';
}

export function formatAdminShortDate(value) {
  return value ? new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(adminDate(value)) : '—';
}

function adminDate(value) {
  const numericValue = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value)
    : value;
  const timestamp = typeof numericValue === 'number' && numericValue < 1e12
    ? numericValue * 1000
    : numericValue;
  return new Date(timestamp);
}

export function formatPercent(value) {
  return new Intl.NumberFormat(dateLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

export function adminStatus(status) {
  const key = {
    none: 'admin.status.none',
    pending: 'admin.status.pending',
    approved: 'admin.status.approved',
    verified: 'admin.status.verified',
    rejected: 'admin.status.rejected',
    refused: 'admin.status.refused',
    expired: 'admin.status.expired',
    accepted: 'admin.status.accepted',
    awaiting_payment: 'admin.status.awaitingPayment',
    paid: 'admin.status.paid',
    meetup: 'admin.status.meetup',
    sealed: 'admin.status.sealed',
    in_transit: 'admin.status.inTransit',
    delivered: 'admin.status.delivered',
    released: 'admin.status.released',
    disputed: 'admin.status.disputed',
    refunded: 'admin.status.refunded',
    cancelled: 'admin.status.cancelled',
    held: 'admin.status.held',
    release_pending: 'admin.status.releasePending',
    message: 'admin.status.message',
    photo: 'admin.status.photo',
    location: 'admin.status.location',
    warning: 'admin.status.warning',
    system: 'admin.system',
    'message.safety_blocked': 'admin.audit.messageBlocked',
    'kyc.approve': 'admin.audit.kycApproved',
    'kyc.reject': 'admin.audit.kycRejected',
    'kyc.refuse': 'admin.audit.kycRefused',
  }[status];
  return key ? t(key) : status || '—';
}

export function opsTaskCopy(id, field, fallback) {
  const suffix = {
    'review-disputes': 'disputes',
    'kyc-overdue': 'kyc',
    'gray-listings': 'gray',
    'review-conversations': 'conversations',
    'fraud-signals': 'fraud',
  }[id];
  if (!suffix) return fallback;
  if (field === 'body' && id === 'kyc-overdue') {
    return t(fallback?.includes('SLA') ? 'admin.task.kyc.overdueBody' : 'admin.task.kyc.body');
  }
  return t(`admin.task.${suffix}.${field}`);
}

export function conversationContextLabel(type, fallback) {
  const key = {
    operation: 'admin.context.operation',
    trip: 'admin.context.trip',
    direct: 'admin.context.direct',
  }[type];
  return key ? t(key) : (fallback || t('admin.context.direct'));
}

export function safetyCategoryLabel(category) {
  const key = {
    email: 'messages.safety.category.email',
    phone: 'messages.safety.category.phone',
    phone_words: 'messages.safety.category.phone',
    url: 'messages.safety.category.link',
    social_handle: 'messages.safety.category.social',
    off_platform_contact: 'messages.safety.category.outside',
    external_payment: 'admin.report.externalPayment',
    repeated_attempts: 'admin.safety.repeatedAttempts',
  }[category];
  return key ? t(key) : category;
}

// Revue d'une annonce en zone grise : l'approbation demande une quantité max, car
// approuver promeut la catégorie en liste blanche pour tous les envois suivants.
