// Premiere couche repository (PRD Production P0.1).
//
// Objectif: sortir progressivement `server/index.js` des acces directs a
// `db.<collection>` sans casser la demo JSON. Les repositories ci-dessous
// utilisent encore le store JSON, mais leur interface est celle qu'un adaptateur
// Postgres/Supabase pourra reprendre collection par collection.

export function createRepositories({ db, save, newId, findUser, publicUser }) {
  return {
    auditLogs: createAuditLogRepository({ db, save, newId, findUser, publicUser }),
    notifications: createNotificationRepository({ db, newId }),
  };
}

function createNotificationRepository({ db, newId }) {
  const ensure = () => {
    db.notifications = db.notifications || [];
    return db.notifications;
  };

  const sortedForUser = (userId) => ensure()
    .filter((n) => n.userId === userId)
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
      return ensure().filter((n) => n.userId === userId && !n.read).length;
    },

    markAllRead(userId) {
      let changed = 0;
      for (const n of ensure()) {
        if (n.userId === userId && !n.read) {
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

    flush() {
      save();
    },
  };
}
