// Premiere couche repository (PRD Production P0.1).
//
// Objectif: sortir progressivement `server/index.js` des acces directs a
// `db.<collection>` sans casser la demo JSON. Les repositories ci-dessous
// utilisent encore le store JSON, mais leur interface est celle qu'un adaptateur
// Postgres/Supabase pourra reprendre collection par collection.
import {
  isNotificationVisible,
  NOTIFICATION_RETENTION_MS,
} from './notification-retention.js';

export function createRepositories({
  db,
  save,
  newId,
  findUser,
  publicUser,
  now = Date.now,
  notificationRetentionMs = NOTIFICATION_RETENTION_MS,
}) {
  return {
    accountConfirmations: createAccountConfirmationRepository({ db }),
    authResets: createAuthResetRepository({ db }),
    authVerifications: createAuthVerificationRepository({ db }),
    auditLogs: createAuditLogRepository({ db, save, newId, findUser, publicUser }),
    customWhitelist: createCustomWhitelistRepository({ db }),
    kyc: createKycRepository({ db, newId, findUser }),
    messages: createMessageRepository({ db, newId }),
    notifications: createNotificationRepository({
      db,
      newId,
      now,
      retentionMs: notificationRetentionMs,
    }),
    reviewQueue: createReviewQueueRepository({ db, newId }),
    settings: createSettingsRepository(),
    users: createUserRepository({ db }),
  };
}

function createAuthResetRepository({ db }) {
  const ensure = () => {
    db.resets = db.resets || {};
    return db.resets;
  };

  return {
    get(email) {
      return ensure()[email] || null;
    },

    set(email, reset) {
      ensure()[email] = reset;
      return reset;
    },

    remove(email) {
      delete ensure()[email];
    },
  };
}

function createAuthVerificationRepository({ db }) {
  const ensure = () => {
    db.pendingVerifications = db.pendingVerifications || {};
    return db.pendingVerifications;
  };

  return {
    get(email) {
      return ensure()[email] || null;
    },

    set(email, verification) {
      ensure()[email] = verification;
      return verification;
    },

    remove(email) {
      delete ensure()[email];
    },
  };
}

function createUserRepository({ db }) {
  const ensure = () => {
    db.users = db.users || [];
    return db.users;
  };

  return {
    append(user) {
      ensure().push(user);
      return user;
    },

    findByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      return ensure().find((user) => user.email === normalized) || null;
    },
  };
}

function createAccountConfirmationRepository({ db }) {
  const ensure = () => {
    db.accountConfirmations = db.accountConfirmations || {};
    return db.accountConfirmations;
  };

  return {
    get(userId) {
      return ensure()[userId] || null;
    },

    set(userId, confirmation) {
      ensure()[userId] = confirmation;
      return confirmation;
    },

    remove(userId) {
      delete ensure()[userId];
    },
  };
}

const DEFAULT_NOTIFICATION_SETTINGS = {
  transactions: true,
  messages: true,
  shipments: true,
  reminders: true,
  security: true,
};

function createSettingsRepository() {
  return {
    ensure(user) {
      user.settings = user.settings || {};
      user.settings.notifications = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(user.settings.notifications || {}),
        security: true,
      };
      return user.settings;
    },

    updateNotifications(user, input = {}) {
      const next = { ...this.ensure(user).notifications };
      for (const key of Object.keys(DEFAULT_NOTIFICATION_SETTINGS)) {
        if (key === 'security') continue;
        if (input[key] !== undefined) next[key] = !!input[key];
      }
      next.security = true;
      user.settings = { ...user.settings, notifications: next };
      return this.ensure(user);
    },

    markOnboardingDone(user) {
      user.settings = { ...this.ensure(user), onboardingDone: true };
      return this.ensure(user);
    },
  };
}

function createCustomWhitelistRepository({ db }) {
  const ensure = () => {
    db.customWhitelist = db.customWhitelist || [];
    return db.customWhitelist;
  };

  return {
    all() {
      return [...ensure()];
    },

    combinedWith(baseWhitelist) {
      return [...baseWhitelist, ...ensure()];
    },

    remove(id) {
      const index = ensure().findIndex((c) => c.id === id);
      if (index === -1) return null;
      const [removed] = ensure().splice(index, 1);
      return removed;
    },

    hasIn(baseWhitelist, categoryId) {
      return this.combinedWith(baseWhitelist).some((c) => c.id === categoryId);
    },

    promoteFromListing(listing, { maxQty, at = Date.now() } = {}) {
      const entry = {
        id: listing.categoryId,
        label: listing.categoryLabel,
        maxQty: String(maxQty || 'Usage personnel (a confirmer)').slice(0, 40),
        icon: listing.icon || '📦',
        addedFrom: listing.id,
        addedAt: at,
      };
      ensure().push(entry);
      return entry;
    },
  };
}

function createReviewQueueRepository({ db, newId }) {
  const ensure = () => {
    db.reviewQueue = db.reviewQueue || [];
    return db.reviewQueue;
  };

  return {
    append({ type, refId, status = 'open', createdAt = Date.now() }) {
      const item = { id: newId('rq'), type, refId, status, createdAt };
      ensure().push(item);
      return item;
    },

    open({ type = null } = {}) {
      return ensure().filter((r) => r.status === 'open' && (!type || r.type === type));
    },

    find(id) {
      return ensure().find((r) => r.id === id);
    },

    close(item, decision) {
      item.status = 'closed';
      item.decision = decision;
      return item;
    },
  };
}

function createKycRepository({ db, newId, findUser }) {
  const submissions = () => {
    db.kycSubmissions = db.kycSubmissions || [];
    return db.kycSubmissions;
  };
  const decisions = () => {
    db.kycDecisions = db.kycDecisions || [];
    return db.kycDecisions;
  };

  const sortedForUser = (userId) => submissions()
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const priorRejects = (userId, before = Infinity) => submissions()
    .filter((s) => s.userId === userId && s.status === 'rejected' && s.submittedAt < before)
    .length;

  return {
    listForUser(userId) {
      return sortedForUser(userId);
    },

    rejectedCountForUser(userId, { before = Infinity } = {}) {
      return priorRejects(userId, before);
    },

    appendSubmission(data) {
      const submission = {
        id: newId('kyc'),
        submittedAt: Date.now(),
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        decisionReason: null,
        ...data,
      };
      submissions().push(submission);
      return submission;
    },

    purgeSensitiveForUser(userId) {
      for (const s of submissions()) {
        if (s.userId === userId) {
          s.selfiePhoto = null;
          s.idFrontPhoto = null;
          s.idBackPhoto = null;
          s.legalName = '(supprime)';
        }
      }
    },

    pending() {
      return submissions().filter((s) => s.status === 'pending');
    },

    reviewed() {
      return submissions().filter((s) => s.reviewedAt);
    },

    list({ filter = 'pending', q = '' } = {}) {
      const statusMap = { pending: 'pending', verified: 'approved', rejected: 'rejected', refused: 'refused' };
      let list = [...submissions()];
      if (filter !== 'all') list = list.filter((s) => s.status === statusMap[filter]);
      const term = String(q || '').toLowerCase().trim();
      if (term) {
        list = list.filter((s) => {
          const u = findUser(s.userId);
          return s.legalName.toLowerCase().includes(term) || (u && u.email.toLowerCase().includes(term));
        });
      }
      return list.sort((a, b) => (filter === 'pending' ? a.submittedAt - b.submittedAt : b.submittedAt - a.submittedAt));
    },

    findSubmission(id) {
      return submissions().find((x) => x.id === id);
    },

    historyForUser(userId) {
      return decisions()
        .filter((d) => d.userId === userId)
        .sort((a, b) => b.at - a.at);
    },

    appendDecision({ submissionId, userId, adminId, decision, reason, at = Date.now() }) {
      const record = { id: newId('kycd'), submissionId, userId, adminId, decision, reason, at };
      decisions().push(record);
      return record;
    },

    rejectionCountsByUser() {
      const counts = {};
      for (const s of submissions()) {
        if (s.status !== 'rejected' && s.status !== 'refused') continue;
        counts[s.userId] = (counts[s.userId] || 0) + 1;
      }
      return counts;
    },

  };
}

function createMessageRepository({ db, newId }) {
  const ensure = () => {
    db.messages = db.messages || [];
    return db.messages;
  };

  return {
    append({ txId, from, text, flagged = false, at = Date.now() }) {
      const msg = { id: newId('m'), txId, from, text, flagged, at };
      ensure().push(msg);
      return msg;
    },

    listForTransaction(txId) {
      return ensure().filter((m) => m.txId === txId);
    },

    listFromUser(userId) {
      return ensure().filter((m) => m.from === userId);
    },

    flaggedFromUser(userId) {
      return ensure().filter((m) => m.from === userId && m.flagged);
    },

    flagged() {
      return ensure().filter((m) => m.flagged);
    },

    flaggedSenderCount() {
      return new Set(this.flagged().map((m) => m.from)).size;
    },

    count() {
      return ensure().length;
    },

    all() {
      return [...ensure()];
    },
  };
}

function createNotificationRepository({ db, newId, now, retentionMs }) {
  const ensure = () => {
    db.notifications = db.notifications || [];
    return db.notifications;
  };

  const isVisible = (notification) => isNotificationVisible(notification, {
    now,
    retentionMs,
  });

  const sortedForUser = (userId) => ensure()
    .filter((n) => n.userId === userId && isVisible(n))
    .sort((a, b) => b.at - a.at);

  return {
    append({ userId, txId = null, type = 'transactions', section = null, key = null, params = {}, text = null, at = Date.now() }) {
      const entry = { id: newId('n'), userId, txId, type, section, read: false, at };
      if (key) {
        entry.key = key;
        entry.params = params || {};
      }
      if (text) entry.text = text;
      ensure().push(entry);
      return entry;
    },

    listForUser(userId, { limit = 30 } = {}) {
      return sortedForUser(userId).slice(0, Math.max(1, Math.min(100, Number(limit) || 30)));
    },

    unreadCount(userId) {
      return ensure()
        .filter((n) => n.userId === userId && !n.read && isVisible(n))
        .length;
    },

    markAllRead(userId) {
      let changed = 0;
      for (const n of ensure()) {
        if (n.userId === userId && !n.read && isVisible(n)) {
          n.read = true;
          changed += 1;
        }
      }
      return changed;
    },
  };
}

function createAuditLogRepository({ db, save, newId, findUser, publicUser }) {
  const ensure = () => {
    db.auditLogs = db.auditLogs || [];
    return db.auditLogs;
  };

  return {
    append({ actorId, action, targetType, targetId, meta = {} }) {
      const log = {
        id: newId('audit'),
        actorId,
        action,
        targetType,
        targetId,
        meta,
        at: Date.now(),
      };
      ensure().push(log);
      return log;
    },

    list({ limit = 80 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
      return [...ensure()]
        .sort((a, b) => b.at - a.at)
        .slice(0, safeLimit)
        .map((log) => ({
          ...log,
          actor: publicUser(findUser(log.actorId)) || { id: log.actorId, name: 'system' },
        }));
    },

    listForMember(userId, { limit = 200 } = {}) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
      return [...ensure()]
        .filter((log) => log.actorId === userId || log.targetId === userId || log.meta?.subjectUserId === userId)
        .sort((a, b) => b.at - a.at)
        .slice(0, safeLimit)
        .map((log) => ({
          ...log,
          actor: publicUser(findUser(log.actorId)) || { id: log.actorId, name: 'system' },
        }));
    },

    flush() {
      save();
    },
  };
}
