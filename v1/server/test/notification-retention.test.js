import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNotificationVisible,
  NOTIFICATION_RETENTION_MS,
} from '../notification-retention.js';
import { createRepositories } from '../repositories.js';

const NOW = Date.parse('2026-07-28T12:00:00.000Z');

function notificationRepository(notifications) {
  return createRepositories({
    db: { notifications },
    save() {},
    newId: (prefix) => `${prefix}-new`,
    findUser() {},
    publicUser() {},
    now: () => NOW,
  }).notifications;
}

test('notification retention conserve exactement dix jours puis masque les anciennes', () => {
  assert.equal(isNotificationVisible(
    { at: NOW - NOTIFICATION_RETENTION_MS },
    { now: () => NOW },
  ), true);
  assert.equal(isNotificationVisible(
    { at: NOW - NOTIFICATION_RETENTION_MS - 1 },
    { now: () => NOW },
  ), false);
});

test('notification repository masque les expirees des listes et compteurs utilisateur', () => {
  const recent = {
    id: 'n-recent',
    userId: 'u-1',
    read: false,
    at: NOW - NOTIFICATION_RETENTION_MS + 1,
  };
  const expired = {
    id: 'n-expired',
    userId: 'u-1',
    read: false,
    at: NOW - NOTIFICATION_RETENTION_MS - 1,
  };
  const other = {
    id: 'n-other',
    userId: 'u-2',
    read: false,
    at: NOW,
  };
  const stored = [recent, expired, other];
  const repository = notificationRepository(stored);

  assert.deepEqual(repository.listForUser('u-1'), [recent]);
  assert.equal(repository.unreadCount('u-1'), 1);
  assert.equal(repository.markAllRead('u-1'), 1);
  assert.equal(recent.read, true);
  assert.equal(expired.read, false);
  assert.equal(stored.length, 3, 'l historique reste disponible pour l administration');
});
