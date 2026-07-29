const DEFAULT_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export function createAccountEmailService({
  confirmations,
  normalizeEmail,
  emailPattern,
  findByEmail,
  verifyPassword,
  rateLimit,
  newCode,
  deliverCode,
  demoHint,
  clearUserSessions,
  auditChange,
  save,
  now = Date.now,
  confirmationTtlMs = DEFAULT_CONFIRMATION_TTL_MS,
}) {
  async function requestChange({ user, body, lang }) {
    const newEmail = normalizeEmail(body?.newEmail);
    const currentPassword = String(body?.currentPassword || '');
    if (!emailPattern.test(newEmail)) {
      return { status: 400, error: 'Adresse email invalide' };
    }
    if (newEmail === user.email) {
      return { status: 400, error: 'Utilisez une adresse email differente' };
    }
    if (await findByEmail(newEmail)) {
      return {
        status: 400,
        error: 'Un compte utilise deja cette adresse email',
      };
    }
    if (!user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
      return { status: 400, error: 'Mot de passe actuel incorrect' };
    }
    if (await rateLimit(`change-email:${user.id}`)) {
      return {
        status: 429,
        error: 'Trop de demandes. Reessayez plus tard.',
      };
    }

    const code = newCode();
    try {
      await deliverCode(newEmail, code, 'change_email', lang);
    } catch (error) {
      return { status: 503, error: error.message };
    }
    await confirmations.set(user.id, {
      type: 'change_email',
      newEmail,
      code,
      expires: now() + confirmationTtlMs,
    });
    save();
    return {
      value: {
        ok: true,
        demoHint: demoHint(code, lang),
      },
    };
  }

  async function confirmChange({ user, body }) {
    const pending = await confirmations.get(user.id);
    const code = String(body?.code || '').trim();
    if (!pending || pending.type !== 'change_email' || pending.expires < now()) {
      return {
        status: 400,
        error: 'Code expire. Recommencez la demande.',
      };
    }
    if (pending.code !== code) {
      return { status: 400, error: 'Code incorrect' };
    }
    if (await findByEmail(pending.newEmail)) {
      return {
        status: 400,
        error: 'Cette adresse email est deja utilisee',
      };
    }

    const previousEmail = user.email;
    user.email = pending.newEmail;
    user.emailVerified = true;
    await confirmations.remove(user.id);
    await clearUserSessions(user.id);
    await auditChange({
      actorId: user.id,
      action: 'profile.email.update',
      targetType: 'user',
      targetId: user.id,
      subjectUserId: user.id,
      before: { email: previousEmail },
      after: user,
      fields: ['email'],
    });
    save();
    return { value: { ok: true, mustRelogin: true } };
  }

  return {
    requestChange,
    confirmChange,
  };
}
