export const EMAIL_CODE_LENGTH = 6;

export function normalizeEmailCode(value, length = EMAIL_CODE_LENGTH) {
  return String(value || '').replace(/\D/g, '').slice(0, length);
}

export function insertEmailCode(current, index, input, length = EMAIL_CODE_LENGTH) {
  const code = normalizeEmailCode(current, length);
  const digits = normalizeEmailCode(input, length);
  if (!digits) return code.slice(0, index);

  return normalizeEmailCode(
    `${code.slice(0, index)}${digits}${code.slice(index + digits.length)}`,
    length,
  );
}
