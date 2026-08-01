export function createAdminRecordService({
  db,
  findUser,
  findKycUser = findUser,
  loadUsers = null,
  loadUser = null,
  loadUsersByIds = null,
  kycRepository,
  countVerifiedUsers = null,
  kycMedia = null,
  auditLogsRepository,
  loadAuditLogs = null,
  messageSafetyWindowMs,
  kycSlaMs,
  loadMessageArchive = null,
  loadRelationalRecords = null,
  loadSafetyState = null,
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

  async function users(query = {}) {
    if (loadUsers) {
      const result = await loadUsers(query);
      return {
        users: result.users.map(userView),
        adminCount: result.adminCount,
        page: result.page || {
          limit: result.users.length,
          hasMore: false,
          nextCursor: null,
        },
      };
    }
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
      page: {
        limit: members.length,
        hasMore: false,
        nextCursor: null,
      },
    };
  }

  async function buildCaseFile(
    user,
    { messageOffset = 0, messageLimit = 50, messageCursor = null } = {},
  ) {
    const relationalRecords = loadRelationalRecords
      ? await loadRelationalRecords(user.id)
      : null;
    const relationalArchive = loadMessageArchive
      ? await loadMessageArchive({
        userId: user.id,
        limit: messageLimit,
        cursor: messageCursor,
      })
      : null;
    const conversations = relationalArchive?.conversations
      || db.conversations
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
    const allMessages = relationalArchive?.messages
      || db.messages
        .filter(
          (message) => conversationIds.has(message.conversationId),
        )
        .sort((a, b) => b.at - a.at);
    const relatedUserIds = new Set([user.id]);
    for (const conversation of conversations) {
      for (const id of conversation.participantIds || []) relatedUserIds.add(id);
    }
    for (const message of allMessages) {
      if (message.from) relatedUserIds.add(message.from);
    }
    const relatedUsers = loadUsersByIds
      ? await loadUsersByIds([...relatedUserIds])
      : [];
    const usersById = new Map([
      ...(db.users || []).map((member) => [member.id, member]),
      ...relatedUsers.map((member) => [member.id, member]),
      [user.id, user],
    ]);
    const caseUser = (id) => usersById.get(id) || null;
    const messageTotal = relationalArchive
      ? relationalArchive.total
      : allMessages.length;
    const transactions = (relationalRecords?.transactions || db.transactions)
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
    const kycRecords = (await kycRepository.listForUser(user.id))
      .sort((a, b) => b.submittedAt - a.submittedAt);
    const kyc = await Promise.all(kycRecords.map(async (submission) => ({
        id: submission.id,
        status: submission.status,
        legalName: submission.legalName,
        birthDate: submission.birthDate,
        documentType: submission.documentType,
        submittedAt: submission.submittedAt,
        reviewedAt: submission.reviewedAt || null,
        reviewedBy: submission.reviewedBy || null,
        decisionReason: submission.decisionReason || null,
        selfiePhoto: await mediaUrl(submission.selfiePhoto),
        idFrontPhoto: await mediaUrl(submission.idFrontPhoto),
        idBackPhoto: await mediaUrl(submission.idBackPhoto),
        documentsPurged:
          !submission.selfiePhoto
          && !submission.idFrontPhoto
          && !submission.idBackPhoto,
      })));
    const auditLogs = await auditLogsRepository.listForMember(
      user.id,
      { limit: 500 },
    );
    const messages = (
      relationalArchive
        ? allMessages
        : allMessages.slice(messageOffset, messageOffset + messageLimit)
    )
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
          from: caseParticipant(caseUser(message.from)),
          to: recipientIds
            .map((id) => caseParticipant(caseUser(id)))
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
      trips: (relationalRecords?.trips || db.trips)
        .filter((trip) => trip.travelerId === user.id)
        .sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        ),
      listings: (relationalRecords?.listings || db.listings)
        .filter((listing) => listing.senderId === user.id)
        .sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        ),
      transactions,
      disputes: (relationalRecords?.disputes || db.disputes)
        .filter((dispute) => transactionIds.has(dispute.txId))
        .sort((a, b) => b.createdAt - a.createdAt),
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt || null,
        tripId: conversation.tripId || null,
        operationId: conversation.operationId || null,
        participants: conversation.participantIds
          .map((id) => caseParticipant(caseUser(id))),
        reports: conversation.reports || [],
        messageCount: conversation.messageCount
          ?? allMessages.filter(
            (message) => message.conversationId === conversation.id,
          ).length,
      })),
      messages,
      messagePage: {
        offset: relationalArchive ? null : messageOffset,
        limit: messageLimit,
        total: messageTotal,
        conversationTotal: relationalArchive
          ? relationalArchive.conversationTotal
          : conversations.length,
        hasMore: relationalArchive
          ? relationalArchive.hasMore
          : messageOffset + messages.length < messageTotal,
        nextCursor: relationalArchive?.nextCursor || null,
      },
      notifications: (relationalRecords?.notifications || db.notifications || [])
        .filter((notification) => notification.userId === user.id)
        .sort((a, b) => b.at - a.at)
        .slice(0, 100),
      safetyAppeals: (relationalRecords?.safetyAppeals || db.safetyAppeals || [])
        .filter((appeal) => appeal.userId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt),
      recordTotals: relationalRecords?.totals || {
        trips: (relationalRecords?.trips || db.trips).filter(
          (trip) => trip.travelerId === user.id,
        ).length,
        listings: (relationalRecords?.listings || db.listings).filter(
          (listing) => listing.senderId === user.id,
        ).length,
        transactions: transactions.length,
        disputes: (relationalRecords?.disputes || db.disputes).filter(
          (dispute) => transactionIds.has(dispute.txId),
        ).length,
      },
      auditLogs,
      retention: {
        kycImagesAvailable: kyc.some(
          (submission) => !submission.documentsPurged,
        ),
        note: 'Les documents KYC et la trace de decision restent disponibles selon la politique de conservation juridique applicable.',
      },
    };
  }

  async function caseFile(id, query = {}) {
    const user = loadUser ? await loadUser(id) : findUser(id);
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
        messageCursor: query.cursor || null,
      }),
    });
  }

  async function auditLogs(query = {}) {
    if (loadAuditLogs) {
      const result = await loadAuditLogs({
        limit: query.limit,
        cursor: query.cursor,
      });
      return Array.isArray(result)
        ? { logs: result, page: { hasMore: false, nextCursor: null } }
        : result;
    }
    return {
      logs: await auditLogsRepository.list({ limit: query.limit }),
      page: { hasMore: false, nextCursor: null },
    };
  }

  async function kycSummary(submission) {
    const user = await findKycUser(submission.userId);
    const priorRejects = await kycRepository.rejectedCountForUser(
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

  async function kycList(query = {}) {
    const filter = query.status || 'pending';
    const q = String(query.q || '').toLowerCase().trim();
    const [list, pending, reviewed] = await Promise.all([
      kycRepository.list({ filter, q }),
      kycRepository.pending(),
      kycRepository.reviewed(),
    ]);
    const avgReviewMs = reviewed.length
      ? reviewed.reduce(
        (sum, submission) =>
          sum + (submission.reviewedAt - submission.submittedAt),
        0,
      ) / reviewed.length
      : null;
    const verified = countVerifiedUsers
      ? await countVerifiedUsers()
      : db.users.filter((user) => user.kycStatus === 'verified').length;
    return {
      submissions: await Promise.all(list.map(kycSummary)),
      stats: {
        pending: pending.length,
        overdue: pending.filter(
          (submission) =>
            now() - submission.submittedAt > kycSlaMs,
        ).length,
        verified,
        avgReviewHours:
          avgReviewMs !== null
            ? Math.round(avgReviewMs / 3600e3 * 10) / 10
            : null,
      },
    };
  }

  async function kycDetail(id) {
    const submission = await kycRepository.findSubmission(id);
    if (!submission) {
      return response(404, { error: 'Demande introuvable' });
    }
    const user = await findKycUser(submission.userId);
    const historyRecords = await kycRepository.historyForUser(submission.userId);
    const history = await Promise.all(historyRecords.map(async (decision) => ({
        ...decision,
        adminName:
          (await findKycUser(decision.adminId))?.name || decision.adminId,
      })));
    return response(200, {
      submission: {
        ...submission,
        selfiePhoto: await mediaUrl(submission.selfiePhoto),
        idFrontPhoto: await mediaUrl(submission.idFrontPhoto),
        idBackPhoto: await mediaUrl(submission.idBackPhoto),
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
        priorRejects: await kycRepository.rejectedCountForUser(
          submission.userId,
          { before: submission.submittedAt },
        ),
      },
      history,
    });
  }

  async function mediaUrl(photo) {
    if (!photo) return null;
    if (!kycMedia) return typeof photo === 'string' ? photo : null;
    return kycMedia.viewUrl(photo);
  }

  async function safety() {
    const currentTime = now();
    if (loadSafetyState) {
      const state = await loadSafetyState({
        currentTime,
        attemptCutoff: currentTime - messageSafetyWindowMs,
      });
      return {
        riskyUsers: state.users.map(userView),
        appeals: state.appeals.map((appeal) => ({
          ...appeal,
          user: userView(appeal.user),
        })),
      };
    }
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
