export function createGuidanceCenterService({
  db,
  isParty,
  kycRepository,
  evidenceWindowMs,
  localizeCustoms,
  customs,
  combinedWhitelist,
  blacklist,
  localizeCategory,
  reviewQueue,
  disputeView,
}) {
  function roleFor(transaction, userId) {
    if (transaction.senderId === userId) return 'sender';
    if (transaction.travelerId === userId) return 'traveler';
    return 'recipient';
  }

  function memberTransactions(userId) {
    return db.transactions
      .filter((transaction) => isParty(transaction, userId))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function documents(user) {
    const transactions = memberTransactions(user.id);
    const dossiers = transactions.map((transaction) => {
      const listing = db.listings.find(
        (candidate) => candidate.id === transaction.listingId,
      ) || null;
      const dispute = db.disputes.find(
        (candidate) => candidate.txId === transaction.id,
      ) || null;
      const role = roleFor(transaction, user.id);
      const docs = [
        {
          id: 'customs',
          status:
            transaction.sealingVideo
            || [
              'sealed',
              'in_transit',
              'released',
              'disputed',
              'refunded',
            ].includes(transaction.status)
              ? 'ready'
              : 'pending',
          href: `/transactions/${transaction.id}#douane`,
        },
        {
          id: 'sealing',
          status: transaction.sealingVideo
            ? 'ready'
            : transaction.status === 'accepted' && role === 'sender'
              ? 'action'
              : 'pending',
          href: `/transactions/${transaction.id}#actions`,
          meta: transaction.sealingVideo
            ? {
              recordedAt: transaction.sealingVideo.recordedAt,
              simulated: !!transaction.sealingVideo.simulated,
              hasVideo: !!transaction.sealingVideo.dataUrl,
              geo: transaction.sealingVideo.geo || null,
            }
            : null,
        },
        {
          id: 'escrow',
          status: transaction.escrow?.state || 'pending',
          href: `/transactions/${transaction.id}#suivi`,
          meta: transaction.escrow || null,
        },
      ];
      if (dispute) {
        docs.push({
          id: 'dispute',
          status: dispute.status,
          href: `/transactions/${transaction.id}#litige`,
          meta: {
            evidenceCount: dispute.evidence?.length || 0,
            myEvidenceCount: (dispute.evidence || []).filter(
              (evidence) => evidence.by === user.id,
            ).length,
            evidenceDeadline: dispute.createdAt + evidenceWindowMs,
          },
        });
      }
      return {
        txId: transaction.id,
        role,
        status: transaction.status,
        listing: listing
          ? {
            id: listing.id,
            title: listing.title,
            from: listing.from,
            to: listing.to,
            valueEur: listing.valueEur,
            categoryId: listing.categoryId,
          }
          : null,
        createdAt: transaction.createdAt,
        docs,
      };
    });
    const kyc = kycRepository.listForUser(user.id).map(
      (submission) => ({
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        reviewedAt: submission.reviewedAt || null,
        documentType: submission.documentType,
        retainedByProvider: true,
      }),
    );
    return {
      totals: {
        dossiers: dossiers.length,
        ready: dossiers.reduce(
          (total, dossier) =>
            total
            + dossier.docs.filter(
              (document) =>
                document.status === 'ready'
                || document.status === 'released'
                || document.status === 'held',
            ).length,
          0,
        ),
        actions: dossiers.reduce(
          (total, dossier) =>
            total
            + dossier.docs.filter(
              (document) => document.status === 'action',
            ).length,
          0,
        ),
        disputes: dossiers.filter(
          (dossier) =>
            dossier.docs.some((document) => document.id === 'dispute'),
        ).length,
        kyc: kyc.length,
      },
      dossiers,
      kyc,
    };
  }

  function compliance(user, lang = 'fr') {
    const localizedCustoms = localizeCustoms(customs, lang);
    const whitelist = combinedWhitelist();
    const localizedAllowed = whitelist.map(
      (category) => localizeCategory(category, lang),
    );
    const localizedForbidden = blacklist.map(
      (category) => localizeCategory(category, lang),
    );
    const localizedCategoryLabel = (listing) => {
      const category = whitelist.find(
        (item) => item.id === listing.categoryId,
      ) || blacklist.find((item) => item.id === listing.categoryId);
      return category
        ? localizeCategory(category, lang).label
        : listing.categoryLabel;
    };
    const listings = db.listings
      .filter((listing) => listing.senderId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    const openReviewItems = reviewQueue.open({ type: 'listing' });
    const items = listings.map((listing) => {
      const corridorKey = listing.from === 'Casablanca'
        ? 'MA-EU'
        : 'EU-MA';
      const limitEur = corridorKey === 'MA-EU' ? 430 : 185;
      const queueItem = openReviewItems.find(
        (item) => item.refId === listing.id,
      );
      return {
        listing,
        corridorKey,
        customsLimitEur: limitEur,
        overFranchise: listing.valueEur > limitEur,
        reviewPending: listing.status === 'pending_review',
        queueId: queueItem?.id || null,
        action: listing.status === 'pending_review'
          ? {
            id: 'wait_review',
            priority: 'medium',
            href: '/envois',
          }
          : listing.valueEur > limitEur
            ? {
              id: 'customs_value',
              priority: 'medium',
              href: `/annonce/${listing.id}`,
            }
            : {
              id: 'ok',
              priority: 'low',
              href: `/annonce/${listing.id}`,
            },
      };
    });
    const gray = items.filter(
      (item) =>
        item.listing.whitelistVerdict === 'gray'
        || item.reviewPending,
    );
    const over = items.filter((item) => item.overFranchise);
    return {
      corridors: Object.entries(localizedCustoms).map(
        ([id, corridor]) => ({
          id,
          label: corridor.label,
          franchise: corridor.franchise,
          rules: corridor.rules,
          limitEur: id === 'MA-EU' ? 430 : 185,
        }),
      ),
      catalogue: {
        allowed: localizedAllowed,
        forbidden: localizedForbidden,
        grayExamples: gray.slice(0, 4).map((item) => ({
          id: item.listing.id,
          title: item.listing.title,
          categoryLabel: localizedCategoryLabel(item.listing),
          status: item.listing.status,
        })),
      },
      totals: {
        listings: listings.length,
        reviewPending: gray.length,
        overFranchise: over.length,
        allowedCategories: whitelist.length,
        forbiddenCategories: blacklist.length,
      },
      actions: [...gray, ...over]
        .sort((a, b) => {
          const rank = { medium: 0, low: 1 };
          return rank[a.action.priority] - rank[b.action.priority]
            || b.listing.createdAt - a.listing.createdAt;
        })
        .slice(0, 6)
        .map((item) => ({
          id: `${item.listing.id}:${item.action.id}`,
          listingId: item.listing.id,
          title: item.listing.title,
          categoryLabel: localizedCategoryLabel(item.listing),
          action: item.action,
        })),
      items,
    };
  }

  function supportAction(user, transaction, dispute) {
    const role = roleFor(transaction, user.id);
    if (dispute?.status === 'open') {
      const mine = (dispute.evidence || []).some(
        (evidence) => evidence.by === user.id,
      );
      return {
        id: mine ? 'follow_dispute' : 'add_evidence',
        priority: mine ? 'medium' : 'high',
        href: `/transactions/${transaction.id}#litige`,
      };
    }
    if (['in_transit', 'released'].includes(transaction.status)) {
      return {
        id: 'open_dispute',
        priority: 'medium',
        href: `/transactions/${transaction.id}#actions`,
      };
    }
    if (transaction.status === 'accepted' && role === 'sender') {
      return {
        id: 'seal_first',
        priority: 'high',
        href: `/transactions/${transaction.id}#actions`,
      };
    }
    if (transaction.status === 'sealed') {
      return {
        id: 'organize_handoff',
        priority: 'medium',
        href: `/transactions/${transaction.id}#messages`,
      };
    }
    return {
      id: 'read_rules',
      priority: 'low',
      href: '/cgu#litiges',
    };
  }

  function support(user) {
    const cases = memberTransactions(user.id).map((transaction) => {
      const dispute = db.disputes.find(
        (candidate) => candidate.txId === transaction.id,
      ) || null;
      const listing = db.listings.find(
        (candidate) => candidate.id === transaction.listingId,
      ) || null;
      const role = roleFor(transaction, user.id);
      const canOpenDispute =
        !dispute
        && ['in_transit', 'released'].includes(transaction.status);
      return {
        txId: transaction.id,
        role,
        status: transaction.status,
        listing: listing
          ? {
            id: listing.id,
            title: listing.title,
            from: listing.from,
            to: listing.to,
            categoryId: listing.categoryId,
          }
          : null,
        dispute: dispute ? disputeView(dispute, transaction) : null,
        canOpenDispute,
        action: supportAction(user, transaction, dispute),
      };
    });
    const openDisputes = cases.filter(
      (item) => item.dispute?.status === 'open',
    );
    const urgent = cases
      .filter(
        (item) => ['high', 'medium'].includes(item.action.priority),
      )
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.action.priority] - rank[b.action.priority];
      })
      .slice(0, 6)
      .map((item) => ({
        id: `${item.txId}:${item.action.id}`,
        txId: item.txId,
        title: item.listing?.title || item.txId,
        status: item.status,
        action: item.action,
      }));
    return {
      totals: {
        cases: cases.length,
        openDisputes: openDisputes.length,
        canOpenDispute: cases.filter(
          (item) => item.canOpenDispute,
        ).length,
        urgent: urgent.filter(
          (item) => item.action.priority === 'high',
        ).length,
      },
      urgent,
      cases,
      guide: [
        { id: 'stay_in_app', href: '/cgu#interdits' },
        { id: 'inspect_before_pickup', href: '/cgu#transaction' },
        { id: 'customs_truth', href: '/cgu#douane' },
        { id: 'evidence_72h', href: '/cgu#litiges' },
      ],
    };
  }

  return {
    documents,
    compliance,
    support,
  };
}
