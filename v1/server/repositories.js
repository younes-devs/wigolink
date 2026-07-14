// Premiere couche repository (PRD Production P0.1).
//
// Objectif: sortir progressivement `server/index.js` des acces directs a
// `db.<collection>` sans casser la demo JSON. Les repositories ci-dessous
// utilisent encore le store JSON, mais leur interface est celle qu'un adaptateur
// Postgres/Supabase pourra reprendre collection par collection.

export function createRepositories({ db, save, newId, findUser, publicUser }) {
  return {
    auditLogs: createAuditLogRepository({ db, save, newId, findUser, publicUser }),
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
