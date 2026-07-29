import crypto from 'node:crypto';

export function relationalId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
