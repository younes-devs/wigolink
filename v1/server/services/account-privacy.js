const DEFAULT_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export function createAccountPrivacyService({
  db,
  confirmations,
  messages,
  kyc,
  rateLimit,
  newCode,
  deliverCode,
  demoHint,
  isClosedStatus,
  clearUserSessions,
  auditChange,
  save,
  now = Date.now,
  confirmationTtlMs = DEFAULT_CONFIRMATION_TTL_MS,
}) {
  async function requestDeletion({ user, lang }) {
    if (await rateLimit(`delete-account:${user.id}`)) {
      return {
        status: 429,
        error: 'Trop de demandes. Reessayez plus tard.',
      };
    }
    const code = newCode();
    try {
      await deliverCode(user.email, code, 'delete_account', lang);
    } catch (error) {
      return { status: 503, error: error.message };
    }
    confirmations.set(user.id, {
      type: 'delete_account',
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

  async function exportData(user) {
    const userId = user.id;
    const { passwordHash, ...userSafe } = user;
    return {
      exportedAt: new Date(now()).toISOString(),
      user: userSafe,
      listings: db.listings.filter((listing) => listing.senderId === userId),
      trips: db.trips.filter((trip) => trip.travelerId === userId),
      transactions: db.transactions.filter((transaction) => (
        [
          transaction.senderId,
          transaction.travelerId,
          transaction.recipientId,
        ].includes(userId)
      )),
      messages: await messages.listFromUser(userId),
      disputes: db.disputes.filter((dispute) => dispute.openedBy === userId),
      kyc: kyc.listForUser(userId).map((submission) => ({
        id: submission.id,
        submittedAt: submission.submittedAt,
        status: submission.status,
        legalName: submission.legalName,
        birthDate: submission.birthDate,
        documentType: submission.documentType,
        reviewedAt: submission.reviewedAt,
        decisionReason: submission.decisionReason,
      })),
    };
  }

  async function deleteAccount({ user, body }) {
    const pending = confirmations.get(user.id);
    const code = String(body?.code || '').trim();
    if (!pending || pending.type !== 'delete_account' || pending.expires < now()) {
      return {
        status: 400,
        error: 'Code de confirmation expire. Demandez-en un nouveau.',
      };
    }
    if (pending.code !== code) {
      return {
        status: 400,
        error: 'Code de confirmation incorrect',
      };
    }

    const userId = user.id;
    const activeTransactions = db.transactions.filter((transaction) => (
      [
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ].includes(userId) && !isClosedStatus(transaction.status)
    ));
    if (activeTransactions.length > 0) {
      return {
        status: 400,
        error: `Impossible : ${activeTransactions.length} transaction(s) encore en cours. Terminez-les d'abord.`,
      };
    }

    const beforeDeletion = { ...user };
    user.name = 'Compte supprimé';
    user.email = `deleted-${userId}@wigofly.invalid`;
    user.phone = '';
    user.city = '';
    user.photoUrl = null;
    user.passwordHash = null;
    user.provider = 'deleted';
    user.deletedAt = now();
    confirmations.remove(userId);
    kyc.purgeSensitiveForUser(userId);
    await clearUserSessions(userId);
    await auditChange({
      actorId: userId,
      action: 'profile.delete',
      targetType: 'user',
      targetId: userId,
      subjectUserId: userId,
      before: beforeDeletion,
      after: user,
      fields: ['name', 'email', 'phone', 'city', 'provider'],
      meta: { recordEmpty: true },
    });
    save();
    return { value: { ok: true } };
  }

  return {
    requestDeletion,
    exportData,
    deleteAccount,
  };
}
