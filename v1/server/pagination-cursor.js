const MAX_CURSOR_LENGTH = 512;

export function encodePageCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodePageCursor(value, validate) {
  const cursor = String(value || '').trim();
  if (!cursor || cursor.length > MAX_CURSOR_LENGTH) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
