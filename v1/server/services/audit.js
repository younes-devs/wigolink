export function auditValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

export function auditChanges(before = {}, after = {}, fields = []) {
  return fields.flatMap((field) => {
    const previous = auditValue(before[field]);
    const next = auditValue(after[field]);
    return Object.is(previous, next)
      ? []
      : [{ field, before: previous, after: next }];
  });
}

export function createAuditService({ auditLogs }) {
  async function audit(actorId, action, targetType, targetId, meta = {}) {
    return auditLogs.append({
      actorId,
      action,
      targetType,
      targetId,
      meta,
    });
  }

  async function auditChange({
    actorId,
    action,
    targetType,
    targetId,
    subjectUserId,
    before,
    after,
    fields,
    meta = {},
  }) {
    const changes = auditChanges(before, after, fields);
    if (!changes.length && !meta.recordEmpty) return null;
    return audit(actorId, action, targetType, targetId, {
      ...meta,
      subjectUserId,
      changes,
    });
  }

  return {
    audit,
    auditChange,
  };
}
