export const NOTIFICATION_RETENTION_DAYS = 10;
export const NOTIFICATION_RETENTION_MS =
  NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function notificationCutoff({
  now = Date.now,
  retentionMs = NOTIFICATION_RETENTION_MS,
} = {}) {
  return now() - retentionMs;
}

export function isNotificationVisible(notification, options) {
  const at = Number(notification?.at);
  return Number.isFinite(at) && at >= notificationCutoff(options);
}
