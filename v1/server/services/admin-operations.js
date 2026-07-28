export function createAdminOperationsService({
  db,
  repositories,
  adminFraud,
  findUser,
  adminConversationModerationView,
  disputeView,
  localeForLang,
  kycSlaMs,
  now = Date.now,
}) {
  async function summary() {
    const reviewOpen = repositories.reviewQueue.open();
    const reviewDisputes = reviewOpen.filter((item) => item.type === 'dispute');
    const reviewListings = reviewOpen.filter((item) => item.type === 'listing');
    const reviewConversations = reviewOpen.filter((item) => item.type === 'conversation');
    const pendingKyc = repositories.kyc.pending();
    const overdueKyc = pendingKyc.filter((submission) => now() - submission.submittedAt > kycSlaMs);
    const openDisputes = db.disputes.filter((dispute) => dispute.status === 'open');
    const flaggedMessages = await repositories.messages.flagged();
    const simulatedHeld = db.transactions
      .filter((transaction) => ['held', 'frozen'].includes(transaction.escrow?.state))
      .reduce((total, transaction) => total + transaction.escrow.amount, 0);
    const risk = await adminFraud.summary();
    const riskCount = Object.values(risk).reduce((total, count) => total + count, 0);
    const tasks = [
      {
        id: 'review-disputes',
        severity: reviewDisputes.length ? 'critical' : 'ok',
        count: reviewDisputes.length,
        tab: 'review',
        title: 'Litiges à arbitrer',
        body: 'Montant simulé gelé, preuves à lire et décision admin à prendre.',
      },
      {
        id: 'kyc-overdue',
        severity: overdueKyc.length ? 'critical' : pendingKyc.length ? 'warning' : 'ok',
        count: overdueKyc.length || pendingKyc.length,
        tab: 'kyc',
        title: 'Identités à traiter',
        body: overdueKyc.length ? 'Demandes KYC au-delà du SLA 24 h.' : 'Demandes KYC en attente de revue.',
      },
      {
        id: 'gray-listings',
        severity: reviewListings.length ? 'warning' : 'ok',
        count: reviewListings.length,
        tab: 'review',
        title: 'Annonces en zone grise',
        body: 'Catégories à accepter, refuser ou promouvoir en liste blanche.',
      },
      {
        id: 'review-conversations',
        severity: reviewConversations.length ? 'warning' : 'ok',
        count: reviewConversations.length,
        tab: 'review',
        title: 'Conversations signalées',
        body: 'Messages, participants et contexte à vérifier avant décision.',
      },
      {
        id: 'fraud-signals',
        severity: riskCount ? 'warning' : 'ok',
        count: riskCount,
        tab: 'fraud',
        title: 'Signaux de risque',
        body: 'Comptes liés, messages hors app, litiges répétés ou comportements atypiques.',
      },
    ];

    return {
      generatedAt: now(),
      health: {
        status: reviewDisputes.length || overdueKyc.length ? 'critical' : reviewOpen.length || riskCount ? 'watch' : 'clear',
        reviewOpen: reviewOpen.length,
        conversationReports: reviewConversations.length,
        kycPending: pendingKyc.length,
        kycOverdue: overdueKyc.length,
        openDisputes: openDisputes.length,
        flaggedMessages: flaggedMessages.length,
        escrowHeld: simulatedHeld,
        riskSignals: riskCount,
      },
      tasks,
      risk,
      latest: {
        reviewQueue: reviewOpen
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, 5)
          .map((item) => ({
            id: item.id,
            type: item.type,
            createdAt: item.createdAt,
            refId: item.refId,
            label: item.type === 'listing'
              ? db.listings.find((listing) => listing.id === item.refId)?.title
              : item.type === 'dispute'
                ? db.disputes.find((dispute) => dispute.id === item.refId)?.reason
                : adminConversationModerationView(
                  db.conversations.find((conversation) => conversation.id === item.refId),
                )?.reports?.[0]?.reason,
          })),
        kyc: pendingKyc
          .sort((left, right) => left.submittedAt - right.submittedAt)
          .slice(0, 5)
          .map((submission) => {
            const user = findUser(submission.userId);
            return {
              id: submission.id,
              legalName: submission.legalName,
              submittedAt: submission.submittedAt,
              overdue: now() - submission.submittedAt > kycSlaMs,
              user: user ? { name: user.name, email: user.email } : null,
            };
          }),
      },
    };
  }

  async function overview() {
    return {
      reviewQueue: repositories.reviewQueue.open().map((item) => ({
        ...item,
        listing: item.type === 'listing'
          ? db.listings.find((listing) => listing.id === item.refId)
          : null,
        dispute: item.type === 'dispute'
          ? (() => {
            const dispute = db.disputes.find((candidate) => candidate.id === item.refId);
            return dispute ? disputeView(dispute) : null;
          })()
          : null,
        conversation: item.type === 'conversation'
          ? adminConversationModerationView(
            db.conversations.find((conversation) => conversation.id === item.refId),
          )
          : null,
      })),
      stats: {
        users: db.users.length,
        listings: db.listings.length,
        transactions: db.transactions.length,
        released: db.transactions.filter((transaction) => transaction.status === 'released').length,
        disputed: db.transactions.filter((transaction) => transaction.status === 'disputed').length,
        flaggedMessages: (await repositories.messages.flagged()).length,
        escrowHeld: db.transactions
          .filter((transaction) => ['held', 'frozen'].includes(transaction.escrow?.state))
          .reduce((total, transaction) => total + transaction.escrow.amount, 0),
      },
      disputes: db.disputes,
      customWhitelist: repositories.customWhitelist.all(),
    };
  }

  async function kpis(lang) {
    const currentTime = now();
    const dayMs = 864e5;
    const released = db.transactions.filter((transaction) => transaction.status === 'released');
    const firstTransactionAt = db.transactions.length
      ? Math.min(...db.transactions.map((transaction) => transaction.createdAt))
      : currentTime;
    const monthsElapsed = Math.max(1, (currentTime - firstTransactionAt) / (30 * dayMs));
    const monthly = [];

    for (let index = 5; index >= 0; index -= 1) {
      const start = new Date(currentTime - index * 30 * dayMs);
      const from = currentTime - (index + 1) * 30 * dayMs;
      const to = currentTime - index * 30 * dayMs;
      monthly.push({
        label: start.toLocaleDateString(localeForLang(lang), { month: 'short' }),
        count: released.filter((transaction) =>
          transaction.escrow?.releasedAt >= from && transaction.escrow?.releasedAt < to
        ).length,
      });
    }

    const disputable = db.transactions.filter((transaction) =>
      ['in_transit', 'released', 'disputed', 'refunded'].includes(transaction.status)
    );
    const resolved = db.disputes.filter((dispute) => dispute.status === 'resolved' && dispute.resolvedAt);
    const resolvedFast = resolved.filter((dispute) => dispute.resolvedAt - dispute.createdAt <= 7 * dayMs);
    const transactionsByTraveler = {};
    for (const transaction of db.transactions) {
      transactionsByTraveler[transaction.travelerId] =
        (transactionsByTraveler[transaction.travelerId] || 0) + 1;
    }
    const travelerIds = Object.keys(transactionsByTraveler);
    const recurring = travelerIds.filter((id) => transactionsByTraveler[id] >= 2).length;
    const messageCount = await repositories.messages.count();
    const flaggedMessageCount = (await repositories.messages.flagged()).length;
    const matchDelays = db.transactions
      .map((transaction) => {
        const listing = db.listings.find((candidate) => candidate.id === transaction.listingId);
        return listing ? transaction.createdAt - listing.createdAt : null;
      })
      .filter((delay) => delay !== null && delay >= 0);

    return {
      kpis: {
        transactionsPerMonth: {
          value: Math.round((released.length / monthsElapsed) * 10) / 10,
          target: 150,
          direction: 'above',
          monthly,
        },
        disputeRate: {
          value: disputable.length ? db.disputes.length / disputable.length : 0,
          target: 0.05,
          direction: 'below',
        },
        resolutionRate: {
          value: resolved.length ? resolvedFast.length / resolved.length : null,
          target: 0.9,
          direction: 'above',
          sampleSize: resolved.length,
        },
        recurringTravelers: {
          value: travelerIds.length ? recurring / travelerIds.length : 0,
          target: 0.4,
          direction: 'above',
          sampleSize: travelerIds.length,
        },
        desintermediationRate: {
          value: messageCount ? flaggedMessageCount / messageCount : 0,
          target: 0.15,
          direction: 'below',
          sampleSize: messageCount,
        },
        avgMatchHours: {
          value: matchDelays.length
            ? matchDelays.reduce((total, delay) => total + delay, 0) / matchDelays.length / 3600e3
            : null,
          target: 72,
          direction: 'below',
        },
        nps: {
          value: null,
          target: 50,
          direction: 'above',
          note: 'Nécessite un sondage post-transaction — non instrumenté',
        },
      },
      totals: {
        transactions: db.transactions.length,
        released: released.length,
        disputes: db.disputes.length,
        users: db.users.length,
      },
    };
  }

  return { summary, overview, kpis };
}
