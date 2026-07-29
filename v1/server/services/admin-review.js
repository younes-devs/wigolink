function notFound(message) {
  return { status: 404, body: { error: message } };
}

export function createAdminReviewService({
  db,
  repositories,
  whitelist,
  transitionEscrow,
  addEvent,
  audit,
  notify,
  save,
  now = Date.now,
  relationalReview = null,
}) {
  async function review({ actorId, reviewId, decision, maxQty }) {
    if (relationalReview) {
      const relational = await relationalReview({
        actorId,
        reviewId,
        decision,
        maxQty,
      });
      if (relational.handled) {
        return {
          status: relational.status,
          body: relational.body,
        };
      }
    }
    const item = repositories.reviewQueue.find(reviewId);
    if (!item) return notFound('Introuvable');
    repositories.reviewQueue.close(item, decision);

    if (item.type === 'listing') {
      const listing = db.listings.find((candidate) => candidate.id === item.refId);
      if (listing) {
        listing.status = decision === 'approve' ? 'published' : 'rejected';
        let promoted = false;
        if (
          decision === 'approve'
          && listing.whitelistVerdict === 'gray'
          && !repositories.customWhitelist.hasIn(whitelist, listing.categoryId)
        ) {
          repositories.customWhitelist.promoteFromListing(listing, { maxQty });
          promoted = true;
        }
        await audit(actorId, `review.listing.${decision}`, 'listing', listing.id, {
          reviewId: item.id,
          categoryId: listing.categoryId,
          promoted,
        });
      }
    }

    if (item.type === 'dispute') {
      const dispute = db.disputes.find((candidate) => candidate.id === item.refId);
      if (!dispute) return notFound('Litige introuvable');
      const transaction = db.transactions.find((candidate) => candidate.id === dispute.txId);
      if (!transaction) return notFound('Operation introuvable');
      dispute.status = 'resolved';
      dispute.resolution = decision;
      dispute.resolvedAt = now();
      if (decision === 'release_traveler') {
        transaction.status = 'released';
        transitionEscrow(transaction.escrow, 'released');
      } else {
        transaction.status = 'refunded';
        transitionEscrow(transaction.escrow, 'refunded');
      }
      addEvent(transaction, 'dispute_resolved', actorId, { decision });
      await audit(actorId, `review.dispute.${decision}`, 'dispute', dispute.id, {
        reviewId: item.id,
        txId: transaction.id,
        escrowState: transaction.escrow?.state || null,
      });
      await notify(
        [transaction.senderId, transaction.travelerId, transaction.recipientId],
        { key: decision === 'release_traveler' ? 'dispute.resolved.traveler' : 'dispute.resolved.sender' },
        transaction.id,
        'security',
        'litige',
      );
    }

    if (item.type === 'conversation') {
      const conversation = db.conversations.find((candidate) => candidate.id === item.refId);
      if (!conversation) return notFound('Conversation introuvable');
      conversation.moderationStatus = decision || 'reviewed';
      conversation.moderatedAt = now();
      conversation.moderatedBy = actorId;
      conversation.reports = (conversation.reports || []).map((report) => ({
        ...report,
        reviewedAt: conversation.moderatedAt,
        reviewedBy: actorId,
        decision: conversation.moderationStatus,
      }));
      await audit(
        actorId,
        `review.conversation.${conversation.moderationStatus}`,
        'conversation',
        conversation.id,
        {
          reviewId: item.id,
          reportCount: conversation.reports.length,
        },
      );
    }

    save();
    return { status: 200, body: { ok: true } };
  }

  return { review };
}
