export function createNotificationService({
  notifications,
  findUser,
  getUserSettings,
  defaultSettings,
  renderNotification,
}) {
  return async function notify(
    userIds,
    textOrKey,
    txId = null,
    type = 'transactions',
    section = null,
  ) {
    const isKeyed = textOrKey && typeof textOrKey === 'object';
    const writes = [];

    for (const userId of new Set(userIds.filter(Boolean))) {
      const user = findUser(userId);
      const kind = defaultSettings[type] === undefined ? 'transactions' : type;
      const preferences = user
        ? getUserSettings(user).notifications
        : defaultSettings;
      if (kind !== 'security' && preferences[kind] === false) continue;

      const payload = isKeyed
        ? {
            key: textOrKey.key,
            params: textOrKey.params || {},
            text: renderNotification('fr', textOrKey),
          }
        : { text: textOrKey };
      writes.push(notifications.append({
        userId,
        txId,
        type: kind,
        section,
        ...payload,
      }));
    }

    return Promise.all(writes);
  };
}
