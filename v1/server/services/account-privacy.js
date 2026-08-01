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
  loadRelationalRecords = null,
  loadRelationalMessages = null,
  countRelationalActiveOperations = null,
  deleteRelationalAccount = null,
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
    await confirmations.set(user.id, {
      type: 'delete_account',
      code,
      expires: now() + confirmationTtlMs,
    });
    await save();
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
    const relational = loadRelationalRecords
      ? await loadRelationalRecords(userId)
      : null;
    const kycSubmissions = await kyc.listForUser(userId);
    return {
      exportedAt: new Date(now()).toISOString(),
      user: userSafe,
      listings: relational?.listings
        || db.listings.filter((listing) => listing.senderId === userId),
      trips: relational?.trips
        || db.trips.filter((trip) => trip.travelerId === userId),
      transactions: relational?.transactions
        || db.transactions.filter((transaction) => (
        [
          transaction.senderId,
          transaction.travelerId,
          transaction.recipientId,
        ].includes(userId)
      )),
      messages: loadRelationalMessages
        ? await loadRelationalMessages(userId)
        : await messages.listFromUser(userId),
      disputes: relational?.disputes
        || db.disputes.filter((dispute) => dispute.openedBy === userId),
      kyc: kycSubmissions.map((submission) => ({
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
    const code = String(body?.code || '').trim();
    if (deleteRelationalAccount) {
      const result = await deleteRelationalAccount({
        userId: user.id,
        code,
        now: now(),
      });
      if (result.account) Object.assign(user, result.account);
      return result.status
        ? { status: result.status, error: result.error }
        : { value: { ok: true } };
    }

    const pending = await confirmations.get(user.id);
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
    const activeTransactionCount = countRelationalActiveOperations
      ? await countRelationalActiveOperations(userId)
      : db.transactions.filter((transaction) => (
        [
          transaction.senderId,
          transaction.travelerId,
          transaction.recipientId,
        ].includes(userId) && !isClosedStatus(transaction.status)
      )).length;
    if (activeTransactionCount > 0) {
      return {
        status: 400,
        error: `Impossible : ${activeTransactionCount} transaction(s) encore en cours. Terminez-les d'abord.`,
      };
    }

    const beforeDeletion = { ...user };
    user.name = 'Compte supprimé';
    user.email = `deleted-${userId}@wigolink.invalid`;
    user.phone = '';
    user.city = '';
    user.photoUrl = null;
    user.passwordHash = null;
    user.provider = 'deleted';
    user.deletedAt = now();
    await confirmations.remove(userId);
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
    await save();
    return { value: { ok: true } };
  }

  return {
    requestDeletion,
    exportData,
    deleteAccount,
  };
}
