export function createAdminRecordService({
  db,
  findUser,
  kycRepository,
  auditLogsRepository,
  messageSafetyWindowMs,
  kycSlaMs,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function userView(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city,
      isAdmin: !!user.isAdmin,
      emailVerified: !!user.emailVerified,
      kycStatus: user.kycStatus,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt || null,
      suspendedUntil: user.suspendedUntil || null,
      suspensionReason: user.suspensionReason || null,
      messageSafetyAttempts: (user.messageSafetyAttempts || [])
        .filter(
          (item) => item.at > now() - messageSafetyWindowMs,
        ).length,
    };
  }

  function caseParticipant(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      city: user.city || null,
      photoUrl: user.photoUrl || null,
      provider: user.provider || 'email',
      emailVerified: !!user.emailVerified,
      kycStatus: user.kycStatus || 'none',
      createdAt: user.createdAt || null,
      deletedAt: user.deletedAt || null,
    };
  }

  function users(query = {}) {
    const needle = String(query.q || '').trim().toLowerCase();
    const members = db.users
      .filter(
        (user) =>
          !needle
          || `${user.name} ${user.email} ${user.city}`
            .toLowerCase()
            .includes(needle),
      )
      .sort(
        (a, b) =>
          Number(!!b.isAdmin) - Number(!!a.isAdmin)
          || (b.createdAt || 0) - (a.createdAt || 0),
      )
      .slice(0, 100)
      .map(userView);
    return {
      users: members,
      adminCount: db.users.filter(
        (user) => user.isAdmin && !user.deletedAt,
      ).length,
    };
  }

  async function buildCaseFile(
    user,
    { messageOffset = 0, messageLimit = 50 } = {},
  ) {
    const conversations = db.conversations
      .filter(
        (conversation) => conversation.participantIds.includes(user.id),
      )
      .sort(
        (a, b) =>
          (b.lastMessageAt || b.createdAt || 0)
          - (a.lastMessageAt || a.createdAt || 0),
      );
    const conversationIds = new Set(
      conversations.map((conversation) => conversation.id),
    );
    const conversationsById = new Map(
      conversations.map((conversation) => [
        conversation.id,
        conversation,
      ]),
    );
    const allMessages = db.messages
      .filter(
        (message) => conversationIds.has(message.conversationId),
      )
      .sort((a, b) => b.at - a.at);
    const transactions = db.transactions
      .filter(
        (transaction) => [
          transaction.senderId,
          transaction.travelerId,
          transaction.recipientId,
        ].includes(user.id),
      )
      .sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      );
    const transactionIds = new Set(
      transactions.map((transaction) => transaction.id),
    );
    const kyc = kycRepository
      .listForUser(user.id)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((submission) => ({
        id: submission.id,
        status: submission.status,
        legalName: submission.legalName,
        birthDate: submission.birthDate,
        documentType: submission.documentType,
        submittedAt: submission.submittedAt,
        reviewedAt: submission.reviewedAt || null,
        reviewedBy: submission.reviewedBy || null,
        decisionReason: submission.decisionReason || null,
        selfiePhoto: submission.selfiePhoto || null,
        idFrontPhoto: submission.idFrontPhoto || null,
        idBackPhoto: submission.idBackPhoto || null,
        documentsPurged:
          !submission.selfiePhoto
          && !submission.idFrontPhoto
          && !submission.idBackPhoto,
      }));
    const auditLogs = await auditLogsRepository.listForMember(
      user.id,
      { limit: 500 },
    );
    const messages = allMessages
      .slice(messageOffset, messageOffset + messageLimit)
      .map((message) => {
        const conversation = conversationsById.get(
          message.conversationId,
        );
        const recipientIds = (
          conversation?.participantIds || []
        ).filter((id) => id !== message.from);
        return {
          id: message.id,
          conversationId: message.conversationId,
          from: caseParticipant(findUser(message.from)),
          to: recipientIds
            .map((id) => caseParticipant(findUser(id)))
            .filter(Boolean),
          text: message.text || '',
          type: message.type || 'text',
          flagged: !!message.flagged,
          flagReason: message.flagReason || null,
          attachments: (message.attachments || []).map(
            (attachment) => ({
              id: attachment.id,
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
            }),
          ),
          location: message.location
            ? {
              kind: message.location.kind,
              labelKey: message.location.labelKey,
              label: message.location.label,
              city: message.location.city,
              precision: message.location.precision,
              expiresAt: message.location.expiresAt,
            }
            : null,
          at: message.at,
          deletedAt: message.deletedAt || null,
        };
      });
    return {
      member: {
        ...caseParticipant(user),
        suspensionReason: user.suspensionReason || null,
        suspendedUntil: user.suspendedUntil || null,
      },
      kyc,
      trips: db.trips
        .filter((trip) => trip.travelerId === user.id)
        .sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        ),
      listings: db.listings
        .filter((listing) => listing.senderId === user.id)
        .sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        ),
      transactions,
      disputes: db.disputes
        .filter((dispute) => transactionIds.has(dispute.txId))
        .sort((a, b) => b.createdAt - a.createdAt),
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt || null,
        tripId: conversation.tripId || null,
        operationId: conversation.operationId || null,
        participants: conversation.participantIds
          .map((id) => caseParticipant(findUser(id))),
        reports: conversation.reports || [],
        messageCount: allMessages.filter(
          (message) => message.conversationId === conversation.id,
        ).length,
      })),
      messages,
      messagePage: {
        offset: messageOffset,
        limit: messageLimit,
        total: allMessages.length,
        hasMore: messageOffset + messages.length < allMessages.length,
      },
      notifications: (db.notifications || [])
        .filter((notification) => notification.userId === user.id)
        .sort((a, b) => b.at - a.at)
        .slice(0, 100),
      safetyAppeals: (db.safetyAppeals || [])
        .filter((appeal) => appeal.userId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt),
      auditLogs,
      retention: {
        kycImagesAvailable: kyc.some(
          (submission) => !submission.documentsPurged,
        ),
        note: 'Les documents KYC peuvent etre purges a l issue de la duree de conservation applicable. La trace de decision reste auditable.',
      },
    };
  }

  async function caseFile(id, query = {}) {
    const user = findUser(id);
    if (!user) {
      return response(404, { error: 'Membre introuvable' });
    }
    const offset = Math.max(0, Number(query.offset || 0) || 0);
    const limit = Math.max(
      10,
      Math.min(100, Number(query.limit || 50) || 50),
    );
    return response(200, {
      caseFile: await buildCaseFile(user, {
        messageOffset: offset,
        messageLimit: limit,
      }),
    });
  }

  async function auditLogs(query = {}) {
    return {
      logs: await auditLogsRepository.list({
        limit: query.limit,
      }),
    };
  }

  function kycSummary(submission) {
    const user = findUser(submission.userId);
    const priorRejects = kycRepository.rejectedCountForUser(
      submission.userId,
      { before: submission.submittedAt },
    );
    return {
      id: submission.id,
      userId: submission.userId,
      submittedAt: submission.submittedAt,
      status: submission.status,
      legalName: submission.legalName,
      documentType: submission.documentType,
      age: submission.age,
      reviewedBy: submission.reviewedBy,
      reviewedAt: submission.reviewedAt,
      decisionReason: submission.decisionReason,
      user: user
        ? {
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          kycStatus: user.kycStatus,
        }
        : null,
      priorRejects,
      overdue:
        submission.status === 'pending'
        && now() - submission.submittedAt > kycSlaMs,
    };
  }

  function kycList(query = {}) {
    const filter = query.status || 'pending';
    const q = String(query.q || '').toLowerCase().trim();
    const list = kycRepository.list({ filter, q });
    const pending = kycRepository.pending();
    const reviewed = kycRepository.reviewed();
    const avgReviewMs = reviewed.length
      ? reviewed.reduce(
        (sum, submission) =>
          sum + (submission.reviewedAt - submission.submittedAt),
        0,
      ) / reviewed.length
      : null;
    return {
      submissions: list.map(kycSummary),
      stats: {
        pending: pending.length,
        overdue: pending.filter(
          (submission) =>
            now() - submission.submittedAt > kycSlaMs,
        ).length,
        verified: db.users.filter(
          (user) => user.kycStatus === 'verified',
        ).length,
        avgReviewHours:
          avgReviewMs !== null
            ? Math.round(avgReviewMs / 3600e3 * 10) / 10
            : null,
      },
    };
  }

  function kycDetail(id) {
    const submission = kycRepository.findSubmission(id);
    if (!submission) {
      return response(404, { error: 'Demande introuvable' });
    }
    const user = findUser(submission.userId);
    const history = kycRepository
      .historyForUser(submission.userId)
      .map((decision) => ({
        ...decision,
        adminName:
          findUser(decision.adminId)?.name || decision.adminId,
      }));
    return response(200, {
      submission: {
        ...submission,
        user: user
          ? {
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
            kycStatus: user.kycStatus,
            phone: user.phone,
            city: user.city,
          }
          : null,
        priorRejects: kycRepository.rejectedCountForUser(
          submission.userId,
          { before: submission.submittedAt },
        ),
      },
      history,
    });
  }

  function safety() {
    const currentTime = now();
    const riskyUsers = db.users
      .filter(
        (user) =>
          !user.isAdmin
          && (
            (
              user.suspendedUntil
              && user.suspendedUntil > currentTime
            )
            || (user.messageSafetyAttempts || []).some(
              (item) =>
                item.at > currentTime - messageSafetyWindowMs,
            )
          ),
      )
      .map(userView)
      .sort(
        (a, b) =>
          Number(!!b.suspendedUntil) - Number(!!a.suspendedUntil)
          || b.messageSafetyAttempts - a.messageSafetyAttempts,
      );
    const appeals = (db.safetyAppeals || [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((appeal) => ({
        ...appeal,
        user: userView(findUser(appeal.userId)),
      }));
    return { riskyUsers, appeals };
  }

  return {
    users,
    caseFile,
    auditLogs,
    kycList,
    kycDetail,
    safety,
    userView,
  };
}
